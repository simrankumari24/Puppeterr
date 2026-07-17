#!/usr/bin/env node
const path = require("path");
const { loadConfig } = require("./lib/config");
const { readJson, readText, writeJson, nowIso } = require("./lib/fs_utils");
const { generateWithProvider, extractJsonObject, fallbackReview } = require("./lib/llm_client");
const { countDiffChangedLines, listTouchedFiles, hasDependencyChanges, hasLicenseChanges, hasPotentialEnvBreakingChanges } = require("./lib/diff_utils");
const { createProgressBar } = require("./lib/progress");
const { mapWithConcurrency } = require("./lib/async_pool");

async function reviewOne(config, patchId, diffText, reviewerRole, reviewerPrompt, issueReport) {
  const prompt = [
    `You are strict reviewer ${reviewerRole} for patch ${patchId}.`,
    reviewerPrompt,
    "Return JSON keys: score(0-1000), notes(array of strings), blocking_issues(array of strings).",
    "Issue report:",
    JSON.stringify(issueReport || {}, null, 2),
    "Patch diff:",
    diffText
  ].join("\n\n");

  const response = await generateWithProvider(
    config,
    prompt,
    "{\"score\":0,\"notes\":[\"\"],\"blocking_issues\":[\"\"]}"
  );

  const parsed = extractJsonObject(response.text);
  if (!parsed || typeof parsed.score !== "number") {
    const fallback = fallbackReview(patchId, diffText, reviewerRole);
    return {
      reviewer: reviewerRole,
      provider: response.provider,
      model: response.model,
      score: fallback.score,
      notes: fallback.notes,
      blocking_issues: []
    };
  }

  return {
    reviewer: reviewerRole,
    provider: response.provider,
    model: response.model,
    score: Math.max(0, Math.min(1000, Math.round(parsed.score))),
    notes: Array.isArray(parsed.notes) ? parsed.notes.slice(0, 20) : [],
    blocking_issues: Array.isArray(parsed.blocking_issues) ? parsed.blocking_issues.slice(0, 20) : []
  };
}

async function main() {
  const { config } = loadConfig();
  const effectiveConfig = {
    ...config,
    ai_model: String(config.ai_model_reviewer || config.ai_model || "openai/gpt-5.6-sol")
  };
  const reportsDir = config._resolved.reports_dir;

  const batch = readJson(path.join(reportsDir, "fix_batch.json"), { patches: [] });
  const issueReport = readJson(path.join(reportsDir, "issue_report.json"), {});

  const outputs = [];
  const patches = batch.patches || [];
  const progress = createProgressBar({ total: Math.max(1, patches.length * 2), label: "Reviewing patch proposals" });
  const reviewerConcurrency = Math.max(1, Number(config.max_parallel_reviews || 3));

  const results = await mapWithConcurrency(patches, async (patch) => {
    const diffText = readText(patch.patch_path, "");
    const primary = await reviewOne(
      effectiveConfig,
      patch.patch_id,
      diffText,
      "primary",
      String(effectiveConfig.agents.reviewer_primary || ""),
      issueReport
    );
    progress.tick(`${patch.patch_id} primary`);
    const secondary = await reviewOne(
      effectiveConfig,
      patch.patch_id,
      diffText,
      "secondary",
      String(effectiveConfig.agents.reviewer_secondary || ""),
      issueReport
    );
    progress.tick(`${patch.patch_id} secondary`);

    const changedLines = countDiffChangedLines(diffText);
    const touchedFiles = listTouchedFiles(diffText);
    const avg = Math.round((primary.score + secondary.score) / 2);

    const evaluation = {
      patch_id: patch.patch_id,
      created_at: nowIso(),
      changed_lines: changedLines,
      touched_files: touchedFiles,
      policy_flags: {
        dependency_changes: hasDependencyChanges(diffText),
        license_changes: hasLicenseChanges(diffText),
        env_breaking_risk: hasPotentialEnvBreakingChanges(diffText)
      },
      reviewers: [primary, secondary],
      aggregate_score: avg,
      reviewer_notes: [...primary.notes, ...secondary.notes],
      reviewer_blockers: [...primary.blocking_issues, ...secondary.blocking_issues]
    };

    const outPath = path.join(reportsDir, `patch_evaluation_${patch.patch_id}.json`);
    writeJson(outPath, evaluation);

    return { patch_id: patch.patch_id, evaluation_path: outPath, aggregate_score: avg };
  }, reviewerConcurrency);

  outputs.push(...results);

  writeJson(path.join(reportsDir, "review_batch.json"), {
    created_at: nowIso(),
    total: outputs.length,
    results: outputs
  });

  progress.complete("all reviews complete");

  console.log(`Patch evaluations written: ${outputs.length}`);
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { main };
