### Puppeterr
PROJECT OVERVIEW!!!
This project implements a browser‑automation agent composed of four cooperating modules: Planner, Instinct, Reasoner, and Vision. The system is designed to execute tasks inside a browser environment while providing real‑time reasoning, human guidance, and runtime logging. The goal is to approximate a guided autonomous workflow similar to Devin-style agents. If you wish to see what going to be patched/added you may wish to view TODO.md

MODULES
Planner
Executes step-by-step actions such as clicking, filling inputs, submitting forms, and navigating pages. Planner is responsible for interpreting tasks and producing actionable steps. It may enter fallback loops when selectors fail or page state changes unexpectedly.

Instinct
Monitors Planner’s behavior and detects confusion, repeated failures, invalid selectors, or stalled progress. Instinct can escalate warnings and request human intervention. It acts as a safety layer to prevent infinite loops or runaway behavior.

Reasoner
Generates natural-language explanations of what the agent is doing. It can request guidance from the user and respond to user-provided steering. Reasoner is the communication layer between the autonomous system and the human operator.

Vision
Captures page state, extracts DOM information, identifies visible elements, and provides context for Planner and Reasoner. Vision helps the agent understand what is currently on the screen.

FEATURES

Real-time reasoning output

Human-in-the-loop guidance via /api/guidance

Runtime event logging

Selector fallback logic

Basic confusion detection

Modular architecture for browser automation

Support for manual interruption and recovery

SETUP
Clone the repository.
Install dependencies.
Start the development server.
Run the agent in a browser-enabled environment.

API ENDPOINTS
POST /api/guidance
Accepts a JSON body containing a "text" field. This endpoint delivers user guidance to the Reasoner module.

POST /api/runtime
Logs runtime events from Planner, Instinct, and Reasoner.

GET /api/status
Returns the current agent state.

KNOWN ISSUES
Planner may generate invalid selectors during fallback attempts.
Browser contexts may close unexpectedly if interrupted manually.
Guidance requests require correct JSON formatting.
Selector mutation may produce syntactically invalid CSS.
Certain pages (such as Bing’s homepage) cause repeated fill failures.

## Model Catalog Fallback (Text Import)

If Cloudflare model listing (`/ai/models`) returns 404 or fails, Puppeterr can import model IDs from plain text and continue routing/selecting models.

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

FUTURE WORK
Improve selector sanity checks.
Add a structured Reasoner live-stream panel.
Implement a more robust Reality Bonk Gate for Planner.
Enhance Vision’s DOM interpretation.
Add better debugging tools and UI overlays.

## Browsing Performance + Quality Tunables

These env vars now control key speed/quality tradeoffs in the browser loop:

- `IDLE_HUMAN_MODE`: `off | auto | always` (default `auto`)
  - `off`: disable synthetic idle mouse nudges during waits (fastest)
  - `auto`: only nudge in challenge/handoff contexts
  - `always`: keep old human-like nudging behavior everywhere
- `SUPERVISOR_SAMPLE_EVERY_STEPS` (default `2`)
  - Reuses prior supervisor gate decisions between samples when plan/context is stable
- `INSTINCT_SAMPLE_EVERY_STEPS` (default `2`)
  - Reduces per-step instinct model calls while still refreshing on failure/stuck/dynamic UI
- `VISION_SAMPLE_EVERY_STEPS` (default `2`)
  - Controls how often fresh screenshot+analysis is forced when live vision is stale
- `VERIFY_EVERY_STEPS` (default `2`)
  - Controls completion verification cadence
- `CONFUSION_RESEARCH_STEP_INTERVAL` (default `6`)
  - Limits how frequently fallback research can run
- `CONFUSION_RESEARCH_COOLDOWN_MS` (default `180000`)
  - Minimum delay before rerunning the same research query
- `CONFUSION_RESEARCH_BLOCKED_HOSTS` (default `google.com,bing.com,duckduckgo.com,search.yahoo.com`)
  - Comma-separated host list where confusion research is suppressed
- `SIMPLE_BROWSING_MODE`: `off | auto | always` (default `auto`)
  - `off`: keep full layered behavior
  - `auto`: use direct-path/light-overhead behavior for simple browse/search tasks
  - `always`: aggressively prefer simple browse behavior for most tasks
- `SIMPLE_BROWSING_DYNAMIC_UI_FAIL_THRESHOLD` (default `2`)
  - Number of failures before dynamic-UI vision-only click mode is allowed in simple browsing mode

Supervisor cache safety:

- Cached supervisor decisions are invalidated when the active host changes, reducing stale risk decisions after cross-domain pivots.

Simple browsing behavior:

- For simple goals (known site or straightforward search), the agent now:
  - attempts direct site navigation first when destination is known
  - delays heavy recon/research layers until failures justify escalation
  - reduces early pixel-grid/vision-heavy analysis frequency
  - avoids dynamic-ui vision-only click mode until repeated failures occur

Related extraction/context limits:

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

This keeps planner context useful without dumping full raw crawl payloads into each prompt.

### One-shot live element dump (dynamic DOM)

Use this when you want Strider to extract all currently rendered elements (including JS-rendered/dynamic nodes) from the active browser page.

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
- `maxElements: 0` means no cap (all elements).
- For faster dumps, keep `includeText` and `includeAttributes` false.
- You can pass `url` to navigate first, then extract.

## Stress Tester

`stress-tester.js` is an autonomous harness that continuously evaluates Puppeterr by generating randomized multi-step browser tasks, sending them through the real `/api/chat` path, waiting for completion, and logging both Puppeterr's final answer and its self-diagnosis.

Run it with:

```PUPPETERR_EMAIL=admin PUPPETERR_PASSWORD=puppeterr npm run stress:test
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

Each run records:

- Puppeterr's final answer
- Puppeterr's self-diagnosis JSON
- detected issue categories
- timestamp
- cumulative recurring-problem summary

Stop it manually with `Ctrl+C`.


### Very helpful manual

use "sudo find / -type f -iname "*chrome*" 2>/dev/null" fr a full nuke search and

"npx playwright install chromium" if u dont find it anyway


then install the required libaries 

"
sudo apt-get update
sudo apt-get install -y \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libgtk-3-0 \
  libgbm1 \
  libnss3 \
  libxss1 \
  libasound2t64
"

to run the program itself you need to run this cmd
"npm start"
if xvfb (it fails because of a module issue) not 'INSTALLED' do this

"
sudo apt-get update
sudo apt-get install -y xvfb
"

if you have leftover processes from the agent... do this

"
echo ":INFO: Clearing leftover processes"
sleep 2 && echo "..."
echo '...' && sleep 2 && echo '...'
pkill -9 node       || true
pkill -9 chrome     || true
pkill -9 chromium   || true
pkill -9 Xvfb       || true
PID=$(ss -ltnp | awk '/:3000/{match($NF,/pid=([0-9]+)/,a); print a[1]}')
[ -n "$PID" ] && kill -9 "$PID" || true
pkill -f agent.js   || true
pkill -f vite       || true
pkill -f webpack    || true
rm -f .puppeterr-profile/SingletonLock \
      .puppeterr-profile/SingletonSocket 2>/dev/null || true
echo '...' && sleep 0.5
echo ':INFO: Leftover processes have been cleared'
"
if you see this error 

"This congenial-halibut-wr945p799g5vc5rvx-3000.app.github.dev page can’t be found
No webpage was found for the web address: https://localhost:3000 HTTP ERROR 404"

then... 

A: the project is being goofy
or 
B: the instance crashed

use this to clean start it

"
fuser -k 3000/tcp || true
pkill -f "node agent.js" || true
pkill -f "xvfb-run -a node agent.js" || true
npm start
"
if that doesnt work... then your tunnel is corrupted and you will need to 

A: create a orhphan branch
"
git checkout *rnd name here*
"
then
B:
push to that branch then create a new codespaces there and delete your other one which had a corrupted tunnel.
