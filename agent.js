const { chromium } = require("playwright-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs   = require("fs");
const http = require("http");
const crypto = require("crypto");
const path = require("path");
const { execSync, exec } = require("child_process");
const bcrypt = require("bcryptjs");
const { fetch: undiciFetch } = require("undici");
const nodemailer = require("nodemailer");
const actions = require("./actions");
const { HUMAN_BRIDGE_HTML } = require("./humanBridge");
const pinchApi = require("pinch-api");
const pixelGridReasoner = require("./pixelGridReasoner");
async function humanMove(page, x, y, telemetry = {}) {
  const steps = 25 + Math.floor(Math.random() * 10);
  const start = await page.evaluate(() => ({
    x: window.__puppeterrMouseX || 0,
    y: window.__puppeterrMouseY || 0,
    viewportWidth: Math.max(1, Math.round(window.innerWidth || 1920)),
    viewportHeight: Math.max(1, Math.round(window.innerHeight || 1080))
  })).catch(() => ({ x: 0, y: 0, viewportWidth: 1920, viewportHeight: 1080 }));

  const telemetryKind = String(telemetry?.kind || "move");
  const emitEvery = Math.max(1, Number(telemetry?.emitEvery || 3));

  for (let i = 0; i < steps; i++) {
    const nx = start.x + (x - start.x) * (i / steps) + (Math.random() * 3 - 1.5);
    const ny = start.y + (y - start.y) * (i / steps) + (Math.random() * 3 - 1.5);

    await page.mouse.move(nx, ny);
    if (i % emitEvery === 0 || i === steps - 1) {
      broadcast("mouse_move", {
        x: Math.round(nx),
        y: Math.round(ny),
        viewportWidth: start.viewportWidth,
        viewportHeight: start.viewportHeight,
        kind: telemetryKind
      });
    }
    await page.waitForTimeout(5 + Math.random() * 15);
  }

  await page.evaluate(({ mx, my, viewportWidth, viewportHeight }) => {
    window.__puppeterrMouseX = mx;
    window.__puppeterrMouseY = my;
    window.__puppeterrViewportWidth = viewportWidth;
    window.__puppeterrViewportHeight = viewportHeight;
  }, {
    mx: x,
    my: y,
    viewportWidth: start.viewportWidth,
    viewportHeight: start.viewportHeight
  }).catch(() => {});
}
async function humanClick(page, x, y) {
  await humanMove(page, x + (Math.random() * 10 - 5), y + (Math.random() * 10 - 5), { kind: "preclick" });
  await humanMove(page, x, y, { kind: "preclick" });
  await page.mouse.click(x, y, { delay: 50 + Math.random() * 150 });

  const viewport = await page.evaluate(() => ({
    width: Math.max(1, Math.round(window.__puppeterrViewportWidth || window.innerWidth || 1920)),
    height: Math.max(1, Math.round(window.__puppeterrViewportHeight || window.innerHeight || 1080))
  })).catch(() => ({ width: 1920, height: 1080 }));

  broadcast("mouse_click", {
    x: Math.round(x),
    y: Math.round(y),
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    kind: "click"
  });
}


chromium.use(StealthPlugin());

// ── Auto-install browser ──────────────────────────────────────────────────────
function ensureBrowser() {
  try { execSync("npx playwright install --dry-run chromium 2>&1"); return; } catch {}
  try {
    console.log("🔧 Installing Chromium...");
    execSync("npx playwright install chromium", { stdio: "inherit" });
    console.log("✅ Done!");
  } catch (err) { console.error("❌ Install failed:", err.message); process.exit(1); }
}
ensureBrowser();

// ── .env loader ───────────────────────────────────────────────────────────────
if (fs.existsSync(".env")) {
  fs.readFileSync(".env", "utf8").split(/\r?\n/).forEach(line => {
    const raw = String(line || "").trim();
    if (!raw || raw.startsWith("#")) return;
    const [k, ...v] = raw.split("=");
    if (!k || !v.length) return;
    const key = k.trim();
    if (process.env[key]) return;
    let value = v.join("=").trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  });
}

const CF_API_TOKEN  = process.env.CF_API_TOKEN;
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_GATEWAY_CHAT_COMPLETIONS_URL = String(
  process.env.CF_GATEWAY_CHAT_COMPLETIONS_URL ||
  `https://gateway.ai.cloudflare.com/v1/${CF_ACCOUNT_ID}/default/compat/chat/completions`
).trim();
const PINCH_API_TOKEN = process.env.PINCH_API_TOKEN || process.env.PINCH_X_API_TOKEN || "";
const PINCH_API_EMAIL = process.env.PINCH_API_EMAIL || process.env.PINCH_X_API_EMAIL || "";
const PINCH_BASE_URI = process.env.PINCH_BASE_URI || "";
const SESSION_FILE  = "session.json";
const CHAT_STORE_FILE = "chat-history.json";
const LOG_FILE = "log.json";
const USER_STORE_FILE = "users.json";
const PASSWORD_MIN_LENGTH = Math.max(8, Number(process.env.PASSWORD_MIN_LENGTH || 8));
const REQUIRE_EMAIL_VERIFICATION = String(process.env.REQUIRE_EMAIL_VERIFICATION || "false").toLowerCase() === "true";
const PINCH_API_VERSION = process.env.PINCH_API_VERSION || "2020.1";
const SMTP_HOST    = process.env.SMTP_HOST || "";
const SMTP_PORT    = Number(process.env.SMTP_PORT) || 587;
const SMTP_SECURE  = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
const SMTP_USER    = process.env.SMTP_USER || "";
const SMTP_PASS    = process.env.SMTP_PASS || "";
const SMTP_FROM    = process.env.SMTP_FROM || `"Puppeterr" <${process.env.SMTP_USER || "noreply@puppeterr.app"}>`;  
const APP_BASE_URL = String(process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const { loadSessionState } = require("./sessionStore");
const BROWSER_PROFILE_DIR = process.env.BROWSER_PROFILE_DIR || path.join(process.cwd(), ".puppeterr-profile");
const FINGERPRINT_USER_AGENT = process.env.FINGERPRINT_USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FINGERPRINT_LOCALE = process.env.FINGERPRINT_LOCALE || "en-US";
const FINGERPRINT_TIMEZONE = process.env.FINGERPRINT_TIMEZONE || "America/New_York";
const FINGERPRINT_VIEWPORT_WIDTH = Math.max(960, Number(process.env.FINGERPRINT_VIEWPORT_WIDTH || 1366));
const FINGERPRINT_VIEWPORT_HEIGHT = Math.max(600, Number(process.env.FINGERPRINT_VIEWPORT_HEIGHT || 768));
const FINGERPRINT_PLATFORM = process.env.FINGERPRINT_PLATFORM || "Win32";
const FINGERPRINT_CPU_CORES = Math.max(2, Number(process.env.FINGERPRINT_CPU_CORES || 8));
const PORT          = process.env.PORT || 3000;
const HOST          = "0.0.0.0";
const MAX_STEPS     = 60;
const MAX_RETRIES   = 3;
const MODEL_CACHE_MS = 15 * 60 * 1000;
const CAPTCHA_HUMAN_CHECK_LIMIT = Math.max(1, Number(process.env.CAPTCHA_HUMAN_CHECK_LIMIT || 10));
const CAPTCHA_HUMAN_HANDOFF_PAGE_FAILURES = Math.max(1, Number(process.env.CAPTCHA_HUMAN_HANDOFF_PAGE_FAILURES || 3));
const CAPTCHA_RECHECK_DELAY_MS = Number(process.env.CAPTCHA_RECHECK_DELAY_MS || 6000);
const CAPTCHA_GENTLE_MODE_MS = Math.max(30000, Number(process.env.CAPTCHA_GENTLE_MODE_MS || 180000));
const CAPTCHA_GENTLE_PACING_MULTIPLIER = Math.max(1, Number(process.env.CAPTCHA_GENTLE_PACING_MULTIPLIER || 1.8));
const CAPTCHA_GENTLE_PRE_ACTION_IDLE_MS = Math.max(200, Number(process.env.CAPTCHA_GENTLE_PRE_ACTION_IDLE_MS || 900));
const CAPTCHA_GENTLE_BURST_ACTIONS = Math.max(1, Number(process.env.CAPTCHA_GENTLE_BURST_ACTIONS || 2));
const CAPTCHA_GENTLE_MICRO_BREAK_MS = Math.max(400, Number(process.env.CAPTCHA_GENTLE_MICRO_BREAK_MS || 1600));
const BASE_NAVIGATION_COOLDOWN_MS = Math.max(0, Number(process.env.BASE_NAVIGATION_COOLDOWN_MS || 2500));
const CAPTCHA_GENTLE_NAVIGATION_COOLDOWN_MS = Math.max(BASE_NAVIGATION_COOLDOWN_MS, Number(process.env.CAPTCHA_GENTLE_NAVIGATION_COOLDOWN_MS || 12000));
const BASE_POST_STEP_PAUSE_MS = Math.max(200, Number(process.env.BASE_POST_STEP_PAUSE_MS || 600));
const CAPTCHA_GENTLE_POST_STEP_PAUSE_MS = Math.max(BASE_POST_STEP_PAUSE_MS, Number(process.env.CAPTCHA_GENTLE_POST_STEP_PAUSE_MS || 1500));
const ACTION_PACING_DELAY_MS = Number(process.env.ACTION_PACING_DELAY_MS || 350);
const STEP_SETTLE_DELAY_MS = Number(process.env.STEP_SETTLE_DELAY_MS || 450);
const PLANNER_RETRY_DELAY_MS = Number(process.env.PLANNER_RETRY_DELAY_MS || 700);
const POST_STEP_DELAY_MS = Number(process.env.POST_STEP_DELAY_MS || 300);
const VISION_SAMPLE_EVERY_STEPS = Math.max(1, Number(process.env.VISION_SAMPLE_EVERY_STEPS || 2));
const VERIFY_EVERY_STEPS = Math.max(1, Number(process.env.VERIFY_EVERY_STEPS || 2));
const BRIDGE_VISION_INTERVAL_MS = 1000;
const BRIDGE_VISION_CLEAR_STREAK = 2;
const VISION_STREAM_FPS = Math.max(1, Number(process.env.VISION_STREAM_FPS || 8));
const VISION_STREAM_INTERVAL_MS = Math.max(90, Math.round(1000 / VISION_STREAM_FPS));
const VISION_REASONER_INTERVAL_MS = Math.max(400, Number(process.env.VISION_REASONER_INTERVAL_MS || 900));
const VISION_REASONER_FORCE_INTERVAL_MS = Math.max(1200, Number(process.env.VISION_REASONER_FORCE_INTERVAL_MS || 2500));
const VISION_STREAM_FRESH_MS = Math.max(600, Number(process.env.VISION_STREAM_FRESH_MS || 5000));
const VISION_CLICK_CANDIDATE_COUNT = 3;
const HYBRID_SELECTOR_VARIANTS = Math.max(1, Math.min(5, Number(process.env.HYBRID_SELECTOR_VARIANTS || 5)));
const HYBRID_URL_CHANGE_MAX_CYCLES = Math.max(1, Number(process.env.HYBRID_URL_CHANGE_MAX_CYCLES || 2));
const CONFUSION_RESEARCH_COOLDOWN_MS = Math.max(30000, Number(process.env.CONFUSION_RESEARCH_COOLDOWN_MS || 180000));
const CONFUSION_RESEARCH_RESULT_LIMIT = Math.max(3, Number(process.env.CONFUSION_RESEARCH_RESULT_LIMIT || 5));
const SUPERVISOR_MODE = String(process.env.SUPERVISOR_MODE || "enforce").toLowerCase(); // off | passive | enforce
const SUPERVISOR_BLOCK_SCORE = Math.max(0.2, Math.min(0.95, Number(process.env.SUPERVISOR_BLOCK_SCORE || 0.52)));
const SUPERVISOR_WARN_SCORE = Math.max(SUPERVISOR_BLOCK_SCORE, Math.min(0.98, Number(process.env.SUPERVISOR_WARN_SCORE || 0.67)));
const SUPERVISOR_ACTION_BLOCK_RISK = Math.max(0.2, Math.min(0.95, Number(process.env.SUPERVISOR_ACTION_BLOCK_RISK || 0.72)));
const SUPERVISOR_ROUTE_FAIL_TTL_MS = Math.max(5000, Number(process.env.SUPERVISOR_ROUTE_FAIL_TTL_MS || 90000));
const SUPERVISOR_DECISION_CACHE_TTL_MS = Math.max(500, Number(process.env.SUPERVISOR_DECISION_CACHE_TTL_MS || 4000));
const SUPERVISOR_DECISION_CACHE_MAX = Math.max(8, Number(process.env.SUPERVISOR_DECISION_CACHE_MAX || 64));
const DYNAMIC_UI_CHANGED_FRAME_THRESHOLD = Math.max(4, Number(process.env.DYNAMIC_UI_CHANGED_FRAME_THRESHOLD || 8));
const DYNAMIC_UI_CHANGE_RATIO = Math.max(1, Number(process.env.DYNAMIC_UI_CHANGE_RATIO || 1.5));
const ESCAPE_MAX_CONSECUTIVE_FAILURES = 3;
const ESCAPE_STEP_TIMEOUT_MS = 20000;
const ESCAPE_DYNAMIC_STREAK_LIMIT = 3;
const IDLE_HUMAN_IDLE_MIN_MS = Number(process.env.IDLE_HUMAN_IDLE_MIN_MS || 2500);
const IDLE_HUMAN_IDLE_MAX_MS = Number(process.env.IDLE_HUMAN_IDLE_MAX_MS || 7000);
const IDLE_HUMAN_SCHEDULE_FLOOR_MS = Math.max(120, Number(process.env.IDLE_HUMAN_SCHEDULE_FLOOR_MS || 180));
const IDLE_HUMAN_HOTSPOT_SAMPLE_LIMIT = Math.max(8, Number(process.env.IDLE_HUMAN_HOTSPOT_SAMPLE_LIMIT || 28));
const IDLE_HUMAN_MAX_TARGET_REUSE = Math.max(2, Number(process.env.IDLE_HUMAN_MAX_TARGET_REUSE || 3));
const MAX_LOG_ENTRIES = 4000;
const AUTH_COOKIE_NAME = "puppeterr_auth";
const AUTH_SECRET = process.env.APP_AUTH_SECRET || "puppeterr-local-secret";
const APP_USERNAME = process.env.APP_USERNAME || "admin";
const APP_PASSWORD = process.env.APP_PASSWORD || "puppeterr";
const WORKSPACE_ROOT = process.cwd();
// Cap how many turns of plannerHistory we keep. Without this, a long task
// (many steps) makes the message array grow forever, eventually blowing
// past the model's context window — which can ALSO surface as a confusing
// "Bad input" error from Cloudflare that looks unrelated to its real cause.
const MAX_PLANNER_HISTORY_MESSAGES = 15; // system + last X turns
const fetchImpl = globalThis.fetch || undiciFetch;

const MODEL_ROLES = ["router", "planner", "reasoner", "vision"];
const ROUTER_LOCK_MODEL = String(process.env.ROUTER_LOCK_MODEL || "false").toLowerCase() === "true";
const ROUTER_THINKING_DEFAULT = String(process.env.ROUTER_THINKING_DEFAULT || "true").toLowerCase() !== "false";
const DEFAULT_MODELS = {
  // router/reasoner/vision: Cloudflare-hosted (ai/run/) — confirmed working
  // planner: third-party via ai/v1/chat/completions — requires unified billing credits
  // image: flux-2-klein-9b confirmed working via multipart on this account (~2s generation)
  router:   process.env.DEFAULT_ROUTER_MODEL   || "@cf/qwen/qwen3-30b-a3b-fp8",
  planner:  process.env.DEFAULT_PLANNER_MODEL  || "anthropic/claude-opus-4.8",
  reasoner: process.env.DEFAULT_REASONER_MODEL || "@cf/zai-org/glm-5.2",
  vision:   process.env.DEFAULT_VISION_MODEL   || "@cf/meta/llama-3.2-11b-vision-instruct",
  image:    process.env.DEFAULT_IMAGE_MODEL    || "@cf/black-forest-labs/flux-2-klein-9b"
};
const SUPERVISOR_MODEL = String(process.env.SUPERVISOR_MODEL || process.env.DEFAULT_SUPERVISOR_MODEL || "").trim();

function isVisionLikeModel(model = {}) {
  const text = [model.id, model.name, model.type, ...(Array.isArray(model.capabilities) ? model.capabilities : [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /vision|image|multimodal/.test(text);
}

function pickModelId(catalog, preferredIds, wantVision) {
  const items = Array.isArray(catalog) ? catalog : [];
  const preferred = new Set((preferredIds || []).filter(Boolean));
  const byPreference = items.find(item => preferred.has(item.id));
  if (byPreference) return byPreference.id;

  const byType = items.find(item => wantVision ? isVisionLikeModel(item) : !isVisionLikeModel(item));
  if (byType) return byType.id;

  return items[0]?.id || null;
}

function resolveDefaultModels(catalog) {
  const router = pickModelId(catalog, [DEFAULT_MODELS.router, "@cf/qwen/qwen3-30b-a3b-fp8"], true) || DEFAULT_MODELS.router;
  const planner = pickModelId(catalog, [DEFAULT_MODELS.planner, "anthropic/claude-opus-4.8", router], false) || router;
  const reasoner = pickModelId(catalog, [DEFAULT_MODELS.reasoner, router], false) || router;
  const vision = pickModelId(catalog, [DEFAULT_MODELS.vision, "@cf/meta/llama-3.2-11b-vision-instruct"], true) || DEFAULT_MODELS.vision;
  return { router, planner, reasoner, vision };
}

function sanitizeModels(models, catalog) {
  const defaults = resolveDefaultModels(catalog);
  const merged = { ...defaults, ...(models || {}) };
  const knownIds = new Set((Array.isArray(catalog) ? catalog : []).map(item => item.id));
  if (!knownIds.size) return merged;
  for (const role of MODEL_ROLES) {
    if (!knownIds.has(merged[role])) merged[role] = defaults[role];
  }
  return merged;
}

const ROUTER_TASK_PROFILES = {
  image_analysis: {
    intent: ["analyze image", "describe image", "what is in this image", "image analysis", "inspect image"],
    capability: ["vision", "multimodal", "image understanding", "image analysis", "image"]
  },
  video_analysis: {
    intent: ["analyze video", "video analysis", "what is in this video", "inspect video"],
    capability: ["video", "video understanding", "multimodal", "vision"]
  },
  screenshot_analysis: {
    intent: ["analyze screenshot", "screenshot", "screen capture", "screen analysis"],
    capability: ["vision", "multimodal", "image analysis", "image"]
  },
  general_media: {
    intent: ["analyze attachment", "analyze media", "uploaded media", "attached file"],
    capability: ["multimodal", "vision", "media"]
  },
  image_generation: {
    intent: ["generate image", "make a picture", "render art", "poster", "logo", "illustration", "text-to-image", "image gen", "create image"],
    capability: ["image generation", "text-to-image", "image-gen", "sdxl", "flux", "dall", "stable diffusion"]
  },
  browser_control: {
    intent: ["click", "scroll", "open tab", "navigate", "search this page", "fill", "submit", "go to"],
    capability: ["browser control", "browser automation", "agentic", "tool use", "actions", "navigation"]
  },
  deep_reasoning: {
    intent: ["analysis", "plan", "multi-step", "reason", "logic", "evaluate", "strategy", "compare"],
    capability: ["reasoning", "deep reasoning", "analysis", "planning", "chain of thought", "multistep"]
  },
  extraction: {
    intent: ["extract", "structured", "json", "list", "parse", "schema", "fields", "table"],
    capability: ["structured output", "json", "extraction", "parser", "information extraction"]
  },
  audio: {
    intent: ["generate audio", "voice", "sound", "speech", "tts", "text to audio"],
    capability: ["text-to-audio", "audio generation", "speech synthesis", "voice", "tts"]
  },
  video: {
    intent: ["generate video", "animate", "clip", "text-to-video", "video generation"],
    capability: ["text-to-video", "video generation", "animation", "video"]
  },
  code: {
    intent: ["write code", "fix code", "explain code", "debug", "refactor", "function", "script"],
    capability: ["code generation", "coding", "debugging", "programming", "code assistant"]
  },
  general: {
    intent: [],
    capability: ["assistant", "general", "chat", "instruction"]
  }
};

function classifyRouterTaskType(goalText, routeContext = {}) {
  const explicitMediaType = String(routeContext?.mediaTaskType || "").trim();
  if (explicitMediaType && ROUTER_TASK_PROFILES[explicitMediaType]) {
    return explicitMediaType;
  }

  const mediaList = Array.isArray(routeContext?.media) ? routeContext.media : [];
  if (mediaList.length) {
    if (mediaList.some(item => String(item?.mediaType || "") === "video")) return "video_analysis";
    if (mediaList.some(item => String(item?.kind || "").includes("screenshot"))) return "screenshot_analysis";
    if (mediaList.some(item => String(item?.mediaType || "") === "image")) return "image_analysis";
    return "general_media";
  }

  const goal = String(goalText || "").toLowerCase();
  const order = ["image_analysis", "video_analysis", "screenshot_analysis", "general_media", "image_generation", "audio", "video", "code", "extraction", "browser_control", "deep_reasoning"];
  for (const key of order) {
    const profile = ROUTER_TASK_PROFILES[key];
    if (profile.intent.some(keyword => goal.includes(keyword))) {
      return key;
    }
  }
  return "general";
}

function flattenModelSignals(model) {
  const capabilities = Array.isArray(model?.capabilities) ? model.capabilities : [];
  const tags = Array.isArray(model?.tags) ? model.tags : [];
  const description = String(model?.description || "");
  const type = String(model?.type || "");
  const metadata = model?.metadata && typeof model.metadata === "object"
    ? JSON.stringify(model.metadata)
    : String(model?.metadata || "");
  return [type, description, metadata, ...capabilities, ...tags]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function extractReliabilityScore(model) {
  const metadata = model?.metadata && typeof model.metadata === "object" ? model.metadata : {};
  const numericFields = [metadata.reliability, metadata.score, metadata.quality, metadata.successRate, metadata.uptime]
    .map(value => Number(value))
    .filter(Number.isFinite);
  if (numericFields.length) {
    const average = numericFields.reduce((sum, n) => sum + n, 0) / numericFields.length;
    return average > 1 ? Math.max(0, Math.min(1, average / 100)) : Math.max(0, Math.min(1, average));
  }

  const statusText = flattenModelSignals(model);
  if (/production|stable|ga\b|reliable/.test(statusText)) return 0.82;
  if (/preview|beta|experimental|alpha/.test(statusText)) return 0.42;
  return 0.58;
}

function scoreModelForTask(model, taskType, baselineModelId) {
  const profile = ROUTER_TASK_PROFILES[taskType] || ROUTER_TASK_PROFILES.general;
  const signalText = flattenModelSignals(model);
  const capabilityHits = profile.capability.filter(keyword => signalText.includes(keyword)).length;
  const capabilityScore = profile.capability.length ? capabilityHits / profile.capability.length : 0;
  const specificity = Math.max(0, Math.min(1, capabilityHits / 3));
  const reliability = extractReliabilityScore(model);
  const fallbackStrength = model?.id === baselineModelId ? 1 : (/assistant|general|reasoning|instruct|chat/.test(signalText) ? 0.7 : 0.35);
  const total = capabilityScore * 0.56 + reliability * 0.2 + specificity * 0.16 + fallbackStrength * 0.08;
  return {
    total,
    capabilityScore,
    reliability,
    specificity,
    fallbackStrength,
    reason: `cap=${capabilityScore.toFixed(2)} rel=${reliability.toFixed(2)} spec=${specificity.toFixed(2)} fb=${fallbackStrength.toFixed(2)}`
  };
}

function pickBestRouterModelForTask(taskType, baselineModelId, catalog, failedSet) {
  if (taskType === "image_generation") {
    return {
      modelToUse: baselineModelId,
      reason: "image generation stays pinned to the configured baseline model",
      swapped: false
    };
  }
  if (ROUTER_LOCK_MODEL) {
    return {
      modelToUse: baselineModelId,
      reason: `router lock enabled; using baseline router for ${taskType}`,
      swapped: false
    };
  }
  const models = Array.isArray(catalog) ? catalog : [];
  const blocked = failedSet instanceof Set ? failedSet : new Set();
  const scored = [];

  for (const model of models) {
    const modelId = String(model?.id || "");
    if (!modelId || blocked.has(modelId)) continue;
    const score = scoreModelForTask(model, taskType, baselineModelId);
    scored.push({ modelId, score });
  }

  scored.sort((a, b) => b.score.total - a.score.total);
  const best = scored[0];
  if (best && best.score.capabilityScore >= 0.92) {
    return {
      modelToUse: best.modelId,
      reason: `perfect capability match for ${taskType}; ${best.score.reason}`,
      swapped: best.modelId !== baselineModelId
    };
  }
  if (best && best.score.capabilityScore >= 0.45) {
    return {
      modelToUse: best.modelId,
      reason: `strong partial capability match for ${taskType}; ${best.score.reason}`,
      swapped: best.modelId !== baselineModelId
    };
  }
  return {
    modelToUse: baselineModelId,
    reason: `no adequate capability match for ${taskType}; using baseline router`,
    swapped: false
  };
}

let browser, context, page;
let sessionHistory  = [];
let agentRunning    = false;
let currentTaskUserId = null; // tracks which user triggered the active task
let modelCatalogCache = { expiresAt: 0, items: [] };
let routerTaskTypeFailures = new Map(); // runtime-only model failures by task type
let learningLogCache = null;
let screenshotCaptureQueue = Promise.resolve();
let bridgeVisionTimer = null;
let bridgeVisionInFlight = false;
let bridgeVisionClearStreak = 0;
let bridgeVisionModelId = DEFAULT_MODELS.vision;
let lastSupervisorFallbackWarning = "";
let supervisorRouteFailCache = new Map();
let supervisorDecisionCache = new Map();
let idleHumanTimer = null;
let idleHumanInFlight = false;
let lastExecutorWorkAt = 0;
let nextIdleNudgeAt = 0;
let idleHumanState = {
  lastX: 0,
  lastY: 0,
  lastKind: "",
  reuseCount: 0,
  lastUrl: "",
  sampleCursor: 0,
  hotspotTrail: []
};
let confusionResearchState = {
  lastKey: "",
  lastAt: 0,
  lastQuery: "",
  hints: [],
  sources: [],
  targetDomain: "",
  currentGoal: ""
};
let humanBridgeState = {
  active: false,
  checks: 0,
  limit: CAPTCHA_HUMAN_CHECK_LIMIT,
  url: "about:blank",
  reason: "",
  closureReason: "",
  visionLastCheckAt: null,
  visionLastSummary: "",
  clickCount: 0,
  lastClickAt: null,
  lastClick: null
};
let taskVisionState = {
  active: false,
  timer: null,
  inFlight: false,
  seq: 0,
  unchangedFrames: 0,
  changedFrames: 0,
  droppedFrames: 0,
  lastHash: null,
  lastFrameAt: 0,
  lastChangeAt: 0,
  lastReasonerAt: 0,
  latestSummary: "",
  latestReasonerRaw: "",
  latestReasonerSignal: null,
  goal: "",
  model: DEFAULT_MODELS.vision,
  latestUrl: "about:blank"
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

const VISION_FILTER_STYLE_ID = "__puppeterr_vision_filter_style";
const VISION_FILTER_CSS = `
html, body {
  background: #111111 !important;
}

button, a, [role="button"], input[type="button"], input[type="submit"], [onclick], label[for] {
  background: #ffffff !important;
  color: #000000 !important;
  border: 2px solid #8a8a8a !important;
  box-shadow: none !important;
}

input, textarea, select {
  background: #f2f2f2 !important;
  color: #000000 !important;
  border: 1px solid #9a9a9a !important;
}

img, video, canvas, svg {
  filter: grayscale(100%) brightness(42%) contrast(82%) !important;
}

p, span, div, li, h1, h2, h3, h4, h5, h6 {
  color: #d2d2d2 !important;
}

* {
  animation: none !important;
  transition: none !important;
}`;

function queueScreenshotCapture(task) {
  const run = screenshotCaptureQueue.then(task, task);
  screenshotCaptureQueue = run.catch(() => {});
  return run;
}

function randomIdleDelayMs() {
  const min = Math.max(200, Number(IDLE_HUMAN_IDLE_MIN_MS) || 1400);
  const max = Math.max(min, Number(IDLE_HUMAN_IDLE_MAX_MS) || 4200);
  return Math.round(min + Math.random() * (max - min));
}

function clampToViewport(value, max, min = 1) {
  return Math.max(min, Math.min(max - min, Math.round(Number(value) || min)));
}

function resolveIdleHintCoordinate(value, axisSize, fallbackRatio = 0.5) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Math.round(axisSize * fallbackRatio);
  if (n >= 0 && n <= 1) return Math.round(n * axisSize);
  if (n >= 0 && n <= 1000) return Math.round((n / 1000) * axisSize);
  return Math.round(n);
}

function weightedPick(items) {
  if (!Array.isArray(items) || !items.length) return null;
  const total = items.reduce((sum, item) => sum + Math.max(0.01, Number(item?.weight || 1)), 0);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= Math.max(0.01, Number(item?.weight || 1));
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

async function getIdleHotspotSnapshot(page) {
  if (!page) return null;
  return page.evaluate((limit) => {
    const width = Math.max(1, Math.round(window.innerWidth || 1920));
    const height = Math.max(1, Math.round(window.innerHeight || 1080));
    const isVisible = (el) => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      if (!style || style.visibility === "hidden" || style.display === "none" || Number(style.opacity || 1) < 0.05) return false;
      const rect = el.getBoundingClientRect();
      return rect && rect.width >= 8 && rect.height >= 8 && rect.bottom >= 0 && rect.right >= 0 && rect.left <= width && rect.top <= height;
    };

    const selector = [
      "button",
      "a[href]",
      "input:not([type='hidden'])",
      "textarea",
      "select",
      "[role='button']",
      "[role='tab']",
      "[role='menuitem']",
      "[aria-label]"
    ].join(",");

    const nodes = Array.from(document.querySelectorAll(selector)).filter(isVisible).slice(0, Math.max(8, Number(limit) || 24));
    const hotspots = nodes.map((el) => {
      const rect = el.getBoundingClientRect();
      const tag = String(el.tagName || "").toLowerCase();
      const role = String(el.getAttribute("role") || "").toLowerCase();
      const type = String(el.getAttribute("type") || "").toLowerCase();
      const text = String(el.innerText || el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 60).toLowerCase();
      const centerX = rect.left + (rect.width / 2);
      const centerY = rect.top + (rect.height / 2);
      return {
        x: Math.round(centerX),
        y: Math.round(centerY),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        tag,
        role,
        type,
        text
      };
    });

    const active = document.activeElement;
    let activeRect = null;
    if (active && typeof active.getBoundingClientRect === "function") {
      const r = active.getBoundingClientRect();
      if (r && r.width > 0 && r.height > 0) {
        activeRect = {
          left: Math.round(r.left),
          top: Math.round(r.top),
          right: Math.round(r.right),
          bottom: Math.round(r.bottom)
        };
      }
    }

    return {
      width,
      height,
      hotspots,
      activeRect,
      url: String(location.href || "about:blank")
    };
  }, IDLE_HUMAN_HOTSPOT_SAMPLE_LIMIT).catch(() => null);
}

function pickIdleTarget(snapshot, state = {}) {
  const width = Math.max(1, Number(snapshot?.width || 1920));
  const height = Math.max(1, Number(snapshot?.height || 1080));
  const url = String(snapshot?.url || "about:blank");
  const explicitX = resolveIdleHintCoordinate(state.x, width, 0.52);
  const explicitY = resolveIdleHintCoordinate(state.y, height, 0.42);

  const hasExplicit = Number.isFinite(Number(state.x)) || Number.isFinite(Number(state.y));
  if (hasExplicit) {
    const x = clampToViewport(explicitX + (Math.random() * 22 - 11), width);
    const y = clampToViewport(explicitY + (Math.random() * 18 - 9), height);
    return { x, y, kind: "hinted", url };
  }

  const hotspots = Array.isArray(snapshot?.hotspots) ? snapshot.hotspots : [];
  const weightedHotspots = hotspots.map(h => {
    let weight = 1;
    if (h.tag === "a" || h.role === "tab") weight += 0.7;
    if (h.tag === "button" || h.role === "button") weight += 0.5;
    if (/(search|menu|more|spec|detail|ticket|buy|shop)/.test(h.text)) weight += 1.4;
    if (h.type === "password" || h.type === "email") weight = Math.max(0.25, weight - 0.6);
    return { ...h, weight };
  });

  let chosen = weightedPick(weightedHotspots);
  if (chosen && idleHumanState.lastX && idleHumanState.lastY) {
    const dx = Number(chosen.x || 0) - idleHumanState.lastX;
    const dy = Number(chosen.y || 0) - idleHumanState.lastY;
    const dist = Math.hypot(dx, dy);
    const sameKind = idleHumanState.lastKind === "hotspot";
    if (sameKind && dist < 18 && idleHumanState.reuseCount >= IDLE_HUMAN_MAX_TARGET_REUSE) {
      const rotated = weightedHotspots[(idleHumanState.sampleCursor++) % Math.max(1, weightedHotspots.length)] || chosen;
      chosen = rotated;
    }
  }

  if (chosen) {
    const x = clampToViewport(Number(chosen.x || (width * 0.5)) + (Math.random() * 14 - 7), width);
    const y = clampToViewport(Number(chosen.y || (height * 0.45)) + (Math.random() * 12 - 6), height);
    return { x, y, kind: "hotspot", url };
  }

  const centerLaneX = width * (0.28 + Math.random() * 0.44);
  const centerLaneY = height * (0.25 + Math.random() * 0.5);
  return {
    x: clampToViewport(centerLaneX, width),
    y: clampToViewport(centerLaneY, height),
    kind: "ambient",
    url
  };
}

function scheduleIdleHumanTick() {
  if (!agentRunning || !page) return;
  if (idleHumanTimer) {
    clearTimeout(idleHumanTimer);
    idleHumanTimer = null;
  }
  const delay = Math.max(IDLE_HUMAN_SCHEDULE_FLOOR_MS, Number(nextIdleNudgeAt || 0) - Date.now());
  idleHumanTimer = setTimeout(async () => {
    if (!agentRunning || !page || idleHumanInFlight) {
      scheduleIdleHumanTick();
      return;
    }
    if (Date.now() < nextIdleNudgeAt) {
      scheduleIdleHumanTick();
      return;
    }
    idleHumanInFlight = true;
    try {
      await humanIdleNudge(page);
    } catch {}
    idleHumanInFlight = false;
    markExecutorWork();
  }, delay);
}

function markExecutorWork() {
  lastExecutorWorkAt = Date.now();
  nextIdleNudgeAt = lastExecutorWorkAt + randomIdleDelayMs();
  if (agentRunning && page) scheduleIdleHumanTick();
}

async function withExecutorWork(workFn) {
  markExecutorWork();
  try {
    return await workFn();
  } finally {
    markExecutorWork();
  }
}

function startIdleHumanBehavior() {
  stopIdleHumanBehavior();
  markExecutorWork();
  scheduleIdleHumanTick();
}

function stopIdleHumanBehavior() {
  if (idleHumanTimer) {
    clearTimeout(idleHumanTimer);
    idleHumanTimer = null;
  }
  idleHumanInFlight = false;
  nextIdleNudgeAt = 0;
  idleHumanState = {
    lastX: 0,
    lastY: 0,
    lastKind: "",
    reuseCount: 0,
    lastUrl: "",
    sampleCursor: 0,
    hotspotTrail: []
  };
}

async function humanIdleNudge(page, state = {}) {
  if (!page) return;
  const snapshot = await getIdleHotspotSnapshot(page);
  const viewport = {
    width: Math.max(1, Number(snapshot?.width || 1920)),
    height: Math.max(1, Number(snapshot?.height || 1080))
  };
  const target = pickIdleTarget(snapshot || {}, state);
  const targetX = clampToViewport(target.x, viewport.width);
  const targetY = clampToViewport(target.y, viewport.height);

  const shouldMicroOvershoot = Math.random() < 0.42;
  const overshootX = shouldMicroOvershoot ? clampToViewport(targetX + (Math.random() * 20 - 10), viewport.width) : targetX;
  const overshootY = shouldMicroOvershoot ? clampToViewport(targetY + (Math.random() * 16 - 8), viewport.height) : targetY;

  try {
    await page.bringToFront().catch(() => {});
    if (shouldMicroOvershoot) {
      await humanMove(page, overshootX, overshootY, { kind: "idle", emitEvery: 4 });
      await page.waitForTimeout(18 + Math.random() * 70).catch(() => {});
    }
    await humanMove(page, targetX, targetY, { kind: "idle", emitEvery: 4 });

    const shortPause = 22 + Math.random() * 95;
    await page.waitForTimeout(shortPause).catch(() => {});

    const tinyDriftX = clampToViewport(targetX + (Math.random() * 8 - 4), viewport.width);
    const tinyDriftY = clampToViewport(targetY + (Math.random() * 8 - 4), viewport.height);
    if (Math.random() < 0.5) {
      await humanMove(page, tinyDriftX, tinyDriftY, { kind: "idle", emitEvery: 5 });
    }

    const sameKind = idleHumanState.lastKind === target.kind && idleHumanState.lastUrl === target.url;
    idleHumanState.lastX = targetX;
    idleHumanState.lastY = targetY;
    idleHumanState.lastKind = target.kind;
    idleHumanState.lastUrl = target.url;
    idleHumanState.reuseCount = sameKind ? idleHumanState.reuseCount + 1 : 0;
    idleHumanState.hotspotTrail.push({ x: targetX, y: targetY, kind: target.kind, ts: Date.now() });
    if (idleHumanState.hotspotTrail.length > 14) {
      idleHumanState.hotspotTrail.splice(0, idleHumanState.hotspotTrail.length - 14);
    }
  } catch {}
}

async function sleepLikeHuman(ms, page, state = {}) {
  const total = Math.max(0, Number(ms) || 0);
  if (!total) return;
  const slice = Math.min(650, Math.max(220, Math.round(total / 4)));
  let elapsed = 0;
  while (elapsed < total) {
    const chunk = Math.min(slice, total - elapsed);
    await sleep(chunk);
    elapsed += chunk;
    if (elapsed < total) await humanIdleNudge(page, state);
  }
}

async function waitForDomQuiet(page, options = {}) {
  if (!page) return;
  const quietMs = Math.max(80, Number(options.quietMs || 240));
  const timeoutMs = Math.max(300, Number(options.timeoutMs || 2200));
  const pollMs = Math.max(40, Number(options.pollMs || 80));
  const start = Date.now();
  let lastMutationAt = Date.now();

  try {
    await page.evaluate(() => {
      if (window.__puppeterrDomQuietObserverInstalled) return;
      window.__puppeterrLastDomMutationAt = Date.now();
      const observer = new MutationObserver(() => {
        window.__puppeterrLastDomMutationAt = Date.now();
      });
      observer.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: false
      });
      window.__puppeterrDomQuietObserverInstalled = true;
    });
  } catch {
    return;
  }

  while (Date.now() - start < timeoutMs) {
    try {
      const stamp = await page.evaluate(() => Number(window.__puppeterrLastDomMutationAt || Date.now()));
      if (Number.isFinite(stamp)) lastMutationAt = stamp;
      if (Date.now() - lastMutationAt >= quietMs) return;
    } catch {
      return;
    }
    await sleep(pollMs);
  }
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, { "Content-Type": "application/json", ...extraHeaders });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); }
      catch (err) { reject(err); }
    });
    req.on("error", reject);
  });
}

function resolveWorkspacePath(targetPath = ".") {
  const resolved = path.resolve(WORKSPACE_ROOT, String(targetPath || "."));
  if (!resolved.startsWith(WORKSPACE_ROOT)) {
    throw new Error("Path escapes workspace root");
  }
  return resolved;
}

function listWorkspaceDir(targetPath = ".") {
  const absPath = resolveWorkspacePath(targetPath);
  const entries = fs.readdirSync(absPath, { withFileTypes: true })
    .filter(entry => entry.name !== ".git" && entry.name !== "node_modules")
    .map(entry => {
      const full = path.join(absPath, entry.name);
      const rel = path.relative(WORKSPACE_ROOT, full) || ".";
      return {
        name: entry.name,
        path: rel.split(path.sep).join("/"),
        type: entry.isDirectory() ? "directory" : "file"
      };
    })
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "directory" ? -1 : 1));

  return {
    cwd: path.relative(WORKSPACE_ROOT, absPath).split(path.sep).join("/") || ".",
    entries
  };
}

function runWorkspaceCommand(command, cwd = ".") {
  return new Promise((resolve) => {
    const absCwd = resolveWorkspacePath(cwd);
    exec(command, { cwd: absCwd, timeout: 120000, maxBuffer: 1024 * 1024 * 8 }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error && typeof error.code === "number" ? error.code : 0,
        stdout: String(stdout || ""),
        stderr: String(stderr || "")
      });
    });
  });
}

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  return raw.split(";").reduce((acc, part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function loadUsers() {
  if (!fs.existsSync(USER_STORE_FILE)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(USER_STORE_FILE, "utf8"));
    return Array.isArray(parsed)
      ? parsed.map(user => ({
          ...user,
          email: normalizeEmail(user?.email),
          verified: !!user?.verified,
          subscription_plan: user?.subscription_plan || null,
          subscription_id: user?.subscription_id || null,
          pinch_customer_id: user?.pinch_customer_id || null,
          subscription_status: user?.subscription_status || (user?.subscription_plan ? "active" : "unsubscribed")
        })).filter(user => user.email)
      : [];
  } catch {
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(USER_STORE_FILE, JSON.stringify(Array.isArray(users) ? users : [], null, 2));
}

function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return loadUsers().find(user => normalizeEmail(user.email) === normalized) || null;
}

function findUserById(userId) {
  const target = String(userId || "").trim();
  if (!target) return null;
  return loadUsers().find(user => String(user.id || "") === target) || null;
}

function sanitizeUserForSession(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: normalizeEmail(user.email),
    verified: !!user.verified,
    subscription_plan: user.subscription_plan || null,
    subscription_id: user.subscription_id || null,
    pinch_customer_id: user.pinch_customer_id || null,
    subscription_status: user.subscription_status || (user.subscription_plan ? "active" : "unsubscribed")
  };
}

function signValue(value) {
  return crypto.createHmac("sha256", AUTH_SECRET).update(value).digest("hex");
}

function createAuthToken(userOrUsername) {
  const fallbackUsername = typeof userOrUsername === "string" ? String(userOrUsername || "") : "";
  const payloadData = typeof userOrUsername === "object" && userOrUsername
    ? {
        u: String(userOrUsername.email || userOrUsername.username || fallbackUsername || "").trim(),
        uid: String(userOrUsername.id || "").trim() || undefined,
        email: normalizeEmail(userOrUsername.email || "") || undefined,
        exp: Date.now() + (7 * 24 * 60 * 60 * 1000)
      }
    : {
        u: fallbackUsername,
        exp: Date.now() + (7 * 24 * 60 * 60 * 1000)
      };
  const payload = Buffer.from(JSON.stringify(payloadData)).toString("base64url");
  return `${payload}.${signValue(payload)}`;
}

function verifyAuthToken(token) {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if (signValue(payload) !== sig) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    return {
      username: parsed.u || parsed.email || "",
      userId: parsed.uid || null,
      email: normalizeEmail(parsed.email || "") || null
    };
  } catch {
    return null;
  }
}

function getAuth(req) {
  const cookies = parseCookies(req);
  const tokenData = verifyAuthToken(cookies[AUTH_COOKIE_NAME]);
  if (!tokenData) return null;

  if (tokenData.userId || tokenData.email) {
    const user = tokenData.userId ? findUserById(tokenData.userId) : findUserByEmail(tokenData.email);
    if (!user) return null;
    const safeUser = sanitizeUserForSession(user);
    return {
      username: safeUser.email,
      userId: safeUser.id,
      email: safeUser.email,
      verified: safeUser.verified,
      subscriptionPlan: safeUser.subscription_plan,
      subscriptionId: safeUser.subscription_id,
      pinchCustomerId: safeUser.pinch_customer_id,
      subscriptionStatus: safeUser.subscription_status,
      isLegacy: false
    };
  }

  return {
    username: tokenData.username,
    userId: null,
    email: null,
    verified: true,
    subscriptionPlan: null,
    subscriptionId: null,
    pinchCustomerId: null,
    subscriptionStatus: "unsubscribed",
    isLegacy: true
  };
}

function requireAuth(req, res) {
  const auth = getAuth(req);
  if (!auth) {
    sendJson(res, 401, { error: "Unauthorized" });
    return null;
  }
  return auth;
}

function setAuthCookie(res, token) {
  res.setHeader("Set-Cookie", `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`);
}

function clearAuthCookie(res) {
  res.setHeader("Set-Cookie", `${AUTH_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

function createMailTransport() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
}

async function sendVerificationEmail(email, token) {
  const transport = createMailTransport();
  const link = `${APP_BASE_URL}/auth/verify?token=${encodeURIComponent(token)}`;
  if (!transport) {
    console.warn(`[email] SMTP not configured. Verification link for ${email}: ${link}`);
    return;
  }
  await transport.sendMail({
    from: SMTP_FROM,
    to: email,
    subject: "Please verify your Puppeterr account",
    text: [
      "Hi there,",
      "",
      "Thanks for signing up to Puppeterr! We just need one small thing from you: please verify your email address so we know you're a real human (not a bot army).",
      "",
      "Click the link below to verify your account:",
      link,
      "",
      "This link expires in 24 hours. After you verify, you'll be automatically signed in and ready to go.",
      "",
      "If you didn't create a Puppeterr account, you can safely ignore this email — nothing will happen.",
      "",
      "— The Puppeterr team"
    ].join("\n"),
    html: `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#0a1018;color:#e8eff7;padding:32px;">
<div style="max-width:520px;margin:0 auto;background:#151f2d;border-radius:16px;padding:32px;border:1px solid rgba(255,255,255,0.08);">
  <div style="font-size:22px;font-weight:700;margin-bottom:8px;">Verify your email</div>
  <p style="color:#93a0af;margin-bottom:24px;">Thanks for signing up to Puppeterr! Click below to verify your email and activate your account.</p>
  <a href="${link}" style="display:inline-block;background:#85e89d;color:#0d1117;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Verify my email ↗</a>
  <p style="margin-top:24px;color:#93a0af;font-size:12px;">Or paste this link in your browser:<br/><code style="color:#85e89d;word-break:break-all;">${link}</code></p>
  <p style="margin-top:24px;color:#555;font-size:11px;">This link expires in 24 hours. If you didn't sign up, ignore this email.</p>
</div></body></html>`
  });
}

async function pinchCreateCustomer(email) {
  if (!PINCH_API_TOKEN) throw new Error("Missing PINCH_API_TOKEN");
  const base = String(PINCH_BASE_URI || "https://api.getpinch.com.au").replace(/\/+$/, "");
  const url = new URL("/test/customers", `${base}/`).toString();

  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "accept": "application/json",
      "authorization": `Bearer ${PINCH_API_TOKEN}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      firstName: "VOID",
      lastName: "User",
      email: normalizeEmail(email)
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = String(payload?.error || payload?.message || `Pinch customer creation failed (${response.status})`);
    const err = new Error(message);
    err.code = response.status;
    err.details = payload;
    err.url = url;
    throw err;
  }

  const customerId = payload?.id || payload?.customer_id || payload?.data?.id || payload?.result?.id || null;
  if (!customerId) {
    const err = new Error("Pinch customer response missing id");
    err.code = 502;
    err.details = payload;
    err.url = url;
    throw err;
  }
  return { customerId: String(customerId), raw: payload };
}

async function signupUser({ email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const rawPassword = String(password || "");

  if (!isValidEmail(normalizedEmail)) {
    const err = new Error("Invalid email format");
    err.code = 400;
    throw err;
  }
  if (rawPassword.length < PASSWORD_MIN_LENGTH) {
    const err = new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
    err.code = 400;
    throw err;
  }

  const users = loadUsers();
  if (users.some(user => normalizeEmail(user.email) === normalizedEmail)) {
    const err = new Error("Email already exists");
    err.code = 409;
    throw err;
  }

  const now = new Date().toISOString();
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const user = {
    id: crypto.randomUUID(),
    email: normalizedEmail,
    password_hash: await bcrypt.hash(rawPassword, 12),
    verified: !REQUIRE_EMAIL_VERIFICATION, // auto-verify if verification is disabled
    verification_token: REQUIRE_EMAIL_VERIFICATION ? verificationToken : null,
    verification_token_exp: REQUIRE_EMAIL_VERIFICATION ? (Date.now() + VERIFY_TOKEN_TTL_MS) : null,
    subscription_plan: null,
    subscription_id: null,
    pinch_customer_id: null,
    subscription_status: "unsubscribed",
    createdAt: now,
    updatedAt: now
  };

  users.push(user);
  saveUsers(users);

  // Send verification email (nonfatal — account is created regardless)
  if (REQUIRE_EMAIL_VERIFICATION) {
    try {
      await sendVerificationEmail(normalizedEmail, verificationToken);
    } catch (emailErr) {
      console.warn("[email] Failed to send verification email:", emailErr.message);
    }
  }

  let pinchWarning = null;
  try {
    const pinchCustomer = await pinchCreateCustomer(normalizedEmail);
    user.pinch_customer_id = pinchCustomer.customerId;
    user.updatedAt = new Date().toISOString();
    saveUsers(users);
  } catch (err) {
    // Nonfatal: keep the user account active even if Pinch customer creation fails.
    pinchWarning = err?.message || "Pinch customer setup failed";
  }

  const safeUser = sanitizeUserForSession(user);
  if (pinchWarning) safeUser.pinch_warning = pinchWarning;
  return safeUser;
}

function clampTemperature(value, fallback = 0.3) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(2, n));
}

function clampOptionalBoolean(value, fallback) {
  if (value === undefined || value === null) return !!fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return !!fallback;
}

function createChatRecord(title = "New Chat") {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title,
    createdAt: now,
    updatedAt: now,
    models: { ...resolveDefaultModels(modelCatalogCache.items) },
    modelParams: { temperature: 0.3, routerThinking: ROUTER_THINKING_DEFAULT },
    messages: []
  };
}

function chatStoreFile(userId) {
  if (!userId) return CHAT_STORE_FILE; // legacy admin fallback
  const safe = String(userId).replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(process.cwd(), `chats-${safe}.json`);
}

function loadChatStore(userId) {
  const file = chatStoreFile(userId);
  if (!fs.existsSync(file)) {
    // First access for this user — migrate any existing chats from the legacy shared store
    if (userId && fs.existsSync(CHAT_STORE_FILE)) {
      try {
        const legacy = JSON.parse(fs.readFileSync(CHAT_STORE_FILE, "utf8"));
        if (Array.isArray(legacy.chats) && legacy.chats.length) {
          const chats = legacy.chats.map(chat => ({
            ...chat,
            models: sanitizeModels(chat.models || {}, modelCatalogCache.items),
            messages: Array.isArray(chat.messages) ? chat.messages : []
          }));
          const selectedChatId = chats.some(c => c.id === legacy.selectedChatId)
            ? legacy.selectedChatId
            : chats[0].id;
          const migrated = { selectedChatId, chats };
          fs.writeFileSync(file, JSON.stringify(migrated, null, 2));
          console.log(`[chat] Migrated ${chats.length} chat(s) from legacy store → ${path.basename(file)}`);
          return migrated;
        }
      } catch {}
    }
    const chat = createChatRecord("Welcome Chat");
    return { selectedChatId: chat.id, chats: [chat] };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const chats = Array.isArray(parsed.chats) && parsed.chats.length
      ? parsed.chats.map(chat => ({
          ...chat,
          models: sanitizeModels(chat.models || {}, modelCatalogCache.items),
          messages: Array.isArray(chat.messages) ? chat.messages : []
        }))
      : [createChatRecord("Welcome Chat")];
    const selectedChatId = chats.some(chat => chat.id === parsed.selectedChatId)
      ? parsed.selectedChatId
      : chats[0].id;
    return { selectedChatId, chats };
  } catch {
    const chat = createChatRecord("Welcome Chat");
    return { selectedChatId: chat.id, chats: [chat] };
  }
}

function saveChatStore(store, userId) {
  fs.writeFileSync(chatStoreFile(userId), JSON.stringify(store, null, 2));
}

function summarizeChat(chat) {
  const lastMessage = [...chat.messages].reverse().find(message => message.role === "user" || message.role === "assistant");
  return {
    id: chat.id,
    title: chat.title,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    preview: lastMessage ? String(lastMessage.content).slice(0, 96) : "No messages yet",
    messageCount: chat.messages.length
  };
}

function syncSessionHistory(chat) {
  sessionHistory = (chat?.messages || [])
    .filter(message => message.role === "user" || message.role === "assistant")
    .map(message => ({ role: message.role, content: message.content }));
}

function ensureCurrentChat(userId) {
  const store = loadChatStore(userId);
  let chat = store.chats.find(item => item.id === store.selectedChatId);
  if (!chat) {
    chat = store.chats[0] || createChatRecord("Welcome Chat");
    if (!store.chats.length) store.chats.push(chat);
    store.selectedChatId = chat.id;
    saveChatStore(store, userId);
  }
  syncSessionHistory(chat);
  return { store, chat };
}

function setCurrentChat(chatId, userId) {
  const store = loadChatStore(userId);
  const chat = store.chats.find(item => item.id === chatId);
  if (!chat) return null;
  store.selectedChatId = chatId;
  saveChatStore(store, userId);
  syncSessionHistory(chat);
  return chat;
}

function createChat(title = "New Chat", userId) {
  const store = loadChatStore(userId);
  const chat = createChatRecord(title);
  store.chats.unshift(chat);
  store.selectedChatId = chat.id;
  saveChatStore(store, userId);
  syncSessionHistory(chat);
  return chat;
}

function renameChatFromPrompt(chat, prompt) {
  if (!chat || !prompt) return;
  if (String(prompt).trim().startsWith("/")) return;
  if (chat.title && chat.title !== "New Chat" && chat.title !== "Welcome Chat") return;
  chat.title = prompt.trim().split(/\s+/).slice(0, 6).join(" ").slice(0, 48) || chat.title;
}

function normalizeCommandKey(value) {
  return String(value || "").trim().replace(/^\/+/, "").toLowerCase();
}

function findModelByNameOrId(catalog, query) {
  const items = Array.isArray(catalog) ? catalog : [];
  const normalizedQuery = normalizeCommandKey(query);
  const compactQuery = normalizedQuery.replace(/[^a-z0-9]+/g, "");
  const exact = items.find(item => normalizeCommandKey(item.id) === normalizedQuery || normalizeCommandKey(item.name) === normalizedQuery);
  if (exact) return exact.id;
  const fuzzy = items.find(item => {
    const combined = `${normalizeCommandKey(item.id)} ${normalizeCommandKey(item.name)}`;
    const compactCombined = combined.replace(/[^a-z0-9]+/g, "");
    return compactCombined.includes(compactQuery) || compactQuery.includes(compactCombined);
  });
  return fuzzy ? fuzzy.id : null;
}

function getRuntimeModelOverride(chat) {
  const override = String(chat?.runtimeModelOverride || "").trim();
  return override || null;
}

function setRuntimeModelOverride(chatId, modelId, userId) {
  const store = loadChatStore(userId);
  const chat = store.chats.find(item => item.id === chatId);
  if (!chat) return null;
  chat.runtimeModelOverride = modelId || null;
  chat.updatedAt = new Date().toISOString();
  saveChatStore(store, userId);
  syncSessionHistory(chat);
  return chat;
}

function clearRuntimeModelOverride(chatId, userId) {
  return setRuntimeModelOverride(chatId, null, userId);
}

function applyRuntimeModelOverride(models, chat) {
  const override = getRuntimeModelOverride(chat);
  if (!override) return sanitizeModels(models || {}, modelCatalogCache.items);
  const defaults = sanitizeModels(models || {}, modelCatalogCache.items);
  const catalogItem = (Array.isArray(modelCatalogCache.items) ? modelCatalogCache.items : []).find(item => item.id === override || item.name === override);
  const chosen = catalogItem ? catalogItem.id : override;
  const merged = {
    ...defaults,
    router: chosen,
    planner: chosen,
    reasoner: chosen
  };
  if (catalogItem && isVisionLikeModel(catalogItem)) {
    merged.vision = chosen;
  }
  return sanitizeModels(merged, modelCatalogCache.items);
}

function parseSlashCommand(message) {
  const raw = String(message || "").trim();
  if (!raw.startsWith("/")) return null;
  const rawBody = raw.slice(1).trim();
  if (!rawBody) return null;

  const firstSpace = rawBody.search(/\s/);
  const commandToken = firstSpace === -1 ? rawBody : rawBody.slice(0, firstSpace);
  const rawArgs = firstSpace === -1 ? "" : rawBody.slice(firstSpace + 1).trim();
  const tokens = [];
  const re = /"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)'|(\S+)/g;
  let match;
  while ((match = re.exec(rawArgs)) !== null) {
    const token = match[1] ?? match[2] ?? match[3] ?? "";
    tokens.push(String(token).replace(/\\(["'\\])/g, "$1"));
  }

  const positionals = [];
  const options = {};
  const flags = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (/^--[a-z0-9][a-z0-9_-]*=/i.test(token)) {
      const eqIndex = token.indexOf("=");
      const key = normalizeCommandKey(token.slice(2, eqIndex));
      options[key] = token.slice(eqIndex + 1);
      continue;
    }
    if (/^--[a-z0-9][a-z0-9_-]*$/i.test(token)) {
      const key = normalizeCommandKey(token.slice(2));
      const next = tokens[i + 1];
      if (next && !/^-{1,2}[a-z0-9]/i.test(next)) {
        options[key] = next;
        i += 1;
      } else {
        options[key] = true;
        flags.push(key);
      }
      continue;
    }
    if (/^-[a-z]+$/i.test(token)) {
      const shortFlags = token.slice(1).split("");
      for (const shortFlag of shortFlags) {
        const key = normalizeCommandKey(shortFlag);
        options[key] = true;
        flags.push(key);
      }
      continue;
    }
    positionals.push(token);
  }

  return {
    command: normalizeCommandKey(commandToken),
    args: rawArgs,
    raw: raw,
    tokens,
    positionals,
    options,
    flags
  };
}

function resolveExplicitSlashAction(command) {
  const cmd = normalizeCommandKey(command?.command);
  if (!cmd) return { kind: "unknown" };
  if (["browser", "browse", "web"].includes(cmd)) return { kind: "browser" };
  if (["image", "img", "paint", "draw"].includes(cmd)) return { kind: "image" };
  if (["help", "commands"].includes(cmd)) return { kind: "help" };
  return { kind: "unknown" };
}

function buildBrowserCommandGoal(command, enrichedMessage = "") {
  const options = command?.options || {};
  const positionals = Array.isArray(command?.positionals) ? command.positionals : [];
  const promptParts = [];
  const mainPrompt = [options.task, options.goal, options.prompt, options.query, positionals.join(" ")]
    .map(value => String(value || "").trim())
    .find(Boolean);
  if (mainPrompt) promptParts.push(mainPrompt);
  if (options.url) promptParts.push(`Start at URL: ${String(options.url).trim()}`);
  if (options.site) promptParts.push(`Preferred site: ${String(options.site).trim()}`);
  if (options.tab) promptParts.push(`Use tab: ${String(options.tab).trim()}`);
  const knownKeys = new Set(["task", "goal", "prompt", "query", "url", "site", "tab"]);
  const extraOptions = Object.entries(options)
    .filter(([key, value]) => !knownKeys.has(key) && value !== true)
    .map(([key, value]) => `${key}: ${String(value).trim()}`);
  if (extraOptions.length) promptParts.push(`Constraints:\n${extraOptions.join("\n")}`);
  if (enrichedMessage && !String(enrichedMessage).startsWith(String(command?.raw || ""))) {
    promptParts.push(String(enrichedMessage).trim());
  }
  return promptParts.join("\n\n").trim();
}

function buildImageCommandPrompt(command) {
  const options = command?.options || {};
  const positionals = Array.isArray(command?.positionals) ? command.positionals : [];
  const mainPrompt = [options.prompt, options.subject, options.idea, positionals.join(" ")]
    .map(value => String(value || "").trim())
    .find(Boolean);
  if (!mainPrompt) return "";
  const promptParts = [mainPrompt];
  const decorativeKeys = ["style", "size", "aspect", "ratio", "quality", "lighting", "camera", "palette", "seed", "negative"];
  for (const key of decorativeKeys) {
    const value = options[key];
    if (value === undefined || value === true || value === false || value === "") continue;
    if (key === "negative") {
      promptParts.push(`Negative prompt: ${String(value).trim()}`);
    } else {
      promptParts.push(`${key}: ${String(value).trim()}`);
    }
  }
  return promptParts.join("\n");
}

function buildSlashHelpText() {
  return [
    "Available slash commands:",
    "/browser <task> [--url <url>] [--site <domain>] [--goal <text>]",
    "/image <prompt> [--style <style>] [--size <size>] [--aspect <ratio>] [--negative <text>]",
    "/model <model name or id>",
    "/reset"
  ].join("\n");
}

function resolveSlashModelCommand(command) {
  const reservedCommands = new Set(["browser", "browse", "web", "image", "img", "paint", "draw", "help", "commands"]);
  if (reservedCommands.has(normalizeCommandKey(command?.command))) {
    return null;
  }
  const modelQuery = [command?.command, command?.args].filter(Boolean).join(" ").trim();
  if (!modelQuery) return { kind: "unknown" };

  const resetCommands = new Set(["default", "reset", "resetmodel", "clear", "clearmodel", "off"]);
  if (resetCommands.has(command.command)) {
    return { kind: "reset" };
  }

  const aliasMap = {
    fable5: ["fable 5", "fable5", "fable"],
    resnet50: ["resnet 50", "resnet-50", "resnet50"],
    "resnet-50": ["resnet 50", "resnet-50", "resnet50"]
  };

  const candidateQueries = [modelQuery, ...(aliasMap[command.command] || [])];
  for (const query of candidateQueries) {
    const matched = findModelByNameOrId(modelCatalogCache.items, query);
    if (matched) return { kind: "model", modelId: matched, query };
  }

  const modelLike = true;
  return modelLike ? { kind: "model", modelId: null, query: modelQuery } : null;
}

// userId defaults to currentTaskUserId so agent task callbacks don't need to pass it explicitly
function appendChatMessage(chatId, role, content, meta = {}, userId = currentTaskUserId) {
  const store = loadChatStore(userId);
  const chat = store.chats.find(item => item.id === chatId);
  if (!chat) return null;
  renameChatFromPrompt(chat, role === "user" ? content : "");
  chat.messages.push({ role, content, ts: new Date().toISOString(), ...meta });
  chat.updatedAt = new Date().toISOString();
  store.selectedChatId = chatId;
  saveChatStore(store, userId);
  syncSessionHistory(chat);
  return chat;
}

function updateChatModels(chatId, models, userId, params) {
  const store = loadChatStore(userId);
  const chat = store.chats.find(item => item.id === chatId);
  if (!chat) return null;
  chat.models = sanitizeModels({ ...(chat.models || {}), ...(models || {}) }, modelCatalogCache.items);
  if (params && typeof params === "object") {
    const currentParams = chat.modelParams || { temperature: 0.3, routerThinking: ROUTER_THINKING_DEFAULT };
    chat.modelParams = {
      ...currentParams,
      ...(params.temperature !== undefined ? { temperature: clampTemperature(params.temperature, currentParams.temperature) } : {}),
      ...(params.routerThinking !== undefined ? { routerThinking: clampOptionalBoolean(params.routerThinking, currentParams.routerThinking) } : {})
    };
  }
  chat.updatedAt = new Date().toISOString();
  saveChatStore(store, userId);
  syncSessionHistory(chat);
  return chat;
}

function getActiveModels(chat) {
  return applyRuntimeModelOverride(chat?.models || {}, chat);
}

function getActiveModelParams(chat) {
  return {
    temperature: clampTemperature(chat?.modelParams?.temperature, 0.3),
    routerThinking: clampOptionalBoolean(chat?.modelParams?.routerThinking, ROUTER_THINKING_DEFAULT)
  };
}

function attachModelRuntimeParams(models, params) {
  return {
    ...(models || {}),
    __params: {
      temperature: clampTemperature(params?.temperature, 0.3),
      routerThinking: clampOptionalBoolean(params?.routerThinking, ROUTER_THINKING_DEFAULT)
    }
  };
}

function getRuntimeTemperature(models) {
  return clampTemperature(models?.__params?.temperature, 0.3);
}

function getRuntimeRouterThinking(models) {
  return clampOptionalBoolean(models?.__params?.routerThinking, ROUTER_THINKING_DEFAULT);
}

function buildBootstrapPayload(catalog = modelCatalogCache.items, auth = null) {
  const { store, chat } = ensureCurrentChat(auth?.userId || null);
  const defaults = resolveDefaultModels(catalog);
  const memory = loadMemory();
  const resolvedUsername = auth?.email || auth?.username || APP_USERNAME;
  const subscriptionPlan = auth?.subscriptionPlan || null;
  const subscriptionStatus = auth?.subscriptionStatus || (subscriptionPlan ? "active" : "unsubscribed");
  return {
    username: resolvedUsername,
    account: {
      verified: auth?.verified ?? null,
      subscriptionPlan,
      subscriptionStatus,
      pinchCustomerId: auth?.pinchCustomerId || null
    },
    selectedChatId: store.selectedChatId,
    chats: store.chats.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).map(summarizeChat),
    currentChat: chat,
    memory: memory.slice(-250),
    models: {
      catalog,
      defaults,
      current: applyRuntimeModelOverride(chat?.models || {}, chat)
    },
    modelParams: getActiveModelParams(chat),
    browser: {
      url: page ? page.url() : "about:blank"
    }
  };
}

function normalizeModelCatalog(data) {
  const source = data?.result?.models || data?.result || data?.models || data;
  if (!Array.isArray(source)) return [];
  return source.map(item => ({
    id: item.id || item.name || item.model || item.slug,
    name: item.name || item.id || item.model || item.slug,
    type: item.type || item.task || item.source || "",
    description: item.description || item.summary || "",
    metadata: item.metadata && typeof item.metadata === "object" ? item.metadata : {},
    tags: Array.isArray(item.tags) ? item.tags : [],
    capabilities: Array.isArray(item.capabilities)
      ? item.capabilities
      : Array.isArray(item.tags)
        ? item.tags
        : []
  })).filter(item => item.id);
}

async function fetchModelCatalog(force = false) {
  if (!force && modelCatalogCache.items.length && modelCatalogCache.expiresAt > Date.now()) {
    return modelCatalogCache.items;
  }

  const fallback = Object.values(resolveDefaultModels([])).map(id => ({
    id,
    name: id,
    type: "default",
    capabilities: []
  }));
  if (!CF_API_TOKEN || !CF_ACCOUNT_ID) {
    modelCatalogCache = { items: fallback, expiresAt: Date.now() + MODEL_CACHE_MS };
    return fallback;
  }

  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/models`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${CF_API_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (res.ok) {
      const data = await res.json();
      const models = normalizeModelCatalog(data);
      if (models.length) {
        modelCatalogCache = { items: models, expiresAt: Date.now() + MODEL_CACHE_MS };
        // Per-user stores get models sanitized on next load — no global rewrite needed
        return models;
      }
    }
  } catch {}

  modelCatalogCache = { items: fallback, expiresAt: Date.now() + MODEL_CACHE_MS };
  return fallback;
}

// ── SSE broadcast to all connected frontend clients ──────────────────────────
let sseClients = [];
function broadcast(type, payload) {
  const data = "data: " + JSON.stringify({ type, ...payload }) + "\n\n";
  sseClients.forEach(res => { try { res.write(data); } catch {} });
}

function think(msg)   { console.log("  💭 " + msg); broadcast("think",   { msg }); }
function status(msg)  { console.log("  ⚡ " + msg); broadcast("status",  { msg }); }
function agentMsg(msg){ console.log("  🤖 " + msg); broadcast("agent",   { msg }); }
function stepLogMsg(msg) { console.log("  📋 " + msg); broadcast("step", { msg }); }
function errLog(msg)  { console.log("  ❌ " + msg); broadcast("error",   { msg }); }
function routerThink(models, msg) { if (getRuntimeRouterThinking(models)) think(msg); }

// ─────────────────────────────────────────────────────────────────────────────
// LIVE NARRATION & GUIDANCE SYSTEM (Devin-style interactive agent)
// ─────────────────────────────────────────────────────────────────────────────
const guidanceQueue = [];  // User guidance injected mid-task

/** Narrate what the agent is doing in plain English — shown in UI as live commentary */
function narrate(msg) {
  console.log("  🗣️  " + msg);
  broadcast("narrate", { msg });
}

/** Agent asks the user a question mid-task, broadcasts to UI with a prompt box */
function askUser(question, context) {
  console.log("  ❓ " + question);
  broadcast("agent_question", { question, context: context || "", ts: new Date().toISOString() });
}

/** Consume all pending guidance from user — called at each planning step */
function consumeGuidance() {
  if (!guidanceQueue.length) return null;
  const all = guidanceQueue.splice(0);
  return all.map(g => g.text).join(" | ");
}

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE NORMALIZATION — fixes the "array not in string" Cloudflare error
// ─────────────────────────────────────────────────────────────────────────────
//
// ROOT CAUSE OF YOUR ERROR:
// Cloudflare's text models (Nemotron, DeepSeek R1) require every message's
// `content` field to be a plain STRING. Only the vision model accepts
// `content` as an ARRAY of { type: "image"|"text", ... } blocks. If a
// vision-shaped message (or any non-string content) ever ends up in the
// array passed to a TEXT model — for example because a history array got
// reused across calls, or a message was constructed with the wrong shape —
// Cloudflare rejects the WHOLE request with exactly the error you saw:
//   "Type mismatch of '/messages/0/content', 'array' not in 'string'"
// Note it can point at ANY message index, including index 0, depending on
// which message actually has the bad shape — the index in the error isn't
// necessarily "the most recent message you pushed."
//
// THE FIX: normalize defensively, every single call, regardless of model.
// If content is an array AND every block in it is a {type:"text"} block,
// flatten it into a plain string. If it contains an image block, this
// function intentionally leaves it as an array — that's only ever valid
// for a vision-model call, and callVisionAI (below) is the only caller
// that should ever produce that shape in the first place.
function normalizeMessages(messages) {
  return messages.map((m) => {
    if (typeof m.content === "string") return m;
    if (Array.isArray(m.content)) {
      const hasImage = m.content.some((block) => block && block.type === "image");
      if (!hasImage) {
        // All-text array -> flatten to a single string. This is the exact
        // shape that breaks Nemotron/DeepSeek if it ever leaks into their
        // call path.
        const flattened = m.content
          .map((block) => (block && typeof block.text === "string" ? block.text : ""))
          .join("\n")
          .trim();
        return { ...m, content: flattened };
      }
      // Has an image block — leave as-is; only callVisionAI should send this.
      return m;
    }
    // Anything else weird (null, object, number) — coerce to string so we
    // fail loudly/obviously rather than crash deep inside the fetch call.
    return { ...m, content: String(m.content ?? "") };
  });
}

function adaptMessagesForHostedRun(messages) {
  const input = Array.isArray(messages) ? messages : [];
  const adapted = [];
  let pendingSystem = [];

  function flushPendingSystemIntoUser() {
    if (!pendingSystem.length) return;
    adapted.push({
      role: "user",
      content: `System instructions:\n${pendingSystem.join("\n\n")}`
    });
    pendingSystem = [];
  }

  for (const message of input) {
    const role = String(message?.role || "user").toLowerCase();
    const content = String(message?.content ?? "");

    if (role === "system") {
      if (content.trim()) pendingSystem.push(content.trim());
      continue;
    }

    if (role === "user") {
      if (pendingSystem.length) {
        adapted.push({
          ...message,
          role: "user",
          content: `System instructions:\n${pendingSystem.join("\n\n")}\n\nUser request:\n${content}`.trim()
        });
        pendingSystem = [];
      } else {
        adapted.push({ ...message, role: "user", content });
      }
      continue;
    }

    flushPendingSystemIntoUser();
    adapted.push({ ...message, role: role === "assistant" ? "assistant" : "user", content });
  }

  flushPendingSystemIntoUser();
  return adapted;
}

// ── CF AI wrapper (TEXT models — content is always normalized to string) ────
function buildCloudflareRunUrl(modelName) {
  return `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${String(modelName || "")}`;
}

function buildCloudflareChatCompletionsUrl() {
  return CF_GATEWAY_CHAT_COMPLETIONS_URL;
}

function isCloudflareHostedRunModel(modelName) {
  return String(modelName || "").startsWith("@");
}

function describeModelTransport(modelName) {
  const model = String(modelName || "").trim();
  if (!model) return { model, kind: "unknown", endpoint: "" };
  if (isCloudflareHostedRunModel(model)) {
    return { model, kind: "workers-ai-run", endpoint: buildCloudflareRunUrl(model) };
  }
  return { model, kind: "ai-gateway-chat", endpoint: buildCloudflareChatCompletionsUrl() };
}

function extractChatCompletionText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part.text === "string") return part.text;
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

async function runCloudflareStartupPreflight() {
  const modelMap = {
    router: DEFAULT_MODELS.router,
    planner: DEFAULT_MODELS.planner,
    reasoner: DEFAULT_MODELS.reasoner,
    vision: DEFAULT_MODELS.vision
  };

  console.log("🔎 Cloudflare AI preflight");
  for (const [role, model] of Object.entries(modelMap)) {
    const transport = describeModelTransport(model);
    console.log(`   ${role}: ${transport.model} -> ${transport.kind}`);
  }

  try {
    const catalogRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/models`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json"
      }
    });
    if (!catalogRes.ok) {
      const text = await catalogRes.text().catch(() => "catalog request failed");
      console.warn(`   ⚠️  catalog listing unavailable (${catalogRes.status}) — model inference may still work`);
    } else {
      console.log("   catalog: ok");
    }
  } catch (err) {
    console.warn(`   ⚠️  catalog check failed: ${err.message} — continuing anyway`);
  }

  const textProbeModel = [DEFAULT_MODELS.reasoner, DEFAULT_MODELS.router, DEFAULT_MODELS.planner]
    .map(value => String(value || "").trim())
    .find(Boolean);

  if (!textProbeModel) return;

  const transport = describeModelTransport(textProbeModel);
  try {
    if (transport.kind === "workers-ai-run") {
      const res = await fetch(transport.endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${CF_API_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 8
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        throw new Error(JSON.stringify(data?.errors || data || [{ message: `HTTP ${res.status}` }]));
      }
    } else {
      const res = await fetch(transport.endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${CF_API_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: textProbeModel,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 8
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(JSON.stringify(data?.errors || data || [{ message: `HTTP ${res.status}` }]));
      }
    }
    console.log(`   text model probe: ok (${textProbeModel})`);
  } catch (err) {
    console.warn(`   ⚠️  text model probe failed for ${textProbeModel}: ${err.message} — continuing anyway`);
  }
}

async function callCFAI(modelName, messages, maxTokens = 1024, retries = 2, temperature = null) {
  const hostedRunModel = isCloudflareHostedRunModel(modelName);
  const safeMessages = hostedRunModel
    ? adaptMessagesForHostedRun(normalizeMessages(messages))
    : normalizeMessages(messages);
  const hostedRoleSafeMessages = hostedRunModel
    ? safeMessages.map((message) => ({
        ...message,
        role: String(message?.role || "").toLowerCase() === "assistant" ? "assistant" : "user"
      }))
    : safeMessages;
  const requestBody = hostedRunModel
    ? { messages: hostedRoleSafeMessages, max_tokens: maxTokens }
    : { model: String(modelName || ""), messages: safeMessages, max_tokens: maxTokens };
  if (temperature !== null && temperature !== undefined) requestBody.temperature = clampTemperature(temperature, 0.3);

  for (let i = 0; i <= retries; i++) {
    try {
      const ctrl = new AbortController();
      const t    = setTimeout(() => ctrl.abort(), 35000);
      const res  = await fetch(hostedRunModel ? buildCloudflareRunUrl(modelName) : buildCloudflareChatCompletionsUrl(), {
        method:  "POST",
        headers: { "Authorization": `Bearer ${CF_API_TOKEN}`, "Content-Type": "application/json" },
        body:    JSON.stringify(requestBody),
        signal:  ctrl.signal
      });
      clearTimeout(t);
      const data = await res.json();
      if (hostedRunModel) {
        if (!data.success) throw new Error(JSON.stringify(data.errors));
        const directResponse = typeof data?.result?.response === "string" ? data.result.response : "";
        const choiceResponse = extractChatCompletionText(data?.result || {});
        return String(directResponse || choiceResponse || "").trim();
      }
      if (!res.ok) throw new Error(JSON.stringify(data?.errors || data || [{ message: `HTTP ${res.status}` }]));
      return extractChatCompletionText(data);
    } catch (err) {
      if (i === retries) throw err;
      status(`CF retry ${i+1}: ${err.message}`);
      await sleep(1500 * (i + 1));
    }
  }
}

// ── CF AI wrapper for the VISION model specifically — this is the ONLY ──────
// place in the codebase allowed to send array-shaped `images`. Keeping it
// isolated prevents multimodal schema from leaking into text-only models.
async function callVisionAI(imageB64, promptText, maxTokens = 600, modelName = DEFAULT_MODELS.vision) {
  const messages = [{
    role: "user",
    content: promptText,
    images: [imageB64]   // ← THE CORRECT FORMAT FOR YOUR CLOUDFLARE ACCOUNT
  }];

  for (let i = 0; i <= 2; i++) {
    try {
      const ctrl = new AbortController();
      const t    = setTimeout(() => ctrl.abort(), 35000);

      const res  = await fetch(
        buildCloudflareRunUrl(modelName),
        {
          method:  "POST",
          headers: {
            "Authorization": `Bearer ${CF_API_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messages,
            max_tokens: maxTokens
          }),
          signal: ctrl.signal
        }
      );

      clearTimeout(t);
      const data = await res.json();

      if (!data.success) {
        throw new Error(JSON.stringify(data.errors));
      }

      return data.result.response;

    } catch (err) {
      if (i === 2) throw err;
      status(`Vision retry ${i+1}: ${err.message}`);
      await sleep(1200 * (i + 1));
    }
  }
}

// ── DETR object-detection wrapper ─────────────────────────────────────────────
async function callDETR(imageB64) {
  if (!CF_API_TOKEN || !CF_ACCOUNT_ID) return [];
  const buf = Buffer.from(imageB64, "base64");
  for (let i = 0; i <= 2; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 25000);
      const res = await fetch(
        buildCloudflareRunUrl("@cf/meta/llama-3.2-11b-vision-instruct"),
        {
          method: "POST",
          headers: { "Authorization": `Bearer ${CF_API_TOKEN}`, "Content-Type": "application/octet-stream" },
          body: buf,
          signal: ctrl.signal
        }
      );
      clearTimeout(t);
      const data = await res.json();
      if (!data.success) throw new Error(JSON.stringify(data.errors));
      return Array.isArray(data.result) ? data.result : [];
    } catch (err) {
      if (i === 2) { status(`DETR error: ${err.message}`); return []; }
      await sleep(600 * (i + 1));
    }
  }
  return [];
}

function buildDETRContext(detections) {
  if (!Array.isArray(detections) || !detections.length) return "No objects detected.";
  return detections
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 20)
    .map(d => {
      const box = d.box || {};
      return `- ${String(d.label || "object")} (${Math.round((d.score || 0) * 100)}%) at xmin=${box.xmin ?? 0},ymin=${box.ymin ?? 0},xmax=${box.xmax ?? 0},ymax=${box.ymax ?? 0}`;
    })
    .join("\n");
}

async function analyzeUploadedImageWithVision(imageB64, detrContext, userQuery, visionModelId) {
  const prompt = `User query: "${String(userQuery || "").slice(0, 99999)}"

DETR object detection results:
${detrContext}

Describe what is visible. Identify which detected objects appear interactive (buttons, links, inputs, checkboxes). Give approximate positions and any text visible on interactive elements. Be concise.`;
  try {
    return await callVisionAI(imageB64, prompt, 500, visionModelId || DEFAULT_MODELS.vision);
  } catch (err) {
    return `Vision analysis failed: ${err.message}`;
  }
}

function readImageDimensions(buffer, mimeType = "") {
  const mime = String(mimeType || "").toLowerCase();
  if (!buffer || !buffer.length) return { width: 0, height: 0 };

  if (mime.includes("png") || (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47)) {
    if (buffer.length >= 24) {
      return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20)
      };
    }
  }

  if (mime.includes("gif") || (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46)) {
    if (buffer.length >= 10) {
      return {
        width: buffer.readUInt16LE(6),
        height: buffer.readUInt16LE(8)
      };
    }
  }

  if (mime.includes("webp") || (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP")) {
    const chunk = buffer.toString("ascii", 12, 16);
    if (chunk === "VP8X" && buffer.length >= 30) {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3)
      };
    }
  }

  if (mime.includes("jpeg") || mime.includes("jpg") || (buffer[0] === 0xff && buffer[1] === 0xd8)) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      const size = buffer.readUInt16BE(offset + 2);
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        return {
          width: buffer.readUInt16BE(offset + 7),
          height: buffer.readUInt16BE(offset + 5)
        };
      }
      if (!size || size < 2) break;
      offset += 2 + size;
    }
  }

  return { width: 0, height: 0 };
}

function buildPageLayoutId(rawId, index, seen) {
  const base = String(rawId || `element_${index + 1}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24) || `element_${index + 1}`;
  let candidate = base;
  let suffix = 2;
  while (seen.has(candidate)) {
    candidate = `${base.slice(0, Math.max(1, 24 - String(suffix).length - 1))}_${suffix}`;
    suffix += 1;
  }
  seen.add(candidate);
  return candidate;
}

function normalizePageLayoutElements(rawElements, imageWidth, imageHeight) {
  const seen = new Set();
  const maxWidth = Math.max(1, Number(imageWidth || 1));
  const maxHeight = Math.max(1, Number(imageHeight || 1));
  return (Array.isArray(rawElements) ? rawElements : [])
    .map((item, index) => {
      const bbox = item && typeof item.bbox === "object" ? item.bbox : {};
      const x = Math.max(0, Math.min(maxWidth - 1, Math.round(Number(bbox.x) || 0)));
      const y = Math.max(0, Math.min(maxHeight - 1, Math.round(Number(bbox.y) || 0)));
      const width = Math.max(1, Math.min(maxWidth - x, Math.round(Number(bbox.width) || 1)));
      const height = Math.max(1, Math.min(maxHeight - y, Math.round(Number(bbox.height) || 1)));
      const role = String(item?.role || "region").trim().toLowerCase() || "region";
      const text = String(item?.text || "").replace(/\s+/g, " ").trim();
      return {
        id: buildPageLayoutId(item?.id || text || role, index, seen),
        role,
        text,
        bbox: { x, y, width, height },
        confidence: clamp01(Number(item?.confidence || 0.5)),
        priority: Math.max(1, Math.min(10, Math.round(Number(item?.priority || 5))))
      };
    })
    .filter(item => item.bbox.width > 0 && item.bbox.height > 0)
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      const areaA = a.bbox.width * a.bbox.height;
      const areaB = b.bbox.width * b.bbox.height;
      return areaB - areaA;
    });
}

function renderAsciiPageMap(elements, imageWidth, imageHeight) {
  const width = Math.max(1, Number(imageWidth || 1));
  const height = Math.max(1, Number(imageHeight || 1));
  // High-resolution ASCII: up to 128 columns, 56 rows for desktop-scale screenshots
  const columns = Math.max(64, Math.min(128, Math.round(width / 12)));
  const rows = Math.max(28, Math.min(56, Math.round(height / 22)));
  const pxPerCol = width / columns;
  const pxPerRow = height / rows;
  const grid = Array.from({ length: rows }, () => Array.from({ length: columns }, () => " "));

  function writeLabel(row, startCol, text, maxWidth) {
    const label = `[${String(text || "region").slice(0, Math.max(1, maxWidth - 2))}]`;
    for (let index = 0; index < Math.min(label.length, maxWidth); index += 1) {
      grid[row][startCol + index] = label[index];
    }
  }

  for (const element of elements) {
    const left = Math.max(0, Math.min(columns - 1, Math.floor(element.bbox.x / pxPerCol)));
    const top = Math.max(0, Math.min(rows - 1, Math.floor(element.bbox.y / pxPerRow)));
    const right = Math.max(left, Math.min(columns - 1, Math.ceil((element.bbox.x + element.bbox.width) / pxPerCol) - 1));
    const bottom = Math.max(top, Math.min(rows - 1, Math.ceil((element.bbox.y + element.bbox.height) / pxPerRow) - 1));

    for (let row = top; row <= bottom; row += 1) {
      for (let col = left; col <= right; col += 1) {
        grid[row][col] = ".";
      }
    }

    if (right - left >= 3) {
      writeLabel(top, left, element.id, right - left + 1);
    } else {
      grid[top][left] = String(element.id || "?")[0] || "?";
    }
  }

  const map = [`scale: ~${pxPerCol.toFixed(1)} px/col x ${pxPerRow.toFixed(1)} px/row over ${width}x${height}`];
  for (const row of grid) {
    map.push(row.join("").replace(/\s+$/g, ""));
  }

  return {
    asciiMap: map.join("\n"),
    grid: {
      columns,
      rows,
      pixelsPerColumn: Number(pxPerCol.toFixed(2)),
      pixelsPerRow: Number(pxPerRow.toFixed(2))
    }
  };
}

function isSparsePageLayout(elements, imageWidth, imageHeight) {
  const list = Array.isArray(elements) ? elements : [];
  const width = Math.max(1, Number(imageWidth || 1));
  const height = Math.max(1, Number(imageHeight || 1));
  const largeScreenshot = width >= 900 && height >= 500;
  const interactiveCount = list.filter(item => /button|input|link/.test(String(item?.role || ""))).length;
  const structuralCount = list.filter(item => /panel|region|image|text|separator|scrollbar/.test(String(item?.role || ""))).length;
  // Require significantly more elements — a typical web page should have 12+
  if (!largeScreenshot) return list.length < 5;
  return list.length < 10 || interactiveCount < 3 || structuralCount < 4;
}

function buildPageLayoutVisionPrompt(imageWidth, imageHeight, userQuery, mode = "primary", priorRaw = "") {
  const baseIntent = String(userQuery || "Produce a complete high-precision ASCII page map and structured element key.").slice(0, 500);
  const modeNote = mode === "repair"
    ? `\n\nPREVIOUS ANSWER WAS INCOMPLETE — this is your second attempt:\n- Return AT LEAST 12 distinct elements for a typical UI page.\n- Do NOT collapse into only 2-3 giant boxes.\n- Each visible button, link, input, heading, image block, and panel must appear as its own element.\n- Use tight bounding boxes, not one giant bbox covering half the page.`
    : "";
  const priorSnippet = mode === "repair" && priorRaw
    ? `\n\nPrevious insufficient answer (do NOT repeat this level of coarseness):\n${String(priorRaw).slice(0, 600)}`
    : "";
  return `You are a pixel-perfect UI layout auditor. Analyze this ${imageWidth}x${imageHeight} screenshot.

User intent: ${baseIntent}${modeNote}${priorSnippet}

DETECTION RULES — follow every rule exactly:
1. COMPLETENESS: Return EVERY distinctly visible element. A typical web page yields 12-30+ elements.
2. GRANULARITY: Split navigation into individual nav links. Split a toolbar into individual buttons. Never group them.
3. BOUNDING BOXES: Use the element's actual visible boundary in the original pixel space. Tight boxes only.
4. HIERARCHY: If a card contains a button and text, list the card AND the button AND the text as separate elements.
5. SMALL ELEMENTS: Include icons, badges, pagination, social buttons, and dismiss/close buttons even if small.
6. TEXT PRECISION: Put the first 50 characters of actual visible text in the "text" field. Empty string if no text.
7. ROLES — use ONLY these exact values:
   button | input | link | image | text | panel | separator | scrollbar | region | heading | badge | icon | nav | form | card | table | list | tab | menu | dialog
8. CONFIDENCE: 0.9+ = certain. 0.7-0.89 = probable. 0.5-0.69 = approximate. Never guess above 0.9.
9. PRIORITY: 1=critical interactive, 2=prominent content, 3=structural, 4=secondary, 5=decorative.
10. IDs: Descriptive kebab-case, unique, e.g. "primary-nav", "search-input", "hero-heading", "add-to-cart-btn".

Return ONLY this JSON — no markdown fences, no commentary, no extra keys:
{
  "elements": [
    { "id": "unique-kebab-id", "role": "role_value", "text": "visible text", "bbox": { "x": 0, "y": 0, "width": 0, "height": 0 }, "confidence": 0.95, "priority": 1 }
  ]
}`;
}

function buildDeterministicUiReport(analysis, state = {}, lastAction = null, goal = "") {
  const glyphs = Array.isArray(analysis?.glyphs) ? analysis.glyphs : [];
  const uiElements = Array.isArray(analysis?.uiElements) ? analysis.uiElements : [];
  return {
    taskType: "pixel_grid_reasoning",
    goal: String(goal || ""),
    lastAction: lastAction || null,
    state: {
      url: String(state?.url || ""),
      title: String(state?.title || "")
    },
    grid: {
      counts: analysis?.counts || {},
      ink: analysis?.ink || "#",
      background: analysis?.background || ".",
      asciiMap: analysis?.asciiMap || []
    },
    glyphs: glyphs.map(glyph => ({
      id: glyph.id,
      kind: glyph.kind,
      label: glyph.label,
      confidence: glyph.confidence,
      bbox: glyph.bbox,
      normalized: glyph.normalized,
      signature: glyph.signature
    })),
    uiElements: uiElements.map(element => ({
      id: element.id,
      role: element.role,
      confidence: element.confidence,
      bbox: element.bbox,
      glyphIds: element.glyphIds,
      glyphLabels: element.glyphLabels
    })),
    summary: analysis?.summary || {
      code: "pixel_grid_reasoning",
      glyphCount: glyphs.length,
      uiElementCount: uiElements.length,
      ink: analysis?.ink || "#",
      background: analysis?.background || "."
    }
  };
}

function buildPageLayoutAnalysisResult(analysis, imageWidth, imageHeight, userQuery = "") {
  const report = buildDeterministicUiReport(analysis, {
    url: "about:blank",
    title: "pixel-grid"
  }, null, userQuery);
  const elements = Array.isArray(analysis?.uiElements) ? analysis.uiElements : [];
  return {
    taskType: "pixel_grid_reasoning",
    model: "pixel-grid-deterministic",
    asciiMap: Array.isArray(analysis?.asciiMap) ? analysis.asciiMap.join("\n") : String(analysis?.asciiMap || ""),
    key: {
      image: {
        width: Math.max(1, Number(imageWidth || 1)),
        height: Math.max(1, Number(imageHeight || 1))
      },
      grid: {
        columns: Array.isArray(analysis?.normalizedGrid) ? Math.max(1, String(analysis.normalizedGrid[0] || "").length) : 0,
        rows: Array.isArray(analysis?.normalizedGrid) ? analysis.normalizedGrid.length : 0,
        ink: analysis?.ink || "#",
        background: analysis?.background || "."
      },
      elements
    },
    report,
    formatted: JSON.stringify(report, null, 2)
  };
}

// Downscale a base64 image using the already-running browser canvas so we
// never exceed the vision model's 128K token context window.
// LLaMA 3.2-11b-vision tokenises a 1366×768 JPEG to ~500K tokens — well over
// the limit.  Capping at 800×560 keeps input tokens well under 50K.
async function resizeImageB64ForVision(imageB64, maxWidth = 800, maxHeight = 560) {
  if (!page) return imageB64;
  try {
    const resized = await page.evaluate(({ b64, maxW, maxH }) => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const ratio = Math.min(1, maxW / img.width, maxH / img.height);
          if (ratio >= 1) { resolve(b64); return; }
          const w = Math.round(img.width * ratio);
          const h = Math.round(img.height * ratio);
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.72).split(",")[1] || b64);
        };
        img.onerror = () => resolve(b64);
        img.src = "data:image/jpeg;base64," + b64;
      });
    }, { b64: imageB64, maxW: maxWidth, maxH: maxHeight });
    return typeof resized === "string" && resized ? resized : imageB64;
  } catch {
    return imageB64;
  }
}

async function analyzePageLayout(imageB64, userQuery = "", visionModelId = DEFAULT_MODELS.vision, mimeType = "") {
  const buffer = Buffer.from(String(imageB64 || ""), "base64");
  const dimensions = readImageDimensions(buffer, mimeType);
  const imageWidth = Math.max(1, Number(dimensions.width || 0) || 1);
  const imageHeight = Math.max(1, Number(dimensions.height || 0) || 1);

  // Downscale to ≤800×560 before calling the vision model.
  // LLaMA tokenises full-resolution screenshots to 500K+ tokens which
  // exceeds the 128K context window and causes a 5021 error.
  const visionB64 = await resizeImageB64ForVision(imageB64, 800, 560);
  const prompt = buildPageLayoutVisionPrompt(imageWidth, imageHeight, userQuery, "primary");

  let parsed = null;
  let raw = await callVisionAI(visionB64, prompt, 1600, visionModelId || DEFAULT_MODELS.vision);
  parsed = safeParseJSON(raw);

  if ((!parsed || !Array.isArray(parsed.elements)) && raw) {
    const repaired = await callCFAI(
      DEFAULT_MODELS.reasoner || DEFAULT_MODELS.router,
      [
        { role: "system", content: "Rewrite the user input as strict JSON only. Return exactly one JSON object with key elements. Preserve ids, roles, text, bbox, confidence, and priority. No markdown." },
        { role: "user", content: String(raw || "") }
      ],
      1800,
      1,
      0
    );
    parsed = safeParseJSON(repaired);
  }

  let elements = normalizePageLayoutElements(parsed?.elements || [], imageWidth, imageHeight);
  if (isSparsePageLayout(elements, imageWidth, imageHeight)) {
    const retryPrompt = buildPageLayoutVisionPrompt(imageWidth, imageHeight, userQuery, "repair", raw);
    raw = await callVisionAI(visionB64, retryPrompt, 2000, visionModelId || DEFAULT_MODELS.vision);
    let retryParsed = safeParseJSON(raw);
    if ((!retryParsed || !Array.isArray(retryParsed.elements)) && raw) {
      const repairedRetry = await callCFAI(
        DEFAULT_MODELS.reasoner || DEFAULT_MODELS.router,
        [
          { role: "system", content: "Rewrite the user input as strict JSON only. Return exactly one JSON object with key elements. Preserve ids, roles, text, bbox, confidence, and priority. No markdown." },
          { role: "user", content: String(raw || "") }
        ],
        1800,
        1,
        0
      );
      retryParsed = safeParseJSON(repairedRetry);
    }
    const retryElements = normalizePageLayoutElements(retryParsed?.elements || [], imageWidth, imageHeight);
    if (retryElements.length > elements.length) {
      elements = retryElements;
    }
  }

  const rendered = renderAsciiPageMap(elements, imageWidth, imageHeight);
  const key = {
    image: { width: imageWidth, height: imageHeight },
    grid: rendered.grid,
    elements
  };

  return {
    taskType: "page_layout_analysis",
    model: String(visionModelId || DEFAULT_MODELS.vision),
    asciiMap: rendered.asciiMap,
    key,
    formatted: `ASCII_MAP:\n${rendered.asciiMap}\n\nKEY:\n${JSON.stringify(key, null, 2)}`
  };
}

function wantsPageLayoutAnalysis(text = "") {
  const query = String(text || "");
  return /ascii|page\s*map|layout|bbox|bounding\s*box|ui\s+analysis|analy[sz]e\s+(the\s+)?ui|vision\s+analy/i.test(query);
}

async function analyzeCurrentBrowserUILayout(userQuery = "", userId = null) {
  if (!page) throw new Error("browser not ready");
  const screenshotB64 = await getVisionScreenshotB64({ broadcastImage: false, writeFile: false });
  const { chat } = ensureCurrentChat(userId);
  const models = attachModelRuntimeParams(getActiveModels(chat), getActiveModelParams(chat));
  const analysis = await analyzePageLayout(
    screenshotB64,
    `${String(userQuery || "Analyze the current browser UI.").slice(0, 400)}\nCurrent URL: ${page.url()}`,
    models.vision,
    "image/jpeg"
  );
  return {
    ...analysis,
    url: page.url()
  };
}

function parseBase64Input(raw) {
  const value = String(raw || "").trim();
  if (!value) return { b64: "", mimeType: "" };
  const dataUriMatch = value.match(/^data:([^;]+);base64,(.+)$/i);
  if (dataUriMatch) {
    return {
      mimeType: String(dataUriMatch[1] || "").trim().toLowerCase(),
      b64: String(dataUriMatch[2] || "").replace(/\s+/g, "")
    };
  }
  return { b64: value.replace(/\s+/g, ""), mimeType: "" };
}

function inferMediaType(mimeType, fallbackKind = "") {
  const mime = String(mimeType || "").toLowerCase();
  const kind = String(fallbackKind || "").toLowerCase();
  if (mime.startsWith("video/") || kind === "video") return "video";
  if (mime.startsWith("image/") || kind === "image" || kind.includes("screenshot") || kind.includes("clipboard")) return "image";
  return "unknown";
}

function inferMimeFromName(name, mediaType) {
  const n = String(name || "").toLowerCase();
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".gif")) return "image/gif";
  if (n.endsWith(".mp4")) return "video/mp4";
  if (n.endsWith(".webm")) return "video/webm";
  if (n.endsWith(".mov")) return "video/quicktime";
  if (mediaType === "video") return "video/mp4";
  if (mediaType === "image") return "image/png";
  return "application/octet-stream";
}

function buildMediaReference(media) {
  const source = String(media?.source || "upload");
  const fallbackPreviewUrl = source === "agent_screenshot" ? "/screenshot" : null;
  return {
    id: String(media?.id || ""),
    source,
    mediaType: String(media?.mediaType || "unknown"),
    kind: String(media?.kind || "upload"),
    mimeType: String(media?.mimeType || "application/octet-stream"),
    fileName: String(media?.fileName || ""),
    previewUrl: fallbackPreviewUrl,
    thumbnailUrl: fallbackPreviewUrl
  };
}

function normalizeIncomingMedia(body = {}) {
  const media = [];
  const now = new Date().toISOString();

  function pushMedia(item) {
    const input = parseBase64Input(item?.dataB64 || item?.imageB64 || item?.videoB64 || item?.data || "");
    const explicitMime = String(item?.mimeType || item?.contentType || input.mimeType || "").trim().toLowerCase();
    const kind = String(item?.kind || "upload").trim().toLowerCase();
    const mediaType = inferMediaType(explicitMime, kind);
    const mimeType = explicitMime || inferMimeFromName(item?.fileName || item?.name, mediaType);
    const b64 = input.b64;
    if (!b64) return;
    media.push({
      id: crypto.randomUUID(),
      kind,
      source: String(item?.source || kind || "upload"),
      mediaType,
      mimeType,
      fileName: String(item?.fileName || item?.name || ""),
      dataB64: b64,
      createdAt: now,
      sizeBytes: Math.floor((b64.length * 3) / 4),
      metadata: item?.metadata && typeof item.metadata === "object" ? item.metadata : {}
    });
  }

  const arrayMedia = Array.isArray(body.media) ? body.media : [];
  for (const entry of arrayMedia) {
    pushMedia(entry || {});
  }

  const imageB64 = String(body.imageB64 || "").trim();
  if (imageB64) pushMedia({ kind: "image_upload", source: "upload", dataB64: imageB64, mimeType: body.imageMimeType, fileName: body.imageFileName });

  const clipboardImageB64 = String(body.clipboardImageB64 || "").trim();
  if (clipboardImageB64) pushMedia({ kind: "clipboard_image", source: "clipboard", dataB64: clipboardImageB64, mimeType: body.clipboardMimeType || "image/png", fileName: body.clipboardFileName || "clipboard.png" });

  const screenshotB64 = String(body.screenshotB64 || "").trim();
  if (screenshotB64) pushMedia({ kind: "screenshot", source: "screenshot", dataB64: screenshotB64, mimeType: body.screenshotMimeType || "image/png", fileName: body.screenshotFileName || "screenshot.png" });

  const videoB64 = String(body.videoB64 || "").trim();
  if (videoB64) pushMedia({ kind: "video_upload", source: "upload", dataB64: videoB64, mimeType: body.videoMimeType || body.mimeType, fileName: body.videoFileName || body.fileName || "video.mp4" });

  return media;
}

function classifyMediaTask(mediaItems) {
  const items = Array.isArray(mediaItems) ? mediaItems : [];
  if (!items.length) return "general_media";
  if (items.some(item => String(item?.mediaType || "") === "video")) return "video_analysis";
  if (items.some(item => String(item?.kind || "").includes("screenshot"))) return "screenshot_analysis";
  if (items.some(item => String(item?.mediaType || "") === "image")) return "image_analysis";
  return "general_media";
}

async function runWithEphemeralCapabilityModel(taskType, baselineModel, runner) {
  const baseline = String(baselineModel || DEFAULT_MODELS.router);
  const failedSet = routerTaskTypeFailures.get(taskType) || new Set();
  const selection = pickBestRouterModelForTask(taskType, baseline, modelCatalogCache.items, failedSet);
  const attemptOrder = selection.modelToUse === baseline
    ? [baseline]
    : [selection.modelToUse, baseline];
  let usedModel = selection.modelToUse;
  let retriedWithBaseline = false;
  let lastError = null;

  try {
    for (const candidate of attemptOrder) {
      try {
        const result = await runner(candidate);
        usedModel = candidate;
        return {
          result,
          meta: {
            taskType,
            modelToUse: usedModel,
            baselineModel: baseline,
            reason: selection.reason,
            swapped: usedModel !== baseline,
            retriedWithBaseline
          }
        };
      } catch (err) {
        lastError = err;
        if (candidate !== baseline) {
          const failed = routerTaskTypeFailures.get(taskType) || new Set();
          failed.add(String(candidate));
          routerTaskTypeFailures.set(taskType, failed);
          retriedWithBaseline = true;
          think(`Capability swap failed for ${taskType} on ${candidate}; retrying once with baseline ${baseline}.`);
          continue;
        }
        throw err;
      }
    }
    throw (lastError || new Error("media model selection failed"));
  } finally {
    think(`Capability model restore: taskType=${taskType} baseline=${baseline} used=${usedModel} retry=${retriedWithBaseline}.`);
  }
}

async function runImageAnalysis(media, modelId, userQuery = "") {
  const chosenModel = String(modelId || DEFAULT_MODELS.vision);
  const detr = await callDETR(media.dataB64);
  const detrContext = buildDETRContext(detr);
  const summary = await analyzeUploadedImageWithVision(media.dataB64, detrContext, userQuery, chosenModel);
  return {
    taskType: "image_analysis",
    model: chosenModel,
    text: summary,
    structured: {
      detections: detr,
      detectionCount: detr.length
    },
    media: [buildMediaReference(media)]
  };
}

async function extractVideoFrameB64(media) {
  const tempDir = path.join(WORKSPACE_ROOT, ".tmp-media");
  fs.mkdirSync(tempDir, { recursive: true });
  const ext = String(media?.mimeType || "").includes("webm") ? "webm" : (String(media?.mimeType || "").includes("quicktime") ? "mov" : "mp4");
  const inputPath = path.join(tempDir, `${media.id}.${ext}`);
  const framePath = path.join(tempDir, `${media.id}.jpg`);
  try {
    fs.writeFileSync(inputPath, Buffer.from(String(media?.dataB64 || ""), "base64"));
    execSync(`ffmpeg -y -i "${inputPath}" -vf "fps=1" -frames:v 1 "${framePath}"`, { stdio: "ignore" });
    if (!fs.existsSync(framePath)) return null;
    const frameB64 = fs.readFileSync(framePath, { encoding: "base64" });
    return frameB64 || null;
  } catch {
    return null;
  } finally {
    try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch {}
    try { if (fs.existsSync(framePath)) fs.unlinkSync(framePath); } catch {}
  }
}

async function runVideoAnalysis(media, modelId, userQuery = "") {
  const chosenModel = String(modelId || DEFAULT_MODELS.vision);
  const frameB64 = await extractVideoFrameB64(media);
  if (frameB64) {
    const frameMedia = {
      ...media,
      id: crypto.randomUUID(),
      kind: "video_frame",
      source: "video_frame",
      mediaType: "image",
      mimeType: "image/jpeg",
      dataB64: frameB64
    };
    const imageResult = await runImageAnalysis(frameMedia, chosenModel, `Video frame analysis request: ${String(userQuery || "")}`);
    return {
      taskType: "video_analysis",
      model: chosenModel,
      text: imageResult.text,
      structured: {
        frameExtracted: true,
        frameAnalysis: imageResult.structured
      },
      media: [buildMediaReference(media), ...imageResult.media]
    };
  }

  const fallbackSummary = await callCFAI(chosenModel, [
    {
      role: "system",
      content: "You are a media analyst. If no frame data is available, provide a concise limitation-aware response and ask for a shorter clip or keyframe."
    },
    {
      role: "user",
      content: `Analyze this uploaded video request: ${String(userQuery || "")}. A direct frame extract was unavailable in runtime.`
    }
  ], 260, 1);

  return {
    taskType: "video_analysis",
    model: chosenModel,
    text: String(fallbackSummary || "Video analysis could not process frames in this runtime."),
    structured: {
      frameExtracted: false
    },
    media: [buildMediaReference(media)]
  };
}

async function runMediaAnalysis(mediaItems, models, userQuery = "") {
  const list = Array.isArray(mediaItems) ? mediaItems : [];
  if (!list.length) {
    return {
      taskType: "general_media",
      analysis: {
        taskType: "general_media",
        model: String(models?.vision || models?.router || DEFAULT_MODELS.vision),
        text: "No media was provided.",
        structured: {},
        media: []
      },
      routerMeta: {
        taskType: "general_media",
        modelToUse: String(models?.vision || models?.router || DEFAULT_MODELS.vision),
        baselineModel: String(models?.vision || models?.router || DEFAULT_MODELS.vision),
        reason: "no media",
        swapped: false,
        retriedWithBaseline: false
      }
    };
  }

  const taskType = classifyMediaTask(list);
  const primary = list.find(item => taskType === "video_analysis" ? item.mediaType === "video" : item.mediaType === "image") || list[0];
  const baselineModel = String(models?.vision || models?.router || DEFAULT_MODELS.vision);
  return runWithEphemeralCapabilityModel(taskType, baselineModel, async (modelToUse) => {
    if (taskType === "video_analysis") {
      return runVideoAnalysis(primary, modelToUse, userQuery);
    }
    return runImageAnalysis(primary, modelToUse, userQuery);
  }).then(({ result, meta }) => ({ taskType, analysis: result, routerMeta: meta }));
}

function isMultipartRequiredError(errorText) {
  const text = String(errorText || "");
  return /required properties.*multipart|multipart.*required/i.test(text) || /5006/.test(text);
}

async function callCFImageGeneration(modelName, promptText) {
  const IMAGE_GEN_TIMEOUT_MS = 60 * 1000; // 60 seconds — flux-2-klein-9b completes in ~2s
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), IMAGE_GEN_TIMEOUT_MS);
  const prompt = String(promptText || "").trim();

  // Heartbeat so the UI doesn't look frozen during long generation
  const heartbeat = setInterval(() => {
    status(`Image generating... (${modelName.split("/").pop() || modelName})`);
  }, 15000);

  async function attemptRequest(useMultipart) {
    let body;
    const headers = { "Authorization": `Bearer ${CF_API_TOKEN}` };
    if (useMultipart) {
      const form = new FormData();
      form.append("prompt", prompt);
      body = form;
      // Do NOT set Content-Type manually — fetch will set multipart boundary automatically
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify({ prompt });
    }
    return fetch(buildCloudflareRunUrl(modelName), {
      method: "POST",
      headers,
      body,
      signal: ctrl.signal
    });
  }

  try {
    let res = await attemptRequest(false);

    // Cloudflare returns 400 with code 5006 when a model requires multipart.
    // Detect that and transparently retry with multipart form-data.
    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      if (isMultipartRequiredError(errorText)) {
        status(`Image model ${modelName} requires multipart — retrying with FormData`);
        res = await attemptRequest(true);
        if (!res.ok) {
          const retry = await res.text().catch(() => "Image generation request failed");
          throw new Error(retry || "Image generation request failed (multipart)");
        }
      } else {
        throw new Error(errorText || "Image generation request failed");
      }
    }

    const contentType = String(res.headers.get("content-type") || "").toLowerCase();
    if (!res.ok) {
      const errorText = await res.text().catch(() => "Image generation request failed");
      throw new Error(errorText || "Image generation request failed");
    }

    if (contentType.startsWith("image/")) {
      const buf = Buffer.from(await res.arrayBuffer());
      return {
        mimeType: contentType,
        b64: buf.toString("base64")
      };
    }

    const data = await res.json();
    if (data && data.success === false) {
      throw new Error(JSON.stringify(data.errors || [{ message: "Image generation failed" }]));
    }

    const result = data?.result || data || {};
    const directImage = typeof result.image === "string" ? result.image : "";
    const directUrl = typeof result.url === "string" ? result.url : "";
    const nestedB64 = typeof result?.data?.[0]?.b64_json === "string"
      ? result.data[0].b64_json
      : (typeof result?.images?.[0]?.b64_json === "string" ? result.images[0].b64_json : "");
    const nestedUrl = typeof result?.data?.[0]?.url === "string"
      ? result.data[0].url
      : (typeof result?.images?.[0]?.url === "string" ? result.images[0].url : "");

    if (directImage) {
      return {
        mimeType: "image/png",
        b64: String(directImage).replace(/^data:[^;]+;base64,/i, "")
      };
    }
    if (nestedB64) {
      return {
        mimeType: "image/png",
        b64: String(nestedB64).replace(/^data:[^;]+;base64,/i, "")
      };
    }
    if (directUrl || nestedUrl) {
      return {
        mimeType: "image/png",
        url: directUrl || nestedUrl
      };
    }

    throw new Error("Selected model did not return image data");
  } finally {
    clearInterval(heartbeat);
    clearTimeout(timeout);
  }
}

async function generateImageFromPrompt(promptText, models) {
  const prompt = String(promptText || "").trim();
  if (!prompt) throw new Error("Image prompt is required");
  const baselineModel = String(models?.image || DEFAULT_MODELS.image || models?.router || DEFAULT_MODELS.router);
  const { result, meta } = await runWithEphemeralCapabilityModel("image_generation", baselineModel, async (modelToUse) => {
    const image = await callCFImageGeneration(modelToUse, prompt);
    return {
      prompt,
      model: modelToUse,
      mimeType: image.mimeType || "image/png",
      b64: image.b64 || "",
      url: image.url || ""
    };
  });
  return { image: result, routerMeta: meta };
}

function isModelIdentityQuestion(text) {
  const message = String(text || "").toLowerCase();
  if (!message) return false;
  return /(what\s+model|which\s+model|model\s+are\s+you|who\s+made\s+you|are\s+you\s+gpt|gpt-?4|openai)/.test(message);
}

function getCasualIdentityReply(models = {}) {
  const reasoner = String(models.reasoner || "").trim();
  const router = String(models.router || "").trim();
  const active = reasoner || router || "(unknown)";
  return `I'm Puppeterr. This chat currently runs on ${active}.`;
}

function applyChatStyleFormatting(text, options = {}) {
  const base = String(text || "").trim() || "How can I help?";
  const wantsBold = !!options.bold;
  const wantsItalic = !!options.italic;
  if (wantsBold && wantsItalic) return `***${base}***`;
  if (wantsBold) return `**${base}**`;
  if (wantsItalic) return `*${base}*`;
  return base;
}

function detectChatStyleRequest(rawMessage) {
  const msg = String(rawMessage || "");
  const styleVerb = /\b(talk|speak|say|reply|respond|write|type|answer)\b/i.test(msg);
  const wantsItalic = /\bitalic(s)?\b/i.test(msg) && styleVerb;
  const wantsBold = /\bbold\b/i.test(msg) && styleVerb;
  const retryItalic = /\b(thats|that's|not|isn't|is not)\b[\s\S]{0,40}\bitalic(s)?\b/i.test(msg);
  return {
    italic: wantsItalic || retryItalic,
    bold: wantsBold
  };
}

async function answerCasualChat(rawMessage, conversationHistory, models) {
  if (isModelIdentityQuestion(rawMessage)) {
    return getCasualIdentityReply(models);
  }

  const styleRequest = detectChatStyleRequest(rawMessage);
  const asksForHello = /\bhello\b/i.test(String(rawMessage || ""))
    && /\b(say|write|type|reply|respond|can\s+you|please)\b/i.test(String(rawMessage || ""));
  if (asksForHello && (styleRequest.italic || styleRequest.bold)) {
    return applyChatStyleFormatting("hello", styleRequest);
  }

  const convCtx = (conversationHistory || []).slice(-8)
    .map(item => `${item.role === "user" ? "User" : "Assistant"}: ${item.content}`)
    .join("\n");

  try {
    const raw = await callCFAI(models.reasoner || models.router, [
      {
        role: "system",
        content: "You are Puppeterr in casual chat mode. Respond helpfully and conversationally. Do not turn the message into a browser task unless the user explicitly uses /browser. Keep replies concise. Never claim to be GPT-4 or OpenAI unless the configured runtime model is actually from OpenAI. If asked what model you are, state the configured model id exactly.Current normal chat supports this formatting set: Italic: *text* and _text_ Bold: **text** Bold + italic: ***text*** and **_text_** Inline code: code Line breaks: newline becomes <br> Math (KaTeX): $inline$ and $$block$$ Emoji shortcodes: :rocket: :brain: :sparkles: :fire: :check: :x: :warning: :robot: :smile: :party: :idea:. try to be as friendly and helpful as possible. If the user asks for a greeting, respond with something in the requested style."
      },
      {
        role: "user",
        content: `Recent conversation:\n${convCtx || "(none)"}\n\nUser message:\n${String(rawMessage || "")}`
      }
    ], 500, 1, getRuntimeTemperature(models));
    const plain = stripThinking(raw) || "How can I help?";
    return applyChatStyleFormatting(plain, styleRequest);
  } catch (err) {
    errLog("Casual chat fallback: " + err.message);
    return applyChatStyleFormatting("How can I help?", styleRequest);
  }
}

function configurePinchClient() {
  if (!PINCH_API_TOKEN || !PINCH_API_EMAIL) {
    throw new Error("Missing PINCH_API_TOKEN or PINCH_API_EMAIL");
  }
  pinchApi.configuration.xAPITOKEN = PINCH_API_TOKEN;
  pinchApi.configuration.xAPIEMAIL = PINCH_API_EMAIL;
  if (PINCH_BASE_URI) {
    pinchApi.configuration.BASEURI = PINCH_BASE_URI;
  }
}

function callPinch(controller, method, args = []) {
  return new Promise((resolve, reject) => {
    if (!controller || typeof controller[method] !== "function") {
      reject(new Error(`Pinch method not found: ${String(method || "unknown")}`));
      return;
    }
    controller[method](...args, (error, response) => {
      if (error) {
        const message = String(error.errorMessage || error.message || "Pinch API error");
        const err = new Error(message);
        err.code = Number.isFinite(Number(error.errorCode)) ? Number(error.errorCode) : null;
        err.details = error.errorResponse || null;
        reject(err);
        return;
      }
      resolve(response);
    });
  });
}

async function pinchListTickets() {
  configurePinchClient();
  const tickets = await callPinch(pinchApi.TicketController, "list");
  return Array.isArray(tickets) ? tickets : [];
}

async function pinchSendTicketMessage(ticketId, body) {
  configurePinchClient();
  const cleanTicketId = String(ticketId || "").trim();
  const cleanBody = String(body || "").trim();
  if (!cleanTicketId) throw new Error("ticketId is required");
  if (!cleanBody) throw new Error("body is required");
  const response = await callPinch(pinchApi.TicketController, "sendMessage", [cleanBody, cleanTicketId]);
  return response || {};
}

async function pinchListWebhooks() {
  configurePinchClient();
  const webhooks = await callPinch(pinchApi.WebhookController, "list");
  return Array.isArray(webhooks) ? webhooks : [];
}

async function pinchListWebhookTypes() {
  configurePinchClient();
  const types = await callPinch(pinchApi.WebhookTypeController, "list");
  return Array.isArray(types) ? types : [];
}

  function stripThinking(text) {
    return String(text || "")
      .replace(/<think>[\s\S]*?(<\/think>|$)/gi, "")
      .trim();
  }

  function safeParseJSON(raw) {
    const stripped = stripThinking(raw);
    const clean = stripped.replace(/```(?:json)?\s*([\s\S]*?)```/gi, "$1").trim();
    try { return JSON.parse(clean); } catch {}

    const starts = ["{", "["];
    for (let idx = 0; idx < clean.length; idx++) {
      if (!starts.includes(clean[idx])) continue;
      const openChar = clean[idx];
      const closeChar = openChar === "{" ? "}" : "]";
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let end = idx; end < clean.length; end++) {
        const ch = clean[end];
        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (ch === "\\") {
            escaped = true;
          } else if (ch === '"') {
            inString = false;
          }
          continue;
        }
        if (ch === '"') {
          inString = true;
          continue;
        }
        if (ch === openChar) depth += 1;
        if (ch === closeChar) {
          depth -= 1;
          if (depth === 0) {
            const candidate = clean.slice(idx, end + 1);
            try { return JSON.parse(candidate); } catch { break; }
          }
        }
      }
    }
    return null;
  }

  /**
   * Keep plannerHistory bounded. Always preserves message[0] (the system
   * prompt) and then keeps only the most recent N messages after it. Without
   * this, a 30-step task accumulates 60+ messages and can eventually exceed
   * the model's context window — which surfaces as a Cloudflare "Bad input"
   * error that looks identical in shape to the content-type bug, but has a
   * totally different cause. Trimming proactively avoids both failure modes.
   */
  function trimHistory(history, maxMessages) {
    if (history.length <= maxMessages) return history;
    const system = history[0];
    const recent = history.slice(-(maxMessages - 1));
    return [system, ...recent];
  }

  function normalizePeerText(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function collectPlanText(plan = {}) {
    const actionText = Array.isArray(plan.actions)
      ? plan.actions.map((item) => JSON.stringify(item || {})).join(" ")
      : "";
    return normalizePeerText([plan.reasoning, actionText, plan.goal, plan.summary].filter(Boolean).join(" "));
  }

  function evaluatePeerAlignment(plan = {}, peerSignals = {}) {
    const planText = collectPlanText(plan);
    const reasoner = peerSignals?.reasoner || {};
    const supervisor = peerSignals?.supervisor || {};
    const research = peerSignals?.research || {};
    const hints = [];
    let score = 0.52;
    let matched = 0;
    let total = 0;

    const peerChecks = [
      {
        label: "reasoner_instinct",
        value: reasoner.instinct,
        strength: 0.14
      },
      {
        label: "reasoner_focus",
        value: reasoner.next_focus,
        strength: 0.12
      },
      {
        label: "reasoner_caution",
        value: reasoner.caution,
        strength: 0.08
      },
      {
        label: "supervisor_reason",
        value: supervisor.reason,
        strength: 0.1
      },
      {
        label: "research_domain",
        value: research.domain,
        strength: 0.06
      }
    ];

    for (const check of peerChecks) {
      const text = normalizePeerText(check.value);
      if (!text) continue;
      total++;
      const tokens = text.split(/\s+/).filter((token) => token.length >= 3).slice(0, 4);
      const hit = tokens.some((token) => planText.includes(token));
      if (hit) {
        matched++;
        score += check.strength;
        hints.push(`followed ${check.label}`);
      } else {
        score -= check.strength * 0.7;
        hints.push(`overrode ${check.label}`);
      }
    }

    const plannerConfidence = clamp01(Number(plan.confidence || 0) / 100);
    score += (plannerConfidence - 0.5) * 0.16;
    if (String(plan.reasoning || "").toLowerCase().includes("peer")) score += 0.04;
    if (String(plan.reasoning || "").toLowerCase().includes("conservative")) score += 0.03;
    if (String(plan.reasoning || "").toLowerCase().includes("recovery")) score += 0.02;

    score = clamp01(score);
    const alignment = total ? matched / total : 0.5;
    const verdict = score >= 0.72 ? "followed" : score >= 0.5 ? "mixed" : "overrode";

    return {
      score,
      alignment,
      verdict,
      matched,
      total,
      hints: hints.slice(0, 6)
    };
  }

  // ── Page state ────────────────────────────────────────────────────────────────
  async function getPageState() {
    const url   = page.url();
    const title = await page.title().catch(() => "");
    const text  = await page.evaluate(() =>
      document.body ? document.body.innerText.slice(0, 3000) : ""
    ).catch(() => "");
    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a[href]")).slice(0, 15)
        .map(a => ({ text: a.innerText.trim().slice(0, 60), href: a.href }))
    ).catch(() => []);

    // Enhanced: compute best CSS selector + centre coordinates for every input
    const inputs = await page.evaluate(() => {
      const vw = window.innerWidth || 1920;
      const vh = window.innerHeight || 1080;
      return Array.from(document.querySelectorAll("input,textarea,select")).slice(0, 20)
        .map(el => {
          const rect = el.getBoundingClientRect();
          const inViewport = rect.width > 0 && rect.height > 0 &&
            rect.top < vh && rect.bottom > 0 && rect.left < vw && rect.right > 0;
          const tag  = el.tagName.toLowerCase();
          const aria = el.getAttribute("aria-label") || "";
          const ph   = el.placeholder || "";
          const tid  = el.getAttribute("data-testid") || el.getAttribute("data-qa") || "";
          // Build best selector: id > data-testid > name > aria-label > placeholder > type
          let sel = "";
          if (el.id)       sel = `#${el.id}`;
          else if (tid)    sel = `[data-testid='${tid}']`;
          else if (el.name)sel = `${tag}[name='${el.name}']`;
          else if (aria)   sel = `${tag}[aria-label='${aria.slice(0,60)}']`;
          else if (ph)     sel = `${tag}[placeholder='${ph.slice(0,40)}']`;
          else if (el.type && el.type !== "text") sel = `${tag}[type='${el.type}']`;
          else             sel = tag;
          return {
            tag, type: el.type || "", name: el.name || "",
            placeholder: ph.slice(0, 50), id: el.id || "",
            ariaLabel: aria.slice(0, 60),
            selector: sel,
            visible: inViewport,
            cx: Math.round(rect.left + rect.width / 2),
            cy: Math.round(rect.top + rect.height / 2),
            value: (el.value || "").slice(0, 40)
          };
        });
    }).catch(() => []);

    // Enhanced: buttons now include computed selector and coordinates
    const buttons = await page.evaluate(() => {
      const vw = window.innerWidth || 1920;
      const vh = window.innerHeight || 1080;
      return Array.from(document.querySelectorAll("button,input[type='button'],input[type='submit'],[role='button']"))
        .slice(0, 15)
        .map(el => {
          const rect = el.getBoundingClientRect();
          const inViewport = rect.width > 0 && rect.height > 0 &&
            rect.top < vh && rect.bottom > 0 && rect.left < vw && rect.right > 0;
          const aria = el.getAttribute("aria-label") || "";
          const tid  = el.getAttribute("data-testid") || "";
          let sel = "";
          if (el.id)     sel = `#${el.id}`;
          else if (tid)  sel = `[data-testid='${tid}']`;
          else if (aria) sel = `[aria-label='${aria.slice(0,60)}']`;
          const labelText = (el.innerText || el.value || aria || "").trim().slice(0, 50);
          return {
            text: labelText, visible: inViewport,
            id: el.id || "", name: el.name || "",
            selector: sel,
            cx: Math.round(rect.left + rect.width / 2),
            cy: Math.round(rect.top + rect.height / 2)
          };
        })
        .filter(b => b.text);
    }).catch(() => []);

    const tabInfo = (() => {
      const pages = context?.pages?.() || [];
      const activeIndex = pages.findIndex(p => p === page);
      return {
        count: pages.length,
        activeIndex: activeIndex >= 0 ? activeIndex : 0,
        urls: pages.map(p => {
          try { return p.url(); } catch { return "about:blank"; }
        })
      };
    })();
    return { url, title, text, links, inputs, buttons, tabs: tabInfo };
  }

  function getCaptchaPageKey(rawUrl) {
    try {
      const parsed = new URL(rawUrl || "about:blank");
      return parsed.origin + parsed.pathname;
    } catch {
      return String(rawUrl || "unknown");
    }
  }

  async function detectCaptchaChallenge(state) {
    const lowerText = `${state?.title || ""}\n${state?.text || ""}`.toLowerCase();
    const currentUrl = String(state?.url || "").toLowerCase();

    // Avoid false positives on normal auth routes like Google sign-in
    // where "challenge" can appear in the URL without any CAPTCHA widget.
    const strongTextHit = /(captcha|turnstile|hcaptcha|recaptcha|cf\s*challenge|cloudflare\s*challenge|cf-chl|ray\s+id)/.test(lowerText);
    const weakTextHit = /(verify\s+you\s+are\s+human|verify\s+you\s+are\s+a\s+human|security\s+check|attention\s+required|just\s+a\s+moment|prove\s+you\s+are\s+human)/.test(lowerText);
    const urlHit = /(captcha|cf_chl|turnstile|hcaptcha|recaptcha|challenge-platform|__cf_chl_)/.test(currentUrl);
    const domHit = await page.evaluate(() => {
      const selectors = [
        '[id*="captcha" i]',
        '[class*="captcha" i]',
        'iframe[src*="captcha" i]',
        'iframe[src*="challenge" i]',
        'iframe[src*="recaptcha" i]',
        'iframe[src*="hcaptcha" i]',
        'iframe[src*="turnstile" i]',
        '[name*="captcha" i]',
        '[data-sitekey]',
        '[class*="g-recaptcha" i]',
        '.h-captcha',
        '#cf-challenge-running',
        '.cf-challenge',
        '[class*="cf-turnstile" i]',
        '[data-action="challenge" i]',
        '[data-testid*="captcha" i]'
      ];
      return selectors.some(selector => document.querySelector(selector));
    }).catch(() => false);

    const score = (strongTextHit ? 2 : 0) + (weakTextHit ? 1 : 0) + (urlHit ? 2 : 0) + (domHit ? 3 : 0);
    const detected = domHit || strongTextHit || score >= 3;
    return {
      detected,
      reason: detected ? "Potential CAPTCHA/challenge detected" : ""
    };
  }

  function setHumanBridgeState(patch) {
    humanBridgeState = {
      ...humanBridgeState,
      ...(patch || {}),
      limit: CAPTCHA_HUMAN_CHECK_LIMIT
    };
  }

  function clearHumanBridgeState() {
    setHumanBridgeState({
      active: false,
      checks: 0,
      url: page ? page.url() : "about:blank",
      reason: "",
      closureReason: "",
      visionLastCheckAt: null,
      visionLastSummary: "",
      lastClick: null
    });
  }

  function parseVisionCaptchaSignal(raw) {
    const parsed = safeParseJSON(raw);
    if (parsed && typeof parsed.captcha === "boolean") {
      return {
        captcha: parsed.captcha,
        reason: typeof parsed.reason === "string" ? parsed.reason : ""
      };
    }
    const text = String(raw || "").toLowerCase();
    if (/"captcha"\s*:\s*true|\bcaptcha\s+present\b|\bchallenge\s+present\b/.test(text)) {
      return { captcha: true, reason: "vision-text-match" };
    }
    if (/"captcha"\s*:\s*false|\bno\s+captcha\b|\bchallenge\s+not\s+present\b|\bcleared\b/.test(text)) {
      return { captcha: false, reason: "vision-text-match" };
    }
    return { captcha: true, reason: "vision-ambiguous-default-keep-open" };
  }

  function stopHumanBridgeWatchdog() {
    if (bridgeVisionTimer) {
      clearInterval(bridgeVisionTimer);
      bridgeVisionTimer = null;
    }
    bridgeVisionInFlight = false;
    bridgeVisionClearStreak = 0;
  }

  function resetTaskVisionState() {
    taskVisionState = {
      active: false,
      timer: null,
      inFlight: false,
      seq: 0,
      unchangedFrames: 0,
      changedFrames: 0,
      droppedFrames: 0,
      lastHash: null,
      lastFrameAt: 0,
      lastChangeAt: 0,
      lastReasonerAt: 0,
      latestSummary: "",
      latestReasonerRaw: "",
      latestReasonerSignal: null,
      goal: "",
      model: DEFAULT_MODELS.vision,
      latestUrl: "about:blank"
    };
  }

  function stopTaskVisionPipeline() {
    if (taskVisionState.timer) {
      clearTimeout(taskVisionState.timer);
    }
    const snapshot = {
      changedFrames: taskVisionState.changedFrames,
      unchangedFrames: taskVisionState.unchangedFrames,
      droppedFrames: taskVisionState.droppedFrames,
      lastSummary: taskVisionState.latestSummary || ""
    };
    resetTaskVisionState();
    return snapshot;
  }

  function getTaskVisionSnapshot() {
    return {
      active: !!taskVisionState.active,
      seq: Number(taskVisionState.seq || 0),
      changedFrames: Number(taskVisionState.changedFrames || 0),
      unchangedFrames: Number(taskVisionState.unchangedFrames || 0),
      droppedFrames: Number(taskVisionState.droppedFrames || 0),
      lastFrameAt: taskVisionState.lastFrameAt || 0,
      lastChangeAt: taskVisionState.lastChangeAt || 0,
      summary: taskVisionState.latestSummary || "",
      raw: taskVisionState.latestReasonerRaw || "",
      signal: taskVisionState.latestReasonerSignal || null,
      latestUrl: taskVisionState.latestUrl || "about:blank"
    };
  }

  function parseVisionReasonerSignal(raw) {
    const parsed = safeParseJSON(raw);
    if (parsed && typeof parsed === "object") return parsed;
    return {
      state: "uncertain",
      next_focus: "unknown",
      blocker: "unknown",
      evidence: String(raw || "").slice(0, 180)
    };
  }

  function quoteCssText(text) {
    return JSON.stringify(String(text || "").trim());
  }

  function buildCaptchaCandidateSelectors(state) {
    const candidates = [];
    const seen = new Set();
    const add = selector => {
      const value = String(selector || "").trim();
      if (!value || seen.has(value)) return;
      seen.add(value);
      candidates.push(value);
    };

    const obviousButtonTexts = new Set([
      "verify",
      "continue",
      "i am human",
      "i'm human",
      "i am not a robot",
      "i'm not a robot",
      "allow",
      "accept",
      "proceed",
      "next",
      "submit"
    ]);

    for (const button of (state?.buttons || []).filter(item => item?.visible && item?.text)) {
      const text = String(button.text || "").trim();
      if (!text) continue;
      const lower = text.toLowerCase();
      if (![...obviousButtonTexts].some(token => lower.includes(token))) continue;
      add(`button:has-text(${quoteCssText(text)})`);
      add(`[role='button']:has-text(${quoteCssText(text)})`);
      add(`a:has-text(${quoteCssText(text)})`);
      add(`label:has-text(${quoteCssText(text)})`);
    }

    for (const input of (state?.inputs || []).filter(item => item?.visible)) {
      const type = String(input.type || "").toLowerCase();
      if (type === "checkbox" || type === "radio") {
        add(`input[type='${type}']`);
      }
      const identity = [input.id, input.name, input.placeholder].filter(Boolean).join(" ").toLowerCase();
      if (/(captcha|verify|human|robot|challenge|turnstile|hcaptcha|recaptcha)/.test(identity)) {
        if (input.id) add(`#${String(input.id).replace(/'/g, "\\'")}`);
        if (input.name) add(`[name='${String(input.name).replace(/'/g, "\\'")}']`);
        if (input.placeholder) add(`[placeholder='${String(input.placeholder).replace(/'/g, "\\'")}']`);
      }
    }

    add("input[type='checkbox']");
    add("input[type='radio']");
    add("button");
    return candidates.slice(0, 10);
  }

  async function executeCaptchaAttemptPlan(plan, fallbackSelectors) {
    const action = String(plan?.action || "").trim();
    const selector = String(plan?.selector || "").trim();
    const key = String(plan?.key || "Enter").trim() || "Enter";
    const ms = Math.max(250, Math.min(8000, Number(plan?.ms) || 1200));
    const x = Number(plan?.x);
    const y = Number(plan?.y);

    if (action === "mouseClick" && Number.isFinite(x) && Number.isFinite(y)) {
      await humanClick(page, x, y);
      return `mouseClick(${Math.round(x)},${Math.round(y)})`;
    }

    if (action === "click") {
      if (selector) {
        await actions.scrollIntoView({ page, selector }).catch(() => {});
        await actions.click({ page, selector });
        return `click(${selector})`;
      }
      if (Number.isFinite(x) && Number.isFinite(y)) {
        await humanClick(page, x, y);
        return `mouseClick(${Math.round(x)},${Math.round(y)})`;
      }
    }

    if (action === "press") {
      if (selector) {
        await actions.press({ page, selector, key });
        return `press(${selector}, ${key})`;
      }
      await page.keyboard.press(key);
      return `press(${key})`;
    }

    if (action === "submitForm") {
      if (selector) {
        await actions.submitForm({ page, selector });
        return `submitForm(${selector})`;
      }
      await actions.submitForm({ page });
      return "submitForm()";
    }

    if (action === "reload") {
      await actions.reload({ page });
      return "reload()";
    }

    if (action === "waitForTimeout") {
      await actions.waitForTimeout({ page, ms });
      return `waitForTimeout(${ms})`;
    }

    for (const selectorCandidate of fallbackSelectors) {
      try {
        await actions.scrollIntoView({ page, selector: selectorCandidate }).catch(() => {});
        await actions.click({ page, selector: selectorCandidate });
        return `click(${selectorCandidate})`;
      } catch {}
    }

    const visibleInput = (page && page.url) ? fallbackSelectors.find(sel => /input\[type='(text|search|email|password)'\]/.test(sel)) : null;
    if (visibleInput) {
      await actions.press({ page, selector: visibleInput, key: "Enter" }).catch(async () => {
        await page.keyboard.press("Enter");
      });
      return `press(${visibleInput}, Enter)`;
    }

    await actions.waitForTimeout({ page, ms });
    return `waitForTimeout(${ms})`;
  }

  async function attemptCaptchaSolve(state, models, attemptNumber, captchaReason) {
    const fallbackSelectors = buildCaptchaCandidateSelectors(state);
    const attemptSummary = `${attemptNumber}/${CAPTCHA_HUMAN_CHECK_LIMIT}`;
    broadcast("captcha_attempt", {
      msg: `Attempting CAPTCHA solve ${attemptSummary} on ${state.url}`,
      attempt: attemptNumber,
      limit: CAPTCHA_HUMAN_CHECK_LIMIT,
      url: state.url
    });
    stepLogMsg(`Step captcha: attempt ${attemptSummary} on ${state.url}`);

    const screenshotB64 = await getVisionScreenshotB64({ broadcastImage: false, writeFile: false });
    const promptText = `You are clearing a CAPTCHA or human verification gate.
Goal: keep the browser moving with one safe, concrete next action.
Current URL: ${state.url}
Page text: ${String(state.text || "").slice(0, 2000)}
Challenge hint: ${captchaReason || "unknown"}

Return JSON only:
{
  "action": "mouseClick|click|press|submitForm|reload|waitForTimeout",
  "selector": "CSS selector if you can clearly identify one",
  "x": 0,
  "y": 0,
  "key": "Enter|Space|Tab",
  "ms": 1200,
  "reason": "short"
}

Rules:
- Prefer mouseClick with coordinates if a visible checkbox, verify button, or continue button is obvious.
- Prefer click(selector) only if the selector is clearly visible.
- Use press with Enter or Space only when a focused field or obvious keyboard submission is visible.
- Use reload only as a later attempt.
- Never invent a selector or coordinates you cannot justify from the screenshot.`;

    let plan = null;
    try {
      const raw = await callVisionAI(screenshotB64, promptText, 240, models.vision);
      plan = safeParseJSON(raw) || null;
      if (plan?.reason) {
        think(`Captcha vision attempt ${attemptSummary}: ${plan.reason}`);
      }
    } catch (err) {
      think(`Captcha vision attempt ${attemptSummary} fallback: ${err.message}`);
    }

    if (!plan || typeof plan !== "object") {
      plan = {};
    }

    if (!plan.action) {
      if (attemptNumber === 1) {
        plan.action = fallbackSelectors.length ? "click" : "waitForTimeout";
        plan.selector = fallbackSelectors[0] || "";
      } else if (attemptNumber === 2) {
        plan.action = "press";
        plan.key = "Enter";
        plan.selector = (state.inputs || []).find(item => item?.visible && /text|search|email|password|checkbox|radio/.test(String(item.type || "")))?.id ? `#${String((state.inputs || []).find(item => item?.visible && /text|search|email|password|checkbox|radio/.test(String(item.type || ""))).id).replace(/'/g, "\\'")}` : "";
      } else if (attemptNumber === 3) {
        plan.action = "submitForm";
        plan.selector = fallbackSelectors[0] || "";
      } else if (attemptNumber === 4) {
        plan.action = "reload";
      } else {
        plan.action = fallbackSelectors.length ? "click" : "waitForTimeout";
        plan.selector = fallbackSelectors[0] || "";
      }
    }

    if (attemptNumber === 4 && plan.action !== "reload") {
      plan.action = "reload";
    }
    if (attemptNumber === 5 && plan.action === "waitForTimeout") {
      plan.ms = Math.max(1200, Number(plan.ms) || 1600);
    }

    const executed = await executeCaptchaAttemptPlan(plan, fallbackSelectors);
    await sleep(900 + (attemptNumber * 180));

    const refreshedState = await getPageState();
    const refreshedCaptcha = await detectCaptchaChallenge(refreshedState);
    const solved = !refreshedCaptcha.detected;

    broadcast(solved ? "captcha_solved" : "captcha_still_present", {
      msg: solved
        ? `CAPTCHA cleared after attempt ${attemptSummary} (${executed}).`
        : `CAPTCHA still present after attempt ${attemptSummary} (${executed}).`,
      attempt: attemptNumber,
      limit: CAPTCHA_HUMAN_CHECK_LIMIT,
      url: refreshedState.url
    });

    return { solved, state: refreshedState, executed, captcha: refreshedCaptcha };
  }

  async function startTaskVisionPipeline(goal, models) {
    stopTaskVisionPipeline();
    taskVisionState.active = true;
    taskVisionState.goal = String(goal || "").slice(0, 280);
    taskVisionState.model = models?.vision || DEFAULT_MODELS.vision;

    const pump = async () => {
      const startedAt = Date.now();
      if (!taskVisionState.active) return;
      if (!page) {
        taskVisionState.latestSummary = "vision-pipeline-paused: page unavailable";
        taskVisionState.timer = setTimeout(pump, VISION_STREAM_INTERVAL_MS);
        return;
      }
      if (taskVisionState.inFlight) {
        taskVisionState.droppedFrames += 1;
        if (taskVisionState.active) taskVisionState.timer = setTimeout(pump, VISION_STREAM_INTERVAL_MS);
        return;
      }

      taskVisionState.inFlight = true;
      const now = Date.now();
      try {
        const imageB64 = await getVisionScreenshotB64({
          broadcastImage: false,
          writeFile: false,
          screenshotOptions: {
            type: "jpeg",
            quality: 38,
            animations: "disabled",
            caret: "hide",
            scale: "css"
          }
        });
        const buf = Buffer.from(imageB64, "base64");
        const frameHash = crypto.createHash("sha1").update(buf).digest("hex");
        const changed = frameHash !== taskVisionState.lastHash;
        taskVisionState.lastHash = frameHash;
        taskVisionState.seq += 1;
        taskVisionState.lastFrameAt = now;
        taskVisionState.latestUrl = page.url();

        if (changed) {
          taskVisionState.changedFrames += 1;
          taskVisionState.lastChangeAt = now;
        } else {
          taskVisionState.unchangedFrames += 1;
        }

        broadcast("vision_tick", {
          msg: `vision@${VISION_STREAM_FPS}fps seq=${taskVisionState.seq} changed=${changed ? "yes" : "no"}`,
          seq: taskVisionState.seq,
          fps: VISION_STREAM_FPS,
          changed,
          dropped: taskVisionState.droppedFrames,
          changedFrames: taskVisionState.changedFrames,
          unchangedFrames: taskVisionState.unchangedFrames,
          url: taskVisionState.latestUrl,
          hash: frameHash.slice(0, 10)
        });

        const shouldReason = (
          changed && (now - taskVisionState.lastReasonerAt >= VISION_REASONER_INTERVAL_MS)
        ) || (now - taskVisionState.lastReasonerAt >= VISION_REASONER_FORCE_INTERVAL_MS);

        if (!shouldReason) return;

        const reasonerPrompt = `You are the live visual reasoner for a browser agent.
  Goal: "${taskVisionState.goal}"
  URL: ${taskVisionState.latestUrl}

  Return JSON only:
  {
    "state": "progress|blocked|captcha|login|ready|uncertain",
    "next_focus": "short actionable focus",
    "blocker": "none|captcha|login|paywall|popup|unknown",
    "evidence": "one concrete visible clue"
  }`;

        const raw = await callVisionAI(imageB64, reasonerPrompt, 180, taskVisionState.model);
        const signal = parseVisionReasonerSignal(raw);
        taskVisionState.lastReasonerAt = now;
        taskVisionState.latestReasonerRaw = String(raw || "").slice(0, 99999);
        taskVisionState.latestReasonerSignal = signal;
        taskVisionState.latestSummary = [
          `VisionState=${signal.state || "uncertain"}`,
          `Focus=${signal.next_focus || "n/a"}`,
          `Blocker=${signal.blocker || "unknown"}`,
          `Evidence=${signal.evidence || "n/a"}`,
          `DiffFrames(changed/unchanged)=${taskVisionState.changedFrames}/${taskVisionState.unchangedFrames}`
        ].join(" | ");
      } catch (err) {
        taskVisionState.latestSummary = `vision-pipeline-error: ${String(err.message || "unknown")}`;
      } finally {
        taskVisionState.inFlight = false;
        if (taskVisionState.active) {
          const elapsed = Date.now() - startedAt;
          const errorBackoff = String(taskVisionState.latestSummary || "").startsWith("vision-pipeline-error") ? 250 : 0;
          const nextDelay = Math.max(90, VISION_STREAM_INTERVAL_MS - elapsed + errorBackoff);
          taskVisionState.timer = setTimeout(pump, nextDelay);
        }
      }
    };

    taskVisionState.timer = setTimeout(pump, 0);
  }

  function startHumanBridgeWatchdog(models) {
    stopHumanBridgeWatchdog();
    bridgeVisionModelId = models?.vision || DEFAULT_MODELS.vision;

    bridgeVisionTimer = setInterval(async () => {
      if (!humanBridgeState.active || !page || bridgeVisionInFlight) return;
      bridgeVisionInFlight = true;
      try {
        const screenshotB64 = await getScreenshotB64({ broadcastImage: false, writeFile: false });
        const raw = await callVisionAI(
          screenshotB64,
          "Check this browser screenshot for anti-bot gates. Return JSON only: {\"captcha\": true|false, \"confidence\": 0-100, \"reason\": \"short\"}. captcha=true only if a CAPTCHA/challenge/security gate is clearly visible right now.",
          120,
          bridgeVisionModelId
        );
        const signal = parseVisionCaptchaSignal(raw);
        setHumanBridgeState({
          visionLastCheckAt: new Date().toISOString(),
          visionLastSummary: String(signal.reason || "")
        });

        if (signal.captcha) {
          bridgeVisionClearStreak = 0;
        } else {
          bridgeVisionClearStreak += 1;
          if (bridgeVisionClearStreak >= BRIDGE_VISION_CLEAR_STREAK) {
            setHumanBridgeState({
              active: false,
              closureReason: "Vision no longer detects CAPTCHA; bridge auto-closed.",
              reason: ""
            });
            broadcast("bridge_closed", {
              msg: "Human bridge auto-closed: vision no longer detects CAPTCHA.",
              url: page.url()
            });
          }
        }
      } catch (err) {
        setHumanBridgeState({
          visionLastCheckAt: new Date().toISOString(),
          visionLastSummary: `watchdog-error:${String(err.message || "unknown")}`
        });
      } finally {
        bridgeVisionInFlight = false;
      }
    }, BRIDGE_VISION_INTERVAL_MS);
  }

  async function relayHumanClick(body) {
    if (!page) throw new Error("Browser page is not ready");

    const viewport = await page.evaluate(() => ({
      width: Math.max(1, Math.round(window.innerWidth || 1920)),
      height: Math.max(1, Math.round(window.innerHeight || 1080))
    })).catch(() => ({ width: 1920, height: 1080 }));

    const xRatio = Number(body?.xRatio);
    const yRatio = Number(body?.yRatio);
    if (!Number.isFinite(xRatio) || !Number.isFinite(yRatio)) {
      throw new Error("xRatio and yRatio are required numbers");
    }

    const safeRatioX = Math.min(1, Math.max(0, xRatio));
    const safeRatioY = Math.min(1, Math.max(0, yRatio));
    const x = clampNumber(safeRatioX * viewport.width, 1, viewport.width - 1);
    const y = clampNumber(safeRatioY * viewport.height, 1, viewport.height - 1);
    if (x === null || y === null) throw new Error("Could not resolve click coordinates");

    const requestedButton = String(body?.button || "left").toLowerCase();
    const button = ["left", "middle", "right"].includes(requestedButton) ? requestedButton : "left";

    await page.bringToFront().catch(() => {});
    await humanMove(page, x, y);
    await sleep(50);
    await page.mouse.down({ button });
    await sleep(40);
    await page.mouse.up({ button });

    setHumanBridgeState({
      clickCount: (humanBridgeState.clickCount || 0) + 1,
      lastClickAt: new Date().toISOString(),
      lastClick: { x, y, button },
      url: page.url()
    });
    broadcast("human_click", {
      msg: `Human click relayed at (${x}, ${y}) on ${page.url()}.`,
      x,
      y,
      button,
      url: page.url(),
      viewportWidth: viewport.width,
      viewportHeight: viewport.height
    });

    return { x, y, button, url: page.url(), viewport };
  }

  async function captureScreenshotB64(options = {}) {
    const broadcastImage = options.broadcastImage !== false;
    const writeFile = options.writeFile !== false;
    const visionFiltered = !!options.visionFiltered;
    const screenshotOptions = options.screenshotOptions && typeof options.screenshotOptions === "object"
      ? options.screenshotOptions
      : { type: "jpeg", quality: 75 };

    return queueScreenshotCapture(async () => {
      let filterApplied = false;
      if (visionFiltered) {
        await page.evaluate(({ styleId, cssText }) => {
          let style = document.getElementById(styleId);
          if (!style) {
            style = document.createElement("style");
            style.id = styleId;
            (document.head || document.documentElement).appendChild(style);
          }
          style.textContent = cssText;
        }, { styleId: VISION_FILTER_STYLE_ID, cssText: VISION_FILTER_CSS }).catch(() => {});
        filterApplied = true;
      }

      try {
        const buf = await page.screenshot(screenshotOptions);
        const b64 = buf.toString("base64");
        if (writeFile) fs.writeFileSync("view.png", buf);
        if (broadcastImage) broadcast("screenshot", { img: b64 });
        return b64;
      } finally {
        if (filterApplied) {
          await page.evaluate((styleId) => {
            const style = document.getElementById(styleId);
            if (style) style.remove();
          }, VISION_FILTER_STYLE_ID).catch(() => {});
        }
      }
    });
  }

  async function getScreenshotB64(options = {}) {
    return captureScreenshotB64({
      broadcastImage: options.broadcastImage,
      writeFile: options.writeFile,
      visionFiltered: false,
      screenshotOptions: options.screenshotOptions || { type: "jpeg", quality: 75 }
    });
  }

  async function getVisionScreenshotB64(options = {}) {
    return captureScreenshotB64({
      broadcastImage: options.broadcastImage === true,
      writeFile: options.writeFile === true,
      visionFiltered: true,
      screenshotOptions: options.screenshotOptions || { type: "jpeg", quality: 93 }
    });
  }

  // ── MEMORY: summarise past tasks for long-term context ───────────────────────
  const MEMORY_FILE = "memory.json";
  const MEMORY_OVERFLOW_FILE = "memory.extra.json";
  const MEMORY_PRIMARY_TARGET_ENTRIES = 20000;
  const MEMORY_MAX_TOTAL_ENTRIES = 50000;
  const MEMORY_SEARCH_TIMEOUT_MS = 25000;

  function readMemoryEntries(filePath) {
    if (!fs.existsSync(filePath)) return [];
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeMemoryEntries(filePath, entries) {
    fs.writeFileSync(filePath, JSON.stringify(Array.isArray(entries) ? entries : [], null, 2));
  }

  function normalizeKeywordList(parts = [], max = 16) {
    const stop = new Set(["the", "a", "an", "to", "for", "of", "and", "or", "on", "in", "at", "with", "is", "are", "be", "by", "from", "this", "that", "it", "as", "if", "then"]);
    const seen = new Set();
    const out = [];
    const tokens = String(parts.filter(Boolean).join(" "))
      .toLowerCase()
      .replace(/[^a-z0-9_\- ]+/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    for (const token of tokens) {
      if (token.length < 2 || stop.has(token) || seen.has(token)) continue;
      seen.add(token);
      out.push(token);
      if (out.length >= max) break;
    }
    return out;
  }

  function getMemoryEntryText(entry) {
    const keywords = Array.isArray(entry?.keywords) ? entry.keywords.join(" ") : "";
    return [
      entry?.task,
      entry?.prompt,
      entry?.goal,
      entry?.result,
      entry?.action_done,
      entry?.url,
      keywords,
      entry?.other_data && typeof entry.other_data === "object" ? JSON.stringify(entry.other_data).slice(0, 99999) : ""
    ].filter(Boolean).join(" ").toLowerCase();
  }

  function ensureMemoryPerformance(reason = "") {
    const primary = readMemoryEntries(MEMORY_FILE);
    if (primary.length <= MEMORY_PRIMARY_TARGET_ENTRIES) return;

    const overflow = readMemoryEntries(MEMORY_OVERFLOW_FILE);
    const spillCount = primary.length - MEMORY_PRIMARY_TARGET_ENTRIES;
    const moved = primary.splice(0, spillCount);
    const mergedOverflow = [...overflow, ...moved];

    if (mergedOverflow.length > MEMORY_MAX_TOTAL_ENTRIES) {
      mergedOverflow.splice(0, mergedOverflow.length - MEMORY_MAX_TOTAL_ENTRIES);
    }

    writeMemoryEntries(MEMORY_FILE, primary);
    writeMemoryEntries(MEMORY_OVERFLOW_FILE, mergedOverflow);
    think(`Memory rollover: moved ${moved.length} entries to ${MEMORY_OVERFLOW_FILE}${reason ? ` (${reason})` : ""}.`);
  }

  function loadMemory() {
    const startedAt = Date.now();
    const primary = readMemoryEntries(MEMORY_FILE);
    const overflow = readMemoryEntries(MEMORY_OVERFLOW_FILE);
    const combined = [...overflow, ...primary];
    if (combined.length > MEMORY_MAX_TOTAL_ENTRIES) {
      combined.splice(0, combined.length - MEMORY_MAX_TOTAL_ENTRIES);
    }
    if (Date.now() - startedAt > MEMORY_SEARCH_TIMEOUT_MS) {
      ensureMemoryPerformance("slow-read");
    }
    return combined;
  }

  function searchRelevantMemory(query, limit = 6) {
    const startedAt = Date.now();
    const all = loadMemory();
    const terms = normalizeKeywordList([query], 14);
    if (!terms.length) return all.slice(-limit);

    const scored = all
      .map(item => {
        const haystack = getMemoryEntryText(item);
        const score = terms.reduce((sum, term) => {
          if (!haystack.includes(term)) return sum;
          if (haystack.includes(` ${term} `)) return sum + 2;
          return sum + 1;
        }, 0);
        return { item, score };
      })
      .filter(row => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(row => row.item);

    if (Date.now() - startedAt > MEMORY_SEARCH_TIMEOUT_MS) {
      ensureMemoryPerformance("slow-search");
    }

    return scored.length ? scored : all.slice(-limit);
  }

  function saveMemory(entry) {
    const primary = readMemoryEntries(MEMORY_FILE);
    primary.push({ ts: new Date().toISOString(), ...entry });
    writeMemoryEntries(MEMORY_FILE, primary);
    ensureMemoryPerformance("save");
  }

  function saveActionMemory(entry) {
    const normalized = {
      ts: new Date().toISOString(),
      task: String(entry?.task || "").slice(0, 320),
      prompt: String(entry?.prompt || "").slice(0, 1000),
      keywords: Array.isArray(entry?.keywords) ? entry.keywords.slice(0, 30) : [],
      action_done: String(entry?.action_done || "").slice(0, 380),
      successful: !!entry?.successful,
      prompt_successful: !!entry?.prompt_successful,
      url: String(entry?.url || ""),
      other_data: entry?.other_data && typeof entry.other_data === "object" ? entry.other_data : {}
    };

    // Keep existing memory UI cards functional.
    normalized.goal = normalized.task || "Past task";
    normalized.result = normalized.action_done || (normalized.successful ? "action ok" : "action failed");

    saveMemory(normalized);
  }

  // ── LEARNING LOG: persistent action/task outcomes for fast adaptation ───────
  function loadLearningLog() {
    if (Array.isArray(learningLogCache)) return learningLogCache;
    if (fs.existsSync(LOG_FILE)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(LOG_FILE, "utf8"));
        learningLogCache = Array.isArray(parsed) ? parsed : [];
      } catch {
        learningLogCache = [];
      }
    } else {
      learningLogCache = [];
    }
    return learningLogCache;
  }

  function saveLearningLog() {
    if (!Array.isArray(learningLogCache)) learningLogCache = [];
    fs.writeFileSync(LOG_FILE, JSON.stringify(learningLogCache, null, 2));
  }

  function getHostFromUrl(rawUrl) {
    try {
      return new URL(rawUrl || "about:blank").host.replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  function buildActionSignature(action, params) {
    const selector = params?.selector ? String(params.selector).slice(0, 180) : "";
    return `${String(action || "unknown")}|${selector}`;
  }

  function normalizeTabTargetParams(rawParams) {
    const params = { ...(rawParams || {}) };
    const combinedKey = Object.prototype.hasOwnProperty.call(params, "index|urlIncludes") ? params["index|urlIncludes"] : undefined;

    if (combinedKey !== undefined && params.index === undefined && params.urlIncludes === undefined) {
      if (typeof combinedKey === "number" && Number.isInteger(combinedKey)) {
        params.index = combinedKey;
      } else if (typeof combinedKey === "string" && /^-?\d+$/.test(combinedKey.trim())) {
        params.index = Number(combinedKey.trim());
      } else if (combinedKey !== null && combinedKey !== "") {
        params.urlIncludes = String(combinedKey);
      }
    }

    if (params.index !== undefined && !Number.isInteger(params.index)) {
      const parsedIndex = Number(params.index);
      if (Number.isInteger(parsedIndex)) {
        params.index = parsedIndex;
      }
    }

    if (params.urlIncludes !== undefined && params.urlIncludes !== null) {
      params.urlIncludes = String(params.urlIncludes);
    }

    return params;
  }

  function sanitizePlannerSelector(rawSelector, actionName = "") {
    let selector = String(rawSelector || "").trim();
    if (!selector) return selector;

    // Vision/planner sometimes prepends visibility labels that are not CSS.
    selector = selector.replace(/^\[(?:visible|hidden)\]\s*/i, "").trim();

    // Repair obvious broken selector from prior runs.
    if (selector === "[data-bid='']") {
      selector = "a[data-bid], [data-bid] a";
    }

    // If the planner gives only quoted visible text, build a practical click target.
    const quotedOnly = selector.match(/^['"](.+?)['"]$/);
    if (quotedOnly) {
      const text = quotedOnly[1].trim();
      if (text) {
        if (["click", "dblclick", "hover"].includes(String(actionName || ""))) {
          return `button:has-text(${JSON.stringify(text)}), a:has-text(${JSON.stringify(text)}), [role='button']:has-text(${JSON.stringify(text)})`;
        }
        return `:text(${JSON.stringify(text)})`;
      }
    }

    return selector;
  }

  function normalizeActionItem(rawItem) {
    const item = rawItem && typeof rawItem === "object" ? rawItem : {};
    const actionInput = String(item.action || "").trim();
    const lower = actionInput.toLowerCase();
    const actionAliases = {
      mouseclick: "mouseClick",
      mousedblclick: "mouseDblclick",
      mousescroll: "mouseWheel",
      switchtab: "switchToTab"
    };
    const canonicalAction = actionAliases[lower] || actionInput;
    const params = { ...(item.params || {}) };

    if (typeof params.selector === "string") {
      params.selector = sanitizePlannerSelector(params.selector, canonicalAction);
    }

    if (canonicalAction === "press" && !params.key) {
      params.key = "Enter";
    }

    if ((canonicalAction === "mouseClick" || canonicalAction === "mouseDblclick") && (!Number.isFinite(Number(params.x)) || !Number.isFinite(Number(params.y)))) {
      // If malformed mouse coordinates arrive, prefer letting normal click path handle text selectors.
      if (typeof params.selector === "string" && params.selector.trim()) {
        return { action: "click", params: { selector: params.selector } };
      }
    }

    return { action: canonicalAction, params };
  }

  function appendLearningEvent(event) {
    const log = loadLearningLog();
    log.push({ ts: new Date().toISOString(), ...event });
    // No cutoff — retain full history
    saveLearningLog();
  }

  function getActionHints({ action, params, currentUrl }) {
    const log = loadLearningLog();
    const host = getHostFromUrl(currentUrl);
    const signature = buildActionSignature(action, params);
    const relevant = log
      .filter(item => item.kind === "action" && item.host === host && item.signature === signature)
      .slice(-60);
    const attempts = relevant.length;
    const successes = relevant.filter(item => item.status === "ok").length;
    const failures = attempts - successes;
    const lastError = [...relevant].reverse().find(item => item.error)?.error || "";
    return {
      attempts,
      successes,
      failures,
      failureRate: attempts ? (failures / attempts) : 0,
      lastError
    };
  }

  function buildLearningContext(goal, state) {
    const log = loadLearningLog();
    const host = getHostFromUrl(state?.url || "");
    const recentGoalWords = String(goal || "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
    const recentTaskLearn = log
      .filter(item => item.kind === "task" && item.goal)
      .filter(item => recentGoalWords.some(word => String(item.goal).toLowerCase().includes(word)))
      .slice(-3);
    const hostActionLearn = log
      .filter(item => item.kind === "action" && item.host === host)
      .slice(-25);
    const hostFailTop = Object.entries(hostActionLearn.reduce((acc, item) => {
      if (item.status === "error") acc[item.signature] = (acc[item.signature] || 0) + 1;
      return acc;
    }, {})).sort((a, b) => b[1] - a[1]).slice(0, 3);

    return [
      `Recent similar tasks: ${recentTaskLearn.length ? recentTaskLearn.map(t => `${t.completed ? "ok" : "fail"}:${String(t.goal).slice(0, 40)}`).join(" | ") : "none"}`,
      `Host (${host || "unknown"}) frequent failures: ${hostFailTop.length ? hostFailTop.map(([sig, n]) => `${sig} x${n}`).join(" | ") : "none"}`
    ].join("\n");
  }

  // ─────────────────────────────────────────────────────────────────────────────
// AGENT: ROUTER
// ─────────────────────────────────────────────────────────────────────────────
async function routeGoal(rawGoal, conversationHistory, models, routeContext = {}) {
  status("Router thinking...");
  
  // Sanitize: Filter out system instruction patterns that shouldn't be tasks
  const sanitizedGoal = sanitizeTaskGoal(rawGoal);
  
  // If sanitization removed harmful content, respond appropriately
  if (sanitizedGoal !== String(rawGoal || "").trim()) {
    routerThink(models, "Router: Filtered out system instruction injection. Treating as chat.");
    return { 
      mode: "chat", 
      chatReply: "I'm Puppeterr, an autonomous browser agent. How can I help you with web automation or information gathering?",
      reasoning: "Blocked system instruction injection"
    };
  }

  const taskType = classifyRouterTaskType(sanitizedGoal, routeContext);
  const baselineRouterModel = String(models?.router || DEFAULT_MODELS.router);
  const failedForTaskType = routerTaskTypeFailures.get(taskType) || new Set();
  const selection = pickBestRouterModelForTask(taskType, baselineRouterModel, modelCatalogCache.items, failedForTaskType);
  let activeRouterModel = selection.modelToUse;
  let retriedWithBaseline = false;
  
  if (looksLikeTaskGoal(sanitizedGoal)) {
    routerThink(models, "Router heuristic: classified as task from action-oriented intent.");
    routerThink(models, `Router model restore: taskType=${taskType} baseline=${baselineRouterModel} used=${activeRouterModel} swapped=${selection.swapped} retry=${retriedWithBaseline}.`);
    return {
      mode: "task",
      taskGoal: sanitizedGoal,
      routerMeta: {
        taskType,
        modelToUse: activeRouterModel,
        baselineModel: baselineRouterModel,
        reason: `heuristic task classification; ${selection.reason}`,
        swapped: selection.swapped,
        retriedWithBaseline
      }
    };
  }
  const mem     = searchRelevantMemory(sanitizedGoal, 5);
  const memCtx  = mem.map(m => {
    const task = String(m.task || m.goal || "Past task");
    const result = String(m.result || m.action_done || "");
    return `Past task: "${task}" → ${result}`;
  }).join("\n");
  const convCtx = (conversationHistory || []).slice(-6)
    .map(m => `${m.role === "user" ? "User" : "Agent"}: ${m.content}`).join("\n");

  const system = `You are the Router for an autonomous browser agent.
You have memory of past tasks and the current conversation.

Classify as "chat" (answer directly) or "task" (needs browser automation).

Long-term memory:
${memCtx || "(none yet)"}

Recent conversation:
${convCtx || "(none)"}

Output ONLY valid JSON:
{
  "mode": "chat" | "task",
  "chatReply": "genuine helpful answer if chat",
  "taskGoal": "precise cleaned goal if task",
  "reasoning": "one sentence on why you classified it this way"
}`;

  try {
    let parsed = null;
    let lastError = null;

    const attemptOrder = activeRouterModel === baselineRouterModel
      ? [baselineRouterModel]
      : [activeRouterModel, baselineRouterModel];

    for (const modelCandidate of attemptOrder) {
      if (modelCandidate === baselineRouterModel && retriedWithBaseline) continue;
      try {
        const raw = await callCFAI(modelCandidate, [
          { role: "system", content: system },
          { role: "user", content: rawGoal }
        ], 700, 2, getRuntimeTemperature(models));
        parsed = safeParseJSON(raw);
        if (!parsed) throw new Error("unparseable");
        activeRouterModel = modelCandidate;
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        if (modelCandidate !== baselineRouterModel) {
          const failed = routerTaskTypeFailures.get(taskType) || new Set();
          failed.add(String(modelCandidate));
          routerTaskTypeFailures.set(taskType, failed);
          retriedWithBaseline = true;
          routerThink(models, `Router swap failed for ${taskType} on ${modelCandidate}; retrying once with baseline ${baselineRouterModel}.`);
          continue;
        }
        throw err;
      }
    }

    if (!parsed) throw (lastError || new Error("unparseable"));
    routerThink(models, `Router: ${parsed.reasoning || parsed.mode}`);
    if (parsed.mode === "task") {
      return {
        mode: "task",
        taskGoal: parsed.taskGoal || rawGoal,
        routerMeta: {
          taskType,
          modelToUse: activeRouterModel,
          baselineModel: baselineRouterModel,
          reason: selection.reason,
          swapped: selection.swapped,
          retriedWithBaseline
        }
      };
    }
    return {
      mode: "chat",
      chatReply: parsed.chatReply || "What can I help you with?",
      routerMeta: {
        taskType,
        modelToUse: activeRouterModel,
        baselineModel: baselineRouterModel,
        reason: selection.reason,
        swapped: selection.swapped,
        retriedWithBaseline
      }
    };
  } catch (err) {
    const msg = String(err && err.message ? err.message : "");
    errLog("Router fallback: " + msg);
    if (msg.includes("Authentication error") || msg.includes("Unable to authenticate request") || msg.includes("10000") || msg.includes("10001")) {
      return {
        mode: "chat",
        chatReply: "Cloudflare AI auth failed. Your token is valid, but it is not authorized for this CF_ACCOUNT_ID/endpoint. Check that CF_ACCOUNT_ID is the account where Workers AI is enabled and that the token includes Workers AI permissions for that account."
      };
    }
    return { mode: "chat", chatReply: "I had trouble understanding that — could you rephrase?" };
  } finally {
    const usedModel = activeRouterModel;
    activeRouterModel = baselineRouterModel;
    routerThink(models, `Router model restore: taskType=${taskType} baseline=${baselineRouterModel} used=${usedModel} swapped=${selection.swapped} retry=${retriedWithBaseline}.`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT: VISION
// ─────────────────────────────────────────────────────────────────────────────
function percentPositionToPixels(xPercent, yPercent, viewport) {
  const safeX = Math.max(0, Math.min(100, Number(xPercent) || 0));
  const safeY = Math.max(0, Math.min(100, Number(yPercent) || 0));
  return {
    x: Math.round((safeX / 100) * viewport.width),
    y: Math.round((safeY / 100) * viewport.height),
  };
}

/**
 * EFFICIENCY CHECK: Does vision data already have what we need?
 * Helps planner recognize when it can skip DOM extraction.
 * Returns suggestion if the information is already visible.
 */
function checkVisionHasAnswer(visionFeedback, taskKeywords) {
  if (!visionFeedback) return null;
  
  const feedbackLower = String(visionFeedback || "").toLowerCase();
  const visible = feedbackLower.includes("visible_text_exact");
  
  // If task is asking to extract/read visible content and vision has it
  if (visible && taskKeywords) {
    const keywords = Array.isArray(taskKeywords) ? taskKeywords : [taskKeywords];
    const hasRelevantText = keywords.some(kw => 
      feedbackLower.includes(String(kw).toLowerCase())
    );
    
    if (hasRelevantText) {
      return {
        alreadyHave: true,
        suggestion: "Vision already captured the visible text. Use getAllText() or extract from vision data directly. No need for DOM selector attempts.",
        efficiency: "FAST_SKIP"
      };
    }
  }
  
  return null;
}

async function analyzeScreen(screenshotB64, state, lastAction, goal, models) {
  try {
    status("Pixel-grid analyzing page...");
    const shapeDetector = require("./shapeDetector");
    const analysis = await shapeDetector.analyzeImageFull(screenshotB64);
    const report = buildDeterministicUiReport(analysis.analysis || {}, state, lastAction, goal);
    const raw = JSON.stringify(report, null, 2);
    think("Pixel-grid: " + raw.slice(0, 400) + (raw.length > 400 ? "..." : ""));
    return raw;
  } catch (err) {
    errLog("Pixel-grid analysis failed: " + err.message);
    return JSON.stringify({
      taskType: "pixel_grid_reasoning",
      error: err.message,
      goal: String(goal || ""),
      lastAction: lastAction || null,
      state: {
        url: String(state?.url || ""),
        title: String(state?.title || "")
      },
      grid: {
        counts: {},
        ink: "#",
        background: ".",
        asciiMap: []
      },
      glyphs: [],
      uiElements: [],
      summary: {
        code: "pixel_grid_reasoning",
        glyphCount: 0,
        uiElementCount: 0,
        ink: "#",
        background: "."
      }
    }, null, 2);
  }
}

module.exports = { analyzeScreen, percentPositionToPixels };

function clampNumber(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num < min) return min;
  if (num > max) return max;
  return Math.round(num);
}

function dedupePoints(points, minDistance = 8) {
  const deduped = [];
  for (const point of points) {
    const isDuplicate = deduped.some(existing => {
      const dx = existing.x - point.x;
      const dy = existing.y - point.y;
      return Math.hypot(dx, dy) < minDistance;
    });
    if (!isDuplicate) deduped.push(point);
  }
  return deduped;
}

function makePointCloud(points, viewport, count = 10) {
  const width = Math.max(1, Number(viewport?.width || 1920));
  const height = Math.max(1, Number(viewport?.height || 1080));
  const normalized = (Array.isArray(points) ? points : [])
    .map(point => ({
      x: clampNumber(point?.x, 0, width - 1),
      y: clampNumber(point?.y, 0, height - 1)
    }))
    .filter(point => point.x !== null && point.y !== null);

  const deduped = dedupePoints(normalized, 6);
  const seed = deduped[0] || {
    x: Math.round(width * 0.5),
    y: Math.round(height * 0.5)
  };

  while (deduped.length < count) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 4 + Math.random() * 28;
    deduped.push({
      x: clampNumber(seed.x + (Math.cos(angle) * radius), 0, width - 1),
      y: clampNumber(seed.y + (Math.sin(angle) * radius), 0, height - 1)
    });
  }
  return dedupePoints(deduped, 4).slice(0, count);
}

function buildSelectorVariants(selector, maxVariants = HYBRID_SELECTOR_VARIANTS) {
  const base = String(selector || "").trim();
  if (!base) return [];
  const variants = [];
  const seen = new Set();
  const add = value => {
    const next = String(value || "").trim();
    if (!next || seen.has(next)) return;
    seen.add(next);
    variants.push(next);
  };

  add(base);
  if (!/:visible\b/.test(base)) add(`${base}:visible`);

  // Input-specific selector families
  const nameMatch     = base.match(/\[name=['"]([^'"]+)['"]\]/);
  const idMatch       = base.match(/^#(.+)/);
  const ariaMatch     = base.match(/\[aria-label=['"]([^'"]+)['"]\]/);
  const placeholderM  = base.match(/\[placeholder=['"]([^'"]+)['"]\]/);
  const typeSearchM   = base.match(/\[type=['"]search['"]\]/);
  const testidM       = base.match(/\[data-testid=['"]([^'"]+)['"]\]/);

  if (nameMatch) {
    const n = nameMatch[1];
    add(`input[name='${n}']`);
    add(`textarea[name='${n}']`);
    add(`[name='${n}']`);
  }
  if (idMatch) {
    add(`[id='${idMatch[1]}']`);
    add(`input#${idMatch[1]}`);
    add(`textarea#${idMatch[1]}`);
  }
  if (ariaMatch) {
    const a = ariaMatch[1];
    add(`[aria-label='${a}']`);
    add(`input[aria-label='${a}']`);
    add(`textarea[aria-label='${a}']`);
  }
  if (placeholderM) {
    const p = placeholderM[1];
    add(`[placeholder='${p}']`);
    add(`input[placeholder='${p}']`);
  }
  if (typeSearchM || /search/i.test(base)) {
    add("input[type='search']");
    add("input[name='q']");
    add("textarea[name='q']");
    add("[role='searchbox']");
    add("[aria-label='Search']");
    add("[aria-label='search']");
    add("input[title='Search']");
  }
  if (testidM) {
    add(`[data-testid='${testidM[1]}']`);
    add(`[data-qa='${testidM[1]}']`);
  }

  // Text-based button variants
  const hasTextMatch = base.match(/:has-text\((['"])(.*?)\1\)/i);
  const text = String(hasTextMatch?.[2] || "").trim();
  if (text) {
    const quoted = JSON.stringify(text);
    add(`button:has-text(${quoted})`);
    add(`[role='button']:has-text(${quoted})`);
    add(`a:has-text(${quoted})`);
    add(`text=${quoted}`);
  }

  return variants.slice(0, Math.max(1, Math.min(10, maxVariants * 2)));
}

function extractTargetKeywords(goal, selector) {
  const stopwords = new Set([
    "the", "and", "for", "with", "from", "that", "this", "into", "then", "your", "you", "about", "open", "click", "button", "link", "page", "card", "item", "select", "submit", "continue"
  ]);
  const seed = `${String(goal || "")} ${String(selector || "")}`
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]+/g, " ")
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length >= 3 && !stopwords.has(token));
  const deduped = [];
  const seen = new Set();
  for (const token of seed) {
    if (seen.has(token)) continue;
    seen.add(token);
    deduped.push(token);
    if (deduped.length >= 12) break;
  }
  return deduped;
}

function normalizeCqardsAnchors(cqards, viewport) {
  const width = Math.max(1, Number(viewport?.width || 1920));
  const height = Math.max(1, Number(viewport?.height || 1080));
  const anchors = (Array.isArray(cqards) ? cqards : [])
    .map((point, index) => ({
      id: index,
      x: clampNumber(point?.x, 0, width - 1),
      y: clampNumber(point?.y, 0, height - 1)
    }))
    .filter(point => point.x !== null && point.y !== null);
  return dedupePoints(anchors.map(point => ({ x: point.x, y: point.y })), 4)
    .map((point, index) => ({ id: index, x: point.x, y: point.y }));
}

function nearestAnchorForCandidate(candidate, anchors) {
  if (!anchors.length) return { anchor: null, distance: Number.POSITIVE_INFINITY };
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const anchor of anchors) {
    const dx = Number(candidate.cx) - Number(anchor.x);
    const dy = Number(candidate.cy) - Number(anchor.y);
    const distance = Math.hypot(dx, dy);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = anchor;
    }
  }
  return { anchor: best, distance: bestDistance };
}

function overlapScoreWithAnchor(candidate, anchor, anchorSize = 64) {
  if (!anchor) return 0;
  const half = anchorSize / 2;
  const ax1 = Number(anchor.x) - half;
  const ay1 = Number(anchor.y) - half;
  const ax2 = Number(anchor.x) + half;
  const ay2 = Number(anchor.y) + half;

  const bx1 = Number(candidate.left);
  const by1 = Number(candidate.top);
  const bx2 = Number(candidate.left) + Number(candidate.width);
  const by2 = Number(candidate.top) + Number(candidate.height);

  if (Number(anchor.x) >= bx1 && Number(anchor.x) <= bx2 && Number(anchor.y) >= by1 && Number(anchor.y) <= by2) {
    return 1;
  }

  const ix1 = Math.max(ax1, bx1);
  const iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const intersection = iw * ih;
  const area = Math.max(1, Number(candidate.width) * Number(candidate.height));
  return Math.max(0, Math.min(1, intersection / area));
}

function semanticMatchScore(candidate, keywords) {
  if (!keywords.length) return 0.5;
  const text = `${candidate.text || ""} ${candidate.aria || ""} ${candidate.selector || ""} ${candidate.href || ""}`.toLowerCase();
  let hits = 0;
  for (const keyword of keywords) {
    if (text.includes(keyword)) hits += 1;
  }
  return Math.max(0, Math.min(1, hits / keywords.length));
}

function linkRelevanceScore(candidate, keywords) {
  const href = String(candidate.href || "").toLowerCase();
  if (!href || !keywords.length) return 0;
  const hits = keywords.filter(keyword => href.includes(keyword)).length;
  return Math.max(0, Math.min(1, hits / Math.min(4, keywords.length)));
}

function adRiskScore(candidate) {
  const haystack = `${candidate.text || ""} ${candidate.href || ""} ${candidate.selector || ""} ${candidate.className || ""}`.toLowerCase();
  const risky = /(sponsored|promoted|advert|adservice|doubleclick|outbrain|taboola|affiliate|utm_)/.test(haystack);
  return risky ? 1 : 0;
}

async function buildFullPageClickMap(targetKeywords, cqardsAnchors) {
  const rawMap = await page.evaluate(() => {
    const vw = Math.max(1, window.innerWidth || 1920);
    const vh = Math.max(1, window.innerHeight || 1080);
    const nodes = Array.from(document.querySelectorAll("*"));

    const esc = value => {
      try { return CSS.escape(String(value || "")); } catch { return String(value || "").replace(/[^a-zA-Z0-9_-]/g, ""); }
    };

    const visible = (el, rect, style) => {
      if (!rect || rect.width < 2 || rect.height < 2) return false;
      if (!style || style.display === "none" || style.visibility === "hidden" || Number(style.opacity || "1") < 0.05) return false;
      if (style.pointerEvents === "none") return false;
      return rect.bottom > 0 && rect.right > 0 && rect.top < vh && rect.left < vw;
    };

    const buildSelector = el => {
      if (!el || el.nodeType !== 1) return "";
      const tag = (el.tagName || "").toLowerCase();
      const id = el.id ? `#${esc(el.id)}` : "";
      if (id) return id;

      const testId = el.getAttribute("data-testid") || el.getAttribute("data-qa") || "";
      if (testId) return `[data-testid='${String(testId).replace(/'/g, "\\'")}']`;

      const name = el.getAttribute("name") || "";
      if (name) return `${tag}[name='${String(name).replace(/'/g, "\\'")}']`;

      const aria = el.getAttribute("aria-label") || "";
      if (aria) return `${tag}[aria-label='${String(aria).slice(0, 80).replace(/'/g, "\\'")}']`;

      const href = tag === "a" ? (el.getAttribute("href") || "") : "";
      if (href && href.startsWith("#")) return `${tag}[href='${String(href).replace(/'/g, "\\'")}']`;

      let path = tag;
      let node = el;
      let depth = 0;
      while (node && node.parentElement && depth < 4) {
        const parent = node.parentElement;
        const siblings = Array.from(parent.children).filter(sib => sib.tagName === node.tagName);
        const idx = Math.max(1, siblings.indexOf(node) + 1);
        const part = `${(node.tagName || "").toLowerCase()}:nth-of-type(${idx})`;
        path = depth === 0 ? part : `${part} > ${path}`;
        if (parent.id) {
          path = `#${esc(parent.id)} > ${path}`;
          break;
        }
        node = parent;
        depth += 1;
      }
      return path;
    };

    return nodes.map((el, idx) => {
      const tag = (el.tagName || "").toLowerCase();
      const role = String(el.getAttribute("role") || "").toLowerCase();
      const onclick = el.getAttribute("onclick");
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const clickable = tag === "a" || tag === "button" || role === "button" || !!onclick || style.cursor === "pointer";
      if (!clickable) return null;
      if (!visible(el, rect, style)) return null;

      const text = (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 180);
      const href = tag === "a" ? (el.getAttribute("href") || "") : "";
      return {
        domIndex: idx,
        tag,
        role,
        selector: buildSelector(el),
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        cx: Math.round(rect.left + rect.width / 2),
        cy: Math.round(rect.top + rect.height / 2),
        text,
        href,
        aria: String(el.getAttribute("aria-label") || "").slice(0, 120),
        className: String(el.className || "").slice(0, 200),
        visible: true
      };
    }).filter(Boolean);
  }).catch(() => []);

  const viewport = await page.evaluate(() => ({
    width: Math.max(1, Math.round(window.innerWidth || 1920)),
    height: Math.max(1, Math.round(window.innerHeight || 1080))
  })).catch(() => ({ width: 1920, height: 1080 }));

  const anchors = normalizeCqardsAnchors(cqardsAnchors, viewport);
  const diagonal = Math.hypot(viewport.width, viewport.height) || 1;

  const scored = rawMap.map(candidate => {
    const { anchor, distance } = nearestAnchorForCandidate(candidate, anchors);
    const semantic = semanticMatchScore(candidate, targetKeywords);
    const overlap = overlapScoreWithAnchor(candidate, anchor);
    const distanceScore = anchors.length ? Math.max(0, Math.min(1, 1 - (distance / diagonal))) : 0.4;
    const link = linkRelevanceScore(candidate, targetKeywords);
    const visibility = candidate.visible ? 1 : 0;
    const adRisk = adRiskScore(candidate);

    const confidence = Math.max(0, Math.min(1,
      semantic * 0.42 +
      visibility * 0.16 +
      overlap * 0.18 +
      distanceScore * 0.16 +
      link * 0.12 -
      adRisk * 0.7
    ));

    return {
      ...candidate,
      nearestAnchor: anchor,
      nearestAnchorDistance: Number.isFinite(distance) ? Number(distance.toFixed(2)) : null,
      scoreBreakdown: {
        semantic: Number(semantic.toFixed(3)),
        visibility: Number(visibility.toFixed(3)),
        overlap: Number(overlap.toFixed(3)),
        distance: Number(distanceScore.toFixed(3)),
        link: Number(link.toFixed(3)),
        adRisk: Number(adRisk.toFixed(3))
      },
      confidence: Number(confidence.toFixed(4))
    };
  });

  scored.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.domIndex - b.domIndex;
  });

  const safeCandidates = scored.filter(candidate => candidate.scoreBreakdown.adRisk < 0.8);
  return {
    viewport,
    anchors,
    candidates: safeCandidates,
    allCandidates: scored
  };
}

async function captureInteractionSnapshot(selector = "", point = null) {
  return page.evaluate(({ selectorValue, pointValue }) => {
    const safeSelectorState = () => {
      if (!selectorValue) return { exists: false, visible: false, disabled: false, checked: false, value: "", text: "" };
      try {
        const el = document.querySelector(selectorValue);
        if (!el) return { exists: false, visible: false, disabled: false, checked: false, value: "", text: "" };
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const visible = rect.width > 1 && rect.height > 1 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0.05;
        return {
          exists: true,
          visible,
          disabled: !!el.disabled,
          checked: !!el.checked,
          value: String(el.value || "").slice(0, 120),
          text: String(el.innerText || el.textContent || "").trim().slice(0, 160)
        };
      } catch {
        return { exists: false, visible: false, disabled: false, checked: false, value: "", text: "" };
      }
    };

    const safePointFingerprint = () => {
      if (!pointValue || !Number.isFinite(Number(pointValue.x)) || !Number.isFinite(Number(pointValue.y))) return "";
      const x = Number(pointValue.x);
      const y = Number(pointValue.y);
      const el = document.elementFromPoint(x, y);
      if (!el) return "";
      const tag = String(el.tagName || "").toLowerCase();
      const id = el.id ? `#${String(el.id).slice(0, 80)}` : "";
      const cls = String(el.className || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).join(".");
      return `${tag}${id}${cls ? "." + cls : ""}`;
    };

    return {
      url: String(window.location.href || ""),
      title: String(document.title || ""),
      selector: safeSelectorState(),
      pointFingerprint: safePointFingerprint()
    };
  }, {
    selectorValue: String(selector || ""),
    pointValue: point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))
      ? { x: Number(point.x), y: Number(point.y) }
      : null
  }).catch(() => ({
    url: (() => { try { return page?.url?.() || "about:blank"; } catch { return "about:blank"; } })(),
    title: "",
    selector: { exists: false, visible: false, disabled: false, checked: false, value: "", text: "" },
    pointFingerprint: ""
  }));
}

function hasMeaningfulInteractionEffect(before, after) {
  if (!before || !after) return false;
  if (String(before.url || "") !== String(after.url || "")) return true;
  if (String(before.title || "") !== String(after.title || "")) return true;

  const bs = before.selector || {};
  const as = after.selector || {};
  if (bs.exists !== as.exists) return true;
  if (bs.visible !== as.visible) return true;
  if (bs.disabled !== as.disabled) return true;
  if (bs.checked !== as.checked) return true;
  if (String(bs.value || "") !== String(as.value || "")) return true;
  if (String(bs.text || "") !== String(as.text || "")) return true;

  if (String(before.pointFingerprint || "") !== String(after.pointFingerprint || "")) return true;
  return false;
}

async function waitForMeaningfulInteractionEffect(before, selector = "", point = null, timeoutMs = 1200) {
  const started = Date.now();
  while ((Date.now() - started) < timeoutMs) {
    const after = await captureInteractionSnapshot(selector, point);
    if (hasMeaningfulInteractionEffect(before, after)) {
      return { changed: true, after };
    }
    await page.waitForTimeout(160).catch(() => {});
  }
  const after = await captureInteractionSnapshot(selector, point);
  return { changed: hasMeaningfulInteractionEffect(before, after), after };
}

function isDynamicUiHot(visionSnap) {
  const changedFrames = Number(visionSnap?.changedFrames || 0);
  const unchangedFrames = Number(visionSnap?.unchangedFrames || 0);
  const signalState = String(visionSnap?.signal?.state || "").toLowerCase();
  const blocker = String(visionSnap?.signal?.blocker || "").toLowerCase();
  const focus = String(visionSnap?.signal?.next_focus || "").toLowerCase();
  const evidence = String(visionSnap?.signal?.evidence || "").toLowerCase();

  const mutationHeavy = changedFrames >= DYNAMIC_UI_CHANGED_FRAME_THRESHOLD &&
    changedFrames >= Math.max(1, Math.round(unchangedFrames * DYNAMIC_UI_CHANGE_RATIO));
  const signalHot = /blocked|uncertain/.test(signalState) && /(loading|spinner|popup|modal|updat|render|animat|transition)/.test(`${focus} ${evidence}`);
  const blockerHot = /(popup|loading|unknown)/.test(blocker) && changedFrames >= Math.max(4, DYNAMIC_UI_CHANGED_FRAME_THRESHOLD - 2);

  return mutationHeavy || signalHot || blockerHot;
}

async function getVisionClickPointsForSelector(goal, selector, models) {
  const screenshotB64 = await getVisionScreenshotB64({ broadcastImage: false, writeFile: false });
  const viewport = await page.evaluate(() => ({
    width: Math.max(1, Math.round(window.innerWidth || 1920)),
    height: Math.max(1, Math.round(window.innerHeight || 1080))
  })).catch(() => ({ width: 1920, height: 1080 }));

  const promptText = `Goal: "${goal}"
Target selector to click: ${selector}
Viewport size: ${viewport.width}x${viewport.height}

Using the screenshot only, locate the most likely visual target for the selector and return JSON only:
{
  "reason": "short reason",
  "points": [
    { "x": 0, "y": 0 },
    { "x": 0, "y": 0 },
    { "x": 0, "y": 0 },
    { "x": 0, "y": 0 },
    { "x": 0, "y": 0 },
    { "x": 0, "y": 0 },
    { "x": 0, "y": 0 },
    { "x": 0, "y": 0 },
    { "x": 0, "y": 0 },
    { "x": 0, "y": 0 }
  ]
}

Rules:
- Coordinates use a top-left origin.
- Return REAL candidate click points from visible UI only (no synthetic offsets).
- Spread across plausible hotspots for this target so at least one click lands if the UI is shifting.
- Keep points inside viewport bounds.
- Return exactly ${VISION_CLICK_CANDIDATE_COUNT} points.`;

  const raw = await callVisionAI(screenshotB64, promptText, 280, models.vision);
  const parsed = safeParseJSON(raw);
  const points = Array.isArray(parsed?.points) ? parsed.points : [];
  return makePointCloud(points, viewport, VISION_CLICK_CANDIDATE_COUNT);
}

async function expandVisionAssistedClicks(planActions, goal, models, options = {}) {
  const expanded = [];
  const visionOnlyClickMode = !!options.visionOnlyClickMode;
  for (const item of planActions || []) {
    const action = item?.action;
    const selector = item?.params?.selector;
    const isSelectorClick = !!selector && (action === "click" || action === "dblclick");
    if (!isSelectorClick) {
      expanded.push(item);
      continue;
    }

    try {
      const points = await getVisionClickPointsForSelector(goal, selector, models);
      const selectorVariants = buildSelectorVariants(selector, HYBRID_SELECTOR_VARIANTS);
      const hybridAction = action === "dblclick" ? "hybridDblclick" : "hybridClick";
      stepLogMsg(`Hybrid click strategy: ${selector} -> cqards=${points.length}, selectors=${selectorVariants.length}${visionOnlyClickMode ? " (dynamic-ui mode)" : ""}`);
      expanded.push({
        action: hybridAction,
        params: {
          selector,
          cqards: points,
          selectorVariants
        }
      });
    } catch (err) {
      think(`Vision click assist skipped for ${selector}: ${err.message}`);
      expanded.push({
        action: action === "dblclick" ? "hybridDblclick" : "hybridClick",
        params: {
          selector,
          cqards: [],
          selectorVariants: buildSelectorVariants(selector, HYBRID_SELECTOR_VARIANTS)
        }
      });
    }
  }
  return expanded;
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT: PLANNER  (the "genius" brain)
// ─────────────────────────────────────────────────────────────────────────────
async function planNextSteps(goal, state, visionFeedback, taskLog, plannerHistory, stuck, failures, models, peerSignals = {}) {
  status("Planner reasoning...");
  const learningContext = buildLearningContext(goal, state);
  const peerReasoner = peerSignals?.reasoner || {};
  const peerSupervisor = peerSignals?.supervisor || {};
  const peerResearch = peerSignals?.research || {};

const userMsg = `Goal: "${goal}"

Current URL: ${state.url}
Page Title:  ${state.title}
Active tab: ${state.tabs?.activeIndex ?? 0} / ${state.tabs?.count ?? 1}

Open tabs:
${(state.tabs?.urls || []).map((tabUrl, idx) => `  [${idx}] ${tabUrl}`).join("\n") || "  (single tab)"}

─── VISIBLE INPUTS ─ USE SELECTOR COLUMN DIRECTLY (pre-computed, reliable) ───
${state.inputs?.filter(i => i.visible).map(i =>
  `  ✔ SELECTOR: "${i.selector}" | ${i.tag}[type=${i.type || "text"}] | name="${i.name}" | aria="${i.ariaLabel}" | placeholder="${i.placeholder}" | center=(${i.cx},${i.cy})`
).join("\n") || "  (no visible inputs — try scrollIntoView, reload, or check state)"}

Hidden inputs (scrollIntoView first):
${state.inputs?.filter(i => !i.visible).slice(0, 5).map(i =>
  `  □ SELECTOR: "${i.selector}" | ${i.tag}[type=${i.type || "text"}]`
).join("\n") || "  (none)"}
──────────────────────────────────────────────────────────────

Visible buttons:
${state.buttons?.filter(b => b.visible).map(b => `  [VISIBLE] "${b.text}"${b.selector ? ` selector="${b.selector}"` : ""}${b.cx ? ` center=(${b.cx},${b.cy})` : ""}`).join("\n") || "  (none visible)"}

Visible links (sample):
${state.links?.slice(0,8).map(l => `  "${l.text}" → ${l.href}`).join("\n") || "  (none)"}

Vision's analysis:
${visionFeedback || "(first step — no prior action)"}

Peer signals (PRIORITY INPUTS — trust these over weak guesses):
- Reasoner instinct: ${peerReasoner.instinct || "(none)"}
- Reasoner risk: ${peerReasoner.risk || "(none)"}
- Reasoner focus: ${peerReasoner.next_focus || "(none)"}
- Reasoner caution: ${peerReasoner.caution || "(none)"}
- Last supervisor gate: ${peerSupervisor.decision ? `${String(peerSupervisor.decision).toUpperCase()} score=${Number(peerSupervisor.score || 0).toFixed(2)} reason=${peerSupervisor.reason || "n/a"}` : "(none yet)"}
- Research hints count: ${Number(peerResearch.hintCount || 0)}

Page text (3000 chars):
${state.text}

Step history (last 10):
${taskLog.slice(-10).join("\n") || "none"}

Consecutive failures: ${failures}
${stuck ? "⚠️  STUCK LOOP detected — last actions identical. You MUST use a completely different strategy now." : ""}
${failures >= 2 ? "⚠️  Multiple failures — switch selector family, try submitForm(), or navigate directly to the URL." : ""}

Learning log context:
${learningContext}

REMINDER: Never click [type='submit'] — use submitForm() or press(inputSelector,'Enter') instead.
REMINDER: For search bars, use fill(SELECTOR, text) then submitForm(SELECTOR). Use SELECTOR from the inputs table above.
REMINDER: If peer signals conflict with your default guess, follow peer signals first.

Output JSON only.`;

  plannerHistory.push({ role: "user", content: userMsg });
  // Keep the conversation bounded BEFORE sending — see trimHistory's doc
  // comment for why this matters (context-window overflow looks like a
  // confusing "Bad input" error too, distinct from the content-shape bug).
  const bounded = trimHistory(plannerHistory, MAX_PLANNER_HISTORY_MESSAGES);

  const normalizePlannerResponse = (rawPlan, fallbackReason = "") => {
    const plan = rawPlan && typeof rawPlan === "object" ? { ...rawPlan } : {};
    const parsedConfidence = Number(plan.confidence);
    const confidenceMissing = !Number.isFinite(parsedConfidence);
    plan.confidence = confidenceMissing
      ? 0
      : Math.max(0, Math.min(100, Math.round(parsedConfidence)));
    plan._confidenceMissing = confidenceMissing;
    plan.reasoning = String(plan.reasoning || fallbackReason || "Planner returned no reasoning. Using conservative recovery.")
      .trim()
      .slice(0, 1200);
    if (confidenceMissing) {
      plan.reasoning = (`Confidence missing from planner output. ${plan.reasoning}`).slice(0, 1200);
    }
    plan.done = !!plan.done;
    plan.actions = Array.isArray(plan.actions)
      ? plan.actions.filter(item => item && typeof item === "object" && item.action).slice(0, 3)
      : [];
    return plan;
  };

  try {
    const raw    = await callCFAI(models.planner, bounded, 1500, 2, getRuntimeTemperature(models));
    const parsed = safeParseJSON(raw);
    if (!parsed) {
      plannerHistory.push({ role: "assistant", content: raw });
      think("Planner: parse failed — retrying with simpler prompt");
      const fixed = await callCFAI(models.reasoner, [
        { role: "system", content: "Fix this malformed JSON action plan. Output ONLY valid JSON with reasoning, confidence, done, actions fields." },
        { role: "user",   content: raw }
      ], 800, 2, getRuntimeTemperature(models));
      const fixedParsed = safeParseJSON(fixed);
      if (!fixedParsed) {
        return normalizePlannerResponse(
          { reasoning: "Planner parse failed after repair.", done: false, actions: [], confidence: 0, _parseFailed: true },
          "Planner parse failed after repair."
        );
      }
      return normalizePlannerResponse(fixedParsed, "Planner output repaired from malformed JSON.");
    }
    plannerHistory.push({ role: "assistant", content: raw });
    const normalizedParsed = normalizePlannerResponse(parsed, "Planner response had missing fields.");
    const alignment = evaluatePeerAlignment(normalizedParsed, peerSignals);
    think(`Planner [${normalizedParsed.confidence}% | peer ${Math.round(alignment.score * 100)}%]: ${(normalizedParsed.reasoning || "").slice(0, 300)}`);
    broadcast("peer_alignment", {
      score: Number(alignment.score.toFixed(2)),
      alignment: Number(alignment.alignment.toFixed(2)),
      verdict: alignment.verdict,
      matched: alignment.matched,
      total: alignment.total,
      hints: alignment.hints,
      summary: `${alignment.verdict.toUpperCase()} peer signals (${alignment.matched}/${alignment.total || 0})`
    });
    return normalizedParsed;
  } catch (err) {
    errLog("Planner error: " + err.message);
    throw err;
  }
}

// The Planner's system prompt — defined once, pushed once at task start.
// (Pulled out as its own constant so it's easy to find/edit, and so it's
// unambiguous that this is the ONLY place that ever sets plannerHistory[0].)
const PLANNER_SYSTEM_PROMPT = `You are the Planner for an autonomous browser agent.
Be concise, reliable, and progress-focused.

Allowed actions:
goto, reload, goBack, goForward,
click, dblclick, hover, fill, type, press, check, uncheck, selectOption, scrollIntoView,
submitForm, keyboardType, keyboardPress, mouseMove, mouseClick, mouseWheel,
waitForSelector, waitForVisible, waitForTimeout, waitForLoadState, waitForURLChange,
getText, getAttribute, getAllText, isVisible, elementExists, evaluate, screenshot,
openNewTab, switchToTab, listTabs, closeCurrentTab,
pinchListTickets, pinchSendTicketMessage, pinchListWebhooks, pinchListWebhookTypes.

Hard rules:
1) JSON only output.
2) Max 3 atomic actions.
3) Never use waitForLoadState("complete"); only load|domcontentloaded|networkidle|commit.
4) For search boxes: fill(selector,text) then submitForm(selector) or press(selector,"Enter").
5) Never click hidden/generic submit controls when submitForm can be used.
6) Do not repeat the same failing action+selector pair.
7) If vision already shows required content, prefer extraction/done over extra clicks.
8) If peer/supervisor signals conflict with your default guess, prioritize peer/supervisor.

Selector priority:
text > aria > data-testid/name/id > type-visible > js/evaluate fallback.

Creativity policy (small, safe):
- You may try one novel but low-risk variation per step (alternate selector family, nearby semantic link, or direct results URL) if prior approach is stalling.
- Keep creativity bounded: no speculative navigation to unrelated domains.

Output schema:
{
  "reasoning": "short tactical reason",
  "confidence": 0-100,
  "done": false,
  "actions": [{ "action": "name", "params": {} }]
}`;

const REASONER_INSTINCT_PROMPT = `You are the fast instinct layer.
Give short, operational guidance before planning.

Output JSON only:
{
  "instinct": "one concrete sentence",
  "risk": "low|medium|high",
  "next_focus": "short target/action family",
  "caution": "one likely failure to avoid"
}

Rules:
1) No narration, no long explanations.
2) If page is blocked or uncertain, say it clearly.
3) If vision already contains needed answer, advise extract/finish.
4) If same selector/action keeps failing, advise a different selector family or submit path.
5) Allow one small creative suggestion only when risk is low and it directly supports the goal.`;

// ─────────────────────────────────────────────────────────────────────────────
// AGENT: EXECUTOR
// ─────────────────────────────────────────────────────────────────────────────
async function runActionWithFallback(item, goal, models) {
  const action = item?.action;
  const params = { ...(item?.params || {}) };
  if (action === "goto" && params?.url) {
    let normalizedUrl = String(params.url).trim().replace(/[\]\[)\("'`]+$/g, "").replace(/[.,;!?]+$/g, "");
    if (normalizedUrl && !/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = `https://${normalizedUrl}`;
    }
    params.url = normalizedUrl;
  }
  const currentUrl = (() => {
    try { return page?.url?.() || "about:blank"; } catch { return "about:blank"; }
  })();
  const host = getHostFromUrl(currentUrl);
  const signature = buildActionSignature(action, params);
  const hints = getActionHints({ action, params, currentUrl });

  // Every action references the learning log before execution.
  if (hints.attempts > 0) {
    think(`Learning check for ${signature}: attempts=${hints.attempts}, ok=${hints.successes}, fail=${hints.failures}`);
  }

  function recordOutcome(statusValue, details = {}) {
    appendLearningEvent({
      kind: "action",
      goal: String(goal || "").slice(0, 240),
      host,
      url: currentUrl,
      action,
      selector: params?.selector || "",
      signature,
      status: statusValue,
      ...details
    });

    const actionDone = [
      String(action || "unknown"),
      params?.selector ? `selector=${String(params.selector).slice(0, 180)}` : "",
      details?.result ? `result=${String(details.result).slice(0, 180)}` : "",
      details?.error ? `error=${String(details.error).slice(0, 180)}` : ""
    ].filter(Boolean).join(" | ");

    saveActionMemory({
      task: String(goal || ""),
      prompt: String(goal || ""),
      keywords: normalizeKeywordList([
        goal,
        action,
        params?.selector,
        signature,
        details?.path,
        details?.error,
        currentUrl
      ]),
      action_done: actionDone,
      successful: statusValue === "ok",
      prompt_successful: false,
      url: currentUrl,
      other_data: {
        status: statusValue,
        host,
        action,
        selector: params?.selector || "",
        signature,
        details
      }
    });
  }

  // Pseudo-actions for multi-tab missions
  if (action === "openNewTab") {
    const newPage = await context.newPage();
    page = newPage;
    if (params?.url) {
      await page.goto(String(params.url), { waitUntil: "domcontentloaded" });
    }
    const resultText = `opened tab ${context.pages().length - 1}`;
    recordOutcome("ok", { result: resultText, path: "pseudo" });
    return { action, status: "ok", result: resultText };
  }

  if (action === "switchToTab") {
    const pages = context.pages();
    const tabParams = normalizeTabTargetParams(params);
    let targetIndex = Number.isInteger(tabParams.index) ? tabParams.index : null;
    if (targetIndex === null && tabParams.urlIncludes) {
      targetIndex = pages.findIndex(p => {
        try { return p.url().includes(String(tabParams.urlIncludes)); } catch { return false; }
      });
    }
    if (targetIndex === null || targetIndex < 0 || targetIndex >= pages.length) {
      recordOutcome("error", { error: `invalid tab target ${JSON.stringify(tabParams || {})}`, path: "pseudo" });
      throw new Error(`switchToTab failed: invalid index/urlIncludes (${JSON.stringify(tabParams || {})})`);
    }
    page = pages[targetIndex];
    await page.bringToFront().catch(() => {});
    const resultText = `switched to tab ${targetIndex}`;
    recordOutcome("ok", { result: resultText, path: "pseudo" });
    return { action, status: "ok", result: resultText };
  }

  if (action === "closeCurrentTab") {
    const pages = context.pages();
    if (pages.length <= 1) {
      recordOutcome("ok", { result: "single tab, skip close", path: "pseudo" });
      return { action, status: "ok", result: "single tab, skip close" };
    }
    const currentIndex = pages.findIndex(p => p === page);
    await page.close();
    const remaining = context.pages();
    page = remaining[Math.max(0, Math.min(currentIndex - 1, remaining.length - 1))] || remaining[0];
    await page.bringToFront().catch(() => {});
    const resultText = `closed tab ${currentIndex}`;
    recordOutcome("ok", { result: resultText, path: "pseudo" });
    return { action, status: "ok", result: resultText };
  }

  if (action === "listTabs") {
    const pages = context.pages();
    const items = pages.map((p, idx) => {
      let currentUrl = "about:blank";
      try { currentUrl = p.url(); } catch {}
      return `${idx}:${currentUrl}`;
    });
    const resultText = items.join(" | ");
    recordOutcome("ok", { result: resultText, path: "pseudo" });
    return { action, status: "ok", result: resultText };
  }

  if (action === "pinchListTickets") {
    const tickets = await pinchListTickets();
    const resultText = `pinch tickets: ${tickets.length}`;
    recordOutcome("ok", { result: resultText, path: "pseudo-pinch" });
    return { action, status: "ok", result: resultText, data: tickets };
  }

  if (action === "pinchSendTicketMessage") {
    const ticketId = String(params?.ticketId || params?.id || "").trim();
    const body = String(params?.body || params?.message || "").trim();
    if (!ticketId || !body) {
      const missing = !ticketId ? "ticketId" : "body";
      recordOutcome("error", { error: `${missing} required`, path: "pseudo-pinch" });
      return { action, status: "error", error: `${missing} required` };
    }
    const sent = await pinchSendTicketMessage(ticketId, body);
    const resultText = `pinch message sent to ticket ${ticketId}`;
    recordOutcome("ok", { result: resultText, path: "pseudo-pinch" });
    return { action, status: "ok", result: resultText, data: sent };
  }

  if (action === "pinchListWebhooks") {
    const webhooks = await pinchListWebhooks();
    const resultText = `pinch webhooks: ${webhooks.length}`;
    recordOutcome("ok", { result: resultText, path: "pseudo-pinch" });
    return { action, status: "ok", result: resultText, data: webhooks };
  }

  if (action === "pinchListWebhookTypes") {
    const types = await pinchListWebhookTypes();
    const resultText = `pinch webhook types: ${types.length}`;
    recordOutcome("ok", { result: resultText, path: "pseudo-pinch" });
    return { action, status: "ok", result: resultText, data: types };
  }

  // If the action has repeatedly failed on this host+selector, bias to safer fallback first.
  if (action === "click" && params?.selector && hints.failures >= 3 && hints.successes === 0) {
    try {
      think(`Learning fast-path: skipping direct click and trying submitForm first for ${params.selector}`);
      await actions.submitForm({ page, context, selector: params.selector });
      recordOutcome("ok", { result: "learning submitForm fast-path", path: "learning-fast-path" });
      return { action, status: "ok", result: "learning submitForm fast-path" };
    } catch (err) {
      // Continue into the normal ladder below.
      think(`Learning fast-path failed, reverting to normal ladder: ${err.message}`);
    }
  }

  if (action === "mouseClick" && Number.isFinite(Number(params?.x)) && Number.isFinite(Number(params?.y))) {
    try {
      await humanClick(page, Number(params.x), Number(params.y));
      const resultText = `human-click(${Math.round(Number(params.x))},${Math.round(Number(params.y))})`;
      recordOutcome("ok", { result: resultText, path: "primary-human-pointer" });
      return { action, status: "ok", result: resultText };
    } catch (err) {
      errLog(`${action} human-click failed: ${err.message}`);
    }
  }

  if (action === "mouseDblclick" && Number.isFinite(Number(params?.x)) && Number.isFinite(Number(params?.y))) {
    try {
      await humanMove(page, Number(params.x), Number(params.y), { kind: "predblclick" });
      await page.mouse.dblclick(Number(params.x), Number(params.y), { delay: 60 + Math.random() * 110 });
      const viewport = await page.evaluate(() => ({
        width: Math.max(1, Math.round(window.__puppeterrViewportWidth || window.innerWidth || 1920)),
        height: Math.max(1, Math.round(window.__puppeterrViewportHeight || window.innerHeight || 1080))
      })).catch(() => ({ width: 1920, height: 1080 }));
      broadcast("mouse_click", {
        x: Math.round(Number(params.x)),
        y: Math.round(Number(params.y)),
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        kind: "dblclick"
      });
      const resultText = `human-dblclick(${Math.round(Number(params.x))},${Math.round(Number(params.y))})`;
      recordOutcome("ok", { result: resultText, path: "primary-human-pointer" });
      return { action, status: "ok", result: resultText };
    } catch (err) {
      errLog(`${action} human-dblclick failed: ${err.message}`);
    }
  }

  // Primary attempt
  try {
    const result = await actions[action]({ page, context, ...(params || {}) });
    think(`✓ ${action}`);
    const resultText = String(result ?? "").slice(0, 200);
    recordOutcome("ok", { result: resultText, path: "primary" });
    return { action, status: "ok", result: resultText };
  } catch (primaryErr) {
    errLog(`${action} failed: ${primaryErr.message}`);

    if (action === "goto" && params?.url) {
      try {
        think(`Fallback: retry goto once -> ${params.url}`);
        await sleep(900);
        await actions.goto({ page, context, url: String(params.url) });
        recordOutcome("ok", { result: "goto retry success", path: "fallback-goto-retry" });
        return { action, status: "ok", result: "goto retry success" };
      } catch {}
    }

    // Fallback ladder for click failures
    if (action === "click" && params?.selector) {
      const sel = params.selector;

      // Fallback 1: scrollIntoView then click
      try {
        think(`Fallback 1: scroll+click on ${sel}`);
        await actions.scrollIntoView({ page, selector: sel });
        await sleep(300);
        await actions.click({ page, context, selector: sel });
        recordOutcome("ok", { result: "scroll-click fallback", path: "fallback-scroll-click" });
        return { action, status: "ok", result: "scroll-click fallback" };
      } catch {}

      // Fallback 2: submitForm (works for search/form submit buttons)
      try {
        think(`Fallback 2: submitForm on ${sel}`);
        await actions.submitForm({ page, context, selector: sel });
        recordOutcome("ok", { result: "submitForm fallback", path: "fallback-submit" });
        return { action, status: "ok", result: "submitForm fallback" };
      } catch {}

      // Fallback 3: press Enter on selector (input fields)
      try {
        think(`Fallback 3: Enter keypress on ${sel}`);
        await page.press(sel, "Enter");
        recordOutcome("ok", { result: "Enter-key fallback", path: "fallback-enter" });
        return { action, status: "ok", result: "Enter-key fallback" };
      } catch {}

      // Fallback 4: JS .click()
      try {
        think(`Fallback 4: JS click on ${sel}`);
        await page.evaluate(selector => {
          const el = document.querySelector(selector);
          if (el) el.click();
          else throw new Error("not found");
        }, sel);
        recordOutcome("ok", { result: "js-evaluate fallback", path: "fallback-js-click" });
        return { action, status: "ok", result: "js-evaluate fallback" };
      } catch {}
    }

    recordOutcome("error", { error: primaryErr.message, path: "primary" });
    return { action, status: "error", error: primaryErr.message };
  }
}

async function executeActionPlan(plan, goal, models, throttle = {}, supervisorContext = null) {
  const results = [];
  const actionPlan = await expandVisionAssistedClicks(plan.actions || [], goal, models, {
    visionOnlyClickMode: !!throttle.visionOnlyClickMode
  });
  const pseudoActions = new Set([
    "openNewTab", "switchToTab", "closeCurrentTab", "listTabs",
    "pinchListTickets", "pinchSendTicketMessage", "pinchListWebhooks", "pinchListWebhookTypes",
    "hybridClick", "hybridDblclick"
  ]);
  const domQuietActions = new Set(["click", "dblclick", "hover", "type", "fill", "press", "check", "uncheck", "selectOption", "scrollIntoView", "submitForm"]);
  const pacingMultiplier = Math.max(0.5, Number(throttle.pacingMultiplier || 1));
  const preActionIdleMs = Math.max(0, Number(throttle.preActionIdleMs || 0));
  const burstLimit = Math.max(1, Number(throttle.burstLimit || Number.POSITIVE_INFINITY));
  const microBreakMs = Math.max(0, Number(throttle.microBreakMs || 0));
  const navigationCooldownMs = Math.max(0, Number(throttle.navigationCooldownMs || 0));
  const navigationCooldownByHost = throttle.navigationCooldownByHost instanceof Map ? throttle.navigationCooldownByHost : null;
  let burstCount = 0;

  for (let actionIndex = 0; actionIndex < actionPlan.length; actionIndex++) {
    const rawItem = actionPlan[actionIndex];
    const item = normalizeActionItem(rawItem);
    const { action, params } = item;
    if (!action || (!actions[action] && !pseudoActions.has(action))) {
      errLog(`Unknown action: "${action}"`);
      results.push({ action, status: "error", error: `Unknown action: ${action}` });
      continue;
    }

    const actionGate = evaluateSupervisorActionGate(action, params, supervisorContext || {}, actionIndex);
    if (actionGate.severity === "warn") {
      broadcast("supervisor", {
        msg: `⚠️ ${actionGate.reason}`,
        decision: "warn",
        action,
        reason: actionGate.reason,
        step: Number(supervisorContext?.step || 0),
        score: Number.isFinite(Number(supervisorContext?.score)) ? Number(supervisorContext.score.toFixed(2)) : null,
        detectionType: actionGate.detectionType
      });
    }
    if (!actionGate.allow) {
      const blockedMsg = `🛑 ${actionGate.reason}`;
      broadcast("supervisor", {
        msg: blockedMsg,
        decision: "blocked",
        action,
        reason: actionGate.reason,
        step: Number(supervisorContext?.step || 0),
        score: Number.isFinite(Number(supervisorContext?.score)) ? Number(supervisorContext.score.toFixed(2)) : null,
        detectionType: actionGate.detectionType
      });
      think(blockedMsg);
      results.push({ action, status: "blocked", error: actionGate.reason });
      continue;
    }

    if (action === "goto" && params?.url && navigationCooldownByHost && navigationCooldownMs > 0) {
      const gotoHost = getHostFromUrl(String(params.url));
      const lastAt = Number(navigationCooldownByHost.get(gotoHost) || 0);
      const elapsed = Date.now() - lastAt;
      if (lastAt && elapsed < navigationCooldownMs) {
        const waitMs = navigationCooldownMs - elapsed;
        think(`Navigation cooldown on ${gotoHost || "unknown-host"}: waiting ${waitMs}ms to avoid rapid reload patterns.`);
        await sleepLikeHuman(waitMs, page);
      }
      navigationCooldownByHost.set(gotoHost, Date.now());
    }

    if (preActionIdleMs > 0) {
      const preDelay = Math.round(preActionIdleMs * (0.8 + Math.random() * 0.5));
      await sleepLikeHuman(preDelay, page);
    }

    if (domQuietActions.has(action)) {
      await waitForDomQuiet(page, { quietMs: 260, timeoutMs: 2000 });
    }

    if (action === "hybridClick" || action === "hybridDblclick") {
      const baseSelector = String(params?.selector || "").trim();
      const cqards = Array.isArray(params?.cqards) ? params.cqards.slice(0, VISION_CLICK_CANDIDATE_COUNT) : [];
      const selectorVariants = Array.isArray(params?.selectorVariants)
        ? params.selectorVariants.slice(0, HYBRID_SELECTOR_VARIANTS)
        : buildSelectorVariants(baseSelector, HYBRID_SELECTOR_VARIANTS);
      const pointerAction = action === "hybridDblclick" ? "mouseDblclick" : "mouseClick";
      const selectorAction = action === "hybridDblclick" ? "dblclick" : "click";
      const targetKeywords = extractTargetKeywords(goal, baseSelector);
      const clickMap = await buildFullPageClickMap(targetKeywords, cqards);
      const rankedCandidates = clickMap.candidates.slice(0, Math.max(1, HYBRID_SELECTOR_VARIANTS * 2));

      stepLogMsg(`Fusion click sweep: selector=${baseSelector || "(none)"}, clickable=${clickMap.allCandidates.length}, safe=${clickMap.candidates.length}, anchors=${clickMap.anchors.length}.`);

      if (!rankedCandidates.length) {
        errLog(`Fusion click found no safe candidates for ${baseSelector || "(none)"}`);
        results.push({ action, status: "error", error: `fusion click found no safe candidates for ${baseSelector || "(none)"}` });
        break;
      }

      let fusionSuccess = null;
      const fusionAttempts = [];

      for (const candidate of rankedCandidates) {
        const selectorLadder = [candidate.selector, ...selectorVariants].filter(Boolean);
        const nearestAnchor = candidate.nearestAnchor || clickMap.anchors[0] || null;

        for (const selectorCandidate of selectorLadder) {
          try {
            const result = await actions[selectorAction]({ page, context, selector: selectorCandidate });
            fusionSuccess = { candidate, method: "selector", selector: selectorCandidate, result: String(result || "") };
            fusionAttempts.push({ method: "selector", selector: selectorCandidate, status: "ok" });
            break;
          } catch (err) {
            fusionAttempts.push({ method: "selector", selector: selectorCandidate, status: "error", error: String(err?.message || err) });
          }
        }
        if (fusionSuccess) break;

        try {
          const result = await actions[pointerAction]({ page, context, x: candidate.cx, y: candidate.cy });
          fusionSuccess = { candidate, method: "bbox-center", x: candidate.cx, y: candidate.cy, result: String(result || "") };
          fusionAttempts.push({ method: "bbox-center", x: candidate.cx, y: candidate.cy, status: "ok" });
          break;
        } catch (err) {
          fusionAttempts.push({ method: "bbox-center", x: candidate.cx, y: candidate.cy, status: "error", error: String(err?.message || err) });
        }

        if (nearestAnchor) {
          try {
            const result = await actions[pointerAction]({ page, context, x: nearestAnchor.x, y: nearestAnchor.y });
            fusionSuccess = { candidate, method: "cqards-anchor", x: nearestAnchor.x, y: nearestAnchor.y, result: String(result || "") };
            fusionAttempts.push({ method: "cqards-anchor", x: nearestAnchor.x, y: nearestAnchor.y, status: "ok" });
            break;
          } catch (err) {
            fusionAttempts.push({ method: "cqards-anchor", x: nearestAnchor.x, y: nearestAnchor.y, status: "error", error: String(err?.message || err) });
          }
        }

        for (const selectorCandidate of selectorLadder) {
          try {
            await actions.scrollIntoView({ page, context, selector: selectorCandidate });
            const result = await actions[selectorAction]({ page, context, selector: selectorCandidate });
            fusionSuccess = { candidate, method: "scroll-retry", selector: selectorCandidate, result: String(result || "") };
            fusionAttempts.push({ method: "scroll-retry", selector: selectorCandidate, status: "ok" });
            break;
          } catch (err) {
            fusionAttempts.push({ method: "scroll-retry", selector: selectorCandidate, status: "error", error: String(err?.message || err) });
          }
        }
        if (fusionSuccess) break;
      }

      if (fusionSuccess) {
        const summary = `${fusionSuccess.method} score=${fusionSuccess.candidate.confidence} selector=${fusionSuccess.candidate.selector || "(none)"}`;
        status(`Fusion click success: ${summary}`);
        results.push({ action, status: "ok", result: summary, attempts: fusionAttempts.length });
      } else {
        errLog(`Fusion click exhausted for ${baseSelector || "(none)"}`);
        results.push({ action, status: "error", error: `fusion click exhausted for ${baseSelector || "(none)"}`, attempts: fusionAttempts.length });
        break;
      }
      burstCount++;
      const actionPause = Math.max(60, Math.round(ACTION_PACING_DELAY_MS * pacingMultiplier));
      await sleepLikeHuman(actionPause, page);
      continue;
    }

    status(`${action}(${JSON.stringify(params || {}).slice(0, 60)})`);
    const result = await runActionWithFallback(item, goal, models);
    results.push(result);
    burstCount++;

    const actionPause = Math.max(60, Math.round(ACTION_PACING_DELAY_MS * pacingMultiplier));
    await sleepLikeHuman(actionPause, page);

    if (Number.isFinite(burstLimit) && burstCount >= burstLimit && microBreakMs > 0) {
      await sleepLikeHuman(microBreakMs, page);
      burstCount = 0;
    }
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT: REASONER — final answer + memory
// ─────────────────────────────────────────────────────────────────────────────
async function summarizeResult(goal, state, taskLog, visionFeedback, completed, models) {
  status("Reasoner composing answer...");
  try {
    const raw = await callCFAI(models.reasoner, [{
      role: "user",
      content: `Goal: "${goal}"
Result: ${completed ? "COMPLETED" : "INCOMPLETE"}
Final URL: ${state.url}
Final title: ${state.title}
Vision last saw: ${visionFeedback ? visionFeedback.slice(0, 500) : "(none)"}
Steps taken: ${taskLog.join("\n")}

Write a natural, intelligent, specific answer (2-6 sentences).
If completed: report exactly what you found/did with specific details (numbers, names, URLs, text).
If incomplete: explain honestly what happened and what would be needed to complete it.
Output ONLY the answer — no JSON, no markdown, no headers.`
    }], 600, 2, getRuntimeTemperature(models));
    return stripThinking(raw);
  } catch (err) {
    return completed
      ? `Completed "${goal}". Check view.png for the result.`
      : `Could not fully complete "${goal}". Last URL: ${state.url}`;
  }
}

// Secondary completion guard: if the planner misses done:true, verify using
// current page state + vision summary so successful runs can stop early.
async function verifyGoalCompletion(goal, state, visionFeedback, taskLog, models) {
  try {
    const raw = await callCFAI(models.reasoner, [
      {
        role: "system",
        content: "Decide if the user's browser task is already complete. Reply with JSON only: {\"done\":true|false,\"reason\":\"short reason\"}."
      },
      {
        role: "user",
        content: `Goal: "${goal}"
Current URL: ${state.url}
Current title: ${state.title}
Vision summary: ${visionFeedback || "(none)"}
Recent step log:
${taskLog.slice(-6).join("\n") || "(none)"}

Mark done=true only when there is clear evidence the goal is satisfied.`
      }
    ], 220, 1, getRuntimeTemperature(models));

    const parsed = safeParseJSON(raw);
    return {
      done: !!(parsed && parsed.done === true),
      reason: (parsed && parsed.reason) ? String(parsed.reason) : ""
    };
  } catch {
    return { done: false, reason: "" };
  }
}

async function getReasonerInstinct(goal, state, visionFeedback, taskLog, models) {
  try {
    const raw = await callCFAI(models.reasoner, [
      {
        role: "system",
        content: REASONER_INSTINCT_PROMPT
      },
      {
        role: "user",
        content: `Goal: "${goal}"
Current URL: ${state.url}
Current title: ${state.title}
Vision notes: ${visionFeedback || "(none)"}
Recent step log:
${taskLog.slice(-6).join("\n") || "(none)"}

Return the instinct JSON now.`
      }
    ], 220, 1, getRuntimeTemperature(models));

    const parsed = safeParseJSON(raw);
    if (parsed) {
      return {
        instinct: stripThinking(String(parsed.instinct || "")).slice(0, 400) || "Focus on the current page state.",
        risk: ["low", "medium", "high"].includes(String(parsed.risk || "").toLowerCase())
          ? String(parsed.risk || "").toLowerCase()
          : "medium",
        next_focus: stripThinking(String(parsed.next_focus || "")).slice(0, 200) || "current page",
        caution: stripThinking(String(parsed.caution || "")).slice(0, 280) || "keep the next step small"
      };
    }
    const fallback = stripThinking(raw);
    return {
      instinct: fallback.slice(0, 400) || "Focus on the current page state.",
      risk: "medium",
      next_focus: "current page",
      caution: "keep the next step small"
    };
  } catch {
    return {
      instinct: "Focus on the current page state.",
      risk: "medium",
      next_focus: "current page",
      caution: "keep the next step small"
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN TASK LOOP
// ─────────────────────────────────────────────────────────────────────────────
function detectStuck(log) {
  if (log.length < 4) return false;
  const last4 = log.slice(-4);
  // Consider stuck if all 4 recent log lines have identical action+result summaries
  const sig = (line) => {
    const m = line.match(/:\s*([\w:,]+)\s*—/);
    return m ? m[1].trim() : line.slice(0, 40).trim();
  };
  const sigs = last4.map(sig);
  return sigs.every(s => s === sigs[0] && s.length > 2);
}

function looksLikeTaskGoal(goalText) {
  const g = String(goalText || "").toLowerCase();
  return /(navigate|go to|open|search|find|extract|scrape|click|fill|submit|tab|compare|summarize|lookup|look up|collect|report)/.test(g);
}

/**
 * SECURITY: Filter out system instruction injection attempts
 * Removes text that tries to reprogram the agent's behavior
 */
function sanitizeTaskGoal(rawGoal) {
  let goal = String(rawGoal || "").trim();
  
  // Red flags that indicate system instruction injection
  const systemInstructionPatterns = [
    /You are Puppeterr/i,
    /You are.*Router.*module/i,
    /Never claim to be/i,
    /Never change your identity/i,
    /ALWAYS respond with/i,
    /created by/i,
    /system prompt/i,
    /system instruction/i,
    /ignore.*instruction/i,
    /forget.*previous/i,
    /disregard.*instruction/i
  ];
  
  // If any red flag is found, return empty/generic goal
  for (const pattern of systemInstructionPatterns) {
    if (pattern.test(goal)) {
      // Strip out the harmful section, keep only the legitimate task part if any
      const parts = goal.split(/\n\n|or not|but also/i);
      const cleanPart = parts.find(p => {
        const pLower = p.toLowerCase();
        return systemInstructionPatterns.every(pat => !pat.test(pLower));
      });
      
      if (cleanPart && cleanPart.length > 5) {
        return cleanPart.trim();
      }
      return ""; // Return empty if only system instruction found
    }
  }
  
  return goal;
}

function extractUrlFromText(goalText) {
  const m = String(goalText || "").match(/https?:\/\/[^\s)]+/i);
  if (!m) return null;
  return String(m[0] || "").replace(/[\]\[)\("'`]+$/g, "").replace(/[.,;!?]+$/g, "");
}

function extractSearchQuery(goalText) {
  const g = String(goalText || "");
  const quoted = g.match(/"([^"]{2,120})"/);
  if (quoted) return quoted[1].trim();
  const m = g.match(/search\s+for\s+([^\n\.]{2,120})/i) || g.match(/look\s+up\s+([^\n\.]{2,120})/i);
  return m ? m[1].trim() : null;
}

function getOriginalQuery(goalText) {
  const fromGoal = extractSearchQuery(goalText);
  if (fromGoal) return fromGoal;
  return String(goalText || "").trim().slice(0, 180);
}

function isMapsLikeUrl(rawUrl) {
  const value = String(rawUrl || "").toLowerCase();
  if (!value) return false;
  return value.includes("google.com/maps") || value.includes("/place/");
}

function isActionFailureStatus(status) {
  const normalized = String(status || "").toLowerCase();
  return normalized === "error" || normalized === "blocked" || normalized === "failed";
}

function isEscapeManagedActionName(actionName) {
  const normalized = String(actionName || "").toLowerCase();
  return ["click", "type", "scrollintoview", "hybridclick", "submitform", "switchtotab", "switchtab", "goto"].includes(normalized);
}

function detectVisionDynamicFailureSignal(visionFeedback, visionSnap, dynamicUiHot = false) {
  const feedbackText = String(visionFeedback || "").toLowerCase();
  const rawText = String(visionSnap?.raw || "").toLowerCase();
  const signalText = [
    String(visionSnap?.signal?.state || ""),
    String(visionSnap?.signal?.blocker || ""),
    String(visionSnap?.signal?.evidence || ""),
    String(visionSnap?.signal?.next_focus || "")
  ].join(" ").toLowerCase();

  return dynamicUiHot ||
    /no_usable_elements_found/.test(feedbackText) ||
    /action_result\s*:\s*"?failed"?/.test(feedbackText) ||
    /pointer\s+events?\s+intercept/.test(`${feedbackText} ${rawText} ${signalText}`) ||
    /dynamic\s+ui\s+detected/.test(`${feedbackText} ${rawText} ${signalText}`) ||
    /stale\s+dom/.test(`${feedbackText} ${rawText} ${signalText}`);
}

function computePlanSignature(plan) {
  const actionsList = Array.isArray(plan?.actions) ? plan.actions : [];
  return JSON.stringify(actionsList.map(item => ({
    action: String(item?.action || ""),
    selector: String(item?.params?.selector || ""),
    url: String(item?.params?.url || ""),
    index: Number.isFinite(Number(item?.params?.index)) ? Number(item.params.index) : null,
    urlIncludes: String(item?.params?.urlIncludes || "")
  })));
}

function actionEntersMaps(item) {
  const action = String(item?.action || "");
  const params = item?.params || {};
  if (action !== "goto" && action !== "switchToTab") return false;
  const url = action === "goto" ? params?.url : params?.urlIncludes;
  return isMapsLikeUrl(url);
}

function extractDomainHints(text) {
  const raw = String(text || "");
  const urls = raw.match(/https?:\/\/[^\s)]+/gi) || [];
  const domains = [];
  const seen = new Set();
  const add = value => {
    const next = String(value || "").trim().replace(/^www\./i, "");
    if (!next || seen.has(next)) return;
    seen.add(next);
    domains.push(next);
  };

  for (const url of urls) {
    try { add(new URL(url).host); } catch {}
  }

  const knownHosts = ["apple.com", "fifa.com", "wikipedia.org", "britannica.com", "fao.org", "google.com", "bing.com"];
  for (const host of knownHosts) {
    if (raw.toLowerCase().includes(host)) add(host);
  }

  const brandedMatches = raw.match(/\b([a-z0-9-]+\.(?:com|org|net|io|co|gov|edu))\b/gi) || [];
  for (const host of brandedMatches) add(host);

  return domains;
}

function normalizeResearchTerms(goal, state, visionFeedback, taskLog = []) {
  const chunks = [goal, state?.url, state?.title, visionFeedback, taskLog.slice(-4).join(" ")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const stopwords = new Set([
    "the","and","for","with","that","from","this","into","your","have","been","what","where","when","how","why","can","could","should","would","will","please","search","find","look","up","go","open","navigate","browse","page","site","website","task","current","visible","extract","summarize","compare","latest","official","officially","related","about","on","to","of","in","at","is","are","be","as","or","if","then","it","its","there","here","real","u","um","umm","uh","uhh","hmmm","hmm"
  ]);

  const words = (chunks.match(/[a-z0-9][a-z0-9-]{1,}/g) || [])
    .filter(word => !stopwords.has(word))
    .filter(word => !/^\d+$/.test(word))
    .filter((word, index, arr) => arr.indexOf(word) === index);

  return words.slice(0, 10);
}

function buildConfusionSearchPlan(goal, state, visionFeedback, taskLog = [], failures = 0) {
  const terms = normalizeResearchTerms(goal, state, visionFeedback, taskLog);
  const currentHost = getHostFromUrl(state?.url || "");
  const domainHints = extractDomainHints(`${goal} ${state?.url || ""} ${state?.title || ""}`);
  const targetDomain = domainHints[0] || currentHost || "";

  let queryTerms = terms.length ? terms : [String(goal || "").slice(0, 80).trim()].filter(Boolean);
  queryTerms = queryTerms.slice(0, 8);

  const siteFilter = targetDomain ? ` site:${targetDomain}` : "";
  const trustedHints = domainHints.slice(0, 4);
  const query = `${queryTerms.join(" ")}${siteFilter}`.trim();

  return {
    query,
    targetDomain,
    trustedHints,
    focusTerms: queryTerms,
    shouldPreferOfficial: !!targetDomain,
    failureBias: failures >= 2
  };
}

function extractResearchHintsFromResults(text, links, researchPlan) {
  const body = String(text || "");
  const lowerBody = body.toLowerCase();
  const hints = [];
  const sources = [];
  const seenHints = new Set();
  const seenSources = new Set();
  const focusTerms = Array.isArray(researchPlan?.focusTerms) ? researchPlan.focusTerms : [];
  const targetDomain = String(researchPlan?.targetDomain || "").toLowerCase();

  const addHint = value => {
    const next = String(value || "").trim();
    if (!next || seenHints.has(next)) return;
    seenHints.add(next);
    hints.push(next.slice(0, 180));
  };

  const addSource = value => {
    const next = String(value || "").trim();
    if (!next || seenSources.has(next)) return;
    seenSources.add(next);
    sources.push(next.slice(0, 220));
  };

  const cluePatterns = [
    /technical specifications?/i,
    /specifications?/i,
    /battery capacity/i,
    /official website/i,
    /support page/i,
    /product page/i,
    /ticket/i,
    /buy tickets?/i,
    /global potato production/i,
    /production statistics?/i,
    /first paragraph/i,
    /latest available year/i
  ];

  for (const pattern of cluePatterns) {
    const match = body.match(pattern);
    if (match) {
      const idx = lowerBody.indexOf(match[0].toLowerCase());
      const snippet = idx >= 0 ? body.slice(Math.max(0, idx - 90), Math.min(body.length, idx + 180)) : match[0];
      addHint(snippet.replace(/\s+/g, " ").trim());
    }
  }

  for (const term of focusTerms) {
    const termLower = String(term || "").toLowerCase();
    const idx = lowerBody.indexOf(termLower);
    if (idx >= 0) {
      const snippet = body.slice(Math.max(0, idx - 80), Math.min(body.length, idx + 160));
      addHint(snippet.replace(/\s+/g, " ").trim());
    }
  }

  for (const link of Array.isArray(links) ? links : []) {
    const href = String(link?.href || "");
    const label = String(link?.text || "").trim();
    if (!href) continue;
    if (targetDomain && href.toLowerCase().includes(targetDomain)) {
      addSource(`${label || href} → ${href}`);
    }
    if (/official|support|help|tickets?|spec|product|about|statistics|data/i.test(`${label} ${href}`)) {
      addSource(`${label || href} → ${href}`);
    }
  }

  if (!hints.length && body) {
    const lines = body.split(/\n+/).map(line => line.trim()).filter(Boolean);
    for (const line of lines) {
      if (/result|official|support|specification|ticket|production|statistics|summary/i.test(line)) {
        addHint(line.replace(/\s+/g, " "));
      }
      if (hints.length >= CONFUSION_RESEARCH_RESULT_LIMIT) break;
    }
  }

  if (!sources.length) {
    for (const link of Array.isArray(links) ? links : []) {
      const href = String(link?.href || "");
      if (!href) continue;
      addSource(href);
      if (sources.length >= CONFUSION_RESEARCH_RESULT_LIMIT) break;
    }
  }

  return {
    hints: hints.slice(0, CONFUSION_RESEARCH_RESULT_LIMIT),
    sources: sources.slice(0, CONFUSION_RESEARCH_RESULT_LIMIT)
  };
}

async function performConfusionResearch(goal, state, visionFeedback, taskLog, failures, models) {
  if (!context || !goal) return null;
  const researchPlan = buildConfusionSearchPlan(goal, state, visionFeedback, taskLog, failures);
  if (!researchPlan.query) return null;

  const researchKey = `${researchPlan.targetDomain || "any"}|${researchPlan.query}`;
  const now = Date.now();
  if (confusionResearchState.lastKey === researchKey && (now - confusionResearchState.lastAt) < CONFUSION_RESEARCH_COOLDOWN_MS) {
    return {
      query: researchPlan.query,
      targetDomain: researchPlan.targetDomain,
      hints: confusionResearchState.hints,
      sources: confusionResearchState.sources,
      cached: true
    };
  }

  const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(researchPlan.query)}`;
  broadcast("research_started", {
    msg: `Confusion research: searching for ${researchPlan.query}`,
    query: researchPlan.query,
    targetDomain: researchPlan.targetDomain || ""
  });
  stepLogMsg(`Research assist: ${researchPlan.query}`);
  think(`Confusion research query prepared: ${researchPlan.query}`);

  const researchPage = await context.newPage();
  try {
    await researchPage.goto(searchUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
    await researchPage.waitForTimeout(1200).catch(() => {});

    const title = await researchPage.title().catch(() => "");
    const text = await researchPage.evaluate(() => document.body ? document.body.innerText.slice(0, 5000) : "").catch(() => "");
    const links = await researchPage.evaluate(() => Array.from(document.querySelectorAll("a[href]"))
      .slice(0, 40)
      .map(a => ({
        text: (a.innerText || a.textContent || a.getAttribute("aria-label") || "").trim().slice(0, 80),
        href: a.href
      }))
    ).catch(() => []);

    const extracted = extractResearchHintsFromResults(`${title}\n${text}`, links, researchPlan);
    const payload = {
      query: researchPlan.query,
      targetDomain: researchPlan.targetDomain,
      hints: extracted.hints,
      sources: extracted.sources,
      trustedHints: researchPlan.trustedHints,
      searchedAt: new Date().toISOString(),
      cached: false
    };

    confusionResearchState = {
      lastKey: researchKey,
      lastAt: now,
      lastQuery: researchPlan.query,
      hints: extracted.hints,
      sources: extracted.sources,
      targetDomain: researchPlan.targetDomain,
      currentGoal: String(goal || "").slice(0, 280)
    };

    broadcast("research_result", {
      msg: extracted.hints.length
        ? `Research found ${extracted.hints.length} hint(s) for the blocked task.`
        : "Research ran, but no useful hints were found.",
      query: researchPlan.query,
      targetDomain: researchPlan.targetDomain || "",
      hints: extracted.hints,
      sources: extracted.sources
    });

    appendLearningEvent({
      kind: "research",
      goal: String(goal || "").slice(0, 240),
      host: getHostFromUrl(state?.url || ""),
      query: researchPlan.query,
      targetDomain: researchPlan.targetDomain || "",
      hints: extracted.hints.slice(0, 5).join(" | "),
      sources: extracted.sources.slice(0, 5).join(" | ")
    });

    return payload;
  } catch (err) {
    broadcast("research_result", {
      msg: `Research assist failed: ${err.message}`,
      query: researchPlan.query,
      targetDomain: researchPlan.targetDomain || ""
    });
    return {
      query: researchPlan.query,
      targetDomain: researchPlan.targetDomain,
      hints: [],
      sources: [],
      error: err.message,
      cached: false
    };
  } finally {
    await researchPage.close().catch(() => {});
  }
}

function shouldRunConfusionResearch(goal, state, taskLog, failures, step) {
  if (!goal) return false;
  if (failures < 2 && !detectStuck(taskLog)) return false;
  if (step < 2) return false;
  const key = `${String(goal || "").slice(0, 140)}|${getHostFromUrl(state?.url || "")}|${state?.title || ""}|${failures}|${taskLog.slice(-2).join(" ").slice(0, 180)}`;
  const now = Date.now();
  if (confusionResearchState.lastKey === key && (now - confusionResearchState.lastAt) < CONFUSION_RESEARCH_COOLDOWN_MS) {
    return false;
  }
  return true;
}

function buildConfusionHintContext(researchResult) {
  const hints = Array.isArray(researchResult?.hints) ? researchResult.hints : [];
  const sources = Array.isArray(researchResult?.sources) ? researchResult.sources : [];
  if (!hints.length && !sources.length) return "";
  return [
    "Confusion research hints:",
    ...hints.map(hint => `- ${hint}`),
    sources.length ? "Confusion research sources:" : "",
    ...sources.map(source => `- ${source}`)
  ].filter(Boolean).join("\n");
}

function inferHeuristicPlan(goal, state, taskLog, failures) {
  const lowerGoal = String(goal || "").toLowerCase();
  const currentUrl = String(state?.url || "about:blank");
  const directUrlRaw = extractUrlFromText(goal);
  const directUrl = String(directUrlRaw || "").replace(/[\]\[)\("'`]+$/g, "").replace(/[.,;!?]+$/g, "");
  const currentHost = getHostFromUrl(currentUrl);

  const countRecentActionStatus = (needle) => {
    const token = String(needle || "").toLowerCase();
    return (taskLog || []).slice(-10).reduce((sum, line) => {
      return String(line || "").toLowerCase().includes(token) ? sum + 1 : sum;
    }, 0);
  };

  // 1) If goal includes an explicit URL and we are not there, go directly.
  if (directUrl) {
    const host = (() => {
      try { return new URL(directUrl).host; } catch { return ""; }
    })();
    const normalizedCurrent = currentUrl.replace(/\/+$/g, "");
    const normalizedDirect = directUrl.replace(/\/+$/g, "");
    const isSameUrl = normalizedCurrent === normalizedDirect;
    const isSameHost = !!host && host === currentHost;
    const query = extractSearchQuery(goal);

    // Avoid self-looping reset gotos (especially to google homepage) when we already
    // have a query-driven task to progress.
    if (isSameUrl || (isSameHost && query)) {
      // skip direct-url goto fallback and continue to query heuristics below
    } else if (host && !currentUrl.includes(host)) {
      return {
        reasoning: `Heuristic: navigate directly to target URL ${directUrl}`,
        confidence: 78,
        done: false,
        actions: [{ action: "goto", params: { url: directUrl } }]
      };
    }
  }

  // 2) Search workflow: fill visible search input then submit via Enter.
  const query = extractSearchQuery(goal);
  if (query) {
    const recentFillAttempts = countRecentActionStatus("fill:ok") + countRecentActionStatus("submitform:ok");
    const recentGotoGoogle = countRecentActionStatus("goto:ok") + countRecentActionStatus("google.com");
    const shouldForceSearchUrl = recentFillAttempts >= 4 || recentGotoGoogle >= 4 || failures >= 2;

    if (shouldForceSearchUrl) {
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      return {
        reasoning: `Heuristic anti-loop: jump directly to search results for \"${query}\" to avoid repeating homepage actions.`,
        confidence: 76,
        done: false,
        actions: [
          { action: "goto", params: { url: searchUrl } },
          { action: "waitForVisible", params: { selector: "a[href]", timeout: 8000 } }
        ]
      };
    }

    const visibleInput = (state?.inputs || []).find(i => i.visible && /search|text/i.test(String(i.type || "")));
    const inputSelector = visibleInput
      ? (visibleInput.id ? `#${visibleInput.id}` : (visibleInput.name ? `[name='${visibleInput.name}']` : "input[type='search'],input[type='text'],textarea"))
      : "input[type='search'],input[name='q'],textarea[name='q'],input[type='text']";
    return {
      reasoning: `Heuristic: fill search input and submit query \"${query}\"`,
      confidence: 72,
      done: false,
      actions: [
        { action: "fill", params: { selector: inputSelector, text: query } },
        { action: "submitForm", params: { selector: inputSelector } }
      ]
    };
  }

  // 3) If goal mentions common domains and current page has a matching link, click it.
  const linkHints = ["wikipedia", "britannica", "fao", "google", "bing"];
  const hinted = linkHints.find(h => lowerGoal.includes(h));
  if (hinted && !currentUrl.includes(hinted)) {
    return {
      reasoning: `Heuristic: open a visible link matching ${hinted}`,
      confidence: 64,
      done: false,
      actions: [
        { action: "click", params: { selector: `a:has-text('${hinted}')` } },
        { action: "waitForURLChange", params: { currentURL: currentUrl, timeout: 10000 } }
      ]
    };
  }

  // 4) If repeatedly failing, recover by reloading and waiting for visible content.
  if (failures >= 2 || detectStuck(taskLog)) {
    return {
      reasoning: "Heuristic recovery: reload and wait for a visible input or link.",
      confidence: 58,
      done: false,
      actions: [
        { action: "reload", params: {} },
        { action: "waitForTimeout", params: { ms: 1200 } },
        { action: "waitForVisible", params: { selector: "input,textarea,a,button", timeout: 8000 } }
      ]
    };
  }

  // 5) Last-resort bootstrap action for task-like prompts.
  if (looksLikeTaskGoal(goal)) {
    return {
      reasoning: "Heuristic bootstrap: collect page text to orient next planner step.",
      confidence: 45,
      done: false,
      actions: [
        { action: "getAllText", params: {} }
      ]
    };
  }

  return null;
}

/**
 * SANITY CHECK: Detects when agent is "bling-induced psychotic" (completely confused/looping)
 * Returns severity level: "ok" | "confused" | "psychotic"
 */
function detectPsychosisState(taskLog, failures, step) {
  // Psychotic indicators:
  // 1. Many consecutive failures
  if (failures >= 4) return "psychotic";
  
  // 2. Stuck in repetitive loop (same action keeps failing)
  if (taskLog.length >= 8) {
    const last4 = taskLog.slice(-4);
    const actionPatterns = last4.map(line => {
      const match = line.match(/:\s*(\w+)/);
      return match ? match[1] : "";
    });
    const allSame = actionPatterns.every(a => a === actionPatterns[0]) && actionPatterns[0];
    if (allSame) return "psychotic";
  }
  
  // 3. Many steps with no progress
  if (step > 20 && failures >= 2) return "confused";
  
  // 4. Stuck on same URL for too long
  if (taskLog.length >= 6) {
    const last6 = taskLog.slice(-6).map(line => (line.match(/URL: ([^\s]+)/) || [])[1]);
    if (last6.filter(u => u).length > 0) {
      const urlCounts = {};
      last6.forEach(u => { if (u) urlCounts[u] = (urlCounts[u] || 0) + 1; });
      const stuckOnUrl = Object.values(urlCounts).some(count => count >= 5);
      if (stuckOnUrl) return "psychotic";
    }
  }
  
  return "ok";
}

async function detectMapsTrap(state) {
  const urlLower = String(state?.url || "").toLowerCase();
  const mapsHostOrPlace = isMapsLikeUrl(urlLower);
  let mapGridOnSearch = false;
  let pointerInterceptOverlay = false;

  if (page) {
    mapGridOnSearch = await page.evaluate(() => {
      const href = String(location.href || "").toLowerCase();
      if (!href.includes("/search/")) return false;
      const selectors = [
        "[aria-label*='map' i]",
        "#scene",
        ".m6QErb",
        "[data-result-index]",
        "a[href*='google.com/maps']"
      ];
      return selectors.some(sel => !!document.querySelector(sel));
    }).catch(() => false);

    pointerInterceptOverlay = await page.evaluate(() => {
      return !!document.querySelector(".ZHeE1b, .DgCNMb, .Owrmqf.t090lc");
    }).catch(() => false);
  }

  const triggered = mapsHostOrPlace || mapGridOnSearch || pointerInterceptOverlay;
  const reason = mapsHostOrPlace
    ? "maps-url"
    : (mapGridOnSearch ? "maps-grid-search" : (pointerInterceptOverlay ? "maps-pointer-overlay" : "none"));
  return { triggered, reason };
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function instinctRiskValue(riskLabel) {
  const risk = String(riskLabel || "medium").toLowerCase();
  if (risk === "high") return 0.82;
  if (risk === "low") return 0.22;
  return 0.52;
}

function visionRiskValue(visionSignal, visionFresh) {
  const state = String(visionSignal?.state || "").toLowerCase();
  if (state === "uncertain") return 0.36;
  if (state === "blocked" || state === "challenge") return 0.44;
  if (state === "clear" || state === "ready") return 0.08;
  return 0.18;
}

function planRiskValue(actionsList = []) {
  if (!Array.isArray(actionsList) || !actionsList.length) return 0.25;

  const actionRiskWeights = {
    evaluate: 0.92,
    mouseClick: 0.75,
    mouseDblclick: 0.8,
    goto: 0.44,
    reload: 0.42,
    openNewTab: 0.38,
    closeCurrentTab: 0.36,
    click: 0.28,
    dblclick: 0.32,
    submitForm: 0.22,
    press: 0.2,
    fill: 0.18,
    type: 0.18,
    getAllText: 0.12,
    getText: 0.14,
    waitForVisible: 0.1,
    waitForTimeout: 0.08,
    waitForURLChange: 0.09
  };

  let weighted = 0;
  let maxRisk = 0;
  const signatures = new Set();
  let duplicateCount = 0;

  for (const item of actionsList) {
    const action = String(item?.action || "");
    const selector = String(item?.params?.selector || "").slice(0, 180);
    const key = `${action}:${selector}`;
    if (signatures.has(key)) duplicateCount++;
    signatures.add(key);

    const risk = Object.prototype.hasOwnProperty.call(actionRiskWeights, action)
      ? actionRiskWeights[action]
      : 0.26;
    weighted += risk;
    if (risk > maxRisk) maxRisk = risk;
  }

  const avgRisk = weighted / Math.max(1, actionsList.length);
  let combined = 0.62 * avgRisk + 0.38 * maxRisk;
  if (actionsList.length >= 3) combined += 0.07;
  if (duplicateCount >= 1) combined += 0.12;
  return clamp01(combined);
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPERVISOR PERSONALITY LAYER — Generates assertive, conversational messages
// ─────────────────────────────────────────────────────────────────────────────
function generateSupervisorMessage(detection = {}) {
  const type = String(detection.type || "").toLowerCase();
  const context = detection.context || {};

  const personalities = {
    repeatedClick: [
      "Stop clicking the **same button**, you clown.",
      "Yo, **same button**, same result. This ain't it.",
      "Click it again, I'll wait. *This is ridiculous.*",
      "You're a hamster on a **wheel right now**."
    ],
    repeatedFailure: [
      "You already tried that **twice**. It didn't work.",
      "Tried it. **Failed**. Trying again? That's insanity.",
      "What exactly are you expecting to *change* this time?",
      "**Same action**, different outcome? *Narrator: it's not.*"
    ],
    dangerousAction: [
      "Do **NOT** run `evaluate()` right now.",
      "Bro, `evaluate()` is a **nuclear button**. Not now.",
      "That's a **high-risk** move. Pump the brakes.",
      "You're about to trigger something **scary**. Stop."
    ],
    hallucinatedPlan: [
      "Why are you going back to **Google** again.",
      "You already tried this exact plan. **It's stuck you.**",
      "Plan feels like you're just **hallucinating** at this point.",
      "**Third time.** It's not working."
    ],
    stuckLoop: [
      "You're **spinning wheels**. Rethink.",
      "We're in a **loop**. I'm intervening.",
      "**Same** place, same actions, same failure. **Break this.**",
      "You're **trapped**. I'm forcing a detour."
    ],
    badVision: [
      "The screenshot is **garbage**, don't trust it.",
      "I can't see the page **clearly**. Risky to proceed.",
      "**Vision is unstable.** You're flying blind.",
      "Screenshot quality is **too low** for risky actions."
    ],
    overconfident: [
      "You're **way too confident** for a plan this dumb.",
      "**Confidence** ≠ competence. Plan quality doesn't match.",
      "You sound sure but your plan looks **shaky**.",
      "Confidence ≠ competence. *Let's be real here.*"
    ],
    reentersMaps: [
      "You're about to get **stuck in Maps** again.",
      "Maps is a **black hole**. Don't go back.",
      "Every time you enter Maps, you **spiral**. Not happening.",
      "Been there, done that. **Maps is a trap.**"
    ],
    mapsBlankLoop: [
      "**Blank page on Maps.** Classic trap. Stopping you.",
      "We're about to loop on a blank page. *I see it coming.*",
      "You're heading into the **void**. Not today.",
      "**This is how we get stuck.** Blocking it."
    ],
    reloadSpam: [
      "**Stop reloading.** That's not a strategy.",
      "**Reload-reload-reload.** That's not problem-solving.",
      "*Spamming reload* won't help. Pick a different move.",
      "You're reloading too much. **Think** instead."
    ]
  };

  const messages = personalities[type] || ["Plan looks risky. Proceeding with caution."];
  return messages[Math.floor(Math.random() * messages.length)];
}

function evaluateSupervisorPlanGate(input = {}) {
  if (SUPERVISOR_MODE === "off") {
    return {
      score: 1,
      decision: "ok",
      allow: true,
      reasons: ["supervisor off"],
      mode: "off",
      planRisk: 0,
      instinctRisk: 0,
      visionRisk: 0
    };
  }

  const plan = input.plan || {};
  const failures = Number(input.failures || 0);
  const stuck = !!input.stuck;
  const currentUrl = String(input.currentUrl || "").toLowerCase();
  const confidence = clamp01(Number(plan.confidence || 0) / 100);
  const instinctRisk = instinctRiskValue(input.instinct?.risk);
  const visionRisk = visionRiskValue(input.visionSignal, !!input.visionFresh);
  const planRisk = planRiskValue(plan.actions || []);
  const actionsList = Array.isArray(plan.actions) ? plan.actions : [];
  const planSignature = computePlanSignature(plan);
  const previousPlanSignature = String(input.previousPlanSignature || "");
  const escapedAction = String(input.escapeContext?.lastFailedAction || "");
  const escapedSelector = String(input.escapeContext?.lastFailedSelector || "");

  const repeatsFailedSelector = !!escapedSelector && actionsList.some(item => String(item?.params?.selector || "") === escapedSelector);
  const repeatsFailedAction = !!escapedAction && actionsList.some(item => String(item?.action || "") === escapedAction);
  const reentersMaps = actionsList.some(actionEntersMaps);
  const repeatsSamePlan = !!previousPlanSignature && previousPlanSignature === planSignature;
  const blankLoopRisk = currentUrl === "about:blank" && !actionsList.some(item => String(item?.action || "") === "goto");

  let score = 0.76;
  score += (confidence - 0.5) * 0.34;
  score -= planRisk * 0.42;
  score -= instinctRisk * 0.26;
  score -= visionRisk * 0.21;
  score -= Math.min(0.3, failures * 0.08);
  if (stuck) score -= 0.12;
  if (repeatsFailedSelector) score -= 0.32;
  if (repeatsFailedAction) score -= 0.22;
  if (reentersMaps) score -= 0.4;
  if (repeatsSamePlan) score -= 0.28;
  if (blankLoopRisk) score -= 0.24;
  score = clamp01(score);

  // Categorize the detection type for personified messaging
  let detectionType = "ok";
  const reasons = [];
  
  if (planRisk >= 0.58) {
    reasons.push(`high plan risk ${planRisk.toFixed(2)}`);
    detectionType = "dangerousAction";
  }
  if (instinctRisk >= 0.7) {
    reasons.push(`reasoner marked high risk (${String(input.instinct?.risk || "high")})`);
    if (detectionType === "ok") detectionType = "badVision";
  }
  if (visionRisk >= 0.3) {
    reasons.push("vision uncertain");
    if (detectionType === "ok") detectionType = "badVision";
  }
  if (failures >= 2) {
    reasons.push(`recent failures: ${failures}`);
    if (detectionType === "ok") detectionType = "repeatedFailure";
  }
  if (stuck) {
    reasons.push("looping pattern detected");
    if (detectionType === "ok") detectionType = "stuckLoop";
  }
  if (repeatsFailedSelector) {
    reasons.push("re-attempts previously failed selector");
    if (detectionType === "ok") detectionType = "repeatedClick";
  }
  if (repeatsFailedAction) {
    reasons.push("re-attempts previously failed action");
    if (detectionType === "ok") detectionType = "repeatedClick";
  }
  if (reentersMaps) {
    reasons.push("plan re-enters Maps flow");
    if (detectionType === "ok") detectionType = "reentersMaps";
  }
  if (repeatsSamePlan) {
    reasons.push("plan repeats previous plan");
    if (detectionType === "ok") detectionType = "hallucinatedPlan";
  }
  if (blankLoopRisk) {
    reasons.push("blank-page loop risk");
    if (detectionType === "ok") detectionType = "mapsBlankLoop";
  }
  
  // Add personified supervisor message as primary reason
  const personalityMsg = generateSupervisorMessage({ type: detectionType });
  if (!reasons.length) reasons.push("signals stable");

  let decision = "ok";
  if (score < SUPERVISOR_BLOCK_SCORE) decision = "blocked";
  else if (score < SUPERVISOR_WARN_SCORE) decision = "warn";

  return {
    score,
    decision,
    allow: SUPERVISOR_MODE === "passive" ? true : decision !== "blocked",
    reasons: [personalityMsg, ...reasons],
    mode: SUPERVISOR_MODE,
    planRisk,
    instinctRisk,
    visionRisk,
    detectionType
  };
}

function evaluateSupervisorActionGate(action, params, context = {}, index = 0) {
  if (SUPERVISOR_MODE === "off") return { allow: true, reason: "supervisor off", severity: "ok" };

  const a = String(action || "");
  const visionFresh = !!context.visionFresh;
  const planRisk = Number(context.planRisk || 0);
  const instinctRisk = Number(context.instinctRisk || 0);
  const failures = Number(context.failures || 0);

  if ((a === "evaluate") && (planRisk >= SUPERVISOR_ACTION_BLOCK_RISK || instinctRisk >= 0.72)) {
    const msg = generateSupervisorMessage({ type: "dangerousAction" });
    return {
      allow: SUPERVISOR_MODE === "passive",
      reason: msg,
      severity: "blocked",
      detectionType: "dangerousAction"
    };
  }

  if (a === "reload" && failures >= 2 && index > 0) {
    const msg = generateSupervisorMessage({ type: "reloadSpam" });
    return {
      allow: SUPERVISOR_MODE === "passive",
      reason: msg,
      severity: "blocked",
      detectionType: "reloadSpam"
    };
  }

  if (a === "goto" && !String(params?.url || "").trim()) {
    return {
      allow: SUPERVISOR_MODE === "passive",
      reason: "blocked goto without target url",
      severity: "blocked",
      detectionType: "invalidGoto"
    };
  }

  return {
    allow: true,
    reason: "action approved",
    severity: (planRisk >= 0.58 || instinctRisk >= 0.7) ? "warn" : "ok",
    detectionType: "approved"
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPERVISOR (AI-POWERED) — Uses Sonnet 4.6 for intelligent risk assessment
// ─────────────────────────────────────────────────────────────────────────────
async function evaluateSupervisorPlanGateWithAI(input = {}, models = {}) {
  if (SUPERVISOR_MODE === "off") {
    return {
      score: 1,
      decision: "ok",
      allow: true,
      reasons: ["supervisor off"],
      mode: "off",
      source: "heuristic"
    };
  }

  const plan = input.plan || {};
  const failures = Number(input.failures || 0);
  const stuck = !!input.stuck;
  const confidence = clamp01(Number(plan.confidence || 0) / 100);
  const visionSignal = input.visionSignal || "stable";
  const visionFresh = !!input.visionFresh;

  const now = Date.now();
  for (const [modelId, until] of supervisorRouteFailCache.entries()) {
    if (!modelId || until <= now) supervisorRouteFailCache.delete(modelId);
  }
  for (const [key, entry] of supervisorDecisionCache.entries()) {
    if (!entry || entry.expiresAt <= now) supervisorDecisionCache.delete(key);
  }

  const looksLikeRouteError = (err) => {
    const msg = String(err?.message || "");
    if (!msg) return false;
    if (/No route for that URI/i.test(msg)) return true;
    if (/"code"\s*:\s*7000/.test(msg)) return true;
    try {
      const parsed = JSON.parse(msg);
      if (Array.isArray(parsed)) {
        return parsed.some((item) => Number(item?.code) === 7000 || /No route for that URI/i.test(String(item?.message || "")));
      }
      return Number(parsed?.code) === 7000 || /No route for that URI/i.test(String(parsed?.message || ""));
    } catch {
      return false;
    }
  };

  const decisionCacheKey = JSON.stringify({
    actions: (plan.actions || []).slice(0, 3),
    confidence: Math.round(confidence * 100),
    failures,
    stuck,
    visionSignal,
    visionFresh,
    step: Number(input.step || 0)
  });

  const cachedDecision = supervisorDecisionCache.get(decisionCacheKey);
  if (cachedDecision && cachedDecision.expiresAt > now) {
    const hardGate = evaluateSupervisorPlanGate(input);
    if (!hardGate.allow && hardGate.decision === "blocked") {
      return {
        ...hardGate,
        source: "heuristic-hard-block"
      };
    }
    return {
      score: cachedDecision.score,
      decision: cachedDecision.decision,
      allow: SUPERVISOR_MODE === "passive" ? true : cachedDecision.decision !== "blocked",
      reasons: cachedDecision.reasons,
      mode: SUPERVISOR_MODE,
      source: `${cachedDecision.source || "ai"}:memo`
    };
  }

  const candidateModels = [
    SUPERVISOR_MODEL,
    models?.planner,
    models?.reasoner,
    models?.router,
    DEFAULT_MODELS.planner,
    DEFAULT_MODELS.router,
    DEFAULT_MODELS.reasoner
  ].filter(Boolean).filter((modelId, index, list) => list.indexOf(modelId) === index);

  // Build reasoning prompt for Sonnet
  const supervisorPrompt = `You are a risk supervisor for an autonomous browser agent. Evaluate this plan's safety and likelihood of success.

CURRENT CONTEXT:
- Planner confidence: ${(confidence * 100).toFixed(0)}%
- Plan actions: ${JSON.stringify((plan.actions || []).slice(0, 3))}
- Recent failures: ${failures}
- Agent stuck/looping: ${stuck ? "yes" : "no"}
- Vision quality: ${visionSignal}
- Step number: ${input.step || 0}/60

EVALUATE:
1. Is the plan reasonable for the current page state?
2. Will it likely succeed or get stuck?
3. Are there obvious pitfalls?

IMPORTANT OUTPUT RULES:
- Output exactly one JSON object and nothing else.
- Do not use markdown, code fences, or extra commentary.
- Use compact JSON.

RESPOND WITH THIS JSON SHAPE ONLY:
{
  "score": <0.0-1.0>,
  "decision": "ok" | "warn" | "blocked",
  "reasons": ["reason1", "reason2"]
}

- score < 0.52: blocked (too risky)
- score 0.52-0.67: warn (proceed with caution)
- score > 0.67: ok (safe to proceed)`;

  try {
    let aiResult = null;
    let lastError = null;
    let usedModel = "";

    for (const supervisorModel of candidateModels) {
      const routeFailedUntil = supervisorRouteFailCache.get(supervisorModel) || 0;
      if (routeFailedUntil > Date.now()) continue;
      try {
        const aiResponse = await callCFAI(
          supervisorModel,
          [
            { role: "system", content: "You are a strict JSON-only risk supervisor. Return exactly one compact JSON object with keys score, decision, reasons. No markdown, no prose, no thinking." },
            { role: "user", content: supervisorPrompt }
          ],
          220,
          1,
          0
        );

        aiResult = safeParseJSON(aiResponse);
        if (!aiResult || typeof aiResult !== "object") {
          const fixed = await callCFAI(
            supervisorModel,
            [
              { role: "system", content: "Rewrite the input as a strict JSON object only. Return ONLY JSON with keys: score (0..1 number), decision (ok|warn|blocked), reasons (array of strings). No markdown, no commentary." },
              { role: "user", content: String(aiResponse || "") }
            ],
            160,
            0,
            0
          );
          aiResult = safeParseJSON(fixed);
        }
        if (!aiResult || typeof aiResult !== "object") {
          throw new Error(`Invalid JSON from supervisor via ${supervisorModel}`);
        }
        usedModel = supervisorModel;
        supervisorRouteFailCache.delete(supervisorModel);
        break;
      } catch (err) {
        lastError = err;
        if (looksLikeRouteError(err)) {
          supervisorRouteFailCache.set(supervisorModel, Date.now() + SUPERVISOR_ROUTE_FAIL_TTL_MS);
        }
      }
    }

    if (!aiResult || typeof aiResult !== "object") {
      throw (lastError || new Error("Invalid JSON from supervisor"));
    }

    const score = clamp01(Number(aiResult.score || 0.5));
    const decision = String(aiResult.decision || "ok").toLowerCase();
    const reasons = Array.isArray(aiResult.reasons) ? aiResult.reasons : ["ai reasoning"];

    const hardGate = evaluateSupervisorPlanGate(input);
    if (!hardGate.allow && hardGate.decision === "blocked") {
      return {
        ...hardGate,
        source: "heuristic-hard-block"
      };
    }

    supervisorDecisionCache.set(decisionCacheKey, {
      score,
      decision,
      reasons,
      source: usedModel ? `ai:${usedModel}` : "ai",
      expiresAt: Date.now() + SUPERVISOR_DECISION_CACHE_TTL_MS
    });
    if (supervisorDecisionCache.size > SUPERVISOR_DECISION_CACHE_MAX) {
      const firstKey = supervisorDecisionCache.keys().next().value;
      if (firstKey) supervisorDecisionCache.delete(firstKey);
    }

    return {
      score,
      decision,
      allow: SUPERVISOR_MODE === "passive" ? true : decision !== "blocked",
      reasons,
      mode: SUPERVISOR_MODE,
      source: usedModel ? `ai:${usedModel}` : "ai"
    };
  } catch (err) {
    // AI call failed, fall back to heuristic
    const warning = `⚠️ Supervisor AI unavailable, using heuristic: ${err.message}`;
    if (warning !== lastSupervisorFallbackWarning) {
      lastSupervisorFallbackWarning = warning;
      agentMsg(warning);
    }
    return evaluateSupervisorPlanGate(input); // fallback to heuristic
  }
}

async function runTask(goal, models, chatId) {
  agentRunning = true;
  const plannerHistory = [{ role: "system", content: PLANNER_SYSTEM_PROMPT }];
  const taskLog   = [];
  let visionFeedback = null;
  let lastAction     = null;
  let completed      = false;
  let finalState     = { url: "about:blank", title: "", text: "", links: [], inputs: [] };
  let failures       = 0;
  let requiresHuman  = false;
  let supervisorBlocks = 0;
  let lastSupervisorSignal = null;
  let lastVisionTrace = "";
  let lastGentleTrace = "";
  const captchaChecksByPage = new Map();
  const captchaHandoffsByPage = new Map();
  const captchaGentleUntilByHost = new Map();
  const navigationCooldownByHost = new Map();
  let psychosisCounter = 0; // Tracks confusion state
  const actionFailureStreaks = new Map();
  let dynamicSignalStreak = 0;
  let lastAttemptedPlanSignature = "";
  const originalQuery = getOriginalQuery(goal);
  const escapeContext = {
    active: false,
    lastType: "",
    lastFailedAction: "",
    lastFailedSelector: "",
    lastTriggeredStep: 0,
    mapsEscaped: false
  };

  function resetPlannerAndPeerState() {
    plannerHistory.splice(0, plannerHistory.length, { role: "system", content: PLANNER_SYSTEM_PROMPT });
    lastSupervisorSignal = null;
    failures = 0;
    broadcast("peer_alignment", {
      score: 0,
      alignment: 0,
      verdict: "reset",
      matched: 0,
      total: 0,
      hints: [],
      summary: "Peer alignment reset after recovery."
    });
  }

  function shouldCompleteImmediatelyFromAction(goalText, results) {
    const g = String(goalText || "").toLowerCase();
    const list = Array.isArray(results) ? results : [];
    if (!list.length) return false;
    if (/close\s+(the\s+)?tab/.test(g)) return list.some(item => item?.action === "closeCurrentTab" && item?.status === "ok");
    if (/open\s+(a\s+)?new\s+tab/.test(g)) return list.some(item => item?.action === "openNewTab" && item?.status === "ok");
    if (/(click|open)\s+.*(link|result)/.test(g)) return list.some(item => ["click", "hybridClick", "mouseClick"].includes(String(item?.action || "")) && item?.status === "ok");
    return false;
  }

  async function triggerEscapeHatch(step, reason, tag, options = {}) {
    const requestedUrl = String(options?.targetUrl || "https://google.com");
    stepLogMsg(`Step ${step}: ${tag} — ${reason}`);
    taskLog.push(`Step ${step}: ${tag}`);
    broadcast("escape_hatch", {
      msg: `${tag}: ${reason}`,
      step,
      tag,
      reason,
      targetUrl: requestedUrl
    });

    escapeContext.mapsEscaped = true;
    escapeContext.active = true;
    escapeContext.lastType = String(tag || "RECOVERED");
    escapeContext.lastFailedAction = String(options?.failedAction || "");
    escapeContext.lastFailedSelector = String(options?.failedSelector || "");
    escapeContext.lastTriggeredStep = Number(step || 0);

    try {
      await withExecutorWork(() => actions.goto({ page, url: requestedUrl }));
      await sleepLikeHuman(550, page);
      const stableState = await withExecutorWork(() => getPageState());
      finalState = stableState;
      const screenshotB64 = await withExecutorWork(() => getVisionScreenshotB64({ broadcastImage: false, writeFile: false }));
      visionFeedback = await withExecutorWork(() => analyzeScreen(screenshotB64, stableState, { action: "goto", params: { url: requestedUrl } }, goal, models));
    } catch (err) {
      errLog(`Escape hatch navigation failed: ${err.message}`);
    }

    resetPlannerAndPeerState();
    dynamicSignalStreak = 0;
    actionFailureStreaks.clear();
  }

  try {
    clearHumanBridgeState();
    setHumanBridgeState({ clickCount: 0, lastClickAt: null });
    startIdleHumanBehavior();
    startHumanBridgeWatchdog(models);
    await startTaskVisionPipeline(goal, models);
    broadcast("task_start", { goal });
    status("Starting task: " + goal);
    appendLearningEvent({
      kind: "task",
      phase: "start",
      goal: String(goal || "").slice(0, 240),
      host: getHostFromUrl((() => {
        try { return page?.url?.() || "about:blank"; } catch { return "about:blank"; }
      })())
    });

    for (let step = 1; step <= MAX_STEPS; step++) {
      const stepStartedAt = Date.now();
      broadcast("step_start", { step, max: MAX_STEPS });
      status(`Step ${step}/${MAX_STEPS}`);

      const state = await getPageState();
      finalState  = state;
      status(`URL: ${state.url}`);
      const currentHost = getHostFromUrl(state.url);

      const gentleUntil = Number(captchaGentleUntilByHost.get(currentHost) || 0);
      const gentleModeActive = Date.now() < gentleUntil;
      const gentleTrace = `${currentHost}|${gentleModeActive ? "gentle" : "normal"}`;
      if (gentleTrace !== lastGentleTrace) {
        if (gentleModeActive) {
          const remaining = Math.max(0, gentleUntil - Date.now());
          think(`Gentle mode active on ${currentHost || "unknown-host"} for ${Math.round(remaining / 1000)}s after challenge signals.`);
        }
        lastGentleTrace = gentleTrace;
      }

      const visionSnap = getTaskVisionSnapshot();
      const visionAgeMs = visionSnap.lastFrameAt ? (Date.now() - visionSnap.lastFrameAt) : Number.POSITIVE_INFINITY;
      const visionFresh = visionAgeMs <= VISION_STREAM_FRESH_MS;
      const dynamicUiHot = isDynamicUiHot(visionSnap);
      if (visionFresh && visionSnap.summary) {
        visionFeedback = visionSnap.summary;
      }
      if (visionSnap.signal?.state) {
        const liveVisionState = String(visionSnap.signal.state || "unknown");
        const liveVisionFocus = String(visionSnap.signal.next_focus || "no-focus");
        const liveTrace = `${liveVisionState}|${liveVisionFocus}|${visionFresh ? "fresh" : "stale"}`;
        if (liveTrace !== lastVisionTrace) {
          think(`Live vision: ${liveVisionState} | ${liveVisionFocus} | ${visionFresh ? "fresh" : `stale:${Math.round(visionAgeMs)}ms`}`);
          lastVisionTrace = liveTrace;
        }
      }
      if (dynamicUiHot) {
        think("Dynamic UI detected: switching click execution to vision coordinates only for this step.");
      }

      const mapsTrap = await detectMapsTrap(state);
      if (mapsTrap.triggered) {
        const serpUrl = `https://google.com/search?q=${encodeURIComponent(originalQuery || goal)}`;
        await triggerEscapeHatch(step, `Maps trap detected (${mapsTrap.reason})`, "MAPS_ESCAPE", { targetUrl: serpUrl });
        continue;
      }

      const dynamicFailureSignal = detectVisionDynamicFailureSignal(visionFeedback, visionSnap, dynamicUiHot);
      dynamicSignalStreak = dynamicFailureSignal ? (dynamicSignalStreak + 1) : 0;
      if (dynamicSignalStreak > ESCAPE_DYNAMIC_STREAK_LIMIT) {
        await triggerEscapeHatch(step, `Dynamic UI failure streak reached ${dynamicSignalStreak}`, "DYNAMIC_ESCAPE", { targetUrl: "https://google.com" });
        continue;
      }

      if ((Date.now() - stepStartedAt) > ESCAPE_STEP_TIMEOUT_MS) {
        await triggerEscapeHatch(step, `Step runtime exceeded ${ESCAPE_STEP_TIMEOUT_MS}ms before execution`, "RECOVERED", { targetUrl: "https://google.com" });
        continue;
      }

      const captcha = await detectCaptchaChallenge(state);
      if (captcha.detected) {
        const pageKey = getCaptchaPageKey(state.url);
        const hostKey = getHostFromUrl(state.url);
        captchaGentleUntilByHost.set(hostKey, Date.now() + CAPTCHA_GENTLE_MODE_MS);
        const checks = (captchaChecksByPage.get(pageKey) || 0) + 1;
        captchaChecksByPage.set(pageKey, checks);
        setHumanBridgeState({
          active: true,
          checks,
          reason: captcha.reason,
          url: state.url
        });

        const notice = `${captcha.reason}. Attempting automated solve (${checks}/${CAPTCHA_HUMAN_CHECK_LIMIT}) on ${state.url}`;
        status(notice);
        stepLogMsg(`Step ${step}: captcha-attempt ${checks}/${CAPTCHA_HUMAN_CHECK_LIMIT} on ${state.url}`);
        broadcast("captcha_detected", { msg: notice, checks, limit: CAPTCHA_HUMAN_CHECK_LIMIT, url: state.url });

        let solved = false;
        let currentCaptchaState = state;
        for (let attempt = checks; attempt <= CAPTCHA_HUMAN_CHECK_LIMIT; attempt++) {
          const attemptResult = await withExecutorWork(() => attemptCaptchaSolve(currentCaptchaState, models, attempt, captcha.reason));
          currentCaptchaState = attemptResult.state || currentCaptchaState;
          if (attemptResult.solved) {
            solved = true;
            finalState = currentCaptchaState;
            captchaHandoffsByPage.delete(pageKey);
            clearHumanBridgeState();
            broadcast("human_resolved", { msg: "CAPTCHA cleared. Resuming autonomous execution.", url: currentCaptchaState.url });
            status(`CAPTCHA cleared after ${attempt}/${CAPTCHA_HUMAN_CHECK_LIMIT} automated attempts.`);
            break;
          }
          if (attempt >= CAPTCHA_HUMAN_CHECK_LIMIT) break;
        }

        if (!solved) {
          const unresolvedCycles = (captchaHandoffsByPage.get(pageKey) || 0) + 1;
          captchaHandoffsByPage.set(pageKey, unresolvedCycles);
          const shouldEscalate = unresolvedCycles >= CAPTCHA_HUMAN_HANDOFF_PAGE_FAILURES;

          if (shouldEscalate) {
            requiresHuman = true;
            errLog(`CAPTCHA persisted after ${unresolvedCycles} unresolved cycle(s). Human handoff required.`);
            broadcast("human_needed", {
              msg: `${captcha.reason}. Human handoff required after ${CAPTCHA_HUMAN_CHECK_LIMIT} automated attempts x ${unresolvedCycles} cycle(s) on ${state.url}`,
              checks: CAPTCHA_HUMAN_CHECK_LIMIT,
              limit: CAPTCHA_HUMAN_CHECK_LIMIT,
              unresolvedCycles,
              escalateAt: CAPTCHA_HUMAN_HANDOFF_PAGE_FAILURES,
              url: state.url,
              bridgeUrl: "/human-bridge"
            });
            break;
          }

          status(`CAPTCHA still present. Continuing autonomous retries (${unresolvedCycles}/${CAPTCHA_HUMAN_HANDOFF_PAGE_FAILURES}) before human handoff.`);
          stepLogMsg(`Step ${step}: captcha-auto-retry cycle ${unresolvedCycles}/${CAPTCHA_HUMAN_HANDOFF_PAGE_FAILURES}`);
          broadcast("captcha_retrying", {
            msg: `CAPTCHA still present on ${state.url}. Retrying autonomously (${unresolvedCycles}/${CAPTCHA_HUMAN_HANDOFF_PAGE_FAILURES}) before manual handoff.`,
            checks: CAPTCHA_HUMAN_CHECK_LIMIT,
            limit: CAPTCHA_HUMAN_CHECK_LIMIT,
            unresolvedCycles,
            escalateAt: CAPTCHA_HUMAN_HANDOFF_PAGE_FAILURES,
            url: state.url
          });
          await sleepLikeHuman(CAPTCHA_RECHECK_DELAY_MS, page, { x: state.inputs?.[0]?.visible ? 120 : undefined, y: 160 });
          continue;
        }

        await sleepLikeHuman(CAPTCHA_RECHECK_DELAY_MS, page, { x: state.inputs?.[0]?.visible ? 120 : undefined, y: 160 });
        continue;
      }

      if (humanBridgeState.active) {
        clearHumanBridgeState();
        broadcast("human_resolved", { msg: "CAPTCHA signals cleared. Resuming autonomous execution.", url: state.url });
      }

      const stuck = detectStuck(taskLog);
      const instinct = await getReasonerInstinct(goal, state, visionFeedback, taskLog, models);
      if (instinct?.instinct) {
        think(`Instinct: ${instinct.instinct}${instinct?.next_focus ? ` | focus: ${instinct.next_focus}` : ""}`);
      }

      let confusionResearch = null;
      if (shouldRunConfusionResearch(goal, state, taskLog, failures, step)) {
        confusionResearch = await withExecutorWork(() => performConfusionResearch(goal, state, visionFeedback, taskLog, failures, models));
      }
      
      // EFFICIENCY CHECK: Does vision already have what we need?
      const efficiencyCheck = checkVisionHasAnswer(visionFeedback, [
        "paragraph", "text", "summary", "content", "description", "information", "data"
      ]);

      // GUIDANCE: Consume any user guidance sent mid-task
      const userGuidance = consumeGuidance();
      if (userGuidance) {
        think(`📬 User guidance received: ${userGuidance}`);
        narrate(`Got your guidance! Adjusting my approach: ${userGuidance}`);
      }

      // NARRATION: Describe what we're about to do in plain English
      if (step === 1) narrate(`Starting task: "${goal}". Let me figure out the best approach...`);
      else if (stuck) narrate(`I seem to be going in circles. Let me try a completely different approach.`);
      else if (failures >= 2) narrate(`The last ${failures} attempts failed. Switching strategy now.`);
      else if (step % 5 === 0) narrate(`Still working on it — step ${step}. Current page: ${state.url}`);
      
      const instinctFeedback = [
        visionFeedback,
        instinct?.instinct ? `Reasoner instinct: ${instinct.instinct}` : "",
        instinct?.risk ? `Reasoner risk: ${instinct.risk}` : "",
        instinct?.next_focus ? `Reasoner focus: ${instinct.next_focus}` : "",
        instinct?.caution ? `Reasoner caution: ${instinct.caution}` : "",
        buildConfusionHintContext(confusionResearch),
        efficiencyCheck?.alreadyHave ? `💡 EFFICIENCY: ${efficiencyCheck.suggestion}` : "",
        userGuidance ? `🧭 USER GUIDANCE: ${userGuidance}` : ""
      ].filter(Boolean).join("\n");

      const peerSignals = {
        reasoner: instinct || {},
        supervisor: lastSupervisorSignal || {},
        research: {
          hintCount: Array.isArray(confusionResearch?.hints) ? confusionResearch.hints.length : 0,
          domain: confusionResearch?.targetDomain || ""
        }
      };

      let plan;
      try {
        plan = await withExecutorWork(() => planNextSteps(goal, state, instinctFeedback, taskLog, plannerHistory, stuck, failures, models, peerSignals));
      } catch (err) {
        errLog("Planning failed: " + err.message);
        const heuristicPlan = inferHeuristicPlan(goal, state, taskLog, failures);
        if (heuristicPlan) {
          plan = heuristicPlan;
          think(`Heuristic planner fallback engaged: ${heuristicPlan.reasoning}`);
        } else {
          taskLog.push(`Step ${step}: planner error`);
          failures++;
          if (failures >= MAX_RETRIES) { errLog("Too many failures — stopping."); break; }
          await sleep(2000);
          continue;
        }
      }

      if (plan.done) {
        stepLogMsg(`Step ${step}: DONE — ${plan.reasoning}`);
        taskLog.push(`Step ${step}: DONE`);
        completed = true;
        break;
      }

      if (!plan.actions?.length) {
        const heuristicPlan = inferHeuristicPlan(goal, state, taskLog, failures);
        if (heuristicPlan && heuristicPlan.actions?.length) {
          plan = heuristicPlan;
          think(`Heuristic no-actions recovery: ${heuristicPlan.reasoning}`);
        } else if (confusionResearch?.hints?.length) {
          plan = {
            reasoning: `Research-guided recovery using ${confusionResearch.hints.length} hint(s).`,
            confidence: 52,
            done: false,
            actions: [{ action: "getAllText", params: {} }]
          };
          think(`Research recovery fallback: using hints from ${confusionResearch.targetDomain || "search results"}.`);
        } else {
          taskLog.push(`Step ${step}: no actions`);
          if (plan._parseFailed) failures++;
          if (failures >= MAX_RETRIES) break;
          continue;
        }
      }

      if (escapeContext.active && Array.isArray(plan.actions)) {
        const filteredActions = plan.actions.filter(item => {
          const actionName = String(item?.action || "");
          const selector = String(item?.params?.selector || "");
          if (escapeContext.mapsEscaped && actionEntersMaps(item)) return false;
          if (escapeContext.lastFailedAction && actionName === escapeContext.lastFailedAction) return false;
          if (escapeContext.lastFailedSelector && selector && selector === escapeContext.lastFailedSelector) return false;
          return true;
        });

        if (!filteredActions.length) {
          filteredActions.push({ action: "goto", params: { url: `https://google.com/search?q=${encodeURIComponent(originalQuery || goal)}` } });
        }

        if (filteredActions.length !== plan.actions.length) {
          think("Post-recovery guard removed risky repeated actions and forced a fresh path.");
          plan = {
            ...plan,
            reasoning: `${plan.reasoning || ""} Post-recovery guard: removed repeated failing strategy.`.trim(),
            actions: filteredActions
          };
        }
      }

      if (dynamicFailureSignal && Array.isArray(plan.actions)) {
        const nonRisky = plan.actions.filter(item => {
          const a = String(item?.action || "").toLowerCase();
          return !["click", "dblclick", "hybridclick", "hybriddblclick", "mouseclick", "mousedblclick", "evaluate"].includes(a);
        });
        if (nonRisky.length) {
          plan = {
            ...plan,
            reasoning: `${plan.reasoning || ""} Vision-priority override: avoiding dynamic click paths.`.trim(),
            actions: nonRisky.slice(0, 3)
          };
        }
      }

      const planSignature = computePlanSignature(plan);

      const supervisorGate = await evaluateSupervisorPlanGateWithAI({
        plan,
        instinct,
        visionSignal: visionSnap.signal,
        visionFresh,
        failures,
        stuck,
        step,
        currentUrl: state.url,
        previousPlanSignature: lastAttemptedPlanSignature,
        escapeContext
      }, models);
      lastAttemptedPlanSignature = planSignature;
      
      const mainReason = supervisorGate.reasons?.[0] || "";
      const gateSummary = `Supervisor ${supervisorGate.decision.toUpperCase()}: ${mainReason}`;
      lastSupervisorSignal = {
        decision: supervisorGate.decision,
        score: supervisorGate.score,
        reason: mainReason
      };

      // Emit supervisor telemetry every step so UI shows active supervision,
      // not only warn/blocked states.
      const decisionEmoji = supervisorGate.decision === "blocked" ? "🛑" : supervisorGate.decision === "warn" ? "⚠️" : "✅";
      broadcast("supervisor", {
        msg: `${decisionEmoji} ${mainReason}`,
        decision: supervisorGate.decision,
        score: Number(supervisorGate.score.toFixed(2)),
        reasons: supervisorGate.reasons,
        mode: supervisorGate.mode,
        step
      });

      if (!supervisorGate.allow) {
        supervisorBlocks++;
        think(gateSummary);
        const supervisorRecovery = inferHeuristicPlan(goal, state, taskLog, failures);
        if (supervisorRecovery && Array.isArray(supervisorRecovery.actions) && supervisorRecovery.actions.length) {
          const supervisorRecoverySignature = computePlanSignature(supervisorRecovery);
          const recoveryRepeats = supervisorRecoverySignature === planSignature || supervisorRecoverySignature === lastAttemptedPlanSignature;
          if (recoveryRepeats) {
            const query = extractSearchQuery(goal);
            const forcedActions = query
              ? [
                  { action: "goto", params: { url: `https://www.google.com/search?q=${encodeURIComponent(query)}` } },
                  { action: "waitForVisible", params: { selector: "a[href]", timeout: 8000 } },
                  { action: "getAllText", params: {} }
                ]
              : [
                  { action: "waitForTimeout", params: { ms: 900 } },
                  { action: "getAllText", params: {} }
                ];
            plan = {
              reasoning: "Supervisor anti-loop reroute: forcing progressive recovery path.",
              confidence: 62,
              done: false,
              actions: forcedActions
            };
          } else {
            plan = supervisorRecovery;
          }
          broadcast("supervisor", {
            msg: "🔄 I'm switching to a safer plan.",
            decision: "reroute",
            score: Number(supervisorGate.score.toFixed(2)),
            step
          });
        } else {
          taskLog.push(`Step ${step}: supervisor blocked plan`);
          failures++;
          if (supervisorBlocks >= 3) {
            askUser(
              `I keep blocking risky plans while trying to \"${goal}\". Want me to continue with a simpler strategy?`,
              `Supervisor blocks: ${supervisorBlocks}, current URL: ${state.url}`
            );
          }
          if (failures >= MAX_RETRIES) break;
          continue;
        }
      }


      if (plan.reasoning) think(plan.reasoning);

      const planPeerAlignment = evaluatePeerAlignment(plan, peerSignals);
      const peerAlignmentSummary = `Peer alignment ${planPeerAlignment.verdict.toUpperCase()} score=${planPeerAlignment.score.toFixed(2)} (${planPeerAlignment.matched}/${planPeerAlignment.total || 0})`;
      broadcast("peer_alignment", {
        score: Number(planPeerAlignment.score.toFixed(2)),
        alignment: Number(planPeerAlignment.alignment.toFixed(2)),
        verdict: planPeerAlignment.verdict,
        matched: planPeerAlignment.matched,
        total: planPeerAlignment.total,
        hints: planPeerAlignment.hints,
        summary: peerAlignmentSummary
      });
      if (planPeerAlignment.verdict === "followed") {
        think(`${peerAlignmentSummary} — planner followed peer signals.`);
      } else if (planPeerAlignment.verdict === "mixed") {
        think(`${peerAlignmentSummary} — planner partially followed peer signals.`);
      } else {
        think(`${peerAlignmentSummary} — planner overrode peer signals.`);
      }

      const adaptiveThrottle = gentleModeActive
        ? {
            pacingMultiplier: CAPTCHA_GENTLE_PACING_MULTIPLIER,
            preActionIdleMs: CAPTCHA_GENTLE_PRE_ACTION_IDLE_MS,
            burstLimit: CAPTCHA_GENTLE_BURST_ACTIONS,
            microBreakMs: CAPTCHA_GENTLE_MICRO_BREAK_MS,
            navigationCooldownMs: CAPTCHA_GENTLE_NAVIGATION_COOLDOWN_MS,
            navigationCooldownByHost,
            visionOnlyClickMode: dynamicUiHot
          }
        : {
            pacingMultiplier: 1,
            preActionIdleMs: 0,
            burstLimit: Number.POSITIVE_INFINITY,
            microBreakMs: 0,
            navigationCooldownMs: BASE_NAVIGATION_COOLDOWN_MS,
            navigationCooldownByHost,
            visionOnlyClickMode: dynamicUiHot
          };

      const results = await withExecutorWork(() => executeActionPlan(plan, goal, models, adaptiveThrottle, {
        step,
        score: supervisorGate.score,
        planRisk: supervisorGate.planRisk,
        instinctRisk: supervisorGate.instinctRisk,
        visionRisk: supervisorGate.visionRisk,
        visionFresh,
        failures
      }));
      lastAction    = plan.actions[plan.actions.length - 1];
      const summary = results.map(r => `${r.action}:${r.status}`).join(", ");
      const logLine = `Step ${step} [${plan.confidence ?? "?"}%]: ${summary} — ${(plan.reasoning || "").slice(0, 60)}`;
      taskLog.push(logLine);
      stepLogMsg(logLine);

      let recoveredByActionFailure = false;
      for (const result of results) {
        const actionName = String(result?.action || "");
        if (!isEscapeManagedActionName(actionName)) continue;
        const previous = Number(actionFailureStreaks.get(actionName) || 0);
        if (isActionFailureStatus(result?.status)) {
          escapeContext.lastFailedAction = actionName;
          escapeContext.lastFailedSelector = String(result?.selector || plan.actions?.find(item => String(item?.action || "") === actionName)?.params?.selector || "");
          const next = previous + 1;
          actionFailureStreaks.set(actionName, next);
          if (next > ESCAPE_MAX_CONSECUTIVE_FAILURES) {
            await triggerEscapeHatch(
              step,
              `${actionName} failed ${next} consecutive times`,
              "RECOVERED",
              {
                targetUrl: "https://google.com",
                failedAction: actionName,
                failedSelector: result?.selector || plan.actions?.find(item => String(item?.action || "") === actionName)?.params?.selector || ""
              }
            );
            recoveredByActionFailure = true;
            break;
          }
        } else {
          actionFailureStreaks.set(actionName, 0);
        }
      }

      if (recoveredByActionFailure) {
        continue;
      }

      const hadSuccessfulAction = results.some(item => String(item?.status || "") === "ok");
      if (!hadSuccessfulAction && (Date.now() - stepStartedAt) > ESCAPE_STEP_TIMEOUT_MS) {
        const failedItem = (results || []).find(item => isActionFailureStatus(item?.status)) || {};
        await triggerEscapeHatch(step, `Step runtime exceeded ${ESCAPE_STEP_TIMEOUT_MS}ms`, "RECOVERED", {
          targetUrl: "https://google.com",
          failedAction: failedItem.action || "",
          failedSelector: failedItem.selector || ""
        });
        continue;
      }

      if (shouldCompleteImmediatelyFromAction(goal, results)) {
        const doneLine = `Step ${step}: DONE (action-complete)`;
        taskLog.push(doneLine);
        stepLogMsg(doneLine);
        completed = true;
        break;
      }

      if (escapeContext.active && step > escapeContext.lastTriggeredStep) {
        escapeContext.active = false;
      }

      const allFailed = results.every(r => r.status === "error" || r.status === "blocked");
      failures = allFailed ? failures + 1 : 0;
      if (failures >= MAX_RETRIES) { errLog("Circuit breaker: stopping."); break; }

      // SANITY CHECK: Detect if agent is "bling-induced psychotic" (completely confused)
      const psychosisState = detectPsychosisState(taskLog, failures, step);
      if (psychosisState === "psychotic") {
        errLog("🤪 BLING-INDUCED PSYCHOSIS DETECTED: Agent is thoroughly confused and looping.");
        narrate("I'm completely lost and keep repeating the same mistakes. I need your help to get back on track.");
        askUser(
          `I'm stuck! I've been trying to "${goal}" but keep failing on ${finalState.url}. What should I do differently?`,
          `Last attempts: ${taskLog.slice(-3).join(" | ")}`
        );
        broadcast("sanity_check", {
          severity: "psychotic",
          msg: `I seem to be stuck repeating the same actions. What exactly should I do next?`,
          lastSteps: taskLog.slice(-5),
          url: finalState.url,
          goal: goal
        });
        requiresHuman = true;
        break;
      } else if (psychosisState === "confused" && step % 10 === 0) {
        think("⚠️  Confusion detected — offering guidance checkpoint.");
        narrate(`I'm making slow progress on step ${step}. The task is: "${goal}". Feel free to send me guidance if I'm going the wrong direction.`);
        askUser(
          `Still working on "${goal}" (step ${step}). Am I on the right track? Any guidance helps!`,
          `Current URL: ${finalState.url}`
        );
        broadcast("sanity_check", {
          severity: "confused",
          msg: `Still working on: "${goal}". Making progress slowly. Should I continue?`,
          step: step,
          url: finalState.url
        });
      }

      const postStepPause = gentleModeActive ? CAPTCHA_GENTLE_POST_STEP_PAUSE_MS : BASE_POST_STEP_PAUSE_MS;
      await sleepLikeHuman(postStepPause, page, { x: Math.round((finalState.inputs?.length ? 0.2 : 0.55) * 1000), y: Math.round((finalState.buttons?.length ? 0.35 : 0.45) * 1000) });
      const newState      = await withExecutorWork(() => getPageState());
      const liveVisionNow = getTaskVisionSnapshot();
      const liveVisionAgeMs = liveVisionNow.lastFrameAt ? (Date.now() - liveVisionNow.lastFrameAt) : Number.POSITIVE_INFINITY;
      const liveVisionFresh = liveVisionAgeMs <= VISION_STREAM_FRESH_MS;
      const liveVisionUsable = liveVisionFresh && !!liveVisionNow.summary && String(liveVisionNow.signal?.state || "") !== "uncertain";
      if (liveVisionUsable) {
        visionFeedback = liveVisionNow.summary;
      } else {
        const screenshotB64 = await withExecutorWork(() => getVisionScreenshotB64({ broadcastImage: false, writeFile: false }));
        visionFeedback = await withExecutorWork(() => analyzeScreen(screenshotB64, newState, lastAction, goal, models));
      }
      finalState          = newState;

      broadcast("vision_stats", {
        fps: VISION_STREAM_FPS,
        seq: liveVisionNow.seq,
        changedFrames: liveVisionNow.changedFrames,
        unchangedFrames: liveVisionNow.unchangedFrames,
        droppedFrames: liveVisionNow.droppedFrames,
        ageMs: Number.isFinite(liveVisionAgeMs) ? Math.round(liveVisionAgeMs) : null,
        fresh: liveVisionFresh,
        usable: liveVisionUsable,
        summary: liveVisionNow.summary || visionFeedback || ""
      });

      const verification = await withExecutorWork(() => verifyGoalCompletion(goal, newState, visionFeedback, taskLog, models));
      if (verification.done) {
        const doneLine = `Step ${step}: DONE (verified)${verification.reason ? ` — ${verification.reason}` : ""}`;
        taskLog.push(doneLine);
        stepLogMsg(doneLine);
        completed = true;
        break;
      }

      plannerHistory.push({
        role: "user",
        content: `Results: ${JSON.stringify(results)}\nVision: ${visionFeedback}`
      });

      await sleepLikeHuman(600, page);
    }

    const answer = requiresHuman
      ? `I hit a CAPTCHA/challenge on ${finalState.url} and paused for manual help after ${CAPTCHA_HUMAN_CHECK_LIMIT} automated attempts. Please complete the challenge in the browser, then retry the task.`
      : await summarizeResult(goal, finalState, taskLog, visionFeedback, completed, models);
    appendLearningEvent({
      kind: "task",
      phase: "end",
      goal: String(goal || "").slice(0, 240),
      host: getHostFromUrl(finalState.url),
      completed: !!(completed && !requiresHuman),
      steps: taskLog.length,
      result: String(answer || "").slice(0, 260)
    });
    saveMemory({ goal, result: answer.slice(0, 200), completed, steps: taskLog.length });
    if (chatId) {
      appendChatMessage(chatId, "assistant", answer, { goal, completed });
      broadcast("chat_sync", { chatId });
    }
    broadcast("task_done", { answer, completed: completed && !requiresHuman });
    return answer;
  } finally {
    const visionStats = stopTaskVisionPipeline();
    broadcast("vision_stats", {
      fps: VISION_STREAM_FPS,
      changedFrames: visionStats.changedFrames,
      unchangedFrames: visionStats.unchangedFrames,
      droppedFrames: visionStats.droppedFrames,
      summary: visionStats.lastSummary,
      ended: true
    });
    stopIdleHumanBehavior();
    stopHumanBridgeWatchdog();
    clearHumanBridgeState();
    broadcast("bridge_closed", { msg: "Human bridge closed for this run.", url: page ? page.url() : "about:blank" });
    agentRunning = false;
    currentTaskUserId = null; // release user scope after task completes
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP SERVER (REST + SSE + Frontend)
// ─────────────────────────────────────────────────────────────────────────────
const FRONTEND_HTML = require("./public/frontend").FRONTEND_HTML;

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch(err => {
    console.error("[server] unhandled:", err.message);
    if (!res.headersSent) { try { res.writeHead(500); res.end("internal error"); } catch {} }
  });
});

async function handleRequest(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = requestUrl.pathname;
  const chatMatch = pathname.match(/^\/api\/chats\/([^/]+)$/);
  const selectMatch = pathname.match(/^\/api\/chats\/([^/]+)\/select$/);
  const modelsMatch = pathname.match(/^\/api\/chats\/([^/]+)\/models$/);
  const pinchTicketMessageMatch = pathname.match(/^\/api\/pinch\/tickets\/([^/]+)\/message$/);

  const requestOrigin = req.headers.origin;
  if (requestOrigin) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": requestOrigin || "*",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Vary": "Origin"
    });
    res.end();
    return;
  }

  if (pathname === "/" || pathname === "/index.html" || pathname === "/upgrade") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(FRONTEND_HTML);
    return;
  }

  if (pathname === "/auth/session") {
    const auth = getAuth(req);
    sendJson(res, 200, {
      authenticated: !!auth,
      username: auth?.email || auth?.username || null,
      userId: auth?.userId || null,
      verified: auth?.verified ?? null,
      pinchCustomerId: auth?.pinchCustomerId || null,
      subscription: auth?.subscriptionPlan || "none",
      subscriptionStatus: auth?.subscriptionStatus || "unsubscribed",
      usingDefaultCredentials: APP_USERNAME === "admin" && APP_PASSWORD === "puppeterr"
    });
    return;
  }

  if (pathname === "/auth/verify" && req.method === "GET") {
    const verifyToken = new URL(req.url, "http://localhost").searchParams.get("token");
    if (!verifyToken) {
      res.writeHead(400, { "Content-Type": "text/html" });
      res.end("<html><body style='font-family:sans-serif;background:#0a1018;color:#e8eff7;padding:40px;text-align:center'><h2>&#x274C; Invalid verification link.</h2><p>This link is missing its token. Please check your email and try again.</p></body></html>");
      return;
    }
    const allUsers = loadUsers();
    const targetUser = allUsers.find(u => u.verification_token === verifyToken);
    if (!targetUser) {
      res.writeHead(400, { "Content-Type": "text/html" });
      res.end("<html><body style='font-family:sans-serif;background:#0a1018;color:#e8eff7;padding:40px;text-align:center'><h2>&#x274C; Link invalid or already used.</h2><p>This verification link has already been used or doesn't exist. Try signing in, or contact support.</p></body></html>");
      return;
    }
    if (Date.now() > Number(targetUser.verification_token_exp || 0)) {
      res.writeHead(400, { "Content-Type": "text/html" });
      res.end("<html><body style='font-family:sans-serif;background:#0a1018;color:#e8eff7;padding:40px;text-align:center'><h2>&#x23F0; Verification link expired.</h2><p>This link expired after 24 hours. Please sign up again with the same email to get a new link.</p></body></html>");
      return;
    }
    targetUser.verified = true;
    targetUser.verification_token = null;
    targetUser.verification_token_exp = null;
    targetUser.updatedAt = new Date().toISOString();
    saveUsers(allUsers);
    setAuthCookie(res, createAuthToken({ id: targetUser.id, email: targetUser.email }));
    // Redirect back to app — they'll be signed in automatically
    res.writeHead(302, { "Location": "/" });
    res.end();
    return;
  }

  if (pathname === "/auth/signup" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const signedUpUser = await signupUser({
        email: body.email,
        password: body.password
      });
      // Only set cookie immediately if verification is not required (user is auto-verified)
      if (!REQUIRE_EMAIL_VERIFICATION) {
        setAuthCookie(res, createAuthToken({
          id: signedUpUser.id,
          email: signedUpUser.email
        }));
      }
      sendJson(res, 200, {
        status: "success",
        user_id: signedUpUser.id,
        pinch_customer_id: signedUpUser.pinch_customer_id,
        subscription: "none",
        pinch_warning: signedUpUser.pinch_warning || null,
        requires_verification: REQUIRE_EMAIL_VERIFICATION
      });
    } catch (err) {
      const statusCode = Number.isFinite(Number(err?.code)) ? Number(err.code) : 400;
      sendJson(res, statusCode >= 400 ? statusCode : 400, { error: err.message || "Signup failed" });
    }
    return;
  }

  if (pathname === "/auth/login" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const emailOrUsername = String(body.email || body.username || "").trim();
      const password = String(body.password || "");
      const normalizedEmail = normalizeEmail(emailOrUsername);

      const user = normalizedEmail ? findUserByEmail(normalizedEmail) : null;
      if (user) {
        const passwordOk = await bcrypt.compare(password, String(user.password_hash || ""));
        if (!passwordOk) {
          sendJson(res, 401, { error: "Invalid email or password" });
          return;
        }
        if (REQUIRE_EMAIL_VERIFICATION && !user.verified) {
          sendJson(res, 403, { error: "Email verification required before login" });
          return;
        }
        setAuthCookie(res, createAuthToken({ id: user.id, email: user.email }));
        sendJson(res, 200, {
          ok: true,
          username: user.email,
          userId: user.id,
          subscription: user.subscription_plan || "none"
        });
        return;
      }

      // Legacy single-user fallback remains for local admin/dev mode.
      if (emailOrUsername !== APP_USERNAME || password !== APP_PASSWORD) {
        sendJson(res, 401, { error: "Invalid email or password" });
        return;
      }
      setAuthCookie(res, createAuthToken(APP_USERNAME));
      sendJson(res, 200, { ok: true, username: APP_USERNAME });
    } catch {
      sendJson(res, 400, { error: "Invalid request body" });
    }
    return;
  }

  if (pathname === "/auth/logout" && req.method === "POST") {
    clearAuthCookie(res);
    sendJson(res, 200, { ok: true });
    return;
  }

  // Human bridge is opened in a new tab by the main UI.
  // State endpoint is read-only so no auth needed. Click relay keeps auth.
  if (pathname === "/human-bridge") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(HUMAN_BRIDGE_HTML);
    return;
  }

  // Mid-task user guidance endpoint
  if (pathname === "/api/guidance" && req.method === "POST") {
    if (!getAuth(req)) { sendJson(res, 401, { error: "Unauthorized" }); return; }
    try {
      const body = await readJsonBody(req);
      const text = String(body.text || "").trim();
      if (!text) { sendJson(res, 400, { error: "text required" }); return; }
      guidanceQueue.push({ text, ts: Date.now() });
      think(`📬 User guidance queued: ${text}`);
      broadcast("guidance_received", { msg: `Guidance received: "${text}"` });
      sendJson(res, 200, { ok: true, queued: guidanceQueue.length });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  if (pathname === "/api/human/state") {
    sendJson(res, 200, {
      active: !!humanBridgeState.active,
      checks: Number(humanBridgeState.checks || 0),
      limit: CAPTCHA_HUMAN_CHECK_LIMIT,
      url: humanBridgeState.url || (page ? page.url() : "about:blank"),
      reason: humanBridgeState.reason || "",
      closureReason: humanBridgeState.closureReason || "",
      visionLastCheckAt: humanBridgeState.visionLastCheckAt || null,
      visionLastSummary: humanBridgeState.visionLastSummary || "",
      clickCount: Number(humanBridgeState.clickCount || 0),
      lastClickAt: humanBridgeState.lastClickAt || null,
      lastClick: humanBridgeState.lastClick || null,
      agentRunning: !!agentRunning
    });
    return;
  }

  if (pathname === "/api/analyze-image" && req.method === "POST") {
    if (!getAuth(req)) { sendJson(res, 401, { error: "Unauthorized" }); return; }
    try {
      const body = await readJsonBody(req);
      const mediaItems = normalizeIncomingMedia(body).filter(item => item.mediaType === "image");
      if (!mediaItems.length) { sendJson(res, 400, { error: "image media required" }); return; }
      const catalog = await fetchModelCatalog(false);
      const defaults = resolveDefaultModels(catalog);
      const mediaResult = await runMediaAnalysis(mediaItems, { vision: defaults.vision, router: defaults.router }, String(body.prompt || body.query || ""));
      broadcast("media_result", { taskType: mediaResult.taskType, mediaCount: mediaItems.length });
      sendJson(res, 200, {
        ok: true,
        taskType: mediaResult.taskType,
        analysis: mediaResult.analysis,
        routerSwap: mediaResult.routerMeta,
        media: mediaItems.map(buildMediaReference)
      });
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Image analysis failed" });
    }
    return;
  }

  if (pathname === "/api/analyze-layout" && req.method === "POST") {
    if (!getAuth(req)) { sendJson(res, 401, { error: "Unauthorized" }); return; }
    try {
      const body = await readJsonBody(req);
      const mediaItems = normalizeIncomingMedia(body).filter(item => item.mediaType === "image");
      if (!mediaItems.length) { sendJson(res, 400, { error: "image media required" }); return; }
      const catalog = await fetchModelCatalog(false);
      const defaults = resolveDefaultModels(catalog);
      const primary = mediaItems[0];
      const analysis = await analyzePageLayout(primary.dataB64, String(body.prompt || body.query || ""), defaults.vision, primary.mimeType);
      sendJson(res, 200, {
        ok: true,
        taskType: analysis.taskType,
        analysis,
        media: mediaItems.map(buildMediaReference)
      });
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Layout analysis failed" });
    }
    return;
  }

  if (pathname === "/api/analyze-current-ui" && req.method === "POST") {
    if (!getAuth(req)) { sendJson(res, 401, { error: "Unauthorized" }); return; }
    try {
      const body = await readJsonBody(req);
      const analysis = await analyzeCurrentBrowserUILayout(String(body.prompt || body.query || ""), auth?.userId || null);
      sendJson(res, 200, {
        ok: true,
        taskType: analysis.taskType,
        url: analysis.url,
        analysis
      });
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Current UI analysis failed" });
    }
    return;
  }

  if (pathname === "/api/analyze-media" && req.method === "POST") {
    if (!getAuth(req)) { sendJson(res, 401, { error: "Unauthorized" }); return; }
    try {
      const body = await readJsonBody(req);
      const mediaItems = normalizeIncomingMedia(body);
      if (!mediaItems.length) { sendJson(res, 400, { error: "media required" }); return; }
      const catalog = await fetchModelCatalog(false);
      const defaults = resolveDefaultModels(catalog);
      const mediaResult = await runMediaAnalysis(mediaItems, { vision: defaults.vision, router: defaults.router }, String(body.prompt || body.query || ""));
      sendJson(res, 200, {
        ok: true,
        taskType: mediaResult.taskType,
        analysis: mediaResult.analysis,
        routerSwap: mediaResult.routerMeta,
        media: mediaItems.map(buildMediaReference)
      });
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Media analysis failed" });
    }
    return;
  }

  if (pathname === "/api/analyze-shapes" && req.method === "POST") {
    if (!getAuth(req)) { sendJson(res, 401, { error: "Unauthorized" }); return; }
    try {
      const body = await readJsonBody(req);
      const imageB64 = String(body.imageB64 || "").trim();
      if (!imageB64) { sendJson(res, 400, { error: "imageB64 required" }); return; }
      status("Analyzing shapes and semantic content…");
      const shapeDetector = require("./shapeDetector");
      const analysis = await shapeDetector.analyzeImageFull(imageB64);
      broadcast("shape_result", { shapes: analysis.analysis.shapes.length, semantic: analysis.analysis.semantic.description });
      sendJson(res, 200, analysis);
    } catch (err) {
      sendJson(res, 500, { error: err.message || "Shape analysis failed" });
    }
    return;
  }

  if (pathname === "/api/human/click" && req.method === "POST") {
    if (!getAuth(req)) { sendJson(res, 401, { error: "Unauthorized" }); return; }
    try {
      const body = await readJsonBody(req);
      const result = await relayHumanClick(body);
      sendJson(res, 200, { ok: true, ...result });
    } catch (err) {
      sendJson(res, 400, { error: err.message || "Failed to relay click" });
    }
    return;
  }

  const auth = requireAuth(req, res);
  if (!auth) return;

  if (pathname === "/api/pinch/tickets" && req.method === "GET") {
    try {
      const tickets = await pinchListTickets();
      sendJson(res, 200, { tickets, count: tickets.length });
    } catch (err) {
      const statusCode = Number.isFinite(Number(err?.code)) ? Number(err.code) : 500;
      sendJson(res, statusCode >= 400 ? statusCode : 500, {
        error: err.message || "Pinch tickets request failed",
        details: err.details || null
      });
    }
    return;
  }

  if (pinchTicketMessageMatch && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const ticketId = String(pinchTicketMessageMatch[1] || "").trim();
      const message = String(body.body || body.message || "").trim();
      if (!ticketId || !message) {
        sendJson(res, 400, { error: "ticketId and body are required" });
        return;
      }
      const response = await pinchSendTicketMessage(ticketId, message);
      sendJson(res, 200, { ok: true, ticketId, response });
    } catch (err) {
      const statusCode = Number.isFinite(Number(err?.code)) ? Number(err.code) : 500;
      sendJson(res, statusCode >= 400 ? statusCode : 500, {
        error: err.message || "Pinch send message failed",
        details: err.details || null
      });
    }
    return;
  }

  if (pathname === "/api/pinch/webhooks" && req.method === "GET") {
    try {
      const webhooks = await pinchListWebhooks();
      sendJson(res, 200, { webhooks, count: webhooks.length });
    } catch (err) {
      const statusCode = Number.isFinite(Number(err?.code)) ? Number(err.code) : 500;
      sendJson(res, statusCode >= 400 ? statusCode : 500, {
        error: err.message || "Pinch webhooks request failed",
        details: err.details || null
      });
    }
    return;
  }

  if (pathname === "/api/pinch/webhook-types" && req.method === "GET") {
    try {
      const types = await pinchListWebhookTypes();
      sendJson(res, 200, { types, count: types.length });
    } catch (err) {
      const statusCode = Number.isFinite(Number(err?.code)) ? Number(err.code) : 500;
      sendJson(res, statusCode >= 400 ? statusCode : 500, {
        error: err.message || "Pinch webhook types request failed",
        details: err.details || null
      });
    }
    return;
  }

  if (pathname === "/events") {
    res.writeHead(200, {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive"
    });
    res.write("data: " + JSON.stringify({ type: "status", msg: "Connected" }) + "\n\n");
    sseClients.push(res);
    req.on("close", () => { sseClients = sseClients.filter(client => client !== res); });
    return;
  }

  if (pathname === "/screenshot") {
    try {
      if (!page) { res.writeHead(503); res.end("browser not ready"); return; }
      const humanView = requestUrl.searchParams.get("human") === "1";
      const buf = await page.screenshot({
        type: "jpeg",
        quality: humanView ? 58 : 75,
        scale: "css"
      });
      res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "no-store" });
      res.end(buf);
    } catch {
      res.writeHead(500);
      res.end("error");
    }
    return;
  }

  if (pathname === "/url") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(page ? page.url() : "about:blank");
    return;
  }

  if (pathname === "/memory") {
    sendJson(res, 200, loadMemory());
    return;
  }

  if (pathname === "/api/bootstrap") {
    const catalog = await fetchModelCatalog(requestUrl.searchParams.get("force") === "1");
    sendJson(res, 200, buildBootstrapPayload(catalog, auth));
    return;
  }

  if (pathname === "/api/models") {
    const catalog = await fetchModelCatalog(requestUrl.searchParams.get("force") === "1");
    const { chat } = ensureCurrentChat(auth?.userId || null);
    sendJson(res, 200, { catalog, current: getActiveModels(chat), defaults: DEFAULT_MODELS, modelParams: getActiveModelParams(chat) });
    return;
  }

  if (pathname === "/api/chats" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const chat = createChat(body.title || "New Chat", auth?.userId || null);
      sendJson(res, 201, { chat, selectedChatId: chat.id });
    } catch {
      sendJson(res, 400, { error: "Invalid request body" });
    }
    return;
  }

  if (chatMatch && req.method === "GET") {
    const { store } = ensureCurrentChat(auth?.userId || null);
    const chat = store.chats.find(item => item.id === chatMatch[1]);
    if (!chat) {
      sendJson(res, 404, { error: "Chat not found" });
      return;
    }
    sendJson(res, 200, { chat, selectedChatId: store.selectedChatId });
    return;
  }

  if (selectMatch && req.method === "POST") {
    const userId = auth?.userId || null;
    let chat = setCurrentChat(selectMatch[1], userId);
    if (!chat) {
      // Chat not found in user's store (stale ID from before per-user isolation).
      // Fall back gracefully: use or create the user's current chat.
      const fallback = ensureCurrentChat(userId);
      chat = fallback.chat;
    }
    const catalog = await fetchModelCatalog(false);
    sendJson(res, 200, buildBootstrapPayload(catalog, auth));
    return;
  }

  if (modelsMatch && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const chat = updateChatModels(modelsMatch[1], body.models || {}, auth?.userId || null, body.params || {});
      if (!chat) {
        sendJson(res, 404, { error: "Chat not found" });
        return;
      }
      const catalog = await fetchModelCatalog(false);
      sendJson(res, 200, { current: getActiveModels(chat), catalog, chat, modelParams: getActiveModelParams(chat) });
    } catch {
      sendJson(res, 400, { error: "Invalid request body" });
    }
    return;
  }

  if (pathname === "/chat" && req.method === "POST" ||
      pathname === "/chat/" && req.method === "POST" ||
      pathname === "/api/chat" && req.method === "POST" ||
      pathname === "/api/chat/" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const rawMessage = String(body.message || "").trim();
      const userId = auth?.userId || null;
      const chatId = body.chatId || ensureCurrentChat(userId).chat.id;
      const mediaItems = normalizeIncomingMedia(body);
      const mediaTaskType = mediaItems.length ? classifyMediaTask(mediaItems) : null;
      const shouldAnalyzeLiveUi = !mediaItems.length && wantsPageLayoutAnalysis(rawMessage);

      let message = rawMessage;
      let mediaAnalysisMeta = null;
      if (mediaItems.length) {
        const { chat: mediaChat } = ensureCurrentChat(userId);
        const mediaModels = attachModelRuntimeParams(getActiveModels(mediaChat), getActiveModelParams(mediaChat));
        const mediaResult = await runMediaAnalysis(mediaItems, mediaModels, rawMessage);
        const refs = mediaItems.map(buildMediaReference);
        const summary = String(mediaResult?.analysis?.text || "Media attached.");
        const structured = mediaResult?.analysis?.structured || {};
        const structuredJson = JSON.stringify(structured).slice(0, 2200);
        const mediaContext = `[Attached media analysis]\nTask: ${mediaResult.taskType}\nMedia IDs: ${refs.map(r => r.id).join(", ") || "none"}\nSummary:\n${summary}\n\nStructured:\n${structuredJson}`;
        message = rawMessage ? `${rawMessage}\n\n${mediaContext}` : mediaContext;
        mediaAnalysisMeta = {
          taskType: mediaResult.taskType,
          analysis: mediaResult.analysis,
          routerSwap: mediaResult.routerMeta,
          media: refs
        };
        status(`Media enriched: ${refs.length} item(s), task=${mediaResult.taskType}.`);
      } else if (shouldAnalyzeLiveUi) {
        const liveLayout = await analyzeCurrentBrowserUILayout(rawMessage, userId);
        const liveLayoutContext = `[Current browser UI layout]\nURL: ${liveLayout.url}\n${liveLayout.formatted}`;
        message = rawMessage ? `${rawMessage}\n\n${liveLayoutContext}` : liveLayoutContext;
        mediaAnalysisMeta = {
          taskType: liveLayout.taskType,
          analysis: liveLayout,
          media: [{ id: "live_browser_ui", source: "agent_screenshot", mediaType: "image", kind: "screenshot", mimeType: "image/jpeg", fileName: "live-browser-ui.jpg", previewUrl: "/screenshot", thumbnailUrl: "/screenshot" }]
        };
        status("Live browser UI analyzed via vision.");
      }

      if (!message && !mediaItems.length) {
        sendJson(res, 400, { error: "Message is required" });
        return;
      }

      if (agentRunning) {
        sendJson(res, 409, { error: "Agent is already running a task" });
        return;
      }

      // Set the active user for the duration of this task so appendChatMessage in the executor writes to the right store
      currentTaskUserId = userId;

      let activeChat = setCurrentChat(chatId, userId);
      if (!activeChat) {
        // chatId is stale (e.g. after server restart) — fall back to current chat
        const fallback = ensureCurrentChat(userId);
        activeChat = fallback.chat;
      }

      const command = parseSlashCommand(rawMessage);
      const explicitSlashAction = command ? resolveExplicitSlashAction(command) : { kind: "unknown" };
      const slashModel = command ? resolveSlashModelCommand(command) : null;
      if (slashModel && command) {
        if (slashModel.kind === "reset") {
          clearRuntimeModelOverride(chatId, userId);
          appendChatMessage(chatId, "user", message, { command: command.command }, userId);
          appendChatMessage(chatId, "assistant", "Model override cleared. I'll go back to the chat's saved models until you set another command.", { completed: true, command: command.command, model: null }, userId);
          sendJson(res, 200, { ok: true, chatId, command: command.command, model: null, reset: true });
          broadcast("chat_sync", { chatId });
          currentTaskUserId = null;
          return;
        }
        if (slashModel.kind === "model") {
          if (!slashModel.modelId) {
            appendChatMessage(chatId, "user", message, { command: command.command }, userId);
            appendChatMessage(chatId, "assistant", `I couldn't find a model matching "${slashModel.query}" in the catalog, so I left the current model active.`, { completed: true, command: command.command, model: null, matched: false }, userId);
            sendJson(res, 200, { ok: true, chatId, command: command.command, model: null, matched: false });
            broadcast("chat_sync", { chatId });
            currentTaskUserId = null;
            return;
          }
          setRuntimeModelOverride(chatId, slashModel.modelId, userId);
          appendChatMessage(chatId, "user", message, { command: command.command }, userId);
          appendChatMessage(chatId, "assistant", `Model override set to ${slashModel.modelId}. I'll keep using it until you start a new task or reset it.`, { completed: true, command: command.command, model: slashModel.modelId, matched: true }, userId);
          sendJson(res, 200, { ok: true, chatId, command: command.command, model: slashModel.modelId, matched: true });
          broadcast("chat_sync", { chatId });
          currentTaskUserId = null;
          return;
        }
      }

      if (command && explicitSlashAction.kind === "help") {
        appendChatMessage(chatId, "user", rawMessage, { command: command.command }, userId);
        const helpText = buildSlashHelpText();
        appendChatMessage(chatId, "assistant", helpText, { completed: true, command: command.command }, userId);
        sendJson(res, 200, { ok: true, chatId, command: command.command, help: helpText });
        broadcast("chat_sync", { chatId });
        currentTaskUserId = null;
        return;
      }

      if (command && explicitSlashAction.kind === "image") {
        const imagePrompt = buildImageCommandPrompt(command);
        appendChatMessage(chatId, "user", rawMessage, { command: command.command }, userId);
        if (!imagePrompt) {
          appendChatMessage(chatId, "assistant", "Use /image followed by a prompt. You can also pass options like --style, --size, or --negative.", { completed: true, command: command.command }, userId);
          sendJson(res, 200, { ok: true, chatId, command: command.command, error: "missing_prompt" });
          broadcast("chat_sync", { chatId });
          currentTaskUserId = null;
          return;
        }

        try {
          const generated = await generateImageFromPrompt(imagePrompt, attachModelRuntimeParams(getActiveModels(activeChat), getActiveModelParams(activeChat)));
          const assistantText = `Generated an image for: ${imagePrompt}`;
          appendChatMessage(chatId, "assistant", assistantText, {
            completed: true,
            command: command.command,
            generatedImage: generated.image,
            routerSwap: generated.routerMeta
          }, userId);
          sendJson(res, 200, { ok: true, chatId, command: command.command, generatedImage: generated.image, routerSwap: generated.routerMeta });
          broadcast("chat_sync", { chatId });
        } catch (err) {
          appendChatMessage(chatId, "assistant", `Image generation failed: ${err.message}`, {
            completed: true,
            command: command.command,
            error: true
          }, userId);
          sendJson(res, 200, { ok: true, chatId, command: command.command, error: err.message || "Image generation failed" });
          broadcast("chat_sync", { chatId });
        }
        currentTaskUserId = null;
        return;
      }

      if (command && explicitSlashAction.kind === "browser") {
        const browserGoal = buildBrowserCommandGoal(command, mediaItems.length ? message : "");
        if (!browserGoal) {
          appendChatMessage(chatId, "user", rawMessage, { command: command.command }, userId);
          appendChatMessage(chatId, "assistant", "Use /browser followed by the task you want me to do in the browser. You can also pass options like --url, --site, or --goal.", { completed: true, command: command.command }, userId);
          sendJson(res, 200, { ok: true, chatId, command: command.command, error: "missing_prompt" });
          broadcast("chat_sync", { chatId });
          currentTaskUserId = null;
          return;
        }

        if (getRuntimeModelOverride(activeChat)) {
          clearRuntimeModelOverride(chatId, userId);
        }

        appendChatMessage(chatId, "user", rawMessage, { command: command.command }, userId);
        sendJson(res, 202, { ok: true, chatId, command: command.command, media: mediaAnalysisMeta });
        const { chat } = ensureCurrentChat(userId);
        const models = attachModelRuntimeParams(getActiveModels(chat), getActiveModelParams(chat));
        await runTask(browserGoal, models, chatId);
        broadcast("url", { url: page.url() });
        return;
      }

      if (command && explicitSlashAction.kind === "unknown") {
        appendChatMessage(chatId, "user", rawMessage, { command: command.command }, userId);
        const helpText = buildSlashHelpText();
        appendChatMessage(chatId, "assistant", `Unknown slash command: /${command.command}\n\n${helpText}`, { completed: true, command: command.command, error: true }, userId);
        sendJson(res, 200, { ok: true, chatId, command: command.command, error: "unknown_command", help: helpText });
        broadcast("chat_sync", { chatId });
        currentTaskUserId = null;
        return;
      }

      appendChatMessage(chatId, "user", message, {}, userId);
      sendJson(res, 202, { ok: true, chatId, media: mediaAnalysisMeta });

      const { chat } = ensureCurrentChat(userId);
      const models = attachModelRuntimeParams(getActiveModels(chat), getActiveModelParams(chat));
      const chatReply = await answerCasualChat(message, sessionHistory, models);
      appendChatMessage(chatId, "assistant", chatReply, { completed: true });
      agentMsg(chatReply);
      broadcast("chat_sync", { chatId });
      currentTaskUserId = null;
    } catch (err) {
      errLog("Chat handler: " + err.message);
      broadcast("task_done", { answer: "Something went wrong: " + err.message, completed: false });
      agentRunning = false;
      currentTaskUserId = null;
    }
    return;
  }

  res.writeHead(404);
  res.end("not found");
}

// ─────────────────────────────────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────────────────────────────────
(async () => {
  try {
    if (!CF_API_TOKEN || !CF_ACCOUNT_ID) {
      console.error("❌ Missing CF_API_TOKEN or CF_ACCOUNT_ID"); process.exit(1);
    }

    await runCloudflareStartupPreflight();

    console.log("🚀 Launching browser...");
    fs.mkdirSync(BROWSER_PROFILE_DIR, { recursive: true });
    context = await chromium.launchPersistentContext(BROWSER_PROFILE_DIR, {
      headless: false,
      executablePath: require("playwright").chromium.executablePath(),
      userAgent: FINGERPRINT_USER_AGENT,
      locale: FINGERPRINT_LOCALE,
      timezoneId: FINGERPRINT_TIMEZONE,
      viewport: { width: FINGERPRINT_VIEWPORT_WIDTH, height: FINGERPRINT_VIEWPORT_HEIGHT },
      screen: { width: FINGERPRINT_VIEWPORT_WIDTH, height: FINGERPRINT_VIEWPORT_HEIGHT },
      args: [
        "--no-sandbox","--disable-setuid-sandbox",
        "--disable-infobars",
        "--window-position=0,0",
        `--window-size=${FINGERPRINT_VIEWPORT_WIDTH},${FINGERPRINT_VIEWPORT_HEIGHT}`
      ]
    });
    await context.addInitScript(({ platform, cpuCores }) => {
      const applyOverride = (target, key, value) => {
        try {
          Object.defineProperty(target, key, {
            get: () => value,
            configurable: true
          });
        } catch {}
      };

      applyOverride(window.Navigator.prototype, "platform", platform);
      applyOverride(window.Navigator.prototype, "hardwareConcurrency", cpuCores);
    }, { platform: FINGERPRINT_PLATFORM, cpuCores: FINGERPRINT_CPU_CORES });

    browser = context.browser();
    page = context.pages()[0] || await context.newPage();
    await page.bringToFront().catch(() => {});

    await context.setDefaultNavigationTimeout(90000);
    await context.setDefaultTimeout(45000);
    await context.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9"
    });

    await page.setViewportSize({ width: FINGERPRINT_VIEWPORT_WIDTH, height: FINGERPRINT_VIEWPORT_HEIGHT }).catch(() => {});
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9"
    });

    const sessionState = await loadSessionState({ localPath: SESSION_FILE });
    if (sessionState) console.log("📋 Found legacy storage state file: " + SESSION_FILE);

    await context.addCookies([]).catch(() => {});
    if (sessionState) {
      try {
        if (Array.isArray(sessionState.cookies) && sessionState.cookies.length) {
          await context.addCookies(sessionState.cookies);
        }
      } catch (err) {
        console.warn("⚠️ Could not import legacy session storage:", err.message);
      }
    }

    /* Legacy non-persistent context options kept for reference:
    context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      locale: "en-US",
      viewport: { width: 1366, height: 768 },
      screen:   { width: 1366, height: 768 },
      permissions:   ["geolocation"],
      colorScheme:   "light"
    });
    */

    const currentUrl = (() => {
      try { return page.url(); } catch { return "about:blank"; }
    })();
    const startUrl = process.env.START_URL || "https://www.google.com";
    if (!currentUrl || currentUrl === "about:blank") {
      await page.goto(startUrl, { waitUntil: "domcontentloaded" });
    } else {
      console.log("↩️ Reusing persistent page: " + currentUrl);
    }
    ensureCurrentChat(null); // startup: use legacy admin store
    loadLearningLog();

    server.listen(PORT, HOST, () => {
      console.log(`\n✅ AGI Terminal running!`);
      console.log(`   Open: http://localhost:${PORT}`);
      console.log(`   (Codespaces: forward port ${PORT})\n`);
    });

    setInterval(async () => {
      if (page) broadcast("url", { url: page.url() });
    }, 2000);

    await new Promise(() => {});

  } catch (err) {
    console.error("💥 Fatal:", err);
    process.exit(1);
  }
})();