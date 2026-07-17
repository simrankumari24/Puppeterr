# Quick Start: Testing the Auto-Improve System

## TL;DR

Run this to test everything in ~3 seconds:

```bash
npm run auto:test
```

That's it. You'll see:
- ✓ Full pipeline execution
- ✓ 5 patch proposals generated
- ✓ Each patch reviewed
- ✓ Approval decisions made
- ✓ All JSON reports valid

## What Just Happened

1. **Run Orchestrator** → `run_report.json` (simulated agent failure)
2. **Issue Generator** → `issue_report.json` (structured issues)
3. **Fix Orchestrator** → `patch_proposal_A.diff` through E (5 patches)
4. **Review Orchestrator** → `patch_evaluation_A.json` through E (scores 0-1000)
5. **Auto-Approval Engine** → `decision_log.json` (AUTO_APPROVE or HUMAN_REVIEW)
6. **Git Patch Applier** → `apply_log.json` (apply results)

## Inspect the Results

```bash
# View what's pending human review
npm run auto:cli -- pending

# See detailed review for patch A
npm run auto:cli -- show A

# Check system status
npm run auto:cli -- status
```

## Run with Your Own Agent

To test with a real `agent.js` run:

```bash
npm run auto:run
```

This executes the full pipeline including your actual agent code.

## Test Specific Stages

Run individual stages separately:

```bash
# Generate issues from a run
npm run auto:issues

# Generate patches
npm run auto:fix

# Review patches
npm run auto:review

# Check approval decisions
npm run auto:approve

# Apply patches
npm run auto:apply
```

## Test with Real AI

If you have OpenAI or compatible API:

```bash
export AI_ENDPOINT="https://api.openai.com/v1/chat/completions"
export AI_API_KEY="sk-..."
export AI_MODEL="gpt-4o-mini"

npm run auto:test
```

Patches will come from real AI instead of mocks.

## Test Human Override

Verify the control panel works:

```bash
# Disable auto mode
npm run auto:cli -- toggle-auto off

# Verify it's off
npm run auto:cli -- status | grep auto_mode

# Re-enable
npm run auto:cli -- toggle-auto on
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Command not found | Run `npm install` first |
| Invalid JSON errors | Check `auto-improve/config.yaml` has no pipe `\|` characters |
| No reports generated | Ensure `auto-improve/reports/` directory exists |
| Git apply fails | Make sure repo is clean with no uncommitted changes |

## Next Steps

1. **Read the docs**:
   - [auto-improve/TEST_GUIDE.md](TEST_GUIDE.md) - Detailed test scenarios
   - [auto-improve/EXAMPLE_OUTPUT.md](EXAMPLE_OUTPUT.md) - Sample JSON output
   - [auto-improve/CI_CD_INTEGRATION.md](CI_CD_INTEGRATION.md) - Jenkins/GitHub Actions

2. **Integrate into your workflow**:
   - Add to existing Jenkins pipeline
   - Create GitHub Actions workflow
   - Run on schedule or manually

3. **Connect real AI**:
   - Set `AI_ENDPOINT` and `AI_API_KEY`
   - Update `auto-improve/config.yaml`
   - Run `npm run auto:test` again

4. **Customize policies**:
   - Edit `auto-improve/config.yaml`
   - Adjust `min_score_for_auto_approval`, `max_diff_lines`
   - Toggle `allow_dependency_changes`, etc.

## Available Commands

```bash
npm run auto:test                 # Run full E2E test (< 2 seconds)
npm run auto:run                  # Run full cycle with real agent
npm run auto:orchestrate          # Run agent.js only
npm run auto:issues               # Generate issues
npm run auto:fix                  # Generate patches
npm run auto:review               # Review patches
npm run auto:approve              # Apply approval rules
npm run auto:apply                # Apply to git
npm run auto:cli -- status        # Check system status
npm run auto:cli -- pending       # List patches needing review
npm run auto:cli -- show A        # Inspect patch A
npm run auto:cli -- apply A       # Manually apply patch A
npm run auto:cli -- discard A     # Discard patch A
npm run auto:cli -- toggle-auto on   # Enable auto mode
npm run auto:cli -- toggle-auto off  # Disable auto mode
```

## File Layout

```
auto-improve/
├── lib/                    # Shared utilities
│   ├── config.js          # Config loading
│   ├── yaml.js            # YAML parser
│   ├── llm_client.js      # AI provider interface
│   ├── diff_utils.js      # Git diff analysis
│   └── fs_utils.js        # File I/O helpers
├── prompts/               # Agent role prompts
├── reports/               # Generated artifacts
│   └── (json/diff files from runs)
├── config.yaml            # Configuration
├── run_orchestrator.js    # Stage 1: Run agent
├── issue_generator.js     # Stage 2: Extract issues
├── fix_orchestrator.js    # Stage 3: Generate patches
├── review_orchestrator.js # Stage 4: Review patches
├── auto_approval_engine.js  # Stage 5: Approve
├── git_patch_applier.js   # Stage 6: Apply to git
├── human_cli.js           # Stage 7: Human control
├── pipeline.js            # Run all stages
├── test.js                # E2E test
├── README.md              # Overview
├── TEST_GUIDE.md          # Testing documentation
├── EXAMPLE_OUTPUT.md      # Sample JSON output
└── CI_CD_INTEGRATION.md   # Jenkins/GHA setup
```

## Success Criteria

After running `npm run auto:test`, you should see:

```
✓ E2E Test Passed
✓ All pipeline stages executed successfully
✓ All artifacts generated and valid
✓ CLI commands functional
```

If you see this, the system is fully operational.

## Common Test Patterns

### Pattern 1: Validate Pipeline Works
```bash
npm run auto:test
```

### Pattern 2: Check Approval Decisions
```bash
npm run auto:test
npm run auto:cli -- pending | jq '.[] | {id: .patch_id, score: .aggregate_score}'
```

### Pattern 3: Test Policy Gates
```bash
# Lower score threshold
node -e "
const { loadConfig, saveConfig } = require('./auto-improve/lib/config');
const { config, configPath } = loadConfig();
config.min_score_for_auto_approval = 600;
saveConfig(config, configPath);
"

# Re-run
npm run auto:test
npm run auto:cli -- pending | jq 'map(select(.decision == "AUTO_APPROVE")) | length'
```

### Pattern 4: Full Cycle with Real Agent
```bash
npm run auto:run
npm run auto:cli -- status
git log --oneline -5  # See if any patches committed
```

## Getting Help

All commands output JSON and text to console. Check:
- `auto-improve/reports/*.json` for detailed results
- `auto-improve/reports/*.diff` for generated patches
- `auto-improve/config.yaml` for policy configuration
- Run with `-v` or `--verbose` for more output (if supported)

For issues, inspect:
```bash
cat auto-improve/reports/run_report.json | jq '.errors'
cat auto-improve/reports/issue_report.json | jq '.issues'
cat auto-improve/reports/decision_log.json | jq '.decisions'
```
