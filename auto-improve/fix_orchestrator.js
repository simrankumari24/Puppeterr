#!/usr/bin/env node
const path = require("path");
const { spawnSync } = require("child_process");
const { loadConfig } = require("./lib/config");
const { readJson, readText, writeJson, writeText, nowIso } = require("./lib/fs_utils");
const { generateWithProvider, extractJsonObject, stripCodeFenceWrappers } = require("./lib/llm_client");
const { countDiffChangedLines, listTouchedFiles } = require("./lib/diff_utils");
const { createProgressBar } = require("./lib/progress");
const { mapWithConcurrency } = require("./lib/async_pool");

const CODER_AGENTS = [
  { id: "A", key: "coder_logic", label: "Logic Fixes" },
  { id: "B", key: "coder_performance", label: "Performance" },
  { id: "C", key: "coder_safety", label: "Safety/Stability" },
  { id: "D", key: "coder_readability", label: "Readability/Maintainability" },
  { id: "E", key: "coder_environment", label: "Environment/Puppeteer/Tunnel Stability" }
];

function buildPrompt(agentLabel, rolePrompt, issueReport, runReport) {
  return [
    `You are coder agent: ${agentLabel}`,
    rolePrompt,
    "Task: output ONE unified diff patch as strict JSON.",
    "Return ONLY valid JSON with exactly one key named diff.",
    "Return EXACTLY this shape: {\"diff\":\"unified diff text\"}",
    "Do NOT include any other keys.",
    "Do NOT include markdown, prose, comments, or code fences.",
    "Do NOT wrap the diff in arrays or nested objects.",
    "If you cannot produce a real diff, still return valid JSON with an empty diff string.",
    "Issue report:",
    JSON.stringify(issueReport || {}, null, 2),
    "Run report:",
    JSON.stringify(runReport || {}, null, 2)
  ].join("\n\n");
}

function stripCodeFences(text) {
  return String(text || "").replace(/^```[a-zA-Z]*\s*/m, "").replace(/```\s*$/m, "").trim();
}

function extractUnifiedDiff(text) {
  const value = stripCodeFences(text);
  if (!value) return "";
  const fromGit = value.indexOf("diff --git ");
  if (fromGit >= 0) return value.slice(fromGit).trim();

  const fromHeader = value.search(/^---\s+/m);
  if (fromHeader >= 0 && /\n\+\+\+\s+/m.test(value) && /\n@@\s+/m.test(value)) {
    return value.slice(fromHeader).trim();
  }

  return "";
}

function normalizeUnifiedDiffPaths(diffText, repoRoot) {
  const repo = String(repoRoot || "").replace(/\\/g, "/").replace(/\/+$/, "");
  const lines = String(diffText || "").split(/\r?\n/);

  const normalized = lines.map((line) => {
    if (line.startsWith("--- ") || line.startsWith("+++ ")) {
      const prefix = line.slice(0, 4);
      const file = line.slice(4).trim();
      if (file === "/dev/null") return line;

      let value = file;
      value = value.replace(/^\"|\"$/g, "");
      value = value.replace(/^a\//, "");
      value = value.replace(/^b\//, "");

      const repoPrefix = `${repo}/`;
      if (repo && value.startsWith(repoPrefix)) {
        value = value.slice(repoPrefix.length);
      }

      if (value.startsWith("/")) {
        return line;
      }

      const side = prefix === "--- " ? "a" : "b";
      return `${prefix}${side}/${value}`;
    }
    return line;
  });

  return normalized.join("\n").trim();
}

function parseStrictDiffJson(text) {
  const raw = stripCodeFenceWrappers(String(text || "").trim());
  if (!raw) {
    return { ok: false, reason: "empty-response", diff: "" };
  }

  if (!raw.startsWith("{") || !raw.endsWith("}")) {
    return { ok: false, reason: "not-pure-json-object", diff: "" };
  }

  if (/```|^[-*]\s|^#+\s|\n[A-Za-z].*:/m.test(raw)) {
    return { ok: false, reason: "contains-prose-or-markdown", diff: "" };
  }

  const parsed = extractJsonObject(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "json-parse-failed", diff: "" };
  }

  const keys = Object.keys(parsed);
  if (keys.length !== 1 || keys[0] !== "diff") {
    return { ok: false, reason: "json-shape-invalid", diff: "" };
  }

  if (typeof parsed.diff !== "string") {
    return { ok: false, reason: "diff-not-string", diff: "" };
  }

  const diff = parsed.diff.trim();
  if (!diff) {
    return { ok: false, reason: "diff-empty", diff: "" };
  }

  if (/```|^[-*]\s|^#+\s/.test(diff)) {
    return { ok: false, reason: "diff-contains-markdown", diff: "" };
  }

  const unified = extractUnifiedDiff(diff);
  if (!unified) {
    return { ok: false, reason: "diff-not-unified", diff: "" };
  }

  return { ok: true, reason: "ok", diff: unified };
}

function validatePatchWithGitApply(diffText, repoRoot, reportsDir, patchId, attempt) {
  const tempPath = path.join(reportsDir, `patch_validate_${patchId}_attempt_${attempt}.diff`);
  writeText(tempPath, diffText.endsWith("\n") ? diffText : `${diffText}\n`);
  const check = spawnSync(`git apply --check "${tempPath}"`, {
    cwd: repoRoot,
    shell: true,
    encoding: "utf8"
  });

  return {
    ok: check.status === 0,
    error: (check.stderr || check.stdout || "").trim(),
    temp_path: tempPath
  };
}

async function generatePatch(config, reportsDir, issueReport, runReport, coderSpec) {
  const effectiveConfig = {
    ...config,
    ai_model: String(config.ai_model_coder || config.ai_model || "anthropic/claude-sonnet-4.5")
  };

  const basePrompt = buildPrompt(
    coderSpec.label,
    String(effectiveConfig.agents[coderSpec.key] || ""),
    issueReport,
    runReport
  );

  const maxAttempts = Math.max(1, Number(effectiveConfig.max_generation_attempts || 3));
  const requireNonEmptyDiff = String(effectiveConfig.require_non_empty_diff ?? true) !== "false";

  let selected = {
    diff: ""
  };
  let selectedResponse = { provider: effectiveConfig.ai_provider || "unknown", model: effectiveConfig.ai_model || "unknown", text: "" };
  const attemptArtifacts = [];
  let lastFailureReason = "none";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const retryHint = attempt === 1
      ? ""
      : [
          "",
          `Previous attempt ${attempt - 1} was invalid because no unified diff was detected.`,
          `Previous invalid reason: ${lastFailureReason}.`,
          "Return ONLY valid JSON with exactly one field named diff.",
          "The JSON must be exactly: {\"diff\":\"...\"} and nothing else.",
          "Do NOT include markdown, explanation text, code fences, or extra keys.",
          "The diff must be unified diff format with diff --git, ---, +++, and @@ hunks.",
          "If you cannot comply, output {\"diff\":\"\"} and no other text."
        ].join("\n");

    const response = await generateWithProvider(
      effectiveConfig,
      `${basePrompt}${retryHint}`,
      "{\"diff\":\"unified diff\"}"
    );

    const strict = parseStrictDiffJson(response.text);
    let strictReason = strict.reason;
    let validationError = null;

    let candidateDiff = strict.diff;
    if (strict.ok && candidateDiff) {
      candidateDiff = normalizeUnifiedDiffPaths(candidateDiff, config._resolved.repo_root);
      const applyCheck = validatePatchWithGitApply(
        candidateDiff,
        config._resolved.repo_root,
        reportsDir,
        coderSpec.id,
        attempt
      );
      if (!applyCheck.ok) {
        strictReason = "git-apply-check-failed";
        validationError = applyCheck.error;
      }
    }

    const changedLines = strictReason === "ok" ? countDiffChangedLines(candidateDiff) : 0;
    const rawPath = path.join(reportsDir, `patch_raw_${coderSpec.id}_attempt_${attempt}.txt`);
    writeText(rawPath, String(response.text || ""));

    attemptArtifacts.push({
      attempt,
      raw_path: rawPath,
      strict_reason: strictReason,
      validation_error: validationError,
      changed_lines: changedLines,
      accepted: strictReason === "ok" && (changedLines > 0 || !requireNonEmptyDiff)
    });

    selected = { diff: strictReason === "ok" ? candidateDiff : "" };
    selectedResponse = response;
    lastFailureReason = strictReason;

    if (strictReason === "ok" && (changedLines > 0 || !requireNonEmptyDiff)) {
      break;
    }
  }

  const diff = String(selected.diff || "");

  const patchPath = path.join(reportsDir, `patch_proposal_${coderSpec.id}.diff`);
  const metaPath = path.join(reportsDir, `patch_metadata_${coderSpec.id}.json`);

  const existingPatch = readText(patchPath, "");
  const existingNormalizedPatch = normalizeUnifiedDiffPaths(existingPatch, config._resolved.repo_root);
  const existingChangedLines = countDiffChangedLines(existingNormalizedPatch);
  const existingValid = existingChangedLines > 0
    ? validatePatchWithGitApply(existingNormalizedPatch, config._resolved.repo_root, reportsDir, coderSpec.id, "existing").ok
    : false;
  const generatedAccepted = countDiffChangedLines(diff) > 0 || !requireNonEmptyDiff;
  const finalDiff = generatedAccepted
    ? diff
    : (existingValid ? existingNormalizedPatch : "");
  const effectiveAccepted = countDiffChangedLines(finalDiff) > 0 || !requireNonEmptyDiff;

  // Never overwrite a previously valid patch with an invalid/empty generation.
  writeText(patchPath, finalDiff.endsWith("\n") ? finalDiff : `${finalDiff}\n`);

  const attemptsUsed = attemptArtifacts.length;
  const accepted = effectiveAccepted;

  const meta = {
    patch_id: coderSpec.id,
    coder_label: coderSpec.label,
    created_at: nowIso(),
    provider: selectedResponse.provider,
    model: selectedResponse.model,
    title: `${coderSpec.label} proposal`,
    rationale: generatedAccepted
      ? "Accepted strict JSON diff output."
      : `No valid strict JSON diff after ${attemptsUsed} attempts. ${effectiveAccepted ? "Retained previous valid patch." : "No valid patch available."}`,
    risk: accepted ? "unknown" : "high",
    test_plan: "Generated automatically.",
    changed_lines: countDiffChangedLines(finalDiff),
    touched_files: listTouchedFiles(finalDiff),
    attempts_used: attemptsUsed,
    accepted,
    generated_accepted: generatedAccepted,
    retained_previous_patch: !generatedAccepted && existingValid,
    require_non_empty_diff: requireNonEmptyDiff,
    last_failure_reason: generatedAccepted ? null : lastFailureReason,
    attempt_artifacts: attemptArtifacts
  };

  writeJson(metaPath, meta);

  return {
    patch_id: coderSpec.id,
    patch_path: patchPath,
    metadata_path: metaPath,
    changed_lines: meta.changed_lines,
    touched_files: meta.touched_files
  };
}

async function main() {
  const { config } = loadConfig();
  const reportsDir = config._resolved.reports_dir;

  const issueReport = readJson(path.join(reportsDir, "issue_report.json"), {});
  const runReport = readJson(path.join(reportsDir, "run_report.json"), {});

  const generated = [];
  const coderConcurrency = Math.max(1, Number(config.max_parallel_coders || 2));
  const progress = createProgressBar({ total: CODER_AGENTS.length, label: "Generating patch proposals" });
  const results = await mapWithConcurrency(CODER_AGENTS, async (coder) => {
    const result = await generatePatch(config, reportsDir, issueReport, runReport, coder);
    progress.tick(`${coder.id} ${coder.label} (${result.changed_lines} lines)`);
    return result;
  }, coderConcurrency);
  generated.push(...results);
  progress.complete("all proposals generated");

  const batch = {
    created_at: nowIso(),
    total: generated.length,
    patches: generated
  };

  const batchPath = path.join(reportsDir, "fix_batch.json");
  writeJson(batchPath, batch);

  console.log(`Patch proposals generated: ${generated.length}`);
  console.log(`Batch report saved: ${batchPath}`);
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { main };
