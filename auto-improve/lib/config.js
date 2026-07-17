const fs = require("fs");
const path = require("path");
const { parseYaml, toYaml } = require("./yaml");

const DEFAULT_CONFIG_PATH = path.join(process.cwd(), "auto-improve", "config.yaml");

function getDefaultConfig() {
  const repoRoot = process.cwd();
  return {
    auto_mode_enabled: true,
    min_score_for_auto_approval: 800,
    max_diff_lines: 150,
    allow_dependency_changes: false,
    allow_license_changes: false,
    apply_env_breaking_changes: false,
    open_pr_after_commit: false,
    run_command: "node agent.js",
    test_command: "",
    max_parallel_coders: 2,
    max_parallel_reviews: 3,
    max_generation_attempts: 3,
    require_non_empty_diff: true,
    ai_provider: "cloudflare",
    ai_model: "anthropic/claude-sonnet-4.5",
    ai_model_coder: "anthropic/claude-sonnet-4.5",
    ai_model_reviewer: "openai/gpt-5.6-sol",
    paths: {
      repo_root: repoRoot,
      agent_entry: "agent.js",
      reports_dir: "auto-improve/reports"
    },
    agents: {
      coder_logic: "Fix core logic errors with minimal and safe diffs.",
      coder_performance: "Improve performance bottlenecks without changing behavior.",
      coder_safety: "Improve resilience, retries, and error handling.",
      coder_readability: "Improve maintainability and readability with no behavior regressions.",
      coder_environment: "Fix Puppeteer/Chromium/xvfb and tunnel stability issues.",
      reviewer_primary: "Review strictly for correctness, regressions, and safety. Score 0-1000.",
      reviewer_secondary: "Review strictly for maintainability, tests, and deployment risk. Score 0-1000."
    }
  };
}

function resolvePath(repoRoot, target) {
  if (!target) return repoRoot;
  if (path.isAbsolute(target)) return target;
  return path.join(repoRoot, target);
}

function loadConfig(configPath = DEFAULT_CONFIG_PATH) {
  if (!fs.existsSync(configPath)) {
    const defaults = getDefaultConfig();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, toYaml(defaults) + "\n", "utf8");
    return { config: defaults, configPath };
  }

  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = parseYaml(raw);
  const defaults = getDefaultConfig();
  const merged = {
    ...defaults,
    ...parsed,
    paths: {
      ...defaults.paths,
      ...(parsed.paths || {})
    },
    agents: {
      ...defaults.agents,
      ...(parsed.agents || {})
    }
  };

  const repoRoot = resolvePath(process.cwd(), merged.paths.repo_root);
  merged._resolved = {
    repo_root: repoRoot,
    reports_dir: resolvePath(repoRoot, merged.paths.reports_dir),
    agent_entry: resolvePath(repoRoot, merged.paths.agent_entry),
    config_path: configPath
  };

  return { config: merged, configPath };
}

function saveConfig(config, configPath = DEFAULT_CONFIG_PATH) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, toYaml(config) + "\n", "utf8");
}

module.exports = {
  DEFAULT_CONFIG_PATH,
  getDefaultConfig,
  loadConfig,
  saveConfig
};
