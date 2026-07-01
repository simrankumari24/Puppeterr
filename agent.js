const { chromium } = require("playwright-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs   = require("fs");
const http = require("http");
const crypto = require("crypto");
const path = require("path");
const { execSync, exec } = require("child_process");
const actions = require("./actions");
const { HUMAN_BRIDGE_HTML } = require("./humanBridge");
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
  fs.readFileSync(".env", "utf8").split("\n").forEach(line => {
    const [k, ...v] = line.split("=");
    if (k && v.length && !process.env[k.trim()]) process.env[k.trim()] = v.join("=").trim();
  });
}

const CF_API_TOKEN  = process.env.CF_API_TOKEN;
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const SESSION_FILE  = "session.json";
const CHAT_STORE_FILE = "chat-history.json";
const LOG_FILE = "log.json";
const { loadSessionState } = require("./sessionStore");
const BROWSER_PROFILE_DIR = process.env.BROWSER_PROFILE_DIR || path.join(process.cwd(), ".puppeterr-profile");
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
const VISION_STREAM_FRESH_MS = Math.max(600, Number(process.env.VISION_STREAM_FRESH_MS || 1800));
const VISION_CLICK_CANDIDATE_COUNT = 10;
const HYBRID_SELECTOR_VARIANTS = Math.max(1, Math.min(5, Number(process.env.HYBRID_SELECTOR_VARIANTS || 5)));
const HYBRID_URL_CHANGE_MAX_CYCLES = Math.max(1, Number(process.env.HYBRID_URL_CHANGE_MAX_CYCLES || 2));
const CONFUSION_RESEARCH_COOLDOWN_MS = Math.max(30000, Number(process.env.CONFUSION_RESEARCH_COOLDOWN_MS || 180000));
const CONFUSION_RESEARCH_RESULT_LIMIT = Math.max(3, Number(process.env.CONFUSION_RESEARCH_RESULT_LIMIT || 5));
const DYNAMIC_UI_CHANGED_FRAME_THRESHOLD = Math.max(4, Number(process.env.DYNAMIC_UI_CHANGED_FRAME_THRESHOLD || 8));
const DYNAMIC_UI_CHANGE_RATIO = Math.max(1, Number(process.env.DYNAMIC_UI_CHANGE_RATIO || 1.5));
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

const MODEL_ROLES = ["router", "planner", "reasoner", "vision"];
const DEFAULT_MODELS = {
  // Internal Cloudflare IDs (for example @alibaba/...) are supported via env
  // overrides and catalog resolution. These are only generic starting defaults.
  router: process.env.DEFAULT_ROUTER_MODEL || "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
  planner: process.env.DEFAULT_PLANNER_MODEL || "@cf/nvidia/nemotron-3-120b-a12b",
  reasoner: process.env.DEFAULT_REASONER_MODEL || "@anthropic/claude-sonnet-4.6",
  vision: process.env.DEFAULT_VISION_MODEL || "@cf/meta/llama-3.2-11b-vision-instruct"
};

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
  const router = pickModelId(catalog, [DEFAULT_MODELS.router, "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b"], true) || DEFAULT_MODELS.router;
  const planner = pickModelId(catalog, [DEFAULT_MODELS.planner, "@cf/nvidia/nemotron-3-120b-a12b", router], true) || router;
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

let browser, context, page;
let sessionHistory  = [];
let agentRunning    = false;
let modelCatalogCache = { expiresAt: 0, items: [] };
let learningLogCache = null;
let bridgeVisionTimer = null;
let bridgeVisionInFlight = false;
let bridgeVisionClearStreak = 0;
let bridgeVisionModelId = DEFAULT_MODELS.vision;
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

function signValue(value) {
  return crypto.createHmac("sha256", AUTH_SECRET).update(value).digest("hex");
}

function createAuthToken(username) {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + (7 * 24 * 60 * 60 * 1000) })).toString("base64url");
  return `${payload}.${signValue(payload)}`;
}

function verifyAuthToken(token) {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if (signValue(payload) !== sig) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed.u || !parsed.exp || parsed.exp < Date.now()) return null;
    return { username: parsed.u };
  } catch {
    return null;
  }
}

function getAuth(req) {
  const cookies = parseCookies(req);
  return verifyAuthToken(cookies[AUTH_COOKIE_NAME]);
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

function createChatRecord(title = "New Chat") {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title,
    createdAt: now,
    updatedAt: now,
    models: { ...resolveDefaultModels(modelCatalogCache.items) },
    messages: []
  };
}

function loadChatStore() {
  if (!fs.existsSync(CHAT_STORE_FILE)) {
    const chat = createChatRecord("Welcome Chat");
    return { selectedChatId: chat.id, chats: [chat] };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(CHAT_STORE_FILE, "utf8"));
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

function saveChatStore(store) {
  fs.writeFileSync(CHAT_STORE_FILE, JSON.stringify(store, null, 2));
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

function ensureCurrentChat() {
  const store = loadChatStore();
  let chat = store.chats.find(item => item.id === store.selectedChatId);
  if (!chat) {
    chat = store.chats[0] || createChatRecord("Welcome Chat");
    if (!store.chats.length) store.chats.push(chat);
    store.selectedChatId = chat.id;
    saveChatStore(store);
  }
  syncSessionHistory(chat);
  return { store, chat };
}

function setCurrentChat(chatId) {
  const store = loadChatStore();
  const chat = store.chats.find(item => item.id === chatId);
  if (!chat) return null;
  store.selectedChatId = chatId;
  saveChatStore(store);
  syncSessionHistory(chat);
  return chat;
}

function createChat(title = "New Chat") {
  const store = loadChatStore();
  const chat = createChatRecord(title);
  store.chats.unshift(chat);
  store.selectedChatId = chat.id;
  saveChatStore(store);
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

function setRuntimeModelOverride(chatId, modelId) {
  const store = loadChatStore();
  const chat = store.chats.find(item => item.id === chatId);
  if (!chat) return null;
  chat.runtimeModelOverride = modelId || null;
  chat.updatedAt = new Date().toISOString();
  saveChatStore(store);
  syncSessionHistory(chat);
  return chat;
}

function clearRuntimeModelOverride(chatId) {
  return setRuntimeModelOverride(chatId, null);
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
  const [command, ...rest] = raw.slice(1).split(/\s+/);
  return { command: normalizeCommandKey(command), args: rest.join(" ").trim() };
}

function resolveSlashModelCommand(command) {
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

function appendChatMessage(chatId, role, content, meta = {}) {
  const store = loadChatStore();
  const chat = store.chats.find(item => item.id === chatId);
  if (!chat) return null;
  renameChatFromPrompt(chat, role === "user" ? content : "");
  chat.messages.push({ role, content, ts: new Date().toISOString(), ...meta });
  chat.updatedAt = new Date().toISOString();
  store.selectedChatId = chatId;
  saveChatStore(store);
  syncSessionHistory(chat);
  return chat;
}

function updateChatModels(chatId, models) {
  const store = loadChatStore();
  const chat = store.chats.find(item => item.id === chatId);
  if (!chat) return null;
  chat.models = sanitizeModels({ ...(chat.models || {}), ...(models || {}) }, modelCatalogCache.items);
  chat.updatedAt = new Date().toISOString();
  saveChatStore(store);
  syncSessionHistory(chat);
  return chat;
}

function getActiveModels(chat) {
  return applyRuntimeModelOverride(chat?.models || {}, chat);
}

function buildBootstrapPayload(catalog = modelCatalogCache.items) {
  const { store, chat } = ensureCurrentChat();
  const defaults = resolveDefaultModels(catalog);
  return {
    username: APP_USERNAME,
    selectedChatId: store.selectedChatId,
    chats: store.chats.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).map(summarizeChat),
    currentChat: chat,
    memory: loadMemory(),
    models: {
      catalog,
      defaults,
      current: applyRuntimeModelOverride(chat?.models || {}, chat)
    },
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
        const store = loadChatStore();
        store.chats = store.chats.map(chat => ({
          ...chat,
          models: sanitizeModels(chat.models || {}, models)
        }));
        saveChatStore(store);
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

// ── CF AI wrapper (TEXT models — content is always normalized to string) ────
async function callCFAI(modelName, messages, maxTokens = 1024, retries = 2) {
  const safeMessages = normalizeMessages(messages);
  for (let i = 0; i <= retries; i++) {
    try {
      const ctrl = new AbortController();
      const t    = setTimeout(() => ctrl.abort(), 35000);
      const res  = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${modelName}`,
        {
          method:  "POST",
          headers: { "Authorization": `Bearer ${CF_API_TOKEN}`, "Content-Type": "application/json" },
          body:    JSON.stringify({ messages: safeMessages, max_tokens: maxTokens }),
          signal:  ctrl.signal
        }
      );
      clearTimeout(t);
      const data = await res.json();
      if (!data.success) throw new Error(JSON.stringify(data.errors));
      return data.result.response;
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
        `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${modelName}`,
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
        `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/facebook/detr-resnet-50`,
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
  const prompt = `User query: "${String(userQuery || "").slice(0, 300)}"

DETR object detection results:
${detrContext}

Describe what is visible. Identify which detected objects appear interactive (buttons, links, inputs, checkboxes). Give approximate positions and any text visible on interactive elements. Be concise.`;
  try {
    return await callVisionAI(imageB64, prompt, 500, visionModelId || DEFAULT_MODELS.vision);
  } catch (err) {
    return `Vision analysis failed: ${err.message}`;
  }
}

  function stripThinking(text) { return String(text || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim(); }

  function safeParseJSON(raw) {
    const stripped = stripThinking(raw);
    const clean = stripped.replace(/```(?:json)?\n?([\s\S]*?)```/, "$1").trim();
    try { return JSON.parse(clean); } catch {
      const m = clean.match(/\{[\s\S]*\}/);
      if (m) { try { return JSON.parse(m[0]); } catch {} }
      return null;
    }
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
    const inputs = await page.evaluate(() =>
      Array.from(document.querySelectorAll("input,textarea,select")).slice(0, 12)
        .map(el => {
          const rect = el.getBoundingClientRect();
          return {
            tag: el.tagName,
            type: el.type,
            name: el.name,
            placeholder: el.placeholder,
            id: el.id,
            visible: rect.width > 0 && rect.height > 0,
            value: (el.value || "").slice(0, 40)
          };
        })
    ).catch(() => []);
    const buttons = await page.evaluate(() =>
      Array.from(document.querySelectorAll("button,input[type='button'],input[type='submit'],[role='button']"))
        .slice(0, 10)
        .map(el => {
          const rect = el.getBoundingClientRect();
          return {
            text: (el.innerText || el.value || el.getAttribute("aria-label") || "").trim().slice(0, 50),
            visible: rect.width > 0 && rect.height > 0,
            id: el.id,
            name: el.name || ""
          };
        })
        .filter(b => b.text)
    ).catch(() => []);
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

    const screenshotB64 = await getScreenshotB64({ broadcastImage: false, writeFile: false });
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
        const buf = await page.screenshot({
          type: "jpeg",
          quality: 38,
          animations: "disabled",
          caret: "hide",
          scale: "css"
        });
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

        const imageB64 = buf.toString("base64");
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
        taskVisionState.latestReasonerRaw = String(raw || "").slice(0, 800);
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

  async function getScreenshotB64(options = {}) {
    const broadcastImage = options.broadcastImage !== false;
    const writeFile = options.writeFile !== false;
    const buf = await page.screenshot({ type: "jpeg", quality: 75 });
    const b64 = buf.toString("base64");
    if (writeFile) fs.writeFileSync("view.png", buf);
    if (broadcastImage) broadcast("screenshot", { img: b64 });
    return b64;
  }

  // ── MEMORY: summarise past tasks for long-term context ───────────────────────
  const MEMORY_FILE = "memory.json";
  function loadMemory() {
    if (fs.existsSync(MEMORY_FILE)) {
      try { return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8")); } catch {}
    }
    return [];
  }
  function saveMemory(entry) {
    const mem = loadMemory();
    mem.push({ ts: new Date().toISOString(), ...entry });
    if (mem.length > 50) mem.splice(0, mem.length - 50);
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(mem, null, 2));
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
    if (log.length > MAX_LOG_ENTRIES) {
      log.splice(0, log.length - MAX_LOG_ENTRIES);
    }
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
async function routeGoal(rawGoal, conversationHistory, models) {
  status("Router thinking...");
  
  // Sanitize: Filter out system instruction patterns that shouldn't be tasks
  const sanitizedGoal = sanitizeTaskGoal(rawGoal);
  
  // If sanitization removed harmful content, respond appropriately
  if (sanitizedGoal !== String(rawGoal || "").trim()) {
    think("Router: Filtered out system instruction injection. Treating as chat.");
    return { 
      mode: "chat", 
      chatReply: "I'm Puppeterr, an autonomous browser agent. How can I help you with web automation or information gathering?",
      reasoning: "Blocked system instruction injection"
    };
  }
  
  if (looksLikeTaskGoal(sanitizedGoal)) {
    think("Router heuristic: classified as task from action-oriented intent.");
    return { mode: "task", taskGoal: sanitizedGoal };
  }
  const mem     = loadMemory().slice(-5);
  const memCtx  = mem.map(m => `Past task: "${m.goal}" → ${m.result}`).join("\n");
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
    const raw    = await callCFAI(models.router, [
      { role: "system", content: system },
      { role: "user",   content: rawGoal }
    ], 700);
    const parsed = safeParseJSON(raw);
    if (!parsed) throw new Error("unparseable");
    think(`Router: ${parsed.reasoning || parsed.mode}`);
    if (parsed.mode === "task") return { mode: "task", taskGoal: parsed.taskGoal || rawGoal };
    return { mode: "chat", chatReply: parsed.chatReply || "What can I help you with?" };
  } catch (err) {
    errLog("Router fallback: " + err.message);
    return { mode: "chat", chatReply: "I had trouble understanding that — could you rephrase?" };
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
  status("Vision analyzing page...");

  const promptText = `You are reporting to an autonomous Planner model that ONLY accepts exact,
quotable, machine-usable facts. It cannot interpret vague description. Every
line of your report must be something the Planner could paste directly into
a Playwright selector or a coordinate call. Vague answers cause it to loop.

Goal: "${goal}"
Last action attempted: ${JSON.stringify(lastAction || "(none — this is the first look at the page)")}
URL: ${state.url}
Title: ${state.title}

Report using EXACTLY this structure. Do not add prose outside these fields.
Do not summarize — quote literal text and give literal numbers.

1. ACTION_RESULT: "success" | "failed" | "unclear"
   - If failed/unclear, state the ONE specific visual fact that proves it
     (e.g. "URL bar still shows the search results page, no new page loaded"
     — not "the action did not seem to work").

2. VISIBLE_TEXT_EXACT: List every piece of literal text relevant to the goal,
   each as its own quoted line, copied character-for-character from the
   screen. No paraphrasing. Example:
   - "Sign in to your account"
   - "$42.99"
   - "How extra time works in FIFA World Cup"
   If nothing relevant is visible, write: NONE_VISIBLE

3. CLICKABLE_ELEMENTS: For each interactive element relevant to the goal,
   give ONE line in this exact format:
   [TYPE] "EXACT_VISIBLE_TEXT" | approx_position: (x%, y%) | state: enabled|disabled|hidden
   - TYPE is one of: button, link, input, checkbox, dropdown, tab
   - approx_position is the element's center as a PERCENTAGE of the visible
     screenshot width/height (0-100), e.g. (52, 31) — NOT pixel coordinates,
     since you don't know the real viewport size. The Planner converts this.
   - Example line:
     button "Search" | approx_position: (50, 18) | state: enabled
   If you cannot find any usable elements, write: NO_USABLE_ELEMENTS_FOUND

4. BLOCKER: "none" | "captcha" | "login_wall" | "error_message" | "loading_spinner" | "popup"
   - If not "none", quote the EXACT text of the blocker (e.g. the literal
     error message string), not a description of it.

5. DECOY_WARNING: State explicitly whether any element matching
   [type='submit'] or a generically-named search/submit button is VISIBLE
   but should NOT be the target (per the Planner's known rule that these are
   usually hidden/decoy). If you see one, say so explicitly: e.g.
   "A [type='submit'] button exists in the DOM area near (50,40) but appears
   visually hidden — do not target it, use submitForm() instead."
   If no such risk applies, write: NO_DECOY_RISK_DETECTED

6. NEXT_ACTION_SUGGESTION: Exactly ONE suggested action, in this literal
   JSON shape (the Planner will not use this verbatim, but it must be valid
   enough to parse — do not write prose here):
   { "action": "ACTION_NAME", "params": { "key": "value" } }
   Use only action names the Planner already knows: click, fill, submitForm,
   press, waitForVisible, mouseClick, scrollIntoView, getText. Base the
   selector or coordinates STRICTLY on what you reported in section 3 — never
   invent a selector you didn't already list as visible.

Rules:
- Every quoted string must be EXACT, copied text — never summarized or guessed.
- Never invent an element, coordinate, or text string that isn't actually visible.
- If you are not sure something is present, say so plainly rather than guessing
  ("UNCERTAIN: cannot confirm whether X is present") — a false "yes" causes the
  Planner to act on something that isn't there, which is worse than admitting
  uncertainty.
- Output ONLY the six numbered fields above. No introduction, no closing summary.`;

  try {
    const raw = await callVisionAI(screenshotB64, promptText, 600, models.vision);
    think("Vision: " + raw.slice(0, 400) + (raw.length > 400 ? "..." : ""));
    return raw;
  } catch (err) {
    errLog("Vision failed: " + err.message);
    return `ACTION_RESULT: unclear\nVISIBLE_TEXT_EXACT: NONE_VISIBLE (vision call failed: ${err.message})\nCLICKABLE_ELEMENTS: NO_USABLE_ELEMENTS_FOUND\nBLOCKER: none\nDECOY_WARNING: NO_DECOY_RISK_DETECTED\nNEXT_ACTION_SUGGESTION: { "action": "getAllText", "params": {} }`;
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

  const hasTextMatch = base.match(/:has-text\((['"])(.*?)\1\)/i);
  const text = String(hasTextMatch?.[2] || "").trim();
  if (text) {
    const quoted = JSON.stringify(text);
    add(`button:has-text(${quoted})`);
    add(`[role='button']:has-text(${quoted})`);
    add(`a:has-text(${quoted})`);
    add(`text=${quoted}`);
  }

  return variants.slice(0, Math.max(1, maxVariants));
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
  const screenshotB64 = await getScreenshotB64();
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
async function planNextSteps(goal, state, visionFeedback, taskLog, plannerHistory, stuck, failures, models) {
  status("Planner reasoning...");
  const learningContext = buildLearningContext(goal, state);

  const userMsg = `Goal: "${goal}"

Current URL: ${state.url}
Page Title:  ${state.title}
Active tab: ${state.tabs?.activeIndex ?? 0} / ${state.tabs?.count ?? 1}

Open tabs:
${(state.tabs?.urls || []).map((tabUrl, idx) => `  [${idx}] ${tabUrl}`).join("\n") || "  (single tab)"}

Visible inputs (only interact with visible:true ones):
${state.inputs?.map(i => `  [${i.visible ? "VISIBLE" : "hidden"}] ${i.tag}[type=${i.type}][name=${i.name}][id=${i.id}][placeholder=${i.placeholder}]${i.value ? ` value="${i.value}"` : ""}`).join("\n") || "  (none found)"}

Visible buttons on page:
${state.buttons?.filter(b => b.visible).map(b => `  [VISIBLE] "${b.text}"${b.id ? ` id=${b.id}` : ""}`).join("\n") || "  (none visible)"}

Visible links (sample):
${state.links?.slice(0,8).map(l => `  "${l.text}" → ${l.href}`).join("\n") || "  (none)"}

Vision's analysis:
${visionFeedback || "(first step — no prior action)"}

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

Output JSON only.`;

  plannerHistory.push({ role: "user", content: userMsg });
  // Keep the conversation bounded BEFORE sending — see trimHistory's doc
  // comment for why this matters (context-window overflow looks like a
  // confusing "Bad input" error too, distinct from the content-shape bug).
  const bounded = trimHistory(plannerHistory, MAX_PLANNER_HISTORY_MESSAGES);

  try {
    const raw    = await callCFAI(models.planner, bounded, 1500);
    const parsed = safeParseJSON(raw);
    if (!parsed) {
      plannerHistory.push({ role: "assistant", content: raw });
      think("Planner: parse failed — retrying with simpler prompt");
      const fixed = await callCFAI(models.reasoner, [
        { role: "system", content: "Fix this malformed JSON action plan. Output ONLY valid JSON with reasoning, confidence, done, actions fields." },
        { role: "user",   content: raw }
      ], 800);
      const fixedParsed = safeParseJSON(fixed);
      if (!fixedParsed) return { reasoning: "parse failed", done: false, actions: [], confidence: 0, _parseFailed: true };
      return fixedParsed;
    }
    plannerHistory.push({ role: "assistant", content: raw });
    think(`Planner [${parsed.confidence ?? "?"}%]: ${(parsed.reasoning || "").slice(0, 300)}`);
    return parsed;
  } catch (err) {
    errLog("Planner error: " + err.message);
    throw err;
  }
}

// The Planner's system prompt — defined once, pushed once at task start.
// (Pulled out as its own constant so it's easy to find/edit, and so it's
// unambiguous that this is the ONLY place that ever sets plannerHistory[0].)
const PLANNER_SYSTEM_PROMPT = `You are the Planner — the elite strategic brain of an autonomous browser agent.
You are methodical, adaptive, and always make forward progress. You NEVER give up without exhausting every strategy.

═══════════════════════════════════════════════════════
AVAILABLE ACTIONS (EXACT action names only)
═══════════════════════════════════════════════════════
Navigation:   goto(url), reload(), goBack(), goForward()
Interaction:  click(selector), dblclick(selector), hover(selector)
              fill(selector, text), type(selector, text), press(selector, key)
              check(selector), uncheck(selector), selectOption(selector, value)
              scrollIntoView(selector)
Submit:       submitForm(selector?)  ← USE THIS for search/forms instead of clicking hidden buttons
Keyboard:     keyboardType(text), keyboardPress(key)
Mouse:        mouseMove(x,y), mouseClick(x,y), mouseWheel(deltaX, deltaY)
Wait:         waitForSelector(selector), waitForVisible(selector), waitForTimeout(ms)
              waitForLoadState(state)  ← ONLY valid states: load | domcontentloaded | networkidle | commit
              waitForURLChange(currentURL)  ← best for SPA navigation detection
Extract:      getText(selector), getAttribute(selector, name), getAllText()
Check:        isVisible(selector), elementExists(selector)
Other:        evaluate(script), screenshot(path)
Tabs:         openNewTab(url?), switchToTab(index|urlIncludes), listTabs(), closeCurrentTab()

═══════════════════════════════════════════════════════
SELECTOR PRIORITY (try in order)
═══════════════════════════════════════════════════════
1. Text:    button:has-text('Search')   a:has-text('Login')   [role='button']:has-text('Go')
2. ARIA:    [aria-label='Search']   [placeholder='Search the web']   [role='searchbox']
3. Data:    [data-testid='...']   [name='q']   [id='search-input']
4. Type:    input[type='search']   input[type='text']:visible   textarea:visible
5. SUBMIT:  submitForm() NOT click([type='submit']) — submit buttons are almost always hidden!
6. JS:      evaluate('document.querySelector("...").click()')

═══════════════════════════════════════════════════════
CRITICAL RULES — MUST FOLLOW
═══════════════════════════════════════════════════════
CRITICAL RULES — MUST FOLLOW

✦ NEVER use waitForLoadState("complete"). Valid states: "load", "domcontentloaded", "networkidle", "commit".
✦ when you dont understand the UI of a search engine go to this https://bing.com/search?q=*your query here*
✦ NEVER click [type='submit'] or [name='search']. These are hidden.
→ Use submitForm() or press(inputSelector, "Enter").

✦ NEVER repeat the same failing (action + selector) twice.
→ If click fails: submitForm → press Enter → evaluate JS click → mouseClick via vision.

✦ For ALL search engines (Bing/Google/DDG): fill input → submitForm(). Never click a button.

✦ After fill/type: ALWAYS follow with submitForm() or press(selector, "Enter").

✦ For SPA pages: use waitForURLChange(currentURL) or waitForVisible(expectedElement).

✦ Set done:true ONLY when vision confirms goal completion with visible evidence.

✦ Multi‑stage prompts (STAGE 1, STAGE 2…): complete in order. Never skip stages.

✦ Validate each stage: confirm URL/title + at least one expected element/text.

✦ If navigation fails: retry ONCE, then switch strategy.

✦ If a stage requires a new tab: openNewTab(), then switchToTab() later.

═══════════════════════════════════════════════════════
EFFICIENCY & INTUITIVE REASONING (Smart Agent Behavior)
═══════════════════════════════════════════════════════
✦ VISION-FIRST APPROACH: Always check VISIBLE_TEXT_EXACT from vision BEFORE trying DOM selectors.
   If the text you need is already in the vision feedback, use it directly. Done.

✦ Example: Task = "Extract first paragraph"
   Vision shows: "VISIBLE_TEXT_EXACT: The potato is a root vegetable native to the Americas..."
   Action: Use getAllText() to grab visible text, or reason that you already have it.
   DON'T waste steps trying multiple DOM selectors that will fail.

✦ FAST CIRCUIT BREAKING: If a strategy fails 2x consecutively, abandon it immediately.
   Example: getText selector failed? Try ONE alternate selector. If that fails, use getAllText().
   Don't try 5 different selector variations.

✦ RECOGNIZE TASK COMPLETION: If the goal asks for text/info that vision already captured, mark done:true.
   Don't keep extracting once you have the answer visible.

✦ SKIP UNNECESSARY EXTRACTIONS: If the page is asking you to summarize what you see, and vision has it,
   use vision data directly. No need to extract via getText() — you already see it.

✦ FAST PIVOTING: If current strategy is stalling (2+ failures with same approach):
   → Try adjacent selector family (Text → ARIA → Data)
   → Or switch from getText to getAllText to vision extraction
   → Don't repeat the same selector 10 times.

✦ REASONABLE DEFAULTS: For common tasks (search for X, read first paragraph, etc.):
   Use proven approaches: getText(firstParagraphSelector), getAllText() for full content,
   or extract from visible text in vision feedback.

HUMAN‑MODE CURSOR BEHAVIOR (Human‑2.0)

✦ For ANY click, dblclick, hover, press, fill, type, or selectOption: use human‑mode cursor motion.

✦ Extract bounding box:
evaluate("(() => { const el = document.querySelector('SELECTOR'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 }; })()")

✦ If bounding box exists:
• Compute realistic target point (±3–12px jitter, avoid exact center).
• Generate 2–5 mouseMove steps (curved/diagonal path, micro‑jitter).
• Include overshoot (4–18px) then correction.
• Include micro‑pauses (40–180ms).
• Brief hover before click (±2px drift, 60–120ms pause).
• After click, optional natural drift (±3–10px).

✦ If bounding box is null:
• scrollIntoView(selector)
• waitForVisible(selector)
• try alternate selector families
• fallback: click(selector) or JS evaluate click

✦ Cursor MUST NOT teleport unless fallback is required.

✦ Longer distances → longer movement paths with diagonal transitions + mid‑point corrections.

✦ Human‑mode cursor behavior may span multiple turns (max 3 actions per turn).

✦ These Human‑2.0 cursor rules override all previous cursor‑related behavior.

✦ click(selector) vs mouseClick(x, y): these are different actions, never mix their params.
  click takes { "selector": "..." } only. mouseClick takes { "x": <number>, "y": <number> }
  only — never put a selector in mouseClick's params, it will fail every time with a Chrome
  protocol error, not a normal retry-able failure. If you have a selector, use click(). Only
  use mouseClick() when you have real numeric coordinates (e.g. from a Vision report), never
  a selector string.
CLICK FAILURE RECOVERY LADDER

Step 1: scrollIntoView(selector) → click(selector)
Step 2: submitForm(selector)
Step 3: press(inputSelector, "Enter")
Step 4: evaluate("document.querySelector('selector').click()")
Step 5: mouseClick(x,y) using vision coordinates
═══════════════════════════════════════════════════════
CLICK FAILURE RECOVERY LADDER
═══════════════════════════════════════════════════════
Step 1: scrollIntoView(selector) then click(selector)
Step 2: submitForm(selector)
Step 3: press(inputSelector, 'Enter')
Step 4: evaluate('document.querySelector("selector").click()')
Step 5: Use vision coordinates with mouseClick(x, y)

═══════════════════════════════════════════════════════
OUTPUT — JSON ONLY, no markdown, no extra text
═══════════════════════════════════════════════════════
{
  "reasoning": "What I see, what I'm doing, why this strategy will work",
  "confidence": 0-100,
  "done": false,
  "actions": [
    { "action": "actionName", "params": { "key": "value" } }
  ]
}

- Max 3 actions per turn. Atomic, focused steps.
- confidence < 35: goto the URL directly and start fresh.
- Stuck or all-fail: completely switch selector family, submit method, or navigation path.`;

const REASONER_INSTINCT_PROMPT = `You are the Reasoner instinct layer for an autonomous browser agent.
IF the USER is merely talking you may ignore the rest of this prompt. However, if the USER is asking a browser task to be done, you must FOLLOW EVERY STEP of this prompt. You are the fast intuition that helps the Planner avoid dumb moves.
You do not plan the whole task. You do not write long explanations.
You act like fast intuition before the Planner moves.

Your job is to inspect the current goal, page state, recent steps, and any vision notes,
then return a sharp instinct that helps the Planner avoid dumb moves.

Output JSON only:
{
  "instinct": "one short, concrete sentence about what matters right now",
  "risk": "low" | "medium" | "high",
  "next_focus": "one short phrase naming the most important target or action family",
  "caution": "one short warning or failure pattern to avoid"
}

Rules:
- Be immediate and operational.
- Prefer the simplest useful interpretation.
- If the page looks blocked, say so.
- If the next move is obvious, state it plainly.
- Do not restate the full task.
- Do not be verbose. Think like instinct, not narration.

CRITICAL EFFICIENCY CHECKS:
- If vision already captured the text/data needed for the task → suggest using it directly.
  Example: "Vision has the text already. Use getAllText() and extract from there."
- If recent actions kept failing with same selector → suggest pivoting to a different selector family.
  Example: "DOM selector failed 2x. Try vision text extraction instead."
- If task is to extract/read something visible → check if it's already in VISIBLE_TEXT_EXACT.
  If yes → suggest marking done or extracting from vision, not retrying DOM selectors.`;

// ─────────────────────────────────────────────────────────────────────────────
// AGENT: EXECUTOR
// ─────────────────────────────────────────────────────────────────────────────
async function runActionWithFallback(item, goal, models) {
  const { action, params } = item;
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

async function executeActionPlan(plan, goal, models, throttle = {}) {
  const results = [];
  const actionPlan = await expandVisionAssistedClicks(plan.actions || [], goal, models, {
    visionOnlyClickMode: !!throttle.visionOnlyClickMode
  });
  const pseudoActions = new Set(["openNewTab", "switchToTab", "closeCurrentTab", "listTabs", "hybridClick", "hybridDblclick"]);
  const domQuietActions = new Set(["click", "dblclick", "hover", "type", "fill", "press", "check", "uncheck", "selectOption", "scrollIntoView", "submitForm"]);
  const pacingMultiplier = Math.max(0.5, Number(throttle.pacingMultiplier || 1));
  const preActionIdleMs = Math.max(0, Number(throttle.preActionIdleMs || 0));
  const burstLimit = Math.max(1, Number(throttle.burstLimit || Number.POSITIVE_INFINITY));
  const microBreakMs = Math.max(0, Number(throttle.microBreakMs || 0));
  const navigationCooldownMs = Math.max(0, Number(throttle.navigationCooldownMs || 0));
  const navigationCooldownByHost = throttle.navigationCooldownByHost instanceof Map ? throttle.navigationCooldownByHost : null;
  let burstCount = 0;

  for (const rawItem of actionPlan) {
    const item = normalizeActionItem(rawItem);
    const { action, params } = item;
    if (!action || (!actions[action] && !pseudoActions.has(action))) {
      errLog(`Unknown action: "${action}"`);
      results.push({ action, status: "error", error: `Unknown action: ${action}` });
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
      let cycle = 0;
      let changed = false;
      let urlBefore = (() => {
        try { return page?.url?.() || "about:blank"; } catch { return "about:blank"; }
      })();
      let urlAfter = urlBefore;
      const cycleResults = [];

      while (!changed && cycle < HYBRID_URL_CHANGE_MAX_CYCLES) {
        cycle += 1;
        stepLogMsg(`Hybrid ${selectorAction} cycle ${cycle}/${HYBRID_URL_CHANGE_MAX_CYCLES} for ${baseSelector}: cqards first, selectors second.`);

        for (const point of cqards) {
          const clickResult = await runActionWithFallback({ action: pointerAction, params: { x: point.x, y: point.y } }, goal, models);
          cycleResults.push(clickResult);
          const nowUrl = (() => {
            try { return page?.url?.() || "about:blank"; } catch { return "about:blank"; }
          })();
          if (nowUrl !== urlBefore) {
            changed = true;
            urlAfter = nowUrl;
            break;
          }
          await sleepLikeHuman(90 + Math.random() * 120, page, { x: point.x, y: point.y });
        }

        if (changed) break;

        for (const variant of selectorVariants) {
          const clickResult = await runActionWithFallback({ action: selectorAction, params: { selector: variant } }, goal, models);
          cycleResults.push(clickResult);
          const nowUrl = (() => {
            try { return page?.url?.() || "about:blank"; } catch { return "about:blank"; }
          })();
          if (nowUrl !== urlBefore) {
            changed = true;
            urlAfter = nowUrl;
            break;
          }
          await sleepLikeHuman(110 + Math.random() * 150, page);
        }
      }

      if (changed) {
        status(`Hybrid click detected URL change: ${urlBefore} -> ${urlAfter}`);
        results.push({ action, status: "ok", result: `url-changed ${urlBefore} -> ${urlAfter}`, attempts: cycleResults.length });
      } else {
        errLog(`Hybrid click exhausted without URL change for ${baseSelector}`);
        results.push({ action, status: "error", error: `hybrid click exhausted without URL change for ${baseSelector}` });
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
    }], 600);
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
    ], 220, 1);

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
    ], 220, 1);

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
  return m ? m[0] : null;
}

function extractSearchQuery(goalText) {
  const g = String(goalText || "");
  const quoted = g.match(/"([^"]{2,120})"/);
  if (quoted) return quoted[1].trim();
  const m = g.match(/search\s+for\s+([^\n\.]{2,120})/i) || g.match(/look\s+up\s+([^\n\.]{2,120})/i);
  return m ? m[1].trim() : null;
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
  const directUrl = extractUrlFromText(goal);

  // 1) If goal includes an explicit URL and we are not there, go directly.
  if (directUrl) {
    const host = (() => {
      try { return new URL(directUrl).host; } catch { return ""; }
    })();
    if (host && !currentUrl.includes(host)) {
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
  let lastVisionTrace = "";
  let lastGentleTrace = "";
  const captchaChecksByPage = new Map();
  const captchaHandoffsByPage = new Map();
  const captchaGentleUntilByHost = new Map();
  const navigationCooldownByHost = new Map();
  let psychosisCounter = 0; // Tracks confusion state

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

      let plan;
      try {
        plan = await withExecutorWork(() => planNextSteps(goal, state, instinctFeedback, taskLog, plannerHistory, stuck, failures, models));
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

      if (plan.reasoning) think(plan.reasoning);

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

      const results = await withExecutorWork(() => executeActionPlan(plan, goal, models, adaptiveThrottle));
      lastAction    = plan.actions[plan.actions.length - 1];
      const summary = results.map(r => `${r.action}:${r.status}`).join(", ");
      const logLine = `Step ${step} [${plan.confidence ?? "?"}%]: ${summary} — ${(plan.reasoning || "").slice(0, 60)}`;
      taskLog.push(logLine);
      stepLogMsg(logLine);

      const allFailed = results.every(r => r.status === "error");
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
        const screenshotB64 = await withExecutorWork(() => getScreenshotB64());
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

  if (pathname === "/" || pathname === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(FRONTEND_HTML);
    return;
  }

  if (pathname === "/auth/session") {
    const auth = getAuth(req);
    sendJson(res, 200, {
      authenticated: !!auth,
      username: auth?.username || null,
      usingDefaultCredentials: APP_USERNAME === "admin" && APP_PASSWORD === "puppeterr"
    });
    return;
  }

  if (pathname === "/auth/login" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      if (body.username !== APP_USERNAME || body.password !== APP_PASSWORD) {
        sendJson(res, 401, { error: "Invalid username or password" });
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
      const imageB64 = String(body.imageB64 || "").trim();
      if (!imageB64) { sendJson(res, 400, { error: "imageB64 required" }); return; }
      status("Running DETR on uploaded image…");
      const detections = await callDETR(imageB64);
      broadcast("detr_result", { count: detections.length, labels: detections.slice(0, 5).map(d => d.label) });
      sendJson(res, 200, { detections, count: detections.length });
    } catch (err) {
      sendJson(res, 500, { error: err.message || "DETR analysis failed" });
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
    sendJson(res, 200, buildBootstrapPayload(catalog));
    return;
  }

  if (pathname === "/api/models") {
    const catalog = await fetchModelCatalog(requestUrl.searchParams.get("force") === "1");
    const { chat } = ensureCurrentChat();
    sendJson(res, 200, { catalog, current: getActiveModels(chat), defaults: DEFAULT_MODELS });
    return;
  }

  if (pathname === "/api/chats" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const chat = createChat(body.title || "New Chat");
      sendJson(res, 201, { chat, selectedChatId: chat.id });
    } catch {
      sendJson(res, 400, { error: "Invalid request body" });
    }
    return;
  }

  if (chatMatch && req.method === "GET") {
    const { store } = ensureCurrentChat();
    const chat = store.chats.find(item => item.id === chatMatch[1]);
    if (!chat) {
      sendJson(res, 404, { error: "Chat not found" });
      return;
    }
    sendJson(res, 200, { chat, selectedChatId: store.selectedChatId });
    return;
  }

  if (selectMatch && req.method === "POST") {
    const chat = setCurrentChat(selectMatch[1]);
    if (!chat) {
      sendJson(res, 404, { error: "Chat not found" });
      return;
    }
    const catalog = await fetchModelCatalog(false);
    sendJson(res, 200, buildBootstrapPayload(catalog));
    return;
  }

  if (modelsMatch && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const chat = updateChatModels(modelsMatch[1], body.models || {});
      if (!chat) {
        sendJson(res, 404, { error: "Chat not found" });
        return;
      }
      const catalog = await fetchModelCatalog(false);
      sendJson(res, 200, { current: getActiveModels(chat), catalog, chat });
    } catch {
      sendJson(res, 400, { error: "Invalid request body" });
    }
    return;
  }

  if (pathname === "/chat" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const rawMessage = String(body.message || "").trim();
      const chatId = body.chatId || ensureCurrentChat().chat.id;
      const imageB64Upload = String(body.imageB64 || "").trim();
      const annotatedImageB64 = String(body.annotatedImageB64 || "").trim();
      const detrDetections = Array.isArray(body.detrDetections) ? body.detrDetections : [];
      const detectedShapes = Array.isArray(body.detectedShapes) ? body.detectedShapes : [];
      const semanticAnalysis = typeof body.semanticAnalysis === "object" ? body.semanticAnalysis : {};

      let message = rawMessage;
      if (imageB64Upload && (detrDetections.length > 0 || detectedShapes.length > 0 || Object.keys(semanticAnalysis).length > 0)) {
        const detrCtx = detrDetections.length > 0 ? buildDETRContext(detrDetections) : "No DETR detections.";
        const shapeCtx = detectedShapes.length > 0 
          ? `Shape Analysis:\n${detectedShapes.slice(0, 10).map((s, i) => `  ${i+1}. ${s.type}: area=${Math.round(s.area || 0)}, conf=${(s.confidence || 0).toFixed(2)}`).join("\n")}`
          : "No geometric shapes detected.";
        const semanticCtx = semanticAnalysis.description 
          ? `Semantic Tag: ${semanticAnalysis.description}${semanticAnalysis.confidence ? ` (${(semanticAnalysis.confidence * 100).toFixed(1)}% conf)` : ""}`
          : "No semantic classification.";
        
        const { chat: imgChat } = ensureCurrentChat();
        const imgModels = getActiveModels(imgChat);
        const visionSummary = await analyzeUploadedImageWithVision(
          annotatedImageB64 || imageB64Upload, detrCtx, rawMessage, imgModels.vision
        );
        message = rawMessage
          ? `${rawMessage}\n\n[Attached image analysis]\nDETR detections:\n${detrCtx}\n\n${shapeCtx}\n\n${semanticCtx}\n\nVision summary:\n${visionSummary}`
          : `[Attached image analysis]\nDETR detections:\n${detrCtx}\n\n${shapeCtx}\n\n${semanticCtx}\n\nVision summary:\n${visionSummary}`;
        status(`Image enriched: ${detrDetections.length} DETR objects, ${detectedShapes.length} shapes, ${semanticAnalysis.description ? "semantic: " + semanticAnalysis.description : "no semantic tag"}.`);
      } else if (imageB64Upload) {
        const { chat: imgChat2 } = ensureCurrentChat();
        const imgModels2 = getActiveModels(imgChat2);
        const visionOnly = await analyzeUploadedImageWithVision(imageB64Upload, "No DETR data.", rawMessage, imgModels2.vision);
        message = rawMessage ? `${rawMessage}\n\n[Image vision summary]\n${visionOnly}` : `[Image vision summary]\n${visionOnly}`;
      }

      if (!message && !imageB64Upload) {
        sendJson(res, 400, { error: "Message is required" });
        return;
      }


      if (agentRunning) {
        sendJson(res, 409, { error: "Agent is already running a task" });
        return;
      }

      const activeChat = setCurrentChat(chatId);
      if (!activeChat) {
        sendJson(res, 404, { error: "Chat not found" });
        return;
      }

      const command = parseSlashCommand(message);
      const slashModel = command ? resolveSlashModelCommand(command) : null;
      if (slashModel && command) {
        if (slashModel.kind === "reset") {
          clearRuntimeModelOverride(chatId);
          appendChatMessage(chatId, "user", message, { command: command.command });
          appendChatMessage(chatId, "assistant", "Model override cleared. I’ll go back to the chat’s saved models until you set another command.", {
            completed: true,
            command: command.command,
            model: null
          });
          sendJson(res, 200, { ok: true, chatId, command: command.command, model: null, reset: true });
          broadcast("chat_sync", { chatId });
          return;
        }

        if (slashModel.kind === "model") {
          if (!slashModel.modelId) {
            appendChatMessage(chatId, "user", message, { command: command.command });
            appendChatMessage(chatId, "assistant", `I couldn’t find a model matching "${slashModel.query}" in the catalog, so I left the current model active.`, {
              completed: true,
              command: command.command,
              model: null,
              matched: false
            });
            sendJson(res, 200, { ok: true, chatId, command: command.command, model: null, matched: false });
            broadcast("chat_sync", { chatId });
            return;
          }

          setRuntimeModelOverride(chatId, slashModel.modelId);
          appendChatMessage(chatId, "user", message, { command: command.command });
          appendChatMessage(chatId, "assistant", `Model override set to ${slashModel.modelId}. I’ll keep using it until you start a new task or reset it.`, {
            completed: true,
            command: command.command,
            model: slashModel.modelId,
            matched: true
          });
          sendJson(res, 200, { ok: true, chatId, command: command.command, model: slashModel.modelId, matched: true });
          broadcast("chat_sync", { chatId });
          return;
        }
      }

      if (getRuntimeModelOverride(activeChat) && looksLikeTaskGoal(message)) {
        clearRuntimeModelOverride(chatId);
      }

      appendChatMessage(chatId, "user", message);
      sendJson(res, 202, { ok: true, chatId });

      const { chat } = ensureCurrentChat();
      const models = getActiveModels(chat);
      const routed = await routeGoal(message, sessionHistory, models);

      if (routed.mode === "chat") {
        appendChatMessage(chatId, "assistant", routed.chatReply, { completed: true });
        agentMsg(routed.chatReply);
        broadcast("chat_sync", { chatId });
      } else {
        await runTask(routed.taskGoal, models, chatId);
        broadcast("url", { url: page.url() });
      }
    } catch (err) {
      errLog("Chat handler: " + err.message);
      broadcast("task_done", { answer: "Something went wrong: " + err.message, completed: false });
      agentRunning = false;
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

    console.log("🚀 Launching browser...");
    fs.mkdirSync(BROWSER_PROFILE_DIR, { recursive: true });
    context = await chromium.launchPersistentContext(BROWSER_PROFILE_DIR, {
      headless: false,
      executablePath: require("playwright").chromium.executablePath(),
      args: [
        "--no-sandbox","--disable-setuid-sandbox",
        "--disable-infobars",
        "--window-position=0,0",
        "--window-size=1366,768"
      ]
    });
    browser = context.browser();
    page = context.pages()[0] || await context.newPage();
    await page.bringToFront().catch(() => {});

    await context.setDefaultNavigationTimeout(90000);
    await context.setDefaultTimeout(45000);
    await context.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9"
    });

    await page.setViewportSize({ width: 1366, height: 768 }).catch(() => {});
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
    const startUrl = process.env.START_URL || "https://www.bing.com";
    if (!currentUrl || currentUrl === "about:blank") {
      await page.goto(startUrl, { waitUntil: "domcontentloaded" });
    } else {
      console.log("↩️ Reusing persistent page: " + currentUrl);
    }
    ensureCurrentChat();
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