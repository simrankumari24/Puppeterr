#!/usr/bin/env node
const path = require("path");
const { spawnSync } = require("child_process");
const { loadConfig, saveConfig } = require("./lib/config");
const { readJson, readText, writeJson, nowIso } = require("./lib/fs_utils");
const { countDiffChangedLines } = require("./lib/diff_utils");
const { main: runPipeline } = require("./pipeline");

function printUsage() {
  console.log("Usage:");
  console.log("  node auto-improve/human_cli.js status");
  console.log("  node auto-improve/human_cli.js pending");
  console.log("  node auto-improve/human_cli.js show <PATCH_ID>");
  console.log("  node auto-improve/human_cli.js apply <PATCH_ID>");
  console.log("  node auto-improve/human_cli.js discard <PATCH_ID>");
  console.log("  node auto-improve/human_cli.js toggle-auto <on|off>");
  console.log("  node auto-improve/human_cli.js run-cycle");
}

function run(cmd, cwd) {
  return spawnSync(cmd, { cwd, shell: true, encoding: "utf8" });
}

function loadDecisionContext(config) {
  const reportsDir = config._resolved.reports_dir;
  const decision = readJson(path.join(reportsDir, "decision_log.json"), { decisions: [] });
  const applyLog = readJson(path.join(reportsDir, "apply_log.json"), { results: [] });
  return { reportsDir, decision, applyLog };
}

function cmdStatus(config) {
  const { decision, applyLog } = loadDecisionContext(config);
  const autoApproved = decision.decisions.filter(d => d.decision === "AUTO_APPROVE").length;
  const pendingHuman = decision.decisions.filter(d => d.decision === "HUMAN_REVIEW_REQUIRED").length;
  const applied = (applyLog.results || []).filter(r => r.status === "applied").length;

  console.log(JSON.stringify({
    auto_mode_enabled: !!config.auto_mode_enabled,
    decisions: decision.decisions.length,
    auto_approved: autoApproved,
    human_review_required: pendingHuman,
    applied
  }, null, 2));
}

function cmdPending(config) {
  const { decision } = loadDecisionContext(config);
  const pending = decision.decisions.filter(d => d.decision === "HUMAN_REVIEW_REQUIRED");
  console.log(JSON.stringify(pending, null, 2));
}

function cmdShow(config, patchId) {
  const { reportsDir } = loadDecisionContext(config);
  const evaluation = readJson(path.join(reportsDir, `patch_evaluation_${patchId}.json`), null);
  const decision = readJson(path.join(reportsDir, "decision_log.json"), { decisions: [] })
    .decisions
    .find(d => d.patch_id === patchId) || null;

  console.log(JSON.stringify({ patch_id: patchId, decision, evaluation }, null, 2));
}

function cmdApply(config, patchId) {
  const repoRoot = config._resolved.repo_root;
  const { reportsDir } = loadDecisionContext(config);
  const patchPath = path.join(reportsDir, `patch_proposal_${patchId}.diff`);
  const patchText = readText(patchPath, "");
  if (countDiffChangedLines(patchText) === 0) {
    console.error(`Patch ${patchId} is not ready: diff is empty or invalid. Re-run fix_orchestrator first.`);
    process.exit(1);
  }

  const check = run(`git apply --check "${patchPath}"`, repoRoot);
  if (check.status !== 0) {
    console.error(check.stderr || check.stdout || "git apply --check failed");
    process.exit(1);
  }

  const apply = run(`git apply "${patchPath}"`, repoRoot);
  if (apply.status !== 0) {
    console.error(apply.stderr || apply.stdout || "git apply failed");
    process.exit(1);
  }

  run("git add -A", repoRoot);
  const commit = run(`git commit -m "[manual-override] apply patch ${patchId}"`, repoRoot);
  if (commit.status !== 0) {
    console.error(commit.stderr || commit.stdout || "git commit failed");
    process.exit(1);
  }

  const overridePath = path.join(reportsDir, "human_overrides.json");
  const existing = readJson(overridePath, { overrides: [] });
  existing.overrides.push({
    patch_id: patchId,
    action: "applied",
    actor: "VOID",
    timestamp: nowIso()
  });
  writeJson(overridePath, existing);

  console.log(`Patch ${patchId} applied by human override.`);
}

function cmdDiscard(config, patchId) {
  const { reportsDir } = loadDecisionContext(config);
  const overridePath = path.join(reportsDir, "human_overrides.json");
  const existing = readJson(overridePath, { overrides: [] });
  existing.overrides.push({
    patch_id: patchId,
    action: "discarded",
    actor: "VOID",
    timestamp: nowIso()
  });
  writeJson(overridePath, existing);
  console.log(`Patch ${patchId} discarded.`);
}

async function main() {
  const { config, configPath } = loadConfig();
  const [cmd, arg] = process.argv.slice(2);

  switch (cmd) {
    case "status":
      cmdStatus(config);
      return;
    case "pending":
      cmdPending(config);
      return;
    case "show":
      if (!arg) return printUsage();
      cmdShow(config, arg);
      return;
    case "apply":
      if (!arg) return printUsage();
      cmdApply(config, arg);
      return;
    case "discard":
      if (!arg) return printUsage();
      cmdDiscard(config, arg);
      return;
    case "toggle-auto":
      if (!["on", "off"].includes(arg)) return printUsage();
      config.auto_mode_enabled = arg === "on";
      saveConfig(config, configPath);
      console.log(`auto_mode_enabled=${config.auto_mode_enabled}`);
      return;
    case "run-cycle":
      await runPipeline();
      return;
    default:
      printUsage();
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { main };
