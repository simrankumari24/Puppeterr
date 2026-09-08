#!/usr/bin/env python3
"""
Puppeterr metrics extractor.

Computes benchmark-grade metrics from the existing log.json schema —
no new instrumentation required, since every action event already
carries `status` (ok/error) and `path` (primary vs fallback-*).

Usage: python3 metrics.py /path/to/log.json
"""
import json
import sys
from collections import Counter, defaultdict

def load(path):
    with open(path) as f:
        return json.load(f)

def main(path):
    data = load(path)

    actions = [x for x in data if x.get("kind") == "action"]
    starts  = [x for x in data if x.get("kind") == "task" and x.get("phase") == "start"]
    ends    = [x for x in data if x.get("kind") == "task" and x.get("phase") == "end"]

    # ---- Task-level completion ----
    completed = sum(1 for t in ends if t.get("completed") is True)
    crashed_silently = len(starts) - len(ends)
    error_ends = sum(1 for t in ends if t.get("error") is True)  # only present after the catch-block patch

    print("=" * 60)
    print("TASK-LEVEL METRICS")
    print("=" * 60)
    print(f"Tasks started:                {len(starts)}")
    print(f"Tasks with an end record:     {len(ends)}")
    print(f"  completed = true:           {completed}")
    print(f"  completed = false:          {len(ends) - completed}")
    print(f"  (of which unhandled error): {error_ends}")
    print(f"Tasks with NO end record:     {crashed_silently}  "
          f"(pre-patch: silent crash. post-patch: should be ~0)")
    if ends:
        print(f"\nCompletion rate (of ended):        {completed/len(ends)*100:.1f}%")
    if starts:
        print(f"True completion rate (of started): {completed/len(starts)*100:.1f}%")

    # ---- Step-level metrics (derived from action events) ----
    print()
    print("=" * 60)
    print("STEP-LEVEL METRICS (derived from existing 'action' events)")
    print("=" * 60)
    total_steps = len(actions)
    ok_steps = sum(1 for a in actions if a.get("status") == "ok")
    err_steps = total_steps - ok_steps
    print(f"Total logged actions:   {total_steps}")
    print(f"  ok:                   {ok_steps}")
    print(f"  error:                {err_steps}")
    if total_steps:
        print(f"Step success rate:       {ok_steps/total_steps*100:.1f}%")
    # ---- Fallback / retry usage ----
    # Prefer the explicit fallbackUsed/isRetry fields (added directly to
    # recordOutcome() in agent.js) when present; fall back to parsing `path`
    # for older log entries that predate that patch.
    def _fallback_used(a):
        if "fallbackUsed" in a:
            return bool(a["fallbackUsed"])
        return str(a.get("path", "")).startswith("fallback")

    def _is_retry(a):
        if "isRetry" in a:
            return bool(a["isRetry"])
        return "retry" in str(a.get("path", ""))

    path_counts = Counter(a.get("path", "(none)") for a in actions)
    fallback_total = sum(1 for a in actions if _fallback_used(a))
    retry_total = sum(1 for a in actions if _is_retry(a))
    print()
    print("Path distribution (how each successful/attempted step resolved):")
    for p, c in path_counts.most_common():
        pct = c / total_steps * 100 if total_steps else 0
        print(f"  {p:<28} {c:>5}  ({pct:4.1f}%)")
    if total_steps:
        print(f"\nFallback rate (fallbackUsed=true / total steps): {fallback_total/total_steps*100:.1f}%")
        print(f"Retry rate     (isRetry=true / total steps):     {retry_total/total_steps*100:.1f}%")

    # ---- Claimed vs actual success (from kind:"diagnosis" events) ----
    diagnoses = [x for x in data if x.get("kind") == "diagnosis"]
    if diagnoses:
        print()
        print("=" * 60)
        print("CLAIMED vs ACTUAL SUCCESS (from 'diagnosis' events)")
        print("=" * 60)
        claimed = sum(1 for x in diagnoses if x.get("agentClaimedSuccess"))
        actual = sum(1 for x in diagnoses if x.get("actualSuccess"))
        discrep = sum(1 for x in diagnoses if x.get("discrepancy"))
        print(f"Diagnosis events:        {len(diagnoses)}")
        print(f"Agent claimed success:   {claimed} ({claimed/len(diagnoses)*100:.1f}%)")
        print(f"Actually succeeded:      {actual} ({actual/len(diagnoses)*100:.1f}%)")
        print(f"Discrepancies (claimed success but had failure streak): "
              f"{discrep} ({discrep/len(diagnoses)*100:.1f}%)")

    # ---- CAPTCHA ----
    print()
    print("=" * 60)
    print("CAPTCHA METRICS")
    print("=" * 60)
    captcha_ends = [e for e in ends if "captcha" in (e.get("result") or "").lower()]
    captcha_resolved = sum(1 for e in captcha_ends if e.get("completed"))
    if ends:
        print(f"Tasks that hit a CAPTCHA/challenge: {len(captcha_ends)} / {len(ends)} "
              f"({len(captcha_ends)/len(ends)*100:.1f}%)")
    if captcha_ends:
        print(f"Of those, completed anyway:         {captcha_resolved} / {len(captcha_ends)} "
              f"({captcha_resolved/len(captcha_ends)*100:.1f}%)")
    host_counts = Counter(e.get("host", "unknown") for e in captcha_ends)
    for h, c in host_counts.most_common():
        print(f"  {h:<28} {c}")

    # ---- Per-host breakdown (completion) ----
    print()
    print("=" * 60)
    print("PER-HOST COMPLETION (tasks with an end record)")
    print("=" * 60)
    by_host = defaultdict(lambda: [0, 0])  # host -> [completed, total]
    for e in ends:
        h = e.get("host", "unknown")
        by_host[h][1] += 1
        if e.get("completed"):
            by_host[h][0] += 1
    for h, (c, t) in sorted(by_host.items(), key=lambda kv: -kv[1][1]):
        print(f"  {h:<28} {c}/{t}  ({c/t*100:.0f}%)")

    # ---- Average action / navigation timing (from ts deltas) ----
    print()
    print("=" * 60)
    print("TIMING METRICS (derived from action timestamps)")
    print("=" * 60)
    from datetime import datetime
    def parse_ts(x):
        try:
            return datetime.fromisoformat(x.get("ts", "").replace("Z", "+00:00"))
        except Exception:
            return None
    action_deltas = []
    nav_deltas = []
    prev = None
    for a in actions:
        t = parse_ts(a)
        if t and prev:
            delta = (t - prev).total_seconds()
            if 0 <= delta < 300:  # drop cross-task gaps / clock weirdness
                action_deltas.append(delta)
                if a.get("action") in ("goto", "waitForURLChange", "reload"):
                    nav_deltas.append(delta)
        if t:
            prev = t
    if action_deltas:
        print(f"Avg time between actions: {sum(action_deltas)/len(action_deltas):.2f}s  (n={len(action_deltas)})")
    if nav_deltas:
        print(f"Avg time around navigation actions: {sum(nav_deltas)/len(nav_deltas):.2f}s  (n={len(nav_deltas)})")

    # ---- Recovery rate: tasks that used a fallback/retry but still completed ----
    print()
    print("=" * 60)
    print("RECOVERY RATE (fallback/retry used, task still completed)")
    print("=" * 60)
    # Group actions by goal (best available correlation key without a task id)
    actions_by_goal = defaultdict(list)
    for a in actions:
        actions_by_goal[a.get("goal", "")].append(a)
    ends_by_goal = {e.get("goal", ""): e for e in ends}
    recovered = 0
    struggled = 0
    for g, acts in actions_by_goal.items():
        used_fallback = any(_fallback_used(a) or _is_retry(a) for a in acts)
        if not used_fallback:
            continue
        struggled += 1
        end = ends_by_goal.get(g)
        if end and end.get("completed"):
            recovered += 1
    if struggled:
        print(f"Tasks that needed a fallback/retry: {struggled}")
        print(f"  of those, completed anyway:       {recovered} ({recovered/struggled*100:.1f}%)")
    else:
        print("No tasks used a fallback/retry path in this log.")

    # ---- Search engine fallback count (Google vs Bing vs other, from URLs) ----
    print()
    print("=" * 60)
    print("SEARCH ENGINE USAGE (from action URLs)")
    print("=" * 60)
    engine_hits = Counter()
    for a in actions:
        u = str(a.get("url", "")).lower()
        if "bing.com" in u:
            engine_hits["bing.com"] += 1
        elif "google.com/search" in u or ("google.com" in u and "q=" in u):
            engine_hits["google.com"] += 1
        elif "duckduckgo.com" in u:
            engine_hits["duckduckgo.com"] += 1
        elif "search.yahoo.com" in u:
            engine_hits["search.yahoo.com"] += 1
    for eng, c in engine_hits.most_common():
        print(f"  {eng:<20} {c}")

    # ---- Non-completion breakdown: WHY tasks didn't complete ----
    incomplete = [e for e in ends if not e.get("completed")]
    if incomplete:
        print()
        print("=" * 60)
        print("NON-COMPLETION BREAKDOWN (of tasks that didn't complete)")
        print("=" * 60)
        max_steps_count = sum(1 for e in incomplete if e.get("reachedMaxSteps"))
        # requiresHuman/stoppedByGuidance live on diagnosis events, not task events —
        # cross-reference by goal to pull them in for the same breakdown.
        diag_by_goal = {d.get("goal", ""): d for d in diagnoses}
        captcha_count = sum(1 for e in incomplete if diag_by_goal.get(e.get("goal", ""), {}).get("requiresHuman"))
        guidance_count = sum(1 for e in incomplete if diag_by_goal.get(e.get("goal", ""), {}).get("stoppedByGuidance"))
        other_count = len(incomplete) - max_steps_count - captcha_count - guidance_count
        print(f"Total non-completed: {len(incomplete)}")
        print(f"  ran out of step budget (reachedMaxSteps): {max_steps_count}")
        print(f"  CAPTCHA/human handoff required:            {captcha_count}")
        print(f"  stopped by operator guidance:               {guidance_count}")
        print(f"  other (planner gave up / never done:true):  {other_count}")

    error_msgs = [e.get("errorMessage") for e in ends if e.get("errorMessage")]
    if error_msgs:
        print()
        print("=" * 60)
        print("TOP UNHANDLED ERROR MESSAGES (post-patch data only)")
        print("=" * 60)
        for msg, c in Counter(error_msgs).most_common(10):
            print(f"  [{c}x] {msg[:100]}")

if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "log.json"
    main(path)