#!/usr/bin/env node
const path = require("path");
const { loadConfig } = require("./lib/config");
const { readJson, writeJson, nowIso } = require("./lib/fs_utils");

function buildIssueReport(runReport) {
  const issues = [];

  if (!runReport) {
    issues.push({
      id: "ISSUE-NO-RUN-REPORT",
      severity: "high",
      category: "pipeline",
      summary: "run_report.json is missing. Cannot evaluate agent performance.",
      evidence: []
    });
    return {
      summary: {
        total_issues: issues.length,
        high_severity: 1,
        medium_severity: 0,
        low_severity: 0
      },
      issues,
      opportunities: ["Execute run_orchestrator.js before issue generation."]
    };
  }

  if (!runReport.success) {
    issues.push({
      id: "ISSUE-RUN-FAILED",
      severity: "high",
      category: "runtime",
      summary: "Agent run exited with failure status.",
      evidence: runReport.errors || []
    });
  }

  if ((runReport.timeout_signals || []).length > 0) {
    issues.push({
      id: "ISSUE-TIMEOUT-SIGNALS",
      severity: "high",
      category: "stability",
      summary: "Timeout behavior detected during execution.",
      evidence: runReport.timeout_signals
    });
  }

  if ((runReport.retry_signals || []).length > 2) {
    issues.push({
      id: "ISSUE-HIGH-RETRY-COUNT",
      severity: "medium",
      category: "logic",
      summary: "Excessive retry behavior indicates uncertain control flow.",
      evidence: runReport.retry_signals
    });
  }

  if ((runReport.warnings || []).length > 0) {
    issues.push({
      id: "ISSUE-WARNINGS-PRESENT",
      severity: "low",
      category: "maintainability",
      summary: "Warnings were emitted and should be reviewed.",
      evidence: runReport.warnings.slice(0, 20)
    });
  }

  if (runReport.runtime_ms > 5 * 60 * 1000) {
    issues.push({
      id: "ISSUE-LONG-RUNTIME",
      severity: "medium",
      category: "performance",
      summary: "Execution runtime exceeded 5 minutes.",
      evidence: [`runtime_ms=${runReport.runtime_ms}`]
    });
  }

  const opportunities = [];
  if ((runReport.affected_files || []).length > 0) {
    opportunities.push("Prioritize patch generation around recently affected files.");
  }
  if ((runReport.environment_notes || []).length > 0) {
    opportunities.push("Generate environment hardening patch candidates.");
  }
  opportunities.push("Add deterministic tests around unstable planner/retry pathways.");

  const high = issues.filter(i => i.severity === "high").length;
  const medium = issues.filter(i => i.severity === "medium").length;
  const low = issues.filter(i => i.severity === "low").length;

  return {
    summary: {
      total_issues: issues.length,
      high_severity: high,
      medium_severity: medium,
      low_severity: low
    },
    issues,
    opportunities
  };
}

function main() {
  const { config } = loadConfig();
  const reportsDir = config._resolved.reports_dir;
  const runReportPath = path.join(reportsDir, "run_report.json");
  const issueReportPath = path.join(reportsDir, "issue_report.json");

  const runReport = readJson(runReportPath, null);
  const report = buildIssueReport(runReport);

  const payload = {
    created_at: nowIso(),
    source_run_report: runReportPath,
    ...report
  };

  writeJson(issueReportPath, payload);
  console.log(`Issue report saved: ${issueReportPath}`);
  console.log(`issues=${payload.summary.total_issues}`);
}

if (require.main === module) {
  main();
}

module.exports = { main, buildIssueReport };
