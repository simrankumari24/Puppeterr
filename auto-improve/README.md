# Auto-Improve System

This module implements a supervised self-improvement loop for Puppeterr.

## Architecture

1. Run Orchestrator (`run_orchestrator.js`)
- Runs `agent.js` through configured command.
- Captures stdout, stderr, runtime, exit code.
- Extracts errors, warnings, retry/timeout signals, affected files/functions.
- Writes `run_report.json`.

2. Issue Generator (`issue_generator.js`)
- Reads `run_report.json`.
- Produces structured issues and opportunities.
- Writes `issue_report.json`.

3. Multi-Agent Fix Generator (`fix_orchestrator.js`)
- Reads `issue_report.json` and `run_report.json`.
- Generates five specialized patch proposals (A-E).
- Writes `patch_proposal_*.diff` and `patch_metadata_*.json`.

4. Patch Reviewer & Scorer (`review_orchestrator.js`)
- Runs two strict reviewers per patch.
- Produces aggregate score, policy flags, blockers.
- Writes `patch_evaluation_*.json` and `review_batch.json`.

5. Auto-Approval Engine (`auto_approval_engine.js`)
- Applies strict policy gates.
- Decision per patch: `AUTO_APPROVE` or `HUMAN_REVIEW_REQUIRED`.
- Writes `decision_log.json`.

6. Git Patch Applier (`git_patch_applier.js`)
- For `AUTO_APPROVE` patches and enabled auto mode:
  - `git apply --check`
  - `git apply`
  - optional tests
  - commit
  - optional PR open using `gh`
- For non-approved patches: defers for human.
- Writes `apply_log.json`.

7. Human Control CLI (`human_cli.js`)
- `status`, `pending`, `show`, `apply`, `discard`, `toggle-auto`, `run-cycle`.
- Supports explicit human override by VOID.

## Data Flow

`run_orchestrator` -> `run_report.json`

`issue_generator` <- `run_report.json` -> `issue_report.json`

`fix_orchestrator` <- (`run_report.json`, `issue_report.json`) -> `patch_proposal_*.diff`

`review_orchestrator` <- `patch_proposal_*.diff` -> `patch_evaluation_*.json`

`auto_approval_engine` <- `patch_evaluation_*.json` -> `decision_log.json`

`git_patch_applier` <- `decision_log.json` -> commit/PR or defer

`human_cli` can inspect or override at any point after decisions exist.

## Safety Rules

Policy gates implemented in `auto_approval_engine.js`:
- minimum reviewer score
- maximum changed lines
- dependency changes blocked by default
- license changes blocked by default
- environment-breaking risk blocked by default
- reviewer blocking issues must be empty

Operational guardrails:
- no destructive git commands
- patch dry-check before apply
- optional tests before commit
- auto mode can be toggled off in config or CLI

## Failure Modes and Handling

- Missing reports: downstream stage emits safe error artifacts.
- AI provider unavailable: falls back to deterministic mock behavior.
- Invalid patch: rejected at `git apply --check`.
- Test failures: patch is not committed.
- Low confidence score/policy failure: routed to human review.

## Commands

- `npm run auto:run`
- `npm run auto:orchestrate`
- `npm run auto:issues`
- `npm run auto:fix`
- `npm run auto:review`
- `npm run auto:approve`
- `npm run auto:apply`
- `npm run auto:cli -- status`

## AI Provider Modes

Config key `ai_provider`:
- `mock`: deterministic placeholder outputs.
- `openai_compatible`: calls endpoint from env vars:
  - `AI_ENDPOINT`
  - `AI_API_KEY`
  - optional `AI_MODEL`

This keeps the pipeline runnable even before secrets are configured.
