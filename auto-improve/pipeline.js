#!/usr/bin/env node
const { main: runOrchestrator } = require("./run_orchestrator");
const { main: issueGenerator } = require("./issue_generator");
const { main: fixOrchestrator } = require("./fix_orchestrator");
const { main: reviewOrchestrator } = require("./review_orchestrator");
const { main: approvalEngine } = require("./auto_approval_engine");
const { main: patchApplier } = require("./git_patch_applier");
const { createProgressBar } = require("./lib/progress");

async function main() {
  const stages = [
    { name: "Run orchestrator", fn: runOrchestrator },
    { name: "Issue generator", fn: issueGenerator },
    { name: "Fix orchestrator", fn: fixOrchestrator },
    { name: "Review orchestrator", fn: reviewOrchestrator },
    { name: "Auto-approval engine", fn: approvalEngine },
    { name: "Git patch applier", fn: patchApplier }
  ];

  const progress = createProgressBar({ total: stages.length, label: "Auto-improve cycle" });

  for (const stage of stages) {
    console.log(`Running stage: ${stage.name}`);
    await Promise.resolve(stage.fn());
    progress.tick(stage.name);
  }

  progress.complete("cycle complete");
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { main };
