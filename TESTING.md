# Testing Quick Reference

Run these commands to test different aspects of the auto-improve system.

## Quickest Test (< 2 seconds)

```bash
npm run auto:test
```

This validates the entire pipeline with a mock agent run. **Start here.**

## Test Individual Stages

### Just the mock report + issue generation
```bash
node auto-improve/issue_generator.js
cat auto-improve/reports/issue_report.json
```

### Generate patches from issues
```bash
npm run auto:fix
jq '.patches[] | {patch_id, changed_lines: .changed_lines}' auto-improve/reports/fix_batch.json
```

### Review and score patches
```bash
npm run auto:review
jq '.results[] | {patch_id, aggregate_score: .results[].aggregate_score}' auto-improve/reports/review_batch.json
```

### Check approval decisions
```bash
npm run auto:approve
npm run auto:cli -- pending
```

## Test CLI Commands

```bash
# View system status
npm run auto:cli -- status

# List patches awaiting human review
npm run auto:cli -- pending

# Inspect a specific patch (A-E)
npm run auto:cli -- show A

# Check what reviewers said about patch A
cat auto-improve/reports/patch_evaluation_A.json | jq '.reviewers[] | {reviewer, score, notes}'
```

## Test Control Panel (Human Override)

```bash
# Disable auto-apply mode
npm run auto:cli -- toggle-auto off

# Verify it's off
npm run auto:cli -- status | jq '.auto_mode_enabled'

# Re-enable
npm run auto:cli -- toggle-auto on
```

## Test Full Pipeline (with real agent)

This runs the actual `agent.js` command:

```bash
npm run auto:run
```

To run with a timeout (kills if it takes too long):
```bash
timeout 120 npm run auto:run
```

## Test Patch Application (Git Integration)

Verify patches are clean and can be applied:

```bash
# Check all patches before applying
for id in A B C D E; do
  if git apply --check auto-improve/reports/patch_proposal_${id}.diff 2>/dev/null; then
    echo "✓ Patch $id is clean"
  else
    echo "✗ Patch $id has conflicts"
  fi
done
```

## Test with Real AI Provider

```bash
# Set up OpenAI credentials
export AI_ENDPOINT="https://api.openai.com/v1/chat/completions"
export AI_API_KEY="sk-your-key-here"
export AI_MODEL="gpt-4o-mini"

# Update config to use OpenAI
node -e "
const { loadConfig, saveConfig } = require('./auto-improve/lib/config');
const { config, configPath } = loadConfig();
config.ai_provider = 'openai_compatible';
saveConfig(config, configPath);
"

# Run test
npm run auto:test

# Check patch proposals came from real AI
cat auto-improve/reports/patch_metadata_A.json | jq '.provider, .model'
```

## Inspect Generated Artifacts

```bash
# List all reports
ls -lh auto-improve/reports/

# View a complete patch proposal
cat auto-improve/reports/patch_proposal_A.diff

# View patch metadata
cat auto-improve/reports/patch_metadata_A.json | jq '.'

# View complete evaluation for patch A
cat auto-improve/reports/patch_evaluation_A.json | jq '.'

# View all decisions
jq '.decisions' auto-improve/reports/decision_log.json

# Check what patches were applied
jq '.results[] | select(.status=="applied")' auto-improve/reports/apply_log.json
```

## Debug a Failing Stage

```bash
# Run a specific stage with full output
node auto-improve/issue_generator.js 2>&1 | head -100

# Run with Node debugger
node --inspect-brk auto-improve/fix_orchestrator.js

# Check for errors in stderr log
cat auto-improve/reports/run_stderr.log | tail -50
```

## Test Policy Gates

Change approval thresholds and re-run:

```bash
# Lower score requirement to see auto-approvals
node -e "
const { loadConfig, saveConfig } = require('./auto-improve/lib/config');
const { config, configPath } = loadConfig();
config.min_score_for_auto_approval = 600;
saveConfig(config, configPath);
"

# Re-run approval
npm run auto:approve

# Check decisions
npm run auto:cli -- pending | jq '.'
```

## Test Failure Recovery

```bash
# Delete a report to test error handling
rm auto-improve/reports/run_report.json

# Pipeline should emit safe error artifacts
npm run auto:issues
cat auto-improve/reports/issue_report.json | jq '.issues'

# Continue pipeline anyway
npm run auto:fix
npm run auto:review

# Should still work
npm run auto:approve
npm run auto:cli -- status
```

## All Available Test Commands

| Command | Purpose |
|---------|---------|
| `npm run auto:test` | Full E2E test with mock run |
| `npm run auto:orchestrate` | Run agent.js and capture output |
| `npm run auto:issues` | Generate issue report |
| `npm run auto:fix` | Generate patch proposals |
| `npm run auto:review` | Review and score patches |
| `npm run auto:approve` | Apply approval policy gates |
| `npm run auto:apply` | Apply approved patches to git |
| `npm run auto:cli -- status` | View system status |
| `npm run auto:cli -- pending` | List human-review patches |
| `npm run auto:cli -- show A` | Inspect patch A details |
| `npm run auto:run` | Run full cycle (all stages) |

## Expected Test Output

After running `npm run auto:test`, you should see:

```
=== Auto-Improve System E2E Test ===

✓ Mock run report created
✓ issue_generator completed
✓ Issue report is valid JSON
✓ fix_orchestrator completed
✓ Fix batch is valid JSON
→ Patches generated: 5
✓ review_orchestrator completed
✓ Review batch is valid JSON
→ Patches reviewed: 5
✓ auto_approval_engine completed
✓ Decision log is valid JSON
→ Decisions: 0 auto-approved, 5 requiring human review
✓ git_patch_applier completed
✓ Apply log is valid JSON
✓ All pipeline stages executed successfully

✓ E2E Test Passed
```

## Common Test Scenarios

### Scenario: I want to verify the system works before setting up AI

```bash
npm run auto:test  # This validates with mock AI responses
```

### Scenario: I want to see real patch proposals

```bash
export AI_ENDPOINT="https://api.openai.com/v1/chat/completions"
export AI_API_KEY="sk-xxx"
npm run auto:test
cat auto-improve/reports/patch_proposal_A.diff
```

### Scenario: I want to manually apply a patch and test it

```bash
npm run auto:cli -- pending     # See what needs review
npm run auto:cli -- show A      # Inspect patch A
npm run auto:cli -- apply A     # Manually apply
git log --oneline -1            # Verify commit
```

### Scenario: I want to see what happens when auto-mode is OFF

```bash
npm run auto:cli -- toggle-auto off
npm run auto:test
npm run auto:cli -- status      # auto_mode_enabled: false
```

### Scenario: I want to run the full cycle with real agent execution

```bash
npm run auto:run    # Runs everything including agent.js
npm run auto:cli -- status
npm run auto:cli -- pending
```
