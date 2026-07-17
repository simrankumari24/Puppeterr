# CI/CD Integration Guide

This guide shows how to integrate the auto-improve system into existing CI/CD pipelines.

## Jenkins Integration

### Add to Existing Jenkinsfile

Update your `Jenkinsfile` to run auto-improve after the main agent run:

```groovy
pipeline {
    agent any

    environment {
        CF_API_TOKEN = credentials('CF_API_TOKEN')
        CF_ACCOUNT_ID = credentials('CF_ACCOUNT_ID')
        AI_ENDPOINT = credentials('AI_ENDPOINT')           // Optional
        AI_API_KEY = credentials('AI_API_KEY')             // Optional
        AI_MODEL = credentials('AI_MODEL')                 // Optional
    }

    stages {
        stage('Install Chromium') {
            steps {
                bat '''
                npx playwright install chromium
                '''
            }
        }

        stage('Install Dependencies') {
            steps {
                bat '''
                npm ci
                '''
            }
        }

        stage('Run Agent') {
            steps {
                catchError(buildResult: 'SUCCESS', stageResult: 'SUCCESS') {
                    timeout(time: 60, unit: 'MINUTES') {
                        bat '''
                        set CF_API_TOKEN=%CF_API_TOKEN%
                        set CF_ACCOUNT_ID=%CF_ACCOUNT_ID%
                        node auto-improve/run_orchestrator.js
                        '''
                    }
                }
            }
        }

        stage('Auto-Improve Pipeline') {
            steps {
                bat '''
                REM Generate issues from run output
                node auto-improve/issue_generator.js
                
                REM Generate patch proposals
                node auto-improve/fix_orchestrator.js
                
                REM Review patches
                node auto-improve/review_orchestrator.js
                
                REM Apply approval policy
                node auto-improve/auto_approval_engine.js
                
                REM Apply approved patches (if auto_mode_enabled)
                node auto-improve/git_patch_applier.js
                '''
            }
        }

        stage('Archive Reports') {
            steps {
                archiveArtifacts artifacts: 'auto-improve/reports/**/*.json,auto-improve/reports/**/*.diff',
                                 onlyIfSuccessful: false,
                                 allowEmptyArchive: true
            }
        }

        stage('Publish Decision Summary') {
            steps {
                script {
                    def decision = readJSON file: 'auto-improve/reports/decision_log.json'
                    def autoApproved = decision.decisions.count { it.decision == 'AUTO_APPROVE' }
                    def humanReview = decision.decisions.count { it.decision == 'HUMAN_REVIEW_REQUIRED' }
                    
                    echo """
                    ===== Auto-Improve Summary =====
                    Auto-Approved Patches: ${autoApproved}
                    Patches Requiring Human Review: ${humanReview}
                    Total Decisions: ${decision.decisions.size()}
                    ================================
                    """
                }
            }
        }
    }

    post {
        always {
            bat '''
            echo Cleaning up leftover processes...
            taskkill /F /IM node.exe /T 2>nul || true
            taskkill /F /IM chrome.exe /T 2>nul || true
            '''
        }
        failure {
            echo "Build failed — forcing SUCCESS for pipeline continuity."
            script { currentBuild.result = 'SUCCESS' }
        }
    }
}
```

### Key Points for Jenkins

- AI provider credentials stored in Jenkins credential manager
- Archive all reports for later inspection
- Use catchError to prevent agent failures from halting auto-improve
- Publish summary to build log
- Cleanup orphan processes in post-action

## GitHub Actions Integration

### Create `.github/workflows/auto-improve.yml`

```yaml
name: Auto-Improve Pipeline

on:
  schedule:
    # Run daily at 2 AM UTC
    - cron: '0 2 * * *'
  workflow_dispatch:  # Allow manual trigger

jobs:
  auto-improve:
    runs-on: ubuntu-latest
    
    environment:
      name: auto-improve
    
    permissions:
      contents: write
      pull-requests: write
      
    env:
      AI_ENDPOINT: ${{ secrets.AI_ENDPOINT }}
      AI_API_KEY: ${{ secrets.AI_API_KEY }}
      AI_MODEL: ${{ secrets.AI_MODEL }}
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install Chromium
        run: npx playwright install chromium
      
      - name: Install dependencies
        run: npm ci
      
      - name: Install xvfb
        run: |
          sudo apt-get update
          sudo apt-get install -y xvfb
      
      - name: Run agent with orchestrator
        id: agent-run
        run: |
          xvfb-run -a node auto-improve/run_orchestrator.js
        continue-on-error: true
      
      - name: Generate issues
        run: node auto-improve/issue_generator.js
      
      - name: Generate patch proposals
        run: node auto-improve/fix_orchestrator.js
      
      - name: Review patches
        run: node auto-improve/review_orchestrator.js
      
      - name: Apply approval policy
        run: node auto-improve/auto_approval_engine.js
      
      - name: Apply approved patches
        id: apply-patches
        run: node auto-improve/git_patch_applier.js
        continue-on-error: true
      
      - name: Parse results
        id: parse
        run: |
          PENDING=$(jq '.decisions | length' auto-improve/reports/decision_log.json)
          AUTO_APPROVED=$(jq '.decisions | map(select(.decision == "AUTO_APPROVE")) | length' auto-improve/reports/decision_log.json)
          HUMAN_REVIEW=$(jq '.decisions | map(select(.decision == "HUMAN_REVIEW_REQUIRED")) | length' auto-improve/reports/decision_log.json)
          
          echo "pending=${PENDING}" >> $GITHUB_OUTPUT
          echo "auto_approved=${AUTO_APPROVED}" >> $GITHUB_OUTPUT
          echo "human_review=${HUMAN_REVIEW}" >> $GITHUB_OUTPUT
      
      - name: Comment on PR if patches applied
        if: steps.apply-patches.outcome == 'success'
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `## Auto-Improve Report\n\n- ✓ Patches Reviewed\n- 🤖 Auto-Approved: ${{ steps.parse.outputs.auto_approved }}\n- 👤 Require Human Review: ${{ steps.parse.outputs.human_review }}\n\nSee run logs for details.`
            })
      
      - name: Upload reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: auto-improve-reports
          path: auto-improve/reports/
          retention-days: 30
      
      - name: Slack notification
        if: always()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "Auto-Improve Pipeline",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Auto-Improve Pipeline*\n• Decisions: ${{ steps.parse.outputs.pending }}\n• Auto-Approved: ${{ steps.parse.outputs.auto_approved }}\n• Require Review: ${{ steps.parse.outputs.human_review }}"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
          SLACK_WEBHOOK_TYPE: INCOMING_WEBHOOK
```

### Key Points for GitHub Actions

- Schedule runs daily or on manual trigger
- Checkout with full history for git operations
- xvfb for headless browser support
- Parse JSON reports and expose as outputs
- Comment on PRs with summary (if patches applied)
- Upload artifacts for inspection
- Optional Slack notification

## GitLab CI Integration

### Create `.gitlab-ci.yml` addition

```yaml
auto-improve:
  stage: post-test
  image: node:20
  before_script:
    - apt-get update
    - apt-get install -y xvfb chromium-browser
    - npm ci
    - npx playwright install --with-deps chromium
  script:
    - xvfb-run -a node auto-improve/run_orchestrator.js || true
    - node auto-improve/issue_generator.js
    - node auto-improve/fix_orchestrator.js
    - node auto-improve/review_orchestrator.js
    - node auto-improve/auto_approval_engine.js
    - node auto-improve/git_patch_applier.js
  artifacts:
    paths:
      - auto-improve/reports/
    reports:
      dotenv: auto-improve/reports/summary.env
    expire_in: 30 days
  when: always
  allow_failure: true
```

## Configuration for CI/CD

### In your CI/CD secrets, set:

```
AI_ENDPOINT=https://api.openai.com/v1/chat/completions  (or your provider)
AI_API_KEY=sk-xxxxx
AI_MODEL=gpt-4o-mini
```

Or use local/mock mode (requires no secrets):

```
# Leave blank for mock mode, which generates deterministic test patches
```

### Auto-Improve Config for CI

Create `auto-improve/config.ci.yaml` for stricter policies in CI:

```yaml
auto_mode_enabled: false              # Manual review required in CI
min_score_for_auto_approval: 900      # Higher bar in CI
max_diff_lines: 100                   # Stricter size limit
allow_dependency_changes: false
allow_license_changes: false
apply_env_breaking_changes: false
open_pr_after_commit: true            # Auto-open PR if human applies

paths:
  repo_root: .
  reports_dir: auto-improve/reports
```

Load it in CI with:
```bash
export AUTO_IMPROVE_CONFIG=auto-improve/config.ci.yaml
node auto-improve/auto_approval_engine.js
```

## Best Practices

1. **Run After Main Agent**: Always run auto-improve after main run completes
2. **Archive Reports**: Keep all generated reports for audit trail
3. **Fail Gracefully**: Use `continue-on-error: true` so pipeline continues
4. **Require Manual Review in CI**: Set `auto_mode_enabled: false` for safety
5. **Monitor Logs**: Check that AI provider calls succeed
6. **Set Timeouts**: Agent might hang; use `timeout` wrapper
7. **Clean Up**: Kill leftover processes in post-step
8. **Credentials**: Use provider secrets for AI (never hardcode keys)

## Monitoring Dashboard

You can create a dashboard to track patches over time:

```bash
# Generate reports CSV for analysis
jq -r '.decisions[] | [.patch_id, .decision, .aggregate_score] | @csv' auto-improve/reports/decision_log.json

# Count patches by week
find auto-improve/reports -name 'run_report.json' -mtime -7 | wc -l
```

## Troubleshooting CI/CD

| Issue | Solution |
|-------|----------|
| xvfb not found | Install: `sudo apt-get install xvfb` |
| Browser hangs | Kill processes: `pkill -9 node; pkill -9 chromium` |
| No AI output | Check `AI_ENDPOINT` and `AI_API_KEY` in secrets |
| Git apply fails | Ensure clean repo before running |
| Reports missing | Check previous stage output in logs |

## Example: Scheduled Daily Auto-Improve

This runs daily and automatically applies low-risk patches:

```yaml
# GitHub Actions: .github/workflows/daily-auto-improve.yml
name: Daily Auto-Improve

on:
  schedule:
    - cron: '0 2 * * *'  # 2 AM daily

jobs:
  improve:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: |
          npm ci
          npx playwright install chromium
          sudo apt-get install -y xvfb
      - run: npm run auto:run
      - uses: EndBug/add-and-commit@v9
        if: success()
        with:
          message: '[auto-improve] Daily patch cycle'
          pull: true
```

This runs every day, applies approved patches automatically, and commits them.
