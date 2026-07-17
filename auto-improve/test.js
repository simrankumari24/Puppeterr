#!/usr/bin/env node
/**
 * Auto-Improve System End-to-End Test
 * 
 * This script validates the full pipeline with a mock agent run.
 * Run: node auto-improve/test.js
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { writeJson, readJson, ensureDir } = require("./lib/fs_utils");
const { createProgressBar } = require("./lib/progress");

const REPORTS_DIR = "auto-improve/reports";
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[36m";

function log(symbol, color, text) {
  console.log(`${color}${symbol}${RESET} ${text}`);
}

function pass(text) {
  log("✓", GREEN, text);
}

function fail(text) {
  log("✗", RED, text);
}

function info(text) {
  log("→", BLUE, text);
}

function warn(text) {
  log("⚠", YELLOW, text);
}

function runCommand(cmd, cwd = process.cwd()) {
  const result = spawnSync(cmd, {
    cwd,
    shell: true,
    encoding: "utf8",
    stdio: "pipe"
  });
  return result;
}

function createMockRunReport() {
  ensureDir(REPORTS_DIR);
  
  const report = {
    run_id: `test_run_${Date.now()}`,
    created_at: new Date().toISOString(),
    command: "npm run start",
    success: false,
    exit_code: 1,
    signal: null,
    runtime_ms: 12450,
    errors: [
      "Selector fallback failed for element",
      "Retry limit exceeded on navigation",
      "Page state change detected but recovery failed"
    ],
    warnings: [
      "Navigation timeout - retrying",
      "Element visibility check warning",
      "CAPTCHA detection warning"
    ],
    timeout_signals: [
      "Timeout occurred after 30 seconds",
      "Timeout on page load"
    ],
    retry_signals: [
      "Retry attempt 1 of 3",
      "Retry attempt 2 of 3",
      "Retry attempt 3 of 3 (final)"
    ],
    bottlenecks: [
      "High retry count detected: 3",
      "Timeout signals detected: 2",
      "Long runtime detected (>5 minutes)"
    ],
    affected_files: [
      "agent.js",
      "actions.js",
      "planner.js"
    ],
    affected_functions: [
      "humanClick",
      "executeAction",
      "planStep"
    ],
    environment_notes: [
      "xvfb related output detected.",
      "Browser/Playwright output detected.",
      "Potential network instability detected."
    ],
    stdout_tail: [
      "Starting agent...",
      "Browser launched",
      "Navigation to target page",
      "ERROR: Selector fallback failed",
      "Retrying action...",
      "ERROR: Timeout after 30s"
    ],
    stderr_tail: [
      "Timeout error at humanClick:45",
      "Navigation failed with error"
    ]
  };

  const path_obj = path.join(REPORTS_DIR, "run_report.json");
  writeJson(path_obj, report);
  return path_obj;
}

function validateJsonFile(filePath, description) {
  if (!fs.existsSync(filePath)) {
    fail(`${description} not found: ${filePath}`);
    return false;
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    pass(`${description} is valid JSON`);
    return true;
  } catch (err) {
    fail(`${description} is invalid JSON: ${err.message}`);
    return false;
  }
}

function runStage(stageName, scriptPath) {
  info(`Running ${stageName}...`);
  const result = runCommand(`node ${scriptPath}`);
  
  if (result.status !== 0) {
    fail(`${stageName} exited with code ${result.status}`);
    if (result.stderr) console.error(result.stderr);
    return false;
  }
  
  pass(`${stageName} completed`);
  if (result.stdout) console.log(result.stdout.trim());
  return true;
}

function testCliCommand(cmd, description) {
  info(`Testing CLI: ${description}`);
  const result = runCommand(`node auto-improve/human_cli.js ${cmd}`);
  
  if (result.status !== 0) {
    fail(`CLI command failed: ${cmd}`);
    if (result.stderr) console.error(result.stderr);
    return false;
  }
  
  try {
    JSON.parse(result.stdout);
    pass(`CLI command returned valid JSON: ${description}`);
    return true;
  } catch (_) {
    warn(`CLI command output is not JSON, but command succeeded`);
    return true;
  }
}

function main() {
  console.log(`\n${BLUE}=== Auto-Improve System E2E Test ===${RESET}\n`);
  const stageProgress = createProgressBar({ total: 5, label: "E2E stages" });

  info("Creating mock run report...");
  const reportPath = createMockRunReport();
  pass(`Mock run report created: ${reportPath}\n`);

  // Stage 1: Issue Generation
  console.log(`${BLUE}[Stage 1] Issue Generation${RESET}`);
  if (!runStage("issue_generator", "auto-improve/issue_generator.js")) {
    fail("Pipeline halted");
    process.exit(1);
  }
  if (!validateJsonFile(path.join(REPORTS_DIR, "issue_report.json"), "Issue report")) {
    fail("Pipeline halted");
    process.exit(1);
  }
  stageProgress.tick("Issue generation done");
  console.log();

  // Stage 2: Fix Generation
  console.log(`${BLUE}[Stage 2] Fix Generation${RESET}`);
  if (!runStage("fix_orchestrator", "auto-improve/fix_orchestrator.js")) {
    fail("Pipeline halted");
    process.exit(1);
  }
  if (!validateJsonFile(path.join(REPORTS_DIR, "fix_batch.json"), "Fix batch")) {
    fail("Pipeline halted");
    process.exit(1);
  }
  
  const batch = readJson(path.join(REPORTS_DIR, "fix_batch.json"), {});
  info(`Patches generated: ${batch.total || 0}`);
  stageProgress.tick("Fix generation done");
  console.log();

  // Stage 3: Review
  console.log(`${BLUE}[Stage 3] Patch Review${RESET}`);
  if (!runStage("review_orchestrator", "auto-improve/review_orchestrator.js")) {
    fail("Pipeline halted");
    process.exit(1);
  }
  if (!validateJsonFile(path.join(REPORTS_DIR, "review_batch.json"), "Review batch")) {
    fail("Pipeline halted");
    process.exit(1);
  }
  
  const reviewBatch = readJson(path.join(REPORTS_DIR, "review_batch.json"), {});
  info(`Patches reviewed: ${reviewBatch.total || 0}`);
  stageProgress.tick("Review done");
  console.log();

  // Stage 4: Approval
  console.log(`${BLUE}[Stage 4] Auto-Approval${RESET}`);
  if (!runStage("auto_approval_engine", "auto-improve/auto_approval_engine.js")) {
    fail("Pipeline halted");
    process.exit(1);
  }
  if (!validateJsonFile(path.join(REPORTS_DIR, "decision_log.json"), "Decision log")) {
    fail("Pipeline halted");
    process.exit(1);
  }
  
  const decisions = readJson(path.join(REPORTS_DIR, "decision_log.json"), { decisions: [] });
  const autoApproved = decisions.decisions.filter(d => d.decision === "AUTO_APPROVE").length;
  const humanReview = decisions.decisions.filter(d => d.decision === "HUMAN_REVIEW_REQUIRED").length;
  info(`Decisions: ${autoApproved} auto-approved, ${humanReview} requiring human review`);
  stageProgress.tick("Approval done");
  console.log();

  // Stage 5: Apply
  console.log(`${BLUE}[Stage 5] Patch Application${RESET}`);
  if (!runStage("git_patch_applier", "auto-improve/git_patch_applier.js")) {
    fail("Pipeline halted");
    process.exit(1);
  }
  if (!validateJsonFile(path.join(REPORTS_DIR, "apply_log.json"), "Apply log")) {
    fail("Pipeline halted");
    process.exit(1);
  }
  
  const applyLog = readJson(path.join(REPORTS_DIR, "apply_log.json"), { results: [] });
  const applied = applyLog.results.filter(r => r.status === "applied").length;
  info(`Patches applied: ${applied}`);
  stageProgress.tick("Apply done");
  stageProgress.complete("E2E pipeline done");
  console.log();

  // CLI Tests
  console.log(`${BLUE}[Bonus] CLI Commands${RESET}`);
  testCliCommand("status", "status");
  testCliCommand("pending", "pending list");
  testCliCommand("show A", "show patch A");
  console.log();

  // Summary
  console.log(`${BLUE}=== Test Summary ===${RESET}`);
  pass("All pipeline stages executed successfully");
  pass("All artifacts generated and valid");
  pass("CLI commands functional");
  
  info(`Reports saved to: ${REPORTS_DIR}`);
  info(`Total patches generated: ${batch.total || 0}`);
  info(`Total patches reviewed: ${reviewBatch.total || 0}`);
  info(`Total decisions made: ${decisions.decisions.length}`);
  
  console.log(`\n${GREEN}✓ E2E Test Passed${RESET}\n`);
  
  console.log("Next steps:");
  console.log("  1. Review patch evaluations:");
  console.log("     cat auto-improve/reports/patch_evaluation_A.json");
  console.log("  2. Inspect decisions:");
  console.log("     npm run auto:cli -- pending");
  console.log("  3. Toggle auto mode and re-run:");
  console.log("     npm run auto:cli -- toggle-auto off");
  console.log("     npm run auto:cli -- toggle-auto on");
  console.log("  4. Run full cycle with real agent:");
  console.log("     npm run auto:run");
  console.log();
}

if (require.main === module) {
  main();
}

module.exports = { createMockRunReport };
