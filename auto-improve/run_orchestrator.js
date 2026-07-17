#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { loadConfig } = require("./lib/config");
const { ensureDir, writeJson, nowIso } = require("./lib/fs_utils");

function collectMatches(text, regex) {
  const out = [];
  const source = String(text || "");
  let m;
  while ((m = regex.exec(source)) !== null) {
    const v = (m[1] || m[0] || "").trim();
    if (v) out.push(v);
  }
  return Array.from(new Set(out));
}

function parseRunSignals(stdout, stderr, runtimeMs) {
  const all = `${stdout || ""}\n${stderr || ""}`;
  const errors = collectMatches(all, /^.*(?:error|exception|failed|fatal).*$/gim);
  const warnings = collectMatches(all, /^.*(?:warn|warning|deprecated).*$/gim);
  const timeoutHits = collectMatches(all, /^.*(?:timeout|timed out).*$/gim);
  const retryHits = collectMatches(all, /^.*(?:retry|attempt \d+).*$/gim);

  const affectedFiles = collectMatches(all, /([\w./-]+\.(?:js|mjs|cjs|ts|json|yaml|yml|py))(?:[:\s)]|$)/gim);
  const affectedFunctions = collectMatches(all, /at\s+([A-Za-z0-9_$<>.]+)\s*\(/gim);

  const bottlenecks = [];
  if (timeoutHits.length) bottlenecks.push(`Timeout signals detected: ${timeoutHits.length}`);
  if (retryHits.length > 2) bottlenecks.push(`High retry count detected: ${retryHits.length}`);
  if (runtimeMs > 5 * 60 * 1000) bottlenecks.push("Long runtime detected (>5 minutes)");

  const environmentNotes = [];
  if (/xvfb/i.test(all)) environmentNotes.push("xvfb related output detected.");
  if (/chromium|playwright/i.test(all)) environmentNotes.push("Browser/Playwright output detected.");
  if (/econnrefused|enotfound|network/i.test(all)) environmentNotes.push("Potential network instability detected.");

  return {
    errors,
    warnings,
    timeout_signals: timeoutHits,
    retry_signals: retryHits,
    bottlenecks,
    affected_files: affectedFiles,
    affected_functions: affectedFunctions,
    environment_notes: environmentNotes
  };
}

function runAgent(config) {
  const repoRoot = config._resolved.repo_root;
  const command = String(config.run_command || "node agent.js");
  const start = Date.now();
  const result = spawnSync(command, {
    cwd: repoRoot,
    shell: true,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  const end = Date.now();

  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    exit_code: typeof result.status === "number" ? result.status : 1,
    runtime_ms: end - start,
    signal: result.signal || null,
    command
  };
}

function main() {
  const { config } = loadConfig();
  const reportsDir = config._resolved.reports_dir;
  ensureDir(reportsDir);

  const run = runAgent(config);
  const parsed = parseRunSignals(run.stdout, run.stderr, run.runtime_ms);

  const report = {
    run_id: `run_${Date.now()}`,
    created_at: nowIso(),
    command: run.command,
    success: run.exit_code === 0,
    exit_code: run.exit_code,
    signal: run.signal,
    runtime_ms: run.runtime_ms,
    ...parsed,
    stdout_tail: run.stdout.split(/\r?\n/).slice(-80),
    stderr_tail: run.stderr.split(/\r?\n/).slice(-80)
  };

  const reportPath = path.join(reportsDir, "run_report.json");
  writeJson(reportPath, report);

  fs.writeFileSync(path.join(reportsDir, "run_stdout.log"), run.stdout, "utf8");
  fs.writeFileSync(path.join(reportsDir, "run_stderr.log"), run.stderr, "utf8");

  console.log(`Run report saved: ${reportPath}`);
  console.log(`success=${report.success} exit=${report.exit_code} runtime_ms=${report.runtime_ms}`);
}

if (require.main === module) {
  main();
}

module.exports = { main, parseRunSignals };
