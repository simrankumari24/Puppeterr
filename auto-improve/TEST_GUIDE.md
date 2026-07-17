# Testing the Auto-Improve System

This guide covers testing scenarios from unit validation to full end-to-end integration.

## Quick Start: Dry Run (No Agent Execution)

The fastest way to validate the pipeline without running `agent.js`:

```bash
# Generate a mock issue report (simulates a failed run)
node auto-improve/issue_generator.js

# Generate 5 patch proposals in mock mode
node auto-improve/fix_orchestrator.js

# Evaluate patches with mock reviewers
node auto-improve/review_orchestrator.js

# Apply approval policy gates
node auto-improve/auto_approval_engine.js

# Check what's pending
node auto-improve/human_cli.js pending
```

This completes in seconds and verifies artifact flow without needing browser/agent overhead.

## Scenario 1: Test Config Loading

Verify YAML parsing and config resolution:

```bash
node -e "
const { loadConfig } = require('./auto-improve/lib/config');
const { config } = loadConfig();
console.log('Config loaded:');
console.log('  auto_mode_enabled:', config.auto_mode_enabled);
console.log('  min_score_for_auto_approval:', config.min_score_for_auto_approval);
console.log('  reports_dir:', config._resolved.reports_dir);
console.log('  repo_root:', config._resolved.repo_root);
"
```

Expected output: paths resolve correctly, boolean flags are true/false (not strings).

## Scenario 2: Test CLI Commands

Inspect and interact with pending patches:

```bash
# View current status
npm run auto:cli -- status

# List patches requiring human review
npm run auto:cli -- pending

# Inspect detailed evaluation for patch A
npm run auto:cli -- show A

# Check what reviewers said
cat auto-improve/reports/patch_evaluation_A.json | node -e "
const fs = require('fs');
let data = '';
process.stdin.on('data', c => data += c);
process.stdin.on('end', () => {
  const eval = JSON.parse(data);
  console.log('Patch:', eval.patch_id);
  console.log('Score:', eval.aggregate_score);
  console.log('Primary reviewer:', eval.reviewers[0].notes);
  console.log('Secondary reviewer:', eval.reviewers[1].notes);
});
"
```

## Scenario 3: Test Auto Mode Toggle

Verify the control mechanism:

```bash
# Check current state
npm run auto:cli -- status | grep auto_mode

# Disable auto mode
npm run auto:cli -- toggle-auto off

# Verify
npm run auto:cli -- status | grep auto_mode

# Re-enable
npm run auto:cli -- toggle-auto on

# Verify
npm run auto:cli -- status | grep auto_mode
```

This tests the human override path.

## Scenario 4: Test Patch Validation (Git Apply Check)

Before actually applying, validate a patch can be applied cleanly:

```bash
# Check if patch A would apply
git apply --check auto-improve/reports/patch_proposal_A.diff 2>&1 && echo "✓ Patch A is valid" || echo "✗ Patch A has conflicts"

# Same for B-E
for id in B C D E; do
  git apply --check auto-improve/reports/patch_proposal_${id}.diff 2>&1 && \
    echo "✓ Patch $id is valid" || \
    echo "✗ Patch $id has conflicts"
done
```

## Scenario 5: Manual Patch Application (Human Override)

Test the manual apply path:

```bash
# Apply patch A via CLI (requires git in clean state)
npm run auto:cli -- apply A

# Verify it committed
git log --oneline -1

# Check the override was logged
cat auto-improve/reports/human_overrides.json
```

## Scenario 6: Full End-to-End with Mock Agent

Create a minimal test script that simulates an agent run with known output:

Create `test-auto-improve-e2e.js`:

```javascript
#!/usr/bin/env node
const { spawnSync } = require("child_process");
const path = require("path");
const { writeJson } = require("./auto-improve/lib/fs_utils");

// Simulate a run_report with known issues
const fakeRunReport = {
  run_id: "test_run_001",
  created_at: new Date().toISOString(),
  success: false,
  exit_code: 1,
  runtime_ms: 5000,
  errors: ["Selector fallback failed", "Retry limit exceeded"],
  warnings: ["Navigation timeout: retrying"],
  timeout_signals: ["Timeout occurred after 30s"],
  retry_signals: ["Retry attempt 1", "Retry attempt 2", "Retry attempt 3"],
  bottlenecks: ["High retry count detected: 3", "Timeout signals detected: 1"],
  affected_files: ["planner.js", "retry.js"],
  affected_functions: ["planStep", "executeRetry"]
};

const reportsDir = "auto-improve/reports";
writeJson(path.join(reportsDir, "run_report.json"), fakeRunReport);
console.log("✓ Fake run report created");

// Now run the pipeline
const stages = [
  "issue_generator",
  "fix_orchestrator",
  "review_orchestrator",
  "auto_approval_engine",
  "git_patch_applier"
];

for (const stage of stages) {
  console.log(`\n▶ Running ${stage}...`);
  const result = spawnSync(`node auto-improve/${stage}.js`, {
    cwd: process.cwd(),
    shell: true,
    encoding: "utf8"
  });
  
  if (result.status !== 0) {
    console.error(`✗ ${stage} failed:`);
    console.error(result.stderr || result.stdout);
    process.exit(1);
  }
  
  console.log(`✓ ${stage} completed`);
  console.log(result.stdout);
}

console.log("\n✓ Full pipeline completed successfully!");
console.log("Check auto-improve/reports/ for outputs:");
require("child_process").execSync("ls -lh auto-improve/reports/*.json", { stdio: "inherit" });
```

Run it:
```bash
node test-auto-improve-e2e.js
```

## Scenario 7: Real Agent Run (Full Integration)

To test with the actual agent:

```bash
# 1. Run just the orchestrator (this runs agent.js)
npm run auto:orchestrate

# 2. Check if it succeeded
cat auto-improve/reports/run_report.json | jq '.success, .errors, .warnings'

# 3. If successful, generate issues
npm run auto:issues

# 4. Generate patches
npm run auto:fix

# 5. Review patches
npm run auto:review

# 6. Approve patches
npm run auto:approve

# 7. Check what got approved
cat auto-improve/reports/decision_log.json | jq '.decisions[] | {patch_id, decision}'

# 8. Apply if auto_mode is on
npm run auto:apply

# 9. Check git log
git log --oneline -3
```

Or run the full cycle in one command:
```bash
npm run auto:run
```

## Scenario 8: Test with Real AI Provider

To connect to OpenAI or compatible provider:

```bash
# Set credentials
export AI_ENDPOINT="https://api.openai.com/v1/chat/completions"
export AI_API_KEY="sk-..."
export AI_MODEL="gpt-4o-mini"

# Update config
node -e "
const { loadConfig, saveConfig } = require('./auto-improve/lib/config');
const { config, configPath } = loadConfig();
config.ai_provider = 'openai_compatible';
saveConfig(config, configPath);
console.log('Config updated to use OpenAI');
"

# Run pipeline
npm run auto:run

# Check actual AI proposals
cat auto-improve/reports/patch_metadata_A.json
```

## Scenario 9: Test Policy Gates

Verify approval constraints work:

```bash
node -e "
const { loadConfig, saveConfig } = require('./auto-improve/lib/config');
const { config, configPath } = loadConfig();

// Lower score threshold to see auto-approvals
config.min_score_for_auto_approval = 600;

// Enable auto mode
config.auto_mode_enabled = true;

saveConfig(config, configPath);
console.log('Policy updated: min_score=600, auto_mode=on');
"

# Re-run approval engine
npm run auto:approve

# Check if patches auto-approved
cat auto-improve/reports/decision_log.json | jq '.decisions[] | {patch_id, decision}'
```

## Scenario 10: Test Failure Handling

Verify graceful degradation:

```bash
# Delete run report to trigger missing-report error path
rm auto-improve/reports/run_report.json

# Run issue generator
npm run auto:issues

# Should emit safe error artifact
cat auto-improve/reports/issue_report.json | jq '.issues[0]'

# Continue pipeline anyway
npm run auto:fix

# Should generate patches despite missing run report
cat auto-improve/reports/fix_batch.json | jq '.total'
```

## Inspection Commands

Quick commands to inspect pipeline state:

```bash
# View all reports at once
ls -lh auto-improve/reports/*.json

# Count patches generated
jq '.total' auto-improve/reports/fix_batch.json

# Check aggregate scores
jq '.results[] | {patch_id, aggregate_score}' auto-improve/reports/review_batch.json

# List all decisions
jq '.decisions[] | {patch_id, decision}' auto-improve/reports/decision_log.json

# Check if any patches were applied
jq '.results[] | select(.status=="applied") | .patch_id' auto-improve/reports/apply_log.json

# View human override log
cat auto-improve/reports/human_overrides.json 2>/dev/null || echo "No overrides yet"
```

## Debugging

To debug a specific stage:

```bash
# Add verbose logging by running directly with inspect
node --inspect-brk auto-improve/fix_orchestrator.js

# Or add temporary console.log and run:
node auto-improve/issue_generator.js 2>&1 | head -50

# Check full logs
cat auto-improve/reports/run_stdout.log | tail -100
cat auto-improve/reports/run_stderr.log | tail -100
```

## Performance Benchmarks

Typical execution times (mock mode):

- run_orchestrator: 5-60s (depends on agent complexity)
- issue_generator: <100ms
- fix_orchestrator: ~500ms (5 LLM calls, mock fallback)
- review_orchestrator: ~1s (10 LLM calls, mock fallback)
- auto_approval_engine: <50ms
- git_patch_applier: <100ms (no-op in mock mode)
- Full cycle (mock): ~2s without agent, 5-65s with agent

## Success Criteria

A successful test should show:

- ✓ Config loads without errors
- ✓ All JSON reports are valid and readable
- ✓ Patch proposals have non-empty diffs (or deterministic mocks)
- ✓ Reviewers output scores 0-1000
- ✓ Approval engine makes policy decisions
- ✓ CLI commands return structured JSON
- ✓ Human overrides log correctly
- ✓ Git apply --check passes on generated diffs
- ✓ No crashes or unhandled exceptions

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Config not found | Run any script once; it auto-generates. |
| YAML parse errors | Verify no pipe `\|` characters in config values. |
| Empty patches | Check if AI provider returned mock JSON. |
| Low scores | Adjust `min_score_for_auto_approval` down. |
| Git apply fails | Ensure repo is clean, no uncommitted changes. |
| CLI shows no pending | Check `auto_mode_enabled` is true or decision log is empty. |
| LLM calls timeout | Set `AI_ENDPOINT` and `AI_API_KEY` correctly. |

