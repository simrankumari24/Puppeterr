#!/usr/bin/env node
const path = require("path");
const { spawnSync } = require("child_process");
const { loadConfig } = require("./lib/config");
const { readJson, writeJson, nowIso } = require("./lib/fs_utils");

function run(cmd, cwd) {
  return spawnSync(cmd, { cwd, shell: true, encoding: "utf8" });
}

function maybeRunTests(config, repoRoot) {
  const testCommand = String(config.test_command || "").trim();
  if (!testCommand) {
    return { status: "skipped", command: "", exit_code: 0, stdout: "", stderr: "" };
  }

  const result = run(testCommand, repoRoot);
  return {
    status: result.status === 0 ? "passed" : "failed",
    command: testCommand,
    exit_code: typeof result.status === "number" ? result.status : 1,
    stdout: result.stdout || "",
    stderr: result.stderr || ""
  };
}

function applyPatchFile(repoRoot, patchPath) {
  const check = run(`git apply --check "${patchPath}"`, repoRoot);
  if (check.status !== 0) {
    return { ok: false, phase: "check", stderr: check.stderr || check.stdout || "git apply --check failed" };
  }

  const apply = run(`git apply "${patchPath}"`, repoRoot);
  if (apply.status !== 0) {
    return { ok: false, phase: "apply", stderr: apply.stderr || apply.stdout || "git apply failed" };
  }

  return { ok: true };
}

function commitPatch(repoRoot, patchId, decision) {
  const add = run("git add -A", repoRoot);
  if (add.status !== 0) {
    return { ok: false, phase: "add", stderr: add.stderr || add.stdout || "git add failed" };
  }

  const message = [
    `[auto-improve] apply patch ${patchId}`,
    "",
    `Decision: ${decision.decision}`,
    `Score: ${decision.aggregate_score}`,
    `Changed lines: ${decision.changed_lines}`
  ].join("\n");

  const commit = run(`git commit -m "${message.replace(/"/g, '\\"')}"`, repoRoot);
  if (commit.status !== 0) {
    return { ok: false, phase: "commit", stderr: commit.stderr || commit.stdout || "git commit failed" };
  }

  return { ok: true, output: commit.stdout || "" };
}

function maybeOpenPr(config, repoRoot, patchId) {
  if (!config.open_pr_after_commit) {
    return { status: "skipped" };
  }

  const title = `[auto-improve] Patch ${patchId}`;
  const body = "Auto-generated patch passed approval constraints.";
  const pr = run(`gh pr create --fill --title "${title}" --body "${body}"`, repoRoot);

  return {
    status: pr.status === 0 ? "opened" : "failed",
    stdout: pr.stdout || "",
    stderr: pr.stderr || ""
  };
}

function main() {
  const { config } = loadConfig();
  const repoRoot = config._resolved.repo_root;
  const reportsDir = config._resolved.reports_dir;

  const decisionLog = readJson(path.join(reportsDir, "decision_log.json"), { decisions: [] });
  const results = [];

  for (const decision of decisionLog.decisions || []) {
    const patchPath = path.join(reportsDir, `patch_proposal_${decision.patch_id}.diff`);

    if (decision.decision !== "AUTO_APPROVE") {
      results.push({
        patch_id: decision.patch_id,
        status: "deferred",
        reason: "HUMAN_REVIEW_REQUIRED"
      });
      continue;
    }

    if (!config.auto_mode_enabled) {
      results.push({
        patch_id: decision.patch_id,
        status: "deferred",
        reason: "auto_mode_disabled"
      });
      continue;
    }

    const applied = applyPatchFile(repoRoot, patchPath);
    if (!applied.ok) {
      results.push({ patch_id: decision.patch_id, status: "failed", phase: applied.phase, error: applied.stderr });
      continue;
    }

    const tests = maybeRunTests(config, repoRoot);
    if (tests.status === "failed") {
      results.push({
        patch_id: decision.patch_id,
        status: "failed",
        phase: "tests",
        error: tests.stderr || tests.stdout || "Tests failed",
        test_result: tests
      });
      continue;
    }

    const commit = commitPatch(repoRoot, decision.patch_id, decision);
    if (!commit.ok) {
      results.push({ patch_id: decision.patch_id, status: "failed", phase: commit.phase, error: commit.stderr });
      continue;
    }

    const pr = maybeOpenPr(config, repoRoot, decision.patch_id);

    results.push({
      patch_id: decision.patch_id,
      status: "applied",
      tests,
      commit_output: commit.output,
      pr
    });
  }

  const out = {
    created_at: nowIso(),
    auto_mode_enabled: !!config.auto_mode_enabled,
    results
  };

  const outPath = path.join(reportsDir, "apply_log.json");
  writeJson(outPath, out);

  console.log(`Apply log written: ${outPath}`);
  console.log(`applied=${results.filter(r => r.status === "applied").length}`);
}

if (require.main === module) {
  main();
}

module.exports = { main, applyPatchFile };
