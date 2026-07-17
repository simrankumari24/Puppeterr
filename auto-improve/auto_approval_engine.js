#!/usr/bin/env node
const path = require("path");
const { loadConfig } = require("./lib/config");
const { readJson, writeJson, nowIso } = require("./lib/fs_utils");

function decideForPatch(config, evaluation) {
  const reasons = [];
  const constraints = {
    score_ok: evaluation.aggregate_score >= Number(config.min_score_for_auto_approval || 800),
    diff_ok: evaluation.changed_lines < Number(config.max_diff_lines || 150),
    dependency_ok: config.allow_dependency_changes ? true : !evaluation.policy_flags.dependency_changes,
    license_ok: config.allow_license_changes ? true : !evaluation.policy_flags.license_changes,
    env_ok: config.apply_env_breaking_changes ? true : !evaluation.policy_flags.env_breaking_risk,
    has_blockers: (evaluation.reviewer_blockers || []).length === 0
  };

  if (!constraints.score_ok) reasons.push(`Score below threshold (${evaluation.aggregate_score})`);
  if (!constraints.diff_ok) reasons.push(`Diff too large (${evaluation.changed_lines} lines)`);
  if (!constraints.dependency_ok) reasons.push("Dependency change not allowed");
  if (!constraints.license_ok) reasons.push("License change not allowed");
  if (!constraints.env_ok) reasons.push("Potential environment-breaking change blocked");
  if (!constraints.has_blockers) reasons.push("Reviewer blocking issues present");

  return {
    patch_id: evaluation.patch_id,
    decision: reasons.length === 0 ? "AUTO_APPROVE" : "HUMAN_REVIEW_REQUIRED",
    aggregate_score: evaluation.aggregate_score,
    changed_lines: evaluation.changed_lines,
    reasons,
    constraints
  };
}

function main() {
  const { config } = loadConfig();
  const reportsDir = config._resolved.reports_dir;

  const reviewBatch = readJson(path.join(reportsDir, "review_batch.json"), { results: [] });
  const decisions = [];

  for (const item of reviewBatch.results || []) {
    const evaluation = readJson(item.evaluation_path, null);
    if (!evaluation) continue;
    decisions.push(decideForPatch(config, evaluation));
  }

  const payload = {
    created_at: nowIso(),
    auto_mode_enabled: !!config.auto_mode_enabled,
    min_score_for_auto_approval: Number(config.min_score_for_auto_approval || 800),
    max_diff_lines: Number(config.max_diff_lines || 150),
    decisions
  };

  const outPath = path.join(reportsDir, "decision_log.json");
  writeJson(outPath, payload);

  console.log(`Decision log saved: ${outPath}`);
  console.log(`auto-approved=${decisions.filter(d => d.decision === "AUTO_APPROVE").length}`);
}

if (require.main === module) {
  main();
}

module.exports = { main, decideForPatch };
