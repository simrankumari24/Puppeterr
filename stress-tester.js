const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { fetch: undiciFetch } = require("undici");

dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config({ path: path.join(__dirname, ".env.example") });

const BASE_URL = String(process.env.PUPPETERR_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const LOG_PATH = path.resolve(process.env.STRESS_TESTER_LOG_FILE || path.join(__dirname, "stress-tester-runs.jsonl"));
const SUMMARY_PATH = path.resolve(process.env.STRESS_TESTER_SUMMARY_FILE || path.join(__dirname, "stress-tester-summary.json"));
const PUPPETERR_LOG_PATH = path.resolve(process.env.PUPPETERR_LOG_FILE || path.join(__dirname, "log.json"));
const DEFAULT_POLL_MS = Math.max(250, Number(process.env.STRESS_TESTER_POLL_MS || 1500));
const DEFAULT_TIMEOUT_MS = Math.max(30_000, Math.min(30 * 60 * 1000, Number(process.env.STRESS_TESTER_TIMEOUT_MS || 8 * 60 * 1000)));
const DEFAULT_BETWEEN_RUN_MS = Math.max(0, Number(process.env.STRESS_TESTER_BETWEEN_RUN_MS || 3000));
const DEFAULT_TRANSIENT_RETRY_MAX = Math.max(0, Math.min(8, Number(process.env.STRESS_TESTER_TRANSIENT_RETRY_MAX || 3)));
const DEFAULT_TRANSIENT_RETRY_BASE_MS = Math.max(300, Number(process.env.STRESS_TESTER_TRANSIENT_RETRY_BASE_MS || 900));
const DEFAULT_AGENT_BUSY_RETRY_MS = Math.max(500, Number(process.env.STRESS_TESTER_AGENT_BUSY_RETRY_MS || 2500));
const DEFAULT_AGENT_BUSY_WAIT_MAX_MS = Math.max(5000, Number(process.env.STRESS_TESTER_AGENT_BUSY_WAIT_MAX_MS || 120000));
const MAX_RUNS_HARD_CAP = Math.max(1, Number(process.env.STRESS_TESTER_MAX_RUNS_HARD_CAP || 5000));
const AUTH_COOKIE = String(process.env.PUPPETERR_AUTH_COOKIE || "").trim();
const AUTH_BEARER = String(process.env.PUPPETERR_BEARER_TOKEN || "").trim();
const AUTH_EMAIL = String(process.env.PUPPETERR_EMAIL || process.env.PUPPETERR_USERNAME || "").trim();
const AUTH_PASSWORD = String(process.env.PUPPETERR_PASSWORD || "").trim();
const CF_API_TOKEN = String(process.env.CF_API_TOKEN || "").trim();
const CF_ACCOUNT_ID = String(process.env.CF_ACCOUNT_ID || "").trim();
const STRESS_TESTER_PROMPT_MODEL = "@cf/zai-org/glm-5.2";
const MODEL_CACHE_MS = 15 * 60 * 1000;
const ENV_MAX_RUNS = Number.isFinite(Number(process.env.STRESS_TESTER_MAX_RUNS))
  ? Math.max(1, Math.min(MAX_RUNS_HARD_CAP, Number(process.env.STRESS_TESTER_MAX_RUNS)))
  : Infinity;
const fetchImpl = globalThis.fetch || undiciFetch;

function normalizeFlagKey(raw) {
  return String(raw || "").replace(/^--?/, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function parseDurationMs(raw, fallbackMs) {
  const input = String(raw || "").trim().toLowerCase();
  if (!input) return fallbackMs;
  const match = input.match(/^([0-9]+(?:\.[0-9]+)?)(ms|s|sec|m|min)?$/i);
  if (!match) return fallbackMs;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 0) return fallbackMs;
  const unit = String(match[2] || "ms").toLowerCase();
  if (unit === "ms") return Math.round(value);
  if (["s", "sec"].includes(unit)) return Math.round(value * 1000);
  if (["m", "min"].includes(unit)) return Math.round(value * 60 * 1000);
  return fallbackMs;
}

function parseScenarioCliArgs(argv) {
  const options = {
    open: false,
    tabs: false,
    ai: [],
    jsEval: [],
    navigateRandom: 0,
    navigateBackForward: 0,
    errorRetry: null,
    errorBackoffMs: null,
    stealth: false,
    antiBot: "",
    logIntervalSec: 0,
    heartbeat: false,
    scrollDepth: 0,
    screenshotEveryMs: 0,
    modelSwitch: [],
    modelSwitchInterval: 0,
    rawArgs: Array.isArray(argv) ? argv.slice() : []
  };

  const tokens = Array.isArray(argv) ? argv.slice() : [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = String(tokens[i] || "").trim();
    if (!token.startsWith("-")) continue;

    const key = normalizeFlagKey(token);
    const collectValue = () => {
      const next = String(tokens[i + 1] || "").trim();
      if (!next || next.startsWith("--")) return "";
      i += 1;
      return next;
    };
    const collectPhrase = () => {
      const chunks = [];
      while (i + 1 < tokens.length) {
        const next = String(tokens[i + 1] || "").trim();
        if (!next || next.startsWith("--")) break;
        chunks.push(next);
        i += 1;
      }
      return chunks.join(" ").trim();
    };

    if (key === "open") {
      options.open = true;
      continue;
    }
    if (key === "tabs") {
      options.tabs = true;
      continue;
    }
    if (key === "stealth") {
      options.stealth = true;
      continue;
    }
    if (key === "heartbeat") {
      options.heartbeat = true;
      continue;
    }
    if (key === "ai") {
      const phrase = collectPhrase();
      if (phrase) options.ai.push(phrase);
      continue;
    }
    if (key === "js-eval") {
      const script = collectPhrase();
      if (script) options.jsEval.push(script);
      continue;
    }
    if (key === "navigate-random") {
      const value = Number(collectValue());
      if (Number.isFinite(value) && value > 0) options.navigateRandom = Math.round(value);
      continue;
    }
    if (key === "navigate-back-forward") {
      const value = Number(collectValue());
      if (Number.isFinite(value) && value > 0) options.navigateBackForward = Math.round(value);
      continue;
    }
    if (key === "error-retry") {
      const value = Number(collectValue());
      if (Number.isFinite(value) && value >= 0) options.errorRetry = Math.max(0, Math.min(8, Math.round(value)));
      continue;
    }
    if (key === "error-backoff") {
      const valueRaw = collectValue();
      const parsed = parseDurationMs(valueRaw, NaN);
      if (Number.isFinite(parsed) && parsed >= 0) options.errorBackoffMs = Math.max(100, parsed);
      continue;
    }
    if (key === "anti-bot") {
      options.antiBot = collectValue().toLowerCase();
      continue;
    }
    if (key === "log-interval") {
      const value = Number(collectValue());
      if (Number.isFinite(value) && value > 0) options.logIntervalSec = Math.max(1, Math.round(value));
      continue;
    }
    if (key === "scroll-depth") {
      const value = Number(collectValue());
      if (Number.isFinite(value) && value > 0) options.scrollDepth = Math.round(value);
      continue;
    }
    if (key === "screenshot-every") {
      const parsed = parseDurationMs(collectValue(), NaN);
      if (Number.isFinite(parsed) && parsed >= 1000) options.screenshotEveryMs = parsed;
      continue;
    }
    if (key === "model-switch") {
      const value = collectValue();
      if (value) options.modelSwitch = value.split(",").map(item => item.trim()).filter(Boolean);
      continue;
    }
    if (key === "model-switch-interval") {
      const value = Number(collectValue());
      if (Number.isFinite(value) && value > 0) options.modelSwitchInterval = Math.max(1, Math.round(value));
      continue;
    }
  }

  for (const directiveRaw of options.ai) {
    const directive = String(directiveRaw || "").trim();
    const normalized = directive.toLowerCase();
    const modelMatch = normalized.match(/^model-switch\s+(.+)$/i);
    if (modelMatch && modelMatch[1]) {
      options.modelSwitch = String(modelMatch[1]).split(",").map(item => item.trim()).filter(Boolean);
      continue;
    }
    const intervalMatch = normalized.match(/^model-switch-interval\s+([0-9]+)$/i);
    if (intervalMatch) {
      options.modelSwitchInterval = Math.max(1, Number(intervalMatch[1]));
      continue;
    }
    const scrollMatch = normalized.match(/^scroll-depth\s+([0-9]+)$/i);
    if (scrollMatch) {
      options.scrollDepth = Math.max(options.scrollDepth, Number(scrollMatch[1]));
      continue;
    }
    const screenshotMatch = normalized.match(/^screenshot-every\s+(.+)$/i);
    if (screenshotMatch && screenshotMatch[1]) {
      const ms = parseDurationMs(screenshotMatch[1], NaN);
      if (Number.isFinite(ms) && ms >= 1000) options.screenshotEveryMs = ms;
    }
  }

  return options;
}

function buildScenarioInstructions(options) {
  const lines = [];
  if (options.open) lines.push("Open with a fresh navigation context before deep interaction.");
  if (options.tabs) lines.push("Use multiple tabs and preserve tab-awareness throughout the run.");
  if (options.ai.length) lines.push(`AI directives: ${options.ai.join(" | ")}.`);
  if (options.scrollDepth > 0) lines.push(`Perform deep scrolling up to roughly ${options.scrollDepth}px total where content allows.`);
  if (options.screenshotEveryMs > 0) lines.push(`Capture screenshots roughly every ${Math.round(options.screenshotEveryMs / 1000)}s while progressing through the task.`);
  if (options.navigateRandom > 0) lines.push(`Perform up to ${options.navigateRandom} random navigation steps to increase exploration pressure.`);
  if (options.navigateBackForward > 0) lines.push(`Perform about ${options.navigateBackForward} back/forward navigation transitions during exploration.`);
  if (options.jsEval.length) {
    lines.push("Run JS evaluations and include outputs in the final report:");
    options.jsEval.forEach((script, index) => {
      lines.push(`JS_EVAL_${index + 1}: ${script}`);
    });
  }
  if (options.stealth) lines.push("Use stealth-like interaction pacing to reduce anti-bot triggers.");
  if (options.antiBot) lines.push(`Anti-bot mode: ${options.antiBot}. Prefer human-like pacing, random jitter, and challenge-safe navigation.`);
  return lines;
}

const cliScenario = parseScenarioCliArgs(process.argv.slice(2));
const runtimeConfig = {
  pollMs: DEFAULT_POLL_MS,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  betweenRunMs: DEFAULT_BETWEEN_RUN_MS,
  transientRetryMax: cliScenario.errorRetry !== null ? cliScenario.errorRetry : DEFAULT_TRANSIENT_RETRY_MAX,
  transientRetryBaseMs: cliScenario.errorBackoffMs !== null ? cliScenario.errorBackoffMs : DEFAULT_TRANSIENT_RETRY_BASE_MS,
  agentBusyRetryMs: DEFAULT_AGENT_BUSY_RETRY_MS,
  agentBusyWaitMaxMs: DEFAULT_AGENT_BUSY_WAIT_MAX_MS,
  maxRuns: ENV_MAX_RUNS,
  logIntervalSec: cliScenario.logIntervalSec,
  heartbeat: !!cliScenario.heartbeat,
  scenario: cliScenario,
  scenarioInstructions: buildScenarioInstructions(cliScenario)
};

const ISSUE_TYPES = [
  "navigation_failure",
  "selector_error",
  "dom_mapping_gap",
  "hybridclick_misfire",
  "planner_hallucination",
  "supervisor_block",
  "retry_loop",
  "timing_drift",
  "uncertainty_or_fallback",
  "other"
];

const ISSUE_PATTERNS = [
  { type: "navigation_failure", patterns: [/navigation/i, /failed to (?:navigate|load|open|reach)/i, /stuck on/i, /wrong page/i, /captcha/i, /challenge/i] },
  { type: "selector_error", patterns: [/selector/i, /css/i, /xpath/i, /not found/i, /no element/i, /invalid selector/i] },
  { type: "dom_mapping_gap", patterns: [/dom mapping/i, /element map/i, /vision gap/i, /couldn'?t see/i, /not visible in dom/i, /mapping gap/i] },
  { type: "hybridclick_misfire", patterns: [/hybridclick/i, /fusion click/i, /click misfire/i, /clicked the wrong/i] },
  { type: "planner_hallucination", patterns: [/planner hallucination/i, /hallucinat/i, /imagined/i, /nonexistent/i, /planner error/i] },
  { type: "supervisor_block", patterns: [/supervisor block/i, /supervisor blocked/i, /blocked plan/i, /safety block/i] },
  { type: "retry_loop", patterns: [/retry loop/i, /loop/i, /repeated attempt/i, /kept trying/i, /same action/i] },
  { type: "timing_drift", patterns: [/timing drift/i, /timeout/i, /timed out/i, /too early/i, /too late/i, /settle/i, /race condition/i, /runtime exceeded/i] },
  { type: "uncertainty_or_fallback", patterns: [/fallback/i, /uncertain/i, /not sure/i, /manual help/i, /paused/i, /workaround/i] }
];

const ISSUE_EXPLANATIONS = {
  navigation_failure: {
    bug: "Navigation path fails or target page unreachable",
    why: "Likely DNS/domain issue, blocked destination, or planner recovery choosing non-progress navigation."
  },
  selector_error: {
    bug: "Selector resolution errors during actions",
    why: "Likely stale selectors, hidden elements, or page state changed before interaction completed."
  },
  dom_mapping_gap: {
    bug: "DOM/vision mismatch on actionable elements",
    why: "Likely rendered UI state differs from extracted map or dynamic UI updated between sampling and action."
  },
  hybridclick_misfire: {
    bug: "Hybrid/fusion click selects wrong target",
    why: "Likely ambiguous anchor scoring or dynamic overlays causing click target drift."
  },
  planner_hallucination: {
    bug: "Planner proposes invalid/nonexistent step",
    why: "Likely low-confidence planning under sparse context or parse-repair degradation."
  },
  supervisor_block: {
    bug: "Supervisor blocks otherwise useful plan",
    why: "Likely conservative risk gate or malformed supervisor signal causing overblocking."
  },
  retry_loop: {
    bug: "Agent repeats same action without progress",
    why: "Likely loop detection too weak or recovery policy re-issuing equivalent steps."
  },
  timing_drift: {
    bug: "Timeout/wait sequencing mismatch",
    why: "Likely waits tied to wrong condition (e.g., URL change) or async state settling slower than thresholds."
  },
  uncertainty_or_fallback: {
    bug: "Fallback/uncertainty path triggered",
    why: "Likely primary strategy failed and fallback engaged; quality depends on fallback relevance."
  },
  other: {
    bug: "Infrastructure or uncategorized failure",
    why: "Likely service/session/concurrency issue outside standard browser action categories."
  }
};

const TASK_BLUEPRINTS = [
  {
    name: "docs-compare",
    starts: ["MDN", "Python docs", "Node.js docs"],
    subjects: ["fetch", "Promise.all", "async iterator", "URLSearchParams", "Set", "AbortController"],
    endings: ["then compare the wording to a second source", "then find one practical example", "then verify one edge case in another tab or site"]
  },
  {
    name: "encyclopedia-chain",
    starts: ["Wikipedia", "Britannica", "NASA"],
    subjects: ["Voyager 1", "Ada Lovelace", "Saturn V", "CRISPR", "Mars rover Perseverance"],
    endings: ["then jump to a linked related page and compare one fact", "then find the official source linked from the page", "then extract one surprising detail and verify it elsewhere"]
  },
  {
    name: "package-investigation",
    starts: ["npmjs", "GitHub trending", "PyPI"],
    subjects: ["playwright", "cheerio", "vite", "requests", "pandas"],
    endings: ["then inspect the README/install docs", "then compare the package page with the repo page", "then find the latest version and one usage detail"]
  },
  {
    name: "news-followup",
    starts: ["BBC", "Reuters", "The Verge"],
    subjects: ["AI regulation", "space launch", "browser release", "open source security", "robotics"],
    endings: ["then open a second article on the same topic", "then verify one claim via another source", "then click the most relevant follow-up link and summarize the difference"]
  }
];

const EXTRA_CONSTRAINTS = [
  "Do not ask the user any questions.",
  "If a path fails, recover autonomously using a different visible route.",
  "Prefer actual navigation and visible clicks over purely describing what you would do.",
  "If something is ambiguous, say so in the self-diagnosis instead of hiding it.",
  "Finish only when you either complete the task or can clearly explain the blocker."
];

let stopRequested = false;
let sessionCookieHeader = AUTH_COOKIE ? `puppeterr_auth=${AUTH_COOKIE}` : "";
let cfModelCatalogCache = { expiresAt: 0, items: [] };

process.on("SIGINT", () => {
  stopRequested = true;
  console.log("\n[stress-tester] Stop requested. Finishing current run and exiting.");
});

process.on("SIGTERM", () => {
  stopRequested = true;
  console.log("\n[stress-tester] Termination requested. Finishing current run and exiting.");
});

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(items) {
  return items[randomInt(0, items.length - 1)];
}

function shuffle(items) {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index);
    const temp = copy[index];
    copy[index] = copy[swapIndex];
    copy[swapIndex] = temp;
  }
  return copy;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readJsonFileSafe(filePath, fallbackValue) {
  try {
    if (!fs.existsSync(filePath)) return fallbackValue;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallbackValue;
  }
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function isAgentBusyErrorLike(errLike) {
  const msg = String(errLike && (errLike.message || errLike) || "");
  return /already running a task|agent is already running|status\s*409/i.test(msg);
}

function isTransientNetworkErrorLike(errLike) {
  const msg = String(errLike && (errLike.message || errLike) || "").toLowerCase();
  return /fetch failed|econnrefused|econnreset|etimedout|socket hang up|network error|503|502|gateway timeout|service unavailable/.test(msg);
}

function classifyInfraFailure(errLike) {
  if (isAgentBusyErrorLike(errLike)) return "agent_busy";
  if (isTransientNetworkErrorLike(errLike)) return "network_or_service_transient";
  return "generic_infrastructure";
}

async function withTransientRetry(fn, label = "request") {
  let lastErr = null;
  for (let attempt = 0; attempt <= runtimeConfig.transientRetryMax; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastErr = error;
      if (isAgentBusyErrorLike(error)) throw error;
      if (!isTransientNetworkErrorLike(error) || attempt >= runtimeConfig.transientRetryMax) throw error;
      const delay = runtimeConfig.transientRetryBaseMs * Math.max(1, attempt + 1);
      console.warn(`[stress-tester] transient ${label} failure (attempt ${attempt + 1}/${runtimeConfig.transientRetryMax + 1}): ${error.message}. Retrying in ${delay}ms.`);
      await sleep(delay);
    }
  }
  throw lastErr || new Error(`Unknown transient failure during ${label}`);
}

async function requestJson(relativePath, options = {}) {
  const url = BASE_URL + relativePath;
  const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
  if (AUTH_BEARER) headers.Authorization = `Bearer ${AUTH_BEARER}`;
  if (sessionCookieHeader) headers.Cookie = sessionCookieHeader;
  const response = await withTransientRetry(async () => {
    return fetchImpl(url, {
      method: options.method || "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined
    });
  }, `${options.method || "GET"} ${relativePath}`);
  const setCookie = response.headers.get("set-cookie") || "";
  const authCookieMatch = setCookie.match(/puppeterr_auth=([^;]+)/);
  if (authCookieMatch) {
    sessionCookieHeader = `puppeterr_auth=${authCookieMatch[1]}`;
  }
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const message = typeof payload === "string" ? payload : payload.error || payload.message || "Request failed";
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function normalizeCloudflareModelCatalog(payload) {
  const source = payload && payload.result;
  if (!Array.isArray(source)) return [];
  return source
    .map(item => String(item && (item.id || item.name || item.model || "")).trim())
    .filter(Boolean);
}

async function fetchCloudflareModelCatalog(force = false) {
  if (!force && Array.isArray(cfModelCatalogCache.items) && cfModelCatalogCache.items.length && cfModelCatalogCache.expiresAt > Date.now()) {
    return cfModelCatalogCache.items;
  }

  if (!CF_API_TOKEN || !CF_ACCOUNT_ID) return [];

  try {
    // Mirrors the proven catalog fetch in agent.js.
    const res = await fetchImpl(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/models`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${CF_API_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      return [];
    }

    const ids = normalizeCloudflareModelCatalog(data);
    cfModelCatalogCache = {
      items: ids,
      expiresAt: Date.now() + MODEL_CACHE_MS
    };
    return ids;
  } catch {
    return [];
  }
}

async function resolveStressPromptModel() {
  const preferred = String(STRESS_TESTER_PROMPT_MODEL || "").trim();
  if (!preferred) return "";
  if (!CF_API_TOKEN || !CF_ACCOUNT_ID) return preferred;

  const catalogIds = await fetchCloudflareModelCatalog();
  if (!catalogIds.length) return preferred;
  if (catalogIds.includes(preferred)) return preferred;

  const glmFallback = catalogIds.find(id => /@cf\/zai-org\/glm-5\.2/i.test(id));
  if (glmFallback) return glmFallback;

  return preferred;
}

function extractTextFromCloudflareResult(payload) {
  if (!payload || typeof payload !== "object") return "";
  const result = payload.result && typeof payload.result === "object" ? payload.result : payload;
  const choices = Array.isArray(result.choices) ? result.choices : [];
  const messageContent = choices[0] && choices[0].message ? choices[0].message.content : "";
  const text =
    result.response ||
    result.output_text ||
    messageContent ||
    result.text ||
    result.answer ||
    "";
  return String(text || "").trim();
}

async function callCloudflareReasonerForPrompt(modelId) {
  if (!CF_API_TOKEN || !CF_ACCOUNT_ID) {
    throw new Error("Missing CF_API_TOKEN or CF_ACCOUNT_ID for model-driven stress prompt generation");
  }

  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const systemPrompt = "You generate adversarial, unpredictable browser-task prompts for stress-testing an autonomous web agent. Output only the final task prompt text, no explanation.";
  const userPrompt = [
    "Generate one random multi-step browser task prompt that is difficult, realistic, and unpredictable.",
    "Requirements:",
    "- Start with /browser",
    "- Include 4 to 7 concrete steps",
    "- Force at least one page transition and one extraction step",
    "- Include one reroute/fallback requirement",
    "- Must include this exact final diagnostics block instruction with markers:",
    "<<PUPPETERR_FINAL_ANSWER>> ... <<END_PUPPETERR_FINAL_ANSWER>> and <<PUPPETERR_SELF_DIAGNOSIS_JSON>> ... <<END_PUPPETERR_SELF_DIAGNOSIS_JSON>>",
    "- Keep prompt under 1800 characters",
    `Nonce: ${nonce}`
  ].join("\n");

  const commonHeaders = {
    Authorization: `Bearer ${CF_API_TOKEN}`,
    "Content-Type": "application/json"
  };

  if (String(modelId || "").startsWith("@cf/")) {
    const runUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${encodeURIComponent(modelId)}`;
    const runPayload = {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 800,
      temperature: 1.05
    };
    const runResponse = await fetchImpl(runUrl, { method: "POST", headers: commonHeaders, body: JSON.stringify(runPayload) });
    const runJson = await runResponse.json().catch(() => ({}));
    if (!runResponse.ok || runJson.success === false) {
      const cfErr = runJson && runJson.errors ? JSON.stringify(runJson.errors).slice(0, 240) : `HTTP ${runResponse.status}`;
      throw new Error(`Cloudflare ai/run failed for ${modelId}: ${cfErr}`);
    }
    const text = extractTextFromCloudflareResult(runJson);
    if (!text) throw new Error(`Cloudflare ai/run returned empty text for ${modelId}`);
    return text;
  }

  const gatewayUrl = `https://gateway.ai.cloudflare.com/v1/${CF_ACCOUNT_ID}/default/compat/chat/completions`;
  const gatewayPayload = {
    model: modelId,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    max_tokens: 800,
    temperature: 1.05
  };
  const gatewayResponse = await fetchImpl(gatewayUrl, { method: "POST", headers: commonHeaders, body: JSON.stringify(gatewayPayload) });
  const gatewayJson = await gatewayResponse.json().catch(() => ({}));
  if (!gatewayResponse.ok) {
    const cfErr = gatewayJson && gatewayJson.error ? JSON.stringify(gatewayJson.error).slice(0, 240) : `HTTP ${gatewayResponse.status}`;
    throw new Error(`Cloudflare gateway failed for ${modelId}: ${cfErr}`);
  }
  const text = extractTextFromCloudflareResult(gatewayJson);
  if (!text) throw new Error(`Cloudflare gateway returned empty text for ${modelId}`);
  return text;
}

async function generateRandomPrompt(cycleNumber) {
  const fallbackPrompt = generateTemplatePrompt(cycleNumber);
  const scenarioSuffix = buildScenarioPromptSuffix(cycleNumber);
  try {
    const modelId = await resolveStressPromptModel();
    if (!modelId) return fallbackPrompt;
    const generated = await callCloudflareReasonerForPrompt(modelId);
    if (!generated) return fallbackPrompt;
    return [generated, scenarioSuffix].filter(Boolean).join("\n\n");
  } catch (error) {
    console.warn(`[stress-tester] CF prompt generation fallback: ${error.message}`);
    return fallbackPrompt;
  }
}

function selectModelForCycle(cycleNumber) {
  const models = Array.isArray(runtimeConfig.scenario.modelSwitch)
    ? runtimeConfig.scenario.modelSwitch.filter(Boolean)
    : [];
  if (!models.length) return "";
  const interval = Math.max(1, Number(runtimeConfig.scenario.modelSwitchInterval || 1));
  const bucket = Math.floor(Math.max(0, Number(cycleNumber || 1) - 1) / interval);
  const index = bucket % models.length;
  return models[index] || "";
}

function buildScenarioPromptSuffix(cycleNumber) {
  const lines = runtimeConfig.scenarioInstructions.slice();
  const selectedModel = selectModelForCycle(cycleNumber);
  if (selectedModel) {
    lines.push(`Model focus for this run: ${selectedModel}.`);
  }
  if (!lines.length) return "";
  return [
    "Stress scenario directives (treat these as hard requirements when safe):",
    ...lines
  ].join("\n");
}

function generateTemplatePrompt(cycleNumber) {
  const blueprint = pick(TASK_BLUEPRINTS);
  const subject = pick(blueprint.subjects);
  const start = pick(blueprint.starts);
  const ending = pick(blueprint.endings);
  const constraints = shuffle(EXTRA_CONSTRAINTS).slice(0, randomInt(3, EXTRA_CONSTRAINTS.length));
  const stepCount = randomInt(4, 6);
  const stressFlavor = pick([
    "If the first path is blocked, reroute without waiting.",
    "Use at least one page transition and one content extraction step.",
    "Cross-check one fact before you finish.",
    "Include one backtrack or pivot if the initial result looks weak."
  ]);

  const scenarioSuffix = buildScenarioPromptSuffix(cycleNumber);
  return [
    `/browser Start from ${start}. Investigate ${subject}. Complete roughly ${stepCount} browser steps: locate the best relevant page, extract a concrete fact, follow one meaningful link, ${ending}, and then give a concise result.`,
    stressFlavor,
    constraints.join(" "),
    scenarioSuffix,
    "At the very end of your final message, include these exact markers and a machine-readable diagnosis:",
    "<<PUPPETERR_FINAL_ANSWER>>",
    "Your normal final answer here.",
    "<<END_PUPPETERR_FINAL_ANSWER>>",
    "<<PUPPETERR_SELF_DIAGNOSIS_JSON>>",
    JSON.stringify({
      summary: "short summary of what happened",
      completed: true,
      issues: [
        {
          type: "navigation_failure",
          evidence: "optional evidence"
        }
      ],
      uncertainty: "what remained uncertain, if anything",
      fallbacks: ["fallbacks or workarounds you used"],
      notes: "any planner/vision/selector/supervisor observations"
    }, null, 2),
    "<<END_PUPPETERR_SELF_DIAGNOSIS_JSON>>",
    "Use an empty issues array if nothing went wrong."
  ].filter(Boolean).join("\n\n");
}

async function applyModelSwitchForChat(chatId, cycleNumber) {
  const selectedModel = selectModelForCycle(cycleNumber);
  if (!selectedModel) return null;
  const response = await requestJson(`/api/chats/${encodeURIComponent(chatId)}/models`, {
    method: "POST",
    body: {
      models: {
        router: selectedModel,
        planner: selectedModel,
        reasoner: selectedModel
      }
    }
  });
  return {
    requested: selectedModel,
    applied: response && response.current ? response.current : null
  };
}

async function sendToPuppeterr(prompt, cycleNumber) {
  const created = await requestJson("/api/chats", {
    method: "POST",
    body: { title: `Stress Tester ${new Date().toISOString()}` }
  });
  const chatId = created && created.chat && created.chat.id;
  if (!chatId) {
    throw new Error("Failed to create chat for stress run");
  }

  const modelSwitch = await applyModelSwitchForChat(chatId, cycleNumber);

  const chatState = await requestJson(`/api/chats/${encodeURIComponent(chatId)}`);
  const baselineMessageCount = Array.isArray(chatState && chatState.chat && chatState.chat.messages)
    ? chatState.chat.messages.length
    : 0;
  const startedAt = new Date().toISOString();

  const busyDeadline = Date.now() + runtimeConfig.agentBusyWaitMaxMs;
  let busyRetries = 0;
  while (true) {
    try {
      await requestJson("/api/chat", {
        method: "POST",
        body: { chatId, message: prompt }
      });
      break;
    } catch (error) {
      if (!isAgentBusyErrorLike(error)) throw error;
      busyRetries += 1;
      if (Date.now() >= busyDeadline) {
        const timeoutError = new Error(`Agent stayed busy for ${runtimeConfig.agentBusyWaitMaxMs}ms while queueing stress run`);
        timeoutError.status = 409;
        throw timeoutError;
      }
      console.warn(`[stress-tester] Agent busy while queueing run; retry ${busyRetries} in ${runtimeConfig.agentBusyRetryMs}ms.`);
      await sleep(runtimeConfig.agentBusyRetryMs);
    }
  }

  return { chatId, baselineMessageCount, startedAt, prompt, busyRetries, modelSwitch };
}

async function waitForCompletion(context) {
  const startedMs = Date.now();
  const deadline = startedMs + runtimeConfig.timeoutMs;
  let latestChat = null;
  let nextHeartbeatAt = startedMs + Math.max(1000, runtimeConfig.logIntervalSec * 1000);

  while (!stopRequested && Date.now() < deadline) {
    if (runtimeConfig.heartbeat && runtimeConfig.logIntervalSec > 0 && Date.now() >= nextHeartbeatAt) {
      const elapsedSec = Math.round((Date.now() - startedMs) / 1000);
      console.log(`[stress-tester] heartbeat chat=${context.chatId} elapsed=${elapsedSec}s timeout=${Math.round(runtimeConfig.timeoutMs / 1000)}s`);
      nextHeartbeatAt = Date.now() + Math.max(1000, runtimeConfig.logIntervalSec * 1000);
    }

    const chatResponse = await requestJson(`/api/chats/${encodeURIComponent(context.chatId)}`);
    const chat = chatResponse && chatResponse.chat ? chatResponse.chat : null;
    latestChat = chat;
    const messages = Array.isArray(chat && chat.messages) ? chat.messages : [];
    const candidate = messages
      .slice(context.baselineMessageCount)
      .find(message => message && message.role === "assistant" && typeof message.completed === "boolean");

    if (candidate) {
      return { chat, finalMessage: candidate, timedOut: false };
    }

    await sleep(runtimeConfig.pollMs);
  }

  const timeoutMessage = {
    role: "assistant",
    content: `Stress Tester timed out after ${runtimeConfig.timeoutMs}ms waiting for Puppeterr to finish this run.`,
    ts: new Date().toISOString(),
    completed: false,
    timeout: true
  };

  return { chat: latestChat, finalMessage: timeoutMessage, timedOut: true };
}

function extractTaggedSection(message, startTag, endTag) {
  const startIndex = message.indexOf(startTag);
  const endIndex = message.indexOf(endTag);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) return "";
  return message.slice(startIndex + startTag.length, endIndex).trim();
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractBalancedJsonObject(rawText) {
  const text = String(rawText || "");
  if (!text) return "";
  const start = text.indexOf("{");
  if (start === -1) return "";

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }

    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return "";
}

function extractSelfDiagnosis(finalMessage) {
  const raw = String(finalMessage || "");
  const taggedAnswer = extractTaggedSection(raw, "<<PUPPETERR_FINAL_ANSWER>>", "<<END_PUPPETERR_FINAL_ANSWER>>");
  const diagnosisBlock = extractTaggedSection(raw, "<<PUPPETERR_SELF_DIAGNOSIS_JSON>>", "<<END_PUPPETERR_SELF_DIAGNOSIS_JSON>>");
  const fencedMatch = diagnosisBlock.match(/```json\s*([\s\S]*?)```/i);
  const diagnosisText = fencedMatch ? fencedMatch[1].trim() : diagnosisBlock;
  const fallbackSlice = raw.slice(Math.max(0, raw.lastIndexOf("{")));
  const balancedFallback = extractBalancedJsonObject(diagnosisText) || extractBalancedJsonObject(fallbackSlice) || extractBalancedJsonObject(raw);
  const parsedDiagnosis = safeJsonParse(diagnosisText) || safeJsonParse(balancedFallback) || {
    summary: "Diagnosis markers missing or unparsable.",
    completed: /completed/i.test(raw) && !/incomplete|failed|timed out/i.test(raw),
    issues: [],
    uncertainty: "",
    fallbacks: [],
    notes: diagnosisText || ""
  };

  return {
    finalAnswer: taggedAnswer || raw,
    selfDiagnosis: parsedDiagnosis,
    rawMessage: raw,
    rawDiagnosis: diagnosisText || balancedFallback
  };
}

function normalizeIssue(type, evidence, source) {
  return {
    type: ISSUE_TYPES.includes(type) ? type : "other",
    evidence: String(evidence || "").trim(),
    source: String(source || "derived")
  };
}

function pushUniqueIssue(target, issue) {
  if (!issue || !issue.type) return;
  const fingerprint = `${issue.type}::${issue.evidence}`;
  if (target.some(existing => `${existing.type}::${existing.evidence}` === fingerprint)) return;
  target.push(issue);
}

function detectTextIssues(text, source, target) {
  const message = String(text || "");
  if (!message) return;
  ISSUE_PATTERNS.forEach(definition => {
    const hit = definition.patterns.find(pattern => pattern.test(message));
    if (hit) {
      pushUniqueIssue(target, normalizeIssue(definition.type, `Matched pattern ${hit} in ${source}`, source));
    }
  });
}

function detectEventIssues(events, target) {
  const signatureCounts = new Map();

  events.forEach(event => {
    const kind = String(event && event.kind || "");
    const action = String(event && event.action || "");
    const status = String(event && event.status || "");
    const signature = String(event && event.signature || `${action}|${event && event.selector ? event.selector : ""}`);
    const selector = String(event && event.selector || "");
    const result = String(event && event.result || "");
    const pathName = String(event && event.path || "");

    if (kind === "action") {
      signatureCounts.set(signature, (signatureCounts.get(signature) || 0) + 1);

      if (/goto|navigate/i.test(action) && /error|fail/i.test(status)) {
        pushUniqueIssue(target, normalizeIssue("navigation_failure", `${action} failed: ${result || status}`, "log.json"));
      }

      if ((selector || /selector|css|xpath|element/i.test(result)) && /error|fail/i.test(status)) {
        pushUniqueIssue(target, normalizeIssue("selector_error", `${action} selector issue: ${selector || result}`, "log.json"));
      }

      if (/hybrid|fusion/i.test(action) || /hybrid|fusion/i.test(result)) {
        if (/error|fail|exhaust/i.test(status + " " + result)) {
          pushUniqueIssue(target, normalizeIssue("hybridclick_misfire", `${action} ${status}: ${result}`, "log.json"));
        }
      }

      if (/fallback/i.test(pathName)) {
        pushUniqueIssue(target, normalizeIssue("uncertainty_or_fallback", `${action} used fallback path`, "log.json"));
      }

      if (/runtime exceeded|timeout|timed out|settle/i.test(result)) {
        pushUniqueIssue(target, normalizeIssue("timing_drift", `${action} timing issue: ${result}`, "log.json"));
      }
    }

    if (kind === "task") {
      const phase = String(event && event.phase || "");
      if (phase === "end" && event && event.completed === false) {
        pushUniqueIssue(target, normalizeIssue("uncertainty_or_fallback", `Task ended incomplete: ${String(event.result || "")}`, "log.json"));
      }
      detectTextIssues(String(event && event.result || ""), "log.json", target);
    }
  });

  signatureCounts.forEach((count, signature) => {
    if (count >= 3) {
      pushUniqueIssue(target, normalizeIssue("retry_loop", `Repeated action signature ${signature} x${count}`, "log.json"));
    }
  });
}

function readRunEvents(startTs, endTs) {
  const entries = readJsonFileSafe(PUPPETERR_LOG_PATH, []);
  if (!Array.isArray(entries)) return [];
  const startMs = new Date(startTs).getTime();
  const endMs = new Date(endTs).getTime();
  return entries.filter(entry => {
    const ts = new Date(entry && entry.ts || 0).getTime();
    return Number.isFinite(ts) && ts >= startMs - 1000 && ts <= endMs + 1000;
  });
}

function summarizeRunEvents(events) {
  const actions = events.filter(event => event && event.kind === "action");
  const tasks = events.filter(event => event && event.kind === "task");
  const fallbackActions = actions.filter(event => /fallback/i.test(String(event.path || ""))).length;
  const erroredActions = actions.filter(event => /error|fail/i.test(String(event.status || ""))).length;
  return {
    taskEvents: tasks.length,
    actionEvents: actions.length,
    fallbackActions,
    erroredActions
  };
}

function buildRunBugFindings(run) {
  const findings = [];
  const pushFinding = (id, title, whyLikely, evidence, category = "other") => {
    const key = `${id}::${String(evidence || "").slice(0, 120)}`;
    if (findings.some(item => item._key === key)) return;
    findings.push({
      _key: key,
      id,
      title,
      whyLikely,
      evidence: String(evidence || "").trim(),
      category
    });
  };

  const issues = Array.isArray(run && run.detectedIssues) ? run.detectedIssues : [];
  issues.forEach(issue => {
    const type = ISSUE_TYPES.includes(issue.type) ? issue.type : "other";
    const evidenceText = String(issue.evidence || "");
    if (type === "other" && /fetch failed|already running a task|econnrefused|econnreset|status\s*409/i.test(evidenceText.toLowerCase())) {
      return;
    }
    const explanation = ISSUE_EXPLANATIONS[type] || ISSUE_EXPLANATIONS.other;
    pushFinding(
      `issue_${type}`,
      explanation.bug,
      explanation.why,
      evidenceText || "no evidence",
      type
    );
  });

  const notes = String(run && run.puppeterrSelfDiagnosis && run.puppeterrSelfDiagnosis.notes || "");
  if (/Diagnosis markers missing or unparsable/i.test(String(run && run.puppeterrSelfDiagnosis && run.puppeterrSelfDiagnosis.summary || ""))) {
    pushFinding(
      "missing_self_diagnosis_json",
      "Self-diagnosis block missing or unparsable",
      "Prompt requested structured diagnosis markers, but final response did not emit valid JSON in expected tags.",
      "selfDiagnosis.summary indicates marker/parse failure",
      "other"
    );
  }

  const infraText = [
    String(run && run.puppeterrFinalAnswer || ""),
    notes,
    JSON.stringify(run && run.logEvents || [])
  ].join("\n");

  if (/Agent is already running a task/i.test(infraText)) {
    pushFinding(
      "concurrency_conflict_agent_busy",
      "Stress cycle started while previous task still running",
      "Harness submitted new run before Puppeterr finished active task, producing immediate 409 busy responses.",
      "Agent is already running a task",
      "other"
    );
  }

  if (/fetch failed/i.test(infraText)) {
    pushFinding(
      "transport_fetch_failure",
      "Transport request failure between harness and Puppeterr",
      "Likely server restart/network interruption while stress loop was active.",
      "fetch failed",
      "other"
    );
  }

  if (/econnrefused|econnreset|socket hang up|service unavailable|gateway timeout|502|503/i.test(infraText)) {
    pushFinding(
      "infra_service_transient",
      "Transient infrastructure/service instability",
      "Likely temporary server or network instability during stress cycles.",
      "transient network/service error signature",
      "other"
    );
  }

  if (/6e\+\d+/.test(String(run && run.puppeterrFinalAnswer || ""))) {
    pushFinding(
      "invalid_timeout_configuration",
      "Unrealistic timeout configuration masks actionable timing behavior",
      "Timeout was set to an extreme value, so runs appear hung instead of expiring at a practical window.",
      String(run.puppeterrFinalAnswer || ""),
      "timing_drift"
    );
  }

  if (/net::ERR_NAME_NOT_RESOLVED/i.test(infraText)) {
    pushFinding(
      "bad_direct_domain_resolution",
      "Direct navigation uses invalid or non-resolving domain",
      "Heuristic direct target selected an incorrect hostname (e.g., node.js) causing DNS failures.",
      "net::ERR_NAME_NOT_RESOLVED",
      "navigation_failure"
    );
  }

  if (/waitForURLChange\|.*"status":"error"|URL did not change within/i.test(infraText)) {
    pushFinding(
      "url_change_wait_mismatch",
      "URL-change wait condition fails after click actions",
      "Click succeeded but waited on URL transition that did not occur, leading to repeated non-progress loops.",
      "waitForURLChange errors without navigation",
      "timing_drift"
    );
  }

  if (/Potential CAPTCHA\/challenge detected.*npmjs|theverge|wikipedia|nodejs/i.test(infraText)) {
    pushFinding(
      "captcha_false_positive_non_challenge_page",
      "CAPTCHA detector fires on normal content pages",
      "Challenge heuristics likely over-weight text/weak signals and trigger solve flow without a real gate.",
      "challenge detected on non-challenge host",
      "navigation_failure"
    );
  }

  return findings.map(({ _key, ...rest }) => rest);
}

function storeRunResult(data) {
  ensureParentDir(LOG_PATH);
  fs.appendFileSync(LOG_PATH, JSON.stringify(data) + "\n");
}

function readStoredRuns() {
  if (!fs.existsSync(LOG_PATH)) return [];
  return fs.readFileSync(LOG_PATH, "utf8")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => safeJsonParse(line))
    .filter(Boolean);
}

function summarizeAllRuns() {
  const runs = readStoredRuns();
  const issueCounts = {};
  const bugCounts = {};
  let completedRuns = 0;
  let runsWithStructuredDiagnosis = 0;
  let infraFailures = 0;

  const bugExamples = {};
  const bugSampleRuns = {};

  runs.forEach(run => {
    if (run && run.completed) completedRuns += 1;
    const diagnosisSummary = String(run && run.puppeterrSelfDiagnosis && run.puppeterrSelfDiagnosis.summary || "");
    if (diagnosisSummary && !/missing or unparsable/i.test(diagnosisSummary)) {
      runsWithStructuredDiagnosis += 1;
    }
    const issues = Array.isArray(run && run.detectedIssues) ? run.detectedIssues : [];
    issues.forEach(issue => {
      issueCounts[issue.type] = (issueCounts[issue.type] || 0) + 1;
    });

    const findings = buildRunBugFindings(run);
    findings.forEach(finding => {
      const id = finding.id;
      bugCounts[id] = (bugCounts[id] || 0) + 1;
      if (!bugExamples[id]) bugExamples[id] = finding;
      if (!bugSampleRuns[id]) bugSampleRuns[id] = [];
      if (bugSampleRuns[id].length < 3 && run && run.cycle !== undefined) {
        bugSampleRuns[id].push({ cycle: run.cycle, timestamp: run.timestamp || null, evidence: finding.evidence });
      }
      if (finding.category === "other") infraFailures += 1;
    });
  });

  const recurringProblems = Object.entries(issueCounts)
    .sort((left, right) => right[1] - left[1])
    .map(([type, count]) => ({ type, count }));

  const bugFindings = Object.entries(bugCounts)
    .sort((left, right) => right[1] - left[1])
    .map(([id, count]) => {
      const example = bugExamples[id] || {};
      return {
        id,
        title: example.title || "Unspecified bug",
        whyLikely: example.whyLikely || "No hypothesis generated",
        category: example.category || "other",
        count,
        sampleRuns: bugSampleRuns[id] || []
      };
    });

  const summary = {
    generatedAt: new Date().toISOString(),
    totalRuns: runs.length,
    completedRuns,
    incompleteRuns: runs.length - completedRuns,
    successRate: runs.length ? Number((completedRuns / runs.length).toFixed(4)) : 0,
    diagnosticsCoverage: {
      structuredSelfDiagnosisRuns: runsWithStructuredDiagnosis,
      missingOrUnparsableRuns: Math.max(0, runs.length - runsWithStructuredDiagnosis)
    },
    recurringProblems,
    bugFindings,
    insights: {
      topBug: bugFindings[0] || null,
      infraFailureSignals: infraFailures,
      recommendation: bugFindings.length
        ? "Address top bugFinding entries first; they include likely causes and sample evidence to reproduce."
        : "No bug findings detected yet."
    },
    latestRunTimestamp: runs.length ? runs[runs.length - 1].timestamp : null
  };

  ensureParentDir(SUMMARY_PATH);
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
  return summary;
}

async function ensureServerAvailable() {
  await withTransientRetry(async () => {
    try {
      await requestJson("/api/bootstrap");
      return;
    } catch (error) {
      if (error && error.status === 401) {
        await loginIfNeeded();
        await requestJson("/api/bootstrap");
        return;
      }
      throw error;
    }
  }, "bootstrap");
}

async function loginIfNeeded() {
  if (sessionCookieHeader || AUTH_BEARER) return;
  if (!AUTH_EMAIL || !AUTH_PASSWORD) {
    throw new Error("Puppeterr requires auth. Set PUPPETERR_AUTH_COOKIE, PUPPETERR_BEARER_TOKEN, or PUPPETERR_EMAIL/PUPPETERR_PASSWORD.");
  }
  await requestJson("/auth/login", {
    method: "POST",
    body: { email: AUTH_EMAIL, password: AUTH_PASSWORD }
  });
}

async function runOneCycle(cycleNumber) {
  const prompt = await generateRandomPrompt(cycleNumber);
  const sent = await sendToPuppeterr(prompt, cycleNumber);
  const completion = await waitForCompletion(sent);
  const extracted = extractSelfDiagnosis(completion.finalMessage.content || "");
  const finishedAt = completion.finalMessage.ts || new Date().toISOString();
  const events = readRunEvents(sent.startedAt, finishedAt);
  const detectedIssues = [];

  const diagnosisIssues = Array.isArray(extracted.selfDiagnosis && extracted.selfDiagnosis.issues)
    ? extracted.selfDiagnosis.issues
    : [];
  diagnosisIssues.forEach(issue => {
    pushUniqueIssue(detectedIssues, normalizeIssue(issue.type, issue.evidence || issue.summary || JSON.stringify(issue), "self_diagnosis"));
  });

  detectTextIssues(extracted.finalAnswer, "final_answer", detectedIssues);
  const diagnosisValueText = [
    String(extracted.selfDiagnosis && extracted.selfDiagnosis.summary || ""),
    String(extracted.selfDiagnosis && extracted.selfDiagnosis.uncertainty || ""),
    String(extracted.selfDiagnosis && extracted.selfDiagnosis.notes || ""),
    Array.isArray(extracted.selfDiagnosis && extracted.selfDiagnosis.fallbacks)
      ? extracted.selfDiagnosis.fallbacks.join(" ")
      : String(extracted.selfDiagnosis && extracted.selfDiagnosis.fallbacks || ""),
    Array.isArray(extracted.selfDiagnosis && extracted.selfDiagnosis.issues)
      ? extracted.selfDiagnosis.issues.map(item => `${item && item.type ? item.type : ""} ${item && (item.evidence || item.summary || "") ? (item.evidence || item.summary) : ""}`).join(" ")
      : ""
  ].join("\n").trim();
  detectTextIssues(diagnosisValueText, "self_diagnosis", detectedIssues);
  detectEventIssues(events, detectedIssues);

  const runRecord = {
    cycle: cycleNumber,
    timestamp: finishedAt,
    baseUrl: BASE_URL,
    chatId: sent.chatId,
    busyRetries: Number(sent.busyRetries || 0),
    modelSwitch: sent.modelSwitch || null,
    scenario: runtimeConfig.scenario,
    prompt,
    completed: !!completion.finalMessage.completed,
    timedOut: completion.timedOut,
    puppeterrFinalAnswer: extracted.finalAnswer,
    puppeterrSelfDiagnosis: extracted.selfDiagnosis,
    detectedIssues,
    bugFindings: buildRunBugFindings({
      detectedIssues,
      puppeterrFinalAnswer: extracted.finalAnswer,
      puppeterrSelfDiagnosis: extracted.selfDiagnosis,
      logEvents: events
    }),
    logEventSummary: summarizeRunEvents(events),
    logEvents: events
  };

  storeRunResult(runRecord);
  const cumulative = summarizeAllRuns();
  runRecord.cumulativeLogEntry = cumulative;

  console.log(JSON.stringify(runRecord, null, 2));
  return runRecord;
}

async function main() {
  console.log(`[stress-tester] Using Puppeterr at ${BASE_URL}`);
  console.log(`[stress-tester] Writing run log to ${LOG_PATH}`);
  if (runtimeConfig.scenario.rawArgs.length) {
    console.log(`[stress-tester] Scenario CLI args: ${runtimeConfig.scenario.rawArgs.join(" ")}`);
  }
  if (runtimeConfig.scenarioInstructions.length) {
    console.log("[stress-tester] Scenario directives active:");
    runtimeConfig.scenarioInstructions.forEach(line => console.log(`  - ${line}`));
  }
  if (Number(process.env.STRESS_TESTER_TIMEOUT_MS || 0) > (30 * 60 * 1000)) {
    console.warn(`[stress-tester] STRESS_TESTER_TIMEOUT_MS is too large; capped to ${runtimeConfig.timeoutMs}ms.`);
  }
  if (Number.isFinite(Number(process.env.STRESS_TESTER_MAX_RUNS)) && Number(process.env.STRESS_TESTER_MAX_RUNS) > MAX_RUNS_HARD_CAP) {
    console.warn(`[stress-tester] STRESS_TESTER_MAX_RUNS exceeded cap; using ${MAX_RUNS_HARD_CAP}.`);
  }

  if (String(process.env.STRESS_TESTER_SUMMARIZE_ONLY || "").trim() === "1") {
    const summaryOnly = summarizeAllRuns();
    console.log("[stress-tester] Summary-only mode complete:");
    console.log(JSON.stringify(summaryOnly, null, 2));
    return;
  }

  await ensureServerAvailable();

  let cycle = 0;
  while (!stopRequested && cycle < runtimeConfig.maxRuns) {
    cycle += 1;
    try {
      await runOneCycle(cycle);
    } catch (error) {
      if (isAgentBusyErrorLike(error) || isTransientNetworkErrorLike(error)) {
        const cooldownMs = isAgentBusyErrorLike(error) ? runtimeConfig.agentBusyRetryMs : (runtimeConfig.transientRetryBaseMs * 2);
        console.warn(`[stress-tester] transient cycle failure (${classifyInfraFailure(error)}): ${error.message}. Cooling down ${cooldownMs}ms then retrying cycle ${cycle}.`);
        cycle -= 1;
        await sleep(cooldownMs);
        continue;
      }
      const failureRecord = {
        cycle,
        timestamp: new Date().toISOString(),
        baseUrl: BASE_URL,
        prompt: null,
        completed: false,
        timedOut: false,
        puppeterrFinalAnswer: "",
        puppeterrSelfDiagnosis: {
          summary: `Stress Tester infrastructure error (${classifyInfraFailure(error)})`,
          completed: false,
          issues: [{ type: "other", evidence: error.message }],
          uncertainty: "",
          fallbacks: [],
          notes: error.stack || ""
        },
        detectedIssues: [normalizeIssue("other", error.message, "stress_tester")],
        logEventSummary: { taskEvents: 0, actionEvents: 0, fallbackActions: 0, erroredActions: 0 },
        logEvents: []
      };
      storeRunResult(failureRecord);
      failureRecord.cumulativeLogEntry = summarizeAllRuns();
      console.error(JSON.stringify(failureRecord, null, 2));
      if (stopRequested) break;
    }

    if (!stopRequested && cycle < runtimeConfig.maxRuns && runtimeConfig.betweenRunMs > 0) {
      await sleep(runtimeConfig.betweenRunMs);
    }
  }

  console.log("[stress-tester] Final summary:");
  console.log(JSON.stringify(summarizeAllRuns(), null, 2));
}

main().catch(error => {
  console.error("[stress-tester] Fatal error:", error);
  process.exitCode = 1;
});