# Puppeterr

**Browser-automation agent** composed of four cooperating modules — Planner,
Instinct, Reasoner, and Vision — that execute tasks inside a real browser
while providing real-time reasoning, human guidance, and runtime logging.
The goal is a guided autonomous workflow similar to Devin-style agents.

See `TODO.md` for planned/in-progress work.

---

## Current Status (self-measured, pilot scale)

These numbers come from Puppeterr's own instrumentation (`metrics.py`
against `log.json`), not a published third-party benchmark. Sample size is
small (pilot scale, n≈46 tasks) — treat these as directional, not
definitive, and expect variance run to run. **Reproduce them yourself:**
`python3 metrics.py log.json`.

| Metric | Value | What it means |
|---|---|---|
| Step-level success rate | **87.9%** (255/290 logged actions) | How often an individual action (click, fill, navigate, etc.) succeeds |
| Task completion (of tasks that finished cleanly) | **56.8%** (21/37) | Full end-to-end task success, excluding runs that crashed before reaching a result |
| Task completion (of all tasks attempted) | **45.7%** (21/46) | Same, but counting crashed/incomplete runs against the total — the more conservative number |
| CAPTCHA/challenge encounter rate | **8.1%** (3/37 ended tasks) | How often a task hit a bot-check wall (Bing accounts for the largest share) |
| Claimed vs. verified success match | **70.4%** (19/27 diagnosis events) | How often the agent's own "I completed this" signal matched an independent check |

**In progress:** task completion is the current priority. Known
bottlenecks are resource constraints (RAM/CPU under load) and CAPTCHA
exposure on specific search engines and sites, not step-level execution
quality, which is comparatively strong. Self-verification (claimed vs.
actual success) is instrumented so regressions are visible in the log
rather than hidden.

**Scope of these numbers:** not a comparison to WebVoyager, WebArena, or
any named competitor system — Puppeterr has not been run on a public
benchmark, so no head-to-head claim is made here. Not a final result;
this project is under one month old and changes weekly.

---

## Capabilities & Limitations

**Capabilities, verified by instrumentation:**

- Reliable direct navigation to a known URL, including deep links (tested against GitHub release pages, documentation anchors, and search-engine result pages)
- Step-level action execution (click, fill, navigate, scroll, tab management) at an 87.9% success rate across logged actions
- Multi-tab task execution (open/switch/close tabs within a single task)
- Text extraction scoped to a specific page region via a selector, not only whole-page extraction
- Structured, categorized failure logging: infrastructure failure, reasoning failure, and CAPTCHA/challenge block are recorded as distinct categories, not merged into a single pass/fail signal
- A self-verification check that flags when the agent's own claimed success does not match independent signals from the execution trace

**Known limitations, stated plainly:**

- Task-level completion (45.7-56.8% depending on how crashed runs are counted) is meaningfully behind published results for funded, benchmark-evaluated agents. Step-level execution is comparatively strong; the gap is concentrated in end-to-end task reliability.
- CAPTCHA and bot-detection walls are not solved. When a task hits one, current behavior is to recognize and report the block, not to defeat it. This applies to Puppeterr and to every other browser agent industry-wide as of this writing — it is not a solved problem anywhere.
- A small number of hosts (encountered so far: en.wikipedia.org, archive.org, reddit.com, web.archive.org) have shown 0% completion in testing to date. The root cause has not yet been isolated as CAPTCHA-specific versus a structural/selector issue on those sites.
- Planner decisions are not fully deterministic. The same goal text has been observed to succeed on one run and fail on an identical retry; this is inherent to LLM-driven decision-making at each step, not a parsing or configuration bug.
- Resource-constrained environments (limited RAM, no swap) increase browser-crash frequency. This is an infrastructure limitation of the deployment environment, not the agent logic itself.
- All metrics above come from a small, self-run sample (pilot scale, not a controlled benchmark) and should be read as directional.

## Why Puppeterr Works

Three design choices account for most of its practical reliability, each
tied to a specific, identifiable failure mode they were built to close:

**Task Context Object.** Every planner prompt is prefixed with a fixed,
un-truncatable summary of the original goal, the most recent action, and
its result. Long or multi-step tasks are prone to the underlying model
losing track of the original ask as history accumulates; anchoring this
summary at the top of every prompt, separately from the rest of the page
state, keeps the original goal in view regardless of how much other
context has been generated in between.

**Grounded answer composition.** The final-answer step is instructed to
state a specific fact (a date, a number, a name) only if it is literally
present in the extracted page text, and to say so plainly when a detail
was not captured, rather than inferring a plausible-sounding value. This
was added directly in response to observed cases of fabricated specifics
in otherwise-correct task completions (see Known Limitations).

**Layered action execution with an honest failure ladder.** Actions are
attempted through a primary path first, with fallback strategies (scroll-
then-click, JS-based click, retry-on-navigation) used only when the
primary path fails — and which path was used is recorded per action, not
just whether it eventually succeeded. This keeps the fallback logic
itself measurable rather than a black box.

## Architecture Overview

```
User goal
   |
   v
Task Context Object  (original goal, last action, last result)
   |
   v
Planner  --(action plan)-->  Action execution layer
   ^                              |
   |                       primary path, then
   |                       fallback ladder if needed
   |                              |
   +------ Instinct <-------------+
   |    (confusion / stuck detection,
   |     can request human intervention)
   |
   +------ Vision
   |    (screenshot + DOM state, informs
   |     Planner when selectors are ambiguous)
   |
   v
Reasoner  (grounded final-answer composition,
           only states facts present in extracted text)
   |
   v
Response to user + structured diagnosis event
(claimed vs. verified success, failure category, log entry)
```

Supporting subsystems that feed into this loop:

- **Strider** — bounded reconnaissance (scout, extract, rank, summarize) that feeds a compact recon memo into the Planner's context instead of raw crawl data
- **element-map** — captures the page's interactive element structure directly from the live browser page (no separate browser instance, so it reflects the same session state Puppeterr is actually looking at)
- **Human.js** — motion-curve and timing-distribution helpers (easing, overshoot-and-correct, timing jitter, typing entropy) applied to Puppeterr's own actions, so its execution pattern resembles ordinary browser use rather than constant-velocity, fixed-interval automation
- **Task diagnosis events** — every task produces a structured record distinguishing infrastructure failure, reasoning failure, and completion, whether or not the task itself succeeded

## Modules

**Planner** — Executes step-by-step actions (clicking, filling inputs,
submitting forms, navigating). Interprets tasks and produces actionable
steps; may enter fallback loops when selectors fail or page state changes
unexpectedly.

**Instinct** — Monitors Planner's behavior and detects confusion, repeated
failures, invalid selectors, or stalled progress. Escalates warnings and can
request human intervention; acts as a safety layer against infinite loops.

**Reasoner** — Generates natural-language explanations of agent activity,
requests guidance from the user, and responds to user steering. The
communication layer between the autonomous system and the human operator.

**Vision** — Captures page state, extracts DOM information, identifies
visible elements, and provides context for Planner and Reasoner.

## Features

- Real-time reasoning output
- Human-in-the-loop guidance via `/api/guidance`
- Runtime event logging
- Selector fallback logic
- Basic confusion detection
- Modular architecture for browser automation
- Support for manual interruption and recovery

## Setup

1. Clone the repository
2. Install dependencies
3. Start the development server
4. Run the agent in a browser-enabled environment

See **Environment Setup** below if you hit missing-browser or missing-library
errors on first run.

## API Endpoints

| Endpoint | Description |
|---|---|
| `POST /api/guidance` | Accepts a JSON body with a `text` field; delivers user guidance to the Reasoner module |
| `POST /api/runtime` | Logs runtime events from Planner, Instinct, and Reasoner |
| `GET /api/status` | Returns the current agent state |

## Known Issues

- Planner may generate invalid selectors during fallback attempts
- Browser contexts may close unexpectedly if interrupted manually
- Guidance requests require correct JSON formatting
- Selector mutation may produce syntactically invalid CSS
- Certain pages (such as Bing's homepage) cause repeated fill failures

## Model Catalog Fallback (Text Import)

If Cloudflare model listing (`/ai/models`) returns 404 or fails, Puppeterr
can import model IDs from plain text and continue routing/selecting models.

Supported sources:

- `MODEL_CATALOG_FILE` (default: `./model-catalog.txt`)
- `MODEL_CATALOG_TEXT` (env var string, newline/comma friendly)

Accepted line formats include:

- `@cf/meta/llama-3.2-11b-vision-instruct`
- `anthropic/claude-opus-4.8`
- `id: @cf/qwen/qwen3-30b-a3b-fp8`

Quick setup:

1. Copy `model-catalog.txt.example` to `model-catalog.txt`
2. Paste your full model list (Cloudflare hosted, external, or mixed)
3. Restart `npm start`

Startup preflight now reports when text-imported models are being used.

## Future Work

- Improve selector sanity checks
- Add a structured Reasoner live-stream panel
- Implement a more robust Reality Bonk Gate for Planner
- Enhance Vision's DOM interpretation
- Add better debugging tools and UI overlays

## Browsing Performance + Quality Tunables

These env vars control key speed/quality tradeoffs in the browser loop:

- `IDLE_HUMAN_MODE`: `off | auto | always` (default `auto`)
  - `off`: disable synthetic idle mouse nudges during waits (fastest)
  - `auto`: only nudge in challenge/handoff contexts
  - `always`: keep old human-like nudging behavior everywhere
- `SUPERVISOR_SAMPLE_EVERY_STEPS` (default `2`) — reuses prior supervisor gate decisions between samples when plan/context is stable
- `INSTINCT_SAMPLE_EVERY_STEPS` (default `2`) — reduces per-step instinct model calls while still refreshing on failure/stuck/dynamic UI
- `VISION_SAMPLE_EVERY_STEPS` (default `2`) — controls how often fresh screenshot+analysis is forced when live vision is stale
- `VERIFY_EVERY_STEPS` (default `2`) — controls completion verification cadence
- `CONFUSION_RESEARCH_STEP_INTERVAL` (default `6`) — limits how frequently fallback research can run
- `CONFUSION_RESEARCH_COOLDOWN_MS` (default `180000`) — minimum delay before rerunning the same research query
- `CONFUSION_RESEARCH_BLOCKED_HOSTS` (default `google.com,bing.com,duckduckgo.com,search.yahoo.com`) — comma-separated host list where confusion research is suppressed
- `SIMPLE_BROWSING_MODE`: `off | auto | always` (default `auto`)
  - `off`: keep full layered behavior
  - `auto`: use direct-path/light-overhead behavior for simple browse/search tasks
  - `always`: aggressively prefer simple browse behavior for most tasks
- `SIMPLE_BROWSING_DYNAMIC_UI_FAIL_THRESHOLD` (default `2`) — number of failures before dynamic-UI vision-only click mode is allowed in simple browsing mode

**Supervisor cache safety:** cached supervisor decisions are invalidated
when the active host changes, reducing stale risk decisions after
cross-domain pivots.

**Simple browsing behavior:** for simple goals (known site or
straightforward search), the agent now attempts direct site navigation
first when destination is known, delays heavy recon/research layers until
failures justify escalation, reduces early pixel-grid/vision-heavy analysis
frequency, and avoids dynamic-ui vision-only click mode until repeated
failures occur.

**Related extraction/context limits:**

- `STATE_TEXT_LIMIT` (default `6000`)
- `STATE_LINK_LIMIT` (default `30`)
- `STATE_INPUT_LIMIT` (default `30`)
- `STATE_BUTTON_LIMIT` (default `25`)

## Strider + Planner Loop

Strider is wired into planner decisions as bounded reconnaissance:

1. Scout target domain with budgets (`maxRelevantUrls`, `maxDepth`, runtime cap)
2. Extract text/elements/snapshot metadata
3. Rank pages by relevance
4. Feed compact recon memo into planner (`Recon:` section)
5. Refresh recon mid-task on stuck/failure signals

This keeps planner context useful without dumping full raw crawl payloads
into each prompt.

### One-shot live element dump (dynamic DOM)

Use this when you want Strider to extract all currently rendered elements
(including JS-rendered/dynamic nodes) from the active browser page.

```bash
curl -X POST http://localhost:3000/api/strider/extract-elements \
  -H 'Content-Type: application/json' \
  -d '{
    "includeHidden": true,
    "includeText": false,
    "includeAttributes": false,
    "maxElements": 0,
    "settleMs": 250
  }'
```

Notes:
- `maxElements: 0` means no cap (all elements)
- For faster dumps, keep `includeText` and `includeAttributes` false
- You can pass `url` to navigate first, then extract

## Stress Tester

`stress-tester.js` is an autonomous harness that continuously evaluates
Puppeterr by generating randomized multi-step browser tasks, sending them
through the real `/api/chat` path, waiting for completion, and logging both
Puppeterr's final answer and its self-diagnosis.

Run it with:

```bash
PUPPETERR_EMAIL=admin PUPPETERR_PASSWORD=puppeterr npm run stress:test
```

Optional environment variables:

- `PUPPETERR_BASE_URL` default `http://127.0.0.1:3000`
- `PUPPETERR_AUTH_COOKIE` optional session cookie value for authenticated instances
- `PUPPETERR_BEARER_TOKEN` optional bearer token if your deployment accepts it
- `PUPPETERR_EMAIL` and `PUPPETERR_PASSWORD` optional login credentials for `/auth/login`
- `CF_API_TOKEN` and `CF_ACCOUNT_ID` to generate unpredictable prompts via the current reasoner model in Cloudflare
- `STRESS_TESTER_MAX_RUNS` default infinite
- `STRESS_TESTER_TIMEOUT_MS` default `480000`
- `STRESS_TESTER_BETWEEN_RUN_MS` default `3000`
- `STRESS_TESTER_LOG_FILE` default `./stress-tester-runs.jsonl`
- `STRESS_TESTER_SUMMARY_FILE` default `./stress-tester-summary.json`
- `PUPPETERR_LOG_FILE` default `./log.json`
- `STRESS_TESTER_CONCURRENCY` default `1` — number of task cycles run in parallel per batch (stresses browser pool/planner/recovery under simultaneous load)
- `STRESS_TESTER_SESSION_TIER` default `short` — one of `short | medium | long | marathon`, controls target step-count per generated task

Each run records:

- Puppeterr's final answer
- Puppeterr's self-diagnosis JSON
- detected issue categories
- timestamp
- cumulative recurring-problem summary

Stop it manually with `Ctrl+C`.

## Optional: Load Throttling (CDP)

For testing behavior under degraded conditions, CPU and network throttling
are available via Chrome DevTools Protocol — opt-in, no effect unless set:

```bash
PUPPETEERR_CPU_THROTTLE_RATE=4 npm start        # 4x CPU slowdown
PUPPETEERR_NETWORK_PROFILE=slow-3g npm start     # simulate slow 3G
```

`PUPPETEERR_NETWORK_PROFILE` options: `slow-3g`, `fast-3g`, `4g-approx`, `offline`.

---

## Environment Setup

If you hit a missing-browser or missing-library error on first run:

1. **Locate an existing Chrome install** (optional, used automatically if present):
   ```bash
   sudo find / -type f -iname "*chrome*" 2>/dev/null
   ```
2. **If not found, install Chromium via Playwright:**
   ```bash
   npx playwright install chromium
   ```
   For real Chrome specifically (preferred — see Known Issues on
   fingerprinting), use `npx playwright install chrome` instead.
3. **Install required system libraries and XVFB in one pass:**
   ```bash
   sudo apt-get update
   sudo apt-get install -y \
     libatk1.0-0 \
     libatk-bridge2.0-0 \
     libgtk-3-0 \
     libgbm1 \
     libnss3 \
     libxss1 \
     libasound2t64 \
     xvfb
   ```
4. **Run the program:**
   ```bash
   npm start
   ```

> If a later run still complains about missing display support, rerun the same install command above and verify `xvfb-run` is available with `command -v xvfb-run`.

### Clearing leftover processes

If a previous run didn't shut down cleanly (stale browser/agent processes
holding port 3000 or the profile lock):

```bash
pkill -9 node || true
pkill -9 chrome || true
pkill -9 chromium || true
pkill -9 Xvfb || true
PID=$(ss -ltnp | awk '/:3000/{match($NF,/pid=([0-9]+)/,a); print a[1]}')
[ -n "$PID" ] && kill -9 "$PID" || true
pkill -f agent.js || true
pkill -f vite || true
pkill -f webpack || true
rm -f .puppeterr-profile/SingletonLock .puppeterr-profile/SingletonSocket 2>/dev/null || true
```

### "Page can't be found" / tunnel errors

If your dev tunnel (e.g. a GitHub Codespaces forwarded URL) returns a 404 or
can't connect:

1. **Try a clean restart first:**
   ```bash
   fuser -k 3000/tcp || true
   pkill -f "node agent.js" || true
   pkill -f "xvfb-run -a node agent.js" || true
   npm start
   ```
2. **If that doesn't resolve it, the tunnel itself may be corrupted.**
   Create a new branch, push your work to it, then start a fresh Codespace
   from that branch and delete the old one:
   ```bash
   git checkout -b <new-branch-name>
   git push -u origin <new-branch-name>
   ```
   Then open a new Codespace on `<new-branch-name>` and delete the old
   Codespace instance.
