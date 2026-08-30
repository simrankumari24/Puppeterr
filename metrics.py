#!/usr/bin/env python3
"""
Puppeterr metrics + behavioral analyzer.

- Uses existing log.json schema (no new instrumentation)
- Computes task/step metrics
- Reclassifies tasks by behavior using taskId
- Detects:
    - challenge misclassification
    - hallucination-suspect runs
    - navigation drift
    - planner instability
- Prints before/after deltas for task categories
"""

import json
import sys
from collections import Counter, defaultdict
from datetime import datetime

# ---------- Core IO ----------

def load(path):
    with open(path) as f:
        return json.load(f)

def parse_ts(x):
    try:
        return datetime.fromisoformat(x.get("ts", "").replace("Z", "+00:00"))
    except Exception:
        return None

# ---------- Classification helpers ----------

def classify_task(start, end, actions):
    flags = {
        "challenge": 0,
        "captcha_escape": 0,
        "pixel_grid": 0,
        "planner_switch": 0,
        "navigation_drift": 0,
        "selector_timeout": 0,
        "urlchange_timeout": 0,
        "extraction_error": 0,
        "gentle_mode": 0,
        "hallucination_suspect": 0,
    }

    for a in actions:
        msg = (a.get("errorMessage") or "").lower()
        text = (a.get("result") or "").lower()
        url = str(a.get("url", "")).lower()

        # Soft challenge / CAPTCHA
        if "challenge detected" in msg or "captcha" in msg:
            flags["challenge"] += 1
        if "captcha_escape" in msg:
            flags["captcha_escape"] += 1

        # Pixel-grid fallback
        if "pixel-grid" in msg or "pixel-grid analyzing" in msg:
            flags["pixel_grid"] += 1

        # Planner switching
        if "planner circuit-breaker" in msg or "switching planner model" in msg:
            flags["planner_switch"] += 1

        # Navigation drift
        if "google.com" in url and "github.com" not in url:
            flags["navigation_drift"] += 1

        # Timeouts
        if "timeout" in msg and "locator" in msg:
            flags["selector_timeout"] += 1
        if "timeout" in msg and "waitforurlchange" in msg:
            flags["urlchange_timeout"] += 1

        # Extraction errors
        if "getalltext" in msg and "error" in msg:
            flags["extraction_error"] += 1

        # Gentle mode
        if "gentle mode active" in msg:
            flags["gentle_mode"] += 1

        # Hallucination heuristic
        if "issue #" in text or "release" in text and "fake" in text:
            flags["hallucination_suspect"] += 1

    if not end:
        return "crash"

    if flags["hallucination_suspect"]:
        return "hallucination-suspect"
    if flags["challenge"] or flags["captcha_escape"]:
        return "challenge-misclassified"
    if flags["pixel_grid"] or flags["navigation_drift"]:
        return "navigation-drift"
    if flags["planner_switch"]:
        return "planner-instability"
    if flags["selector_timeout"] or flags["urlchange_timeout"]:
        return "selector-instability"
    if flags["extraction_error"]:
        return "extraction-instability"
    if flags["gentle_mode"]:
        return "soft-challenge-detected"

    return "normal"


def classify_all_tasks(starts, ends, actions):
    ends_by_id = {e.get("taskId"): e for e in ends}
    actions_by_id = defaultdict(list)
    for a in actions:
        tid = a.get("taskId")
        if tid:
            actions_by_id[tid].append(a)

    classifications = Counter()
    per_task_class = {}

    for s in starts:
        tid = s.get("taskId")
        end = ends_by_id.get(tid)
        acts = actions_by_id.get(tid, [])
        cls = classify_task(s, end, acts)
        classifications[cls] += 1
        per_task_class[tid] = cls

    return classifications, per_task_class

# ---------- Fallback / retry helpers ----------

def fallback_used(a):
    if "fallbackUsed" in a:
        return bool(a["fallbackUsed"])
    return str(a.get("path", "")).startswith("fallback")

def is_retry(a):
    if "isRetry" in a:
        return bool(a["isRetry"])
    return "retry" in str(a.get("path", ""))

# ---------- Main metrics ----------

def main(path):
    data = load(path)

    actions = [x for x in data if x.get("kind") == "action"]
    starts  = [x for x in data if x.get("kind") == "task" and x.get("phase") == "start"]
    ends    = [x for x in data if x.get("kind") == "task" and x.get("phase") == "end"]
    diagnoses = [x for x in data if x.get("kind") == "diagnosis"]

    # ---- Task-level metrics ----
    completed = sum(1 for t in ends if t.get("completed") is True)
    crashed_silently = len(starts) - len(ends)
    error_ends = sum(1 for t in ends if t.get("error") is True)

    print("=" * 60)
    print("TASK-LEVEL METRICS")
    print("=" * 60)
    print(f"Tasks started:                {len(starts)}")
    print(f"Tasks with an end record:     {len(ends)}")
    print(f"  completed = true:           {completed}")
    print(f"  completed = false:          {len(ends) - completed}")
    print(f"  (of which unhandled error): {error_ends}")
    print(f"Tasks with NO end record:     {crashed_silently}")
    if ends:
        print(f"\nCompletion rate (of ended):        {completed/len(ends)*100:.1f}%")
    if starts:
        print(f"True completion rate (of started): {completed/len(starts)*100:.1f}%")

    # ---- Step-level metrics ----
    print()
    print("=" * 60)
    print("STEP-LEVEL METRICS")
    print("=" * 60)
    total_steps = len(actions)
    ok_steps = sum(1 for a in actions if a.get("status") == "ok")
    err_steps = total_steps - ok_steps
    print(f"Total logged actions:   {total_steps}")
    print(f"  ok:                   {ok_steps}")
    print(f"  error:                {err_steps}")
    if total_steps:
        print(f"Step success rate:       {ok_steps/total_steps*100:.1f}%")

    # ---- Path distribution ----
    path_counts = Counter(a.get("path", "(none)") for a in actions)
    fallback_total = sum(1 for a in actions if fallback_used(a))
    retry_total = sum(1 for a in actions if is_retry(a))
    print()
    print("Path distribution:")
    for p, c in path_counts.most_common():
        pct = c / total_steps * 100 if total_steps else 0
        print(f"  {p:<28} {c:>5}  ({pct:4.1f}%)")
    print(f"\nFallback rate: {fallback_total/total_steps*100:.1f}%")
    print(f"Retry rate:    {retry_total/total_steps*100:.1f}%")

    # ---- Diagnosis ----
    if diagnoses:
        print()
        print("=" * 60)
        print("CLAIMED vs ACTUAL SUCCESS")
        print("=" * 60)
        claimed = sum(1 for x in diagnoses if x.get("agentClaimedSuccess"))
        actual = sum(1 for x in diagnoses if x.get("actualSuccess"))
        discrep = sum(1 for x in diagnoses if x.get("discrepancy"))
        print(f"Diagnosis events:        {len(diagnoses)}")
        print(f"Agent claimed success:   {claimed} ({claimed/len(diagnoses)*100:.1f}%)")
        print(f"Actually succeeded:      {actual} ({actual/len(diagnoses)*100:.1f}%)")
        print(f"Discrepancies:           {discrep} ({discrep/len(diagnoses)*100:.1f}%)")

    # ---- CAPTCHA ----
    print()
    print("=" * 60)
    print("CAPTCHA METRICS")
    print("=" * 60)
    captcha_ends = [e for e in ends if "captcha" in (e.get("result") or "").lower()]
    captcha_resolved = sum(1 for e in captcha_ends if e.get("completed"))
    print(f"Tasks that hit CAPTCHA: {len(captcha_ends)} / {len(ends)}")
    print(f"Completed anyway:       {captcha_resolved} / {len(captcha_ends)}")
    host_counts = Counter(e.get("host", "unknown") for e in captcha_ends)
    for h, c in host_counts.items():
        print(f"  {h:<28} {c}")

    # ---- Per-host completion ----
    print()
    print("=" * 60)
    print("PER-HOST COMPLETION")
    print("=" * 60)
    by_host = defaultdict(lambda: [0, 0])
    for e in ends:
        h = e.get("host", "unknown")
        by_host[h][1] += 1
        if e.get("completed"):
            by_host[h][0] += 1
    for h, (c, t) in sorted(by_host.items(), key=lambda kv: -kv[1][1]):
        pct = c/t*100 if t else 0
        print(f"  {h:<28} {c}/{t}  ({pct:.0f}%)")

    # ---- Timing ----
    print()
    print("=" * 60)
    print("TIMING METRICS")
    print("=" * 60)
    action_deltas = []
    nav_deltas = []
    prev = None
    for a in actions:
        t = parse_ts(a)
        if t and prev:
            delta = (t - prev).total_seconds()
            if 0 <= delta < 300:
                action_deltas.append(delta)
                if a.get("action") in ("goto", "waitForURLChange", "reload"):
                    nav_deltas.append(delta)
        if t:
            prev = t
    if action_deltas:
        print(f"Avg time between actions: {sum(action_deltas)/len(action_deltas):.2f}s")
    if nav_deltas:
        print(f"Avg navigation time:      {sum(nav_deltas)/len(nav_deltas):.2f}s")

    # ---- Recovery ----
    print()
    print("=" * 60)
    print("RECOVERY RATE")
    print("=" * 60)
    actions_by_goal = defaultdict(list)
    for a in actions:
        actions_by_goal[a.get("goal", "")].append(a)
    ends_by_goal = {e.get("goal", ""): e for e in ends}
    recovered = 0
    struggled = 0
    for g, acts in actions_by_goal.items():
        used_fallback = any(fallback_used(a) or is_retry(a) for a in acts)
        if not used_fallback:
            continue
        struggled += 1
        end = ends_by_goal.get(g)
        if end and end.get("completed"):
            recovered += 1
    print(f"Tasks needing fallback: {struggled}")
    print(f"Recovered:              {recovered}")

    # ---- Search engine usage ----
    print()
    print("=" * 60)
    print("SEARCH ENGINE USAGE")
    print("=" * 60)
    engine_hits = Counter()
    for a in actions:
        u = str(a.get("url", "")).lower()
        if "bing.com" in u:
            engine_hits["bing.com"] += 1
        elif "google.com" in u:
            engine_hits["google.com"] += 1
        elif "duckduckgo.com" in u:
            engine_hits["duckduckgo.com"] += 1
    for eng, c in engine_hits.items():
        print(f"  {eng:<20} {c}")

    # ---- Error messages ----
    error_msgs = [e.get("errorMessage") for e in ends if e.get("errorMessage")]
    if error_msgs:
        print()
        print("=" * 60)
        print("TOP UNHANDLED ERRORS")
        print("=" * 60)
        for msg, c in Counter(error_msgs).most_common(10):
            print(f"  [{c}x] {msg[:100]}")

    # ---- Behavioral reclassification ----
    print()
    print("=" * 60)
    print("TASK RECLASSIFICATION (behavioral)")
    print("=" * 60)
    classifications, per_task_class = classify_all_tasks(starts, ends, actions)
    for cls, count in classifications.items():
        print(f"{cls:<24} {count}")

    # ---- BEFORE vs AFTER ----
    print()
    print("=" * 60)
    print("FULL METRIC TRANSFORMATION REPORT (Before → After)")
    print("=" * 60)

    before_metrics = {
        "tasks_started": len(starts),
        "tasks_ended": len(ends),
        "completed": completed,
        "crashed": crashed_silently,
        "step_success_rate": ok_steps / total_steps * 100 if total_steps else 0,
    }

    after_metrics = {
        "normal": classifications.get("normal", 0),
        "crash": classifications.get("crash", 0),
        "challenge_misclassified": classifications.get("challenge-misclassified", 0),
        "hallucination_suspect": classifications.get("hallucination-suspect", 0),
        "navigation_drift": classifications.get("navigation-drift", 0),
        "planner_instability": classifications.get("planner-instability", 0),
    }

    def print_delta(name, before, after):
        delta = after - before
        pct = (delta / before * 100) if before else float("inf") if after else 0
        print(f"{name:<28} {before:>5} → {after:<5}  (Δ {delta:+4}, {pct:>6.1f}%)")

    print("\n--- TASK COMPLETION DELTAS ---")
    print_delta("Completed tasks", before_metrics["completed"], after_metrics["normal"])
    print_delta("Crashed tasks", before_metrics["crashed"], after_metrics["crash"])

    print("\n--- BEHAVIORAL CATEGORY EMERGENCE ---")
    for key in ["challenge_misclassified", "hallucination_suspect",
                "navigation_drift", "planner_instability"]:
        print_delta(key.replace("_", " ").title(), 0, after_metrics.get(key, 0))

    print("\n--- COMPLETION RATE DELTA ---")
    before_true_rate = before_metrics["completed"] / before_metrics["tasks_started"] * 100
    after_true_rate = after_metrics["normal"] / before_metrics["tasks_started"] * 100
    print_delta("True completion rate (%)", before_true_rate, after_true_rate)

if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "log.json"
    main(path)
