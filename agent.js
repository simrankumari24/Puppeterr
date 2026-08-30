const { chromium } = require("playwright-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs   = require("fs");
const os   = require("os");
const http = require("http");
const crypto = require("crypto");
const path = require("path");
const { execSync, exec, spawn } = require("child_process");
const bcrypt = require("bcryptjs");
const { fetch: undiciFetch } = require("undici");
const Human = require("./Human.js");
const nodemailer = require("nodemailer");
const actions = require("./actions");
const { HUMAN_BRIDGE_HTML } = require("./humanBridge");
const pinchApi = require("pinch-api");
const pixelGridReasoner = require("./pixelGridReasoner");
const StriderIntegration = require("./strider-integration");
const { resolveChatWriteUserId, resolveChatIdForWrite } = require("./chat-scope");
const {
  installVoidElementMapInitScript,
  captureVoidElementMapFromPage,
} = require("./element-map");
let sharp = null;
try {
  sharp = require("sharp");
} catch {}

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

function writeJsonAtomic(filePath, value) {
  const target = String(filePath || "");
  const tempPath = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2));
  fs.renameSync(tempPath, target);
}
async function humanMove(page, x, y, telemetry = {}) {
  const start = await page.evaluate(() => ({
    x: window.__puppeterrMouseX || 0,
    y: window.__puppeterrMouseY || 0,
    viewportWidth: Math.max(1, Math.round(window.innerWidth || 1920)),
    viewportHeight: Math.max(1, Math.round(window.innerHeight || 1080))
  })).catch(() => ({ x: 0, y: 0, viewportWidth: 1920, viewportHeight: 1080 }));

  const telemetryKind = String(telemetry?.kind || "move");
  const emitEvery = Math.max(1, Number(telemetry?.emitEvery || 3));

  // Ease-in-out curve + slight bow + occasional overshoot-and-correct,
  // instead of constant-velocity linear interpolation — see Human.js.
  const path = Human.generateMovementPathWithOvershoot(start.x, start.y, x, y);

  for (let i = 0; i < path.length; i++) {
    const { x: nx, y: ny, delayMs } = path[i];
    await page.mouse.move(nx, ny);
    if (i % emitEvery === 0 || i === path.length - 1) {
      broadcast("mouse_move", {
        x: Math.round(nx),
        y: Math.round(ny),
        viewportWidth: start.viewportWidth,
        viewportHeight: start.viewportHeight,
        kind: telemetryKind
      });
    }
    await page.waitForTimeout(delayMs);
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
  // Search-pattern wander: a brief, tightening wander near the target
  // before committing to it, rather than beelining with perfect precision
  // every time — mimics a last-moment visual/motor search near the
  // roughly-right spot.
  if (Math.random() < 0.5) {
    const wander = Human.generateSearchWander(x, y, 2);
    for (const w of wander) {
      await page.mouse.move(w.x, w.y);
      await page.waitForTimeout(w.delayMs);
    }
  }

  await humanMove(page, x + (Math.random() * 10 - 5), y + (Math.random() * 10 - 5), { kind: "preclick" });
  await humanMove(page, x, y, { kind: "preclick" });
  // Brief dwell with micro-tremor before the click fires — a real hand
  // isn't perfectly still in the instant before clicking.
  const tremor = Human.microTremor(1.1);
  await page.mouse.move(x + tremor.dx, y + tremor.dy);
  await page.waitForTimeout(Human.sampleHumanDelay(45, 0.5, 10));
  await page.mouse.move(x, y);
  // Hover hesitation: pointer has arrived but doesn't click instantly —
  // a real human pauses 80-200ms once "aimed" before committing.
  await page.waitForTimeout(Human.hoverHesitationMs());
  await page.mouse.click(x, y, { delay: Human.sampleHumanDelay(100, 0.4, 30) });

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

// Cached once at startup — avoids spawning `command -v xvfb-run` on every element-map call
let _xvfbAvailable = null;
function checkXvfbOnce(cb) {
  if (_xvfbAvailable !== null) { cb(_xvfbAvailable); return; }
  exec("command -v xvfb-run", (err) => {
    _xvfbAvailable = !err;
    cb(_xvfbAvailable);
  });
}

// Lazy-required so a missing/broken element-map.js doesn't crash agent.js
// startup — same defensive posture as the old subprocess path's existsSync
// guard. require.main here is agent.js's own entry point, not
// element-map.js, so its `if (require.main === module) main()` guard at
// the bottom of that file correctly does NOT fire when required like this.
let _elementMapModule = null;
function getElementMapModule() {
  if (_elementMapModule) return _elementMapModule;
  try {
    const scriptPath = path.join(process.cwd(), "element-map.js");
    if (!fs.existsSync(scriptPath)) return null;
    _elementMapModule = require(scriptPath);
    return _elementMapModule;
  } catch (err) {
    console.warn("element-map module load failed:", err?.message || err);
    return null;
  }
}

// In-process element-map capture against Puppeterr's OWN live page — no
// subprocess, no second browser, no re-navigation from scratch. This fixes
// two real problems with the old spawn-based path (still available below
// as runElementMapForUrl, kept for any caller that genuinely needs a URL
// that ISN'T the current live page):
//   1. Performance: a full second Chrome launch + fresh page load on every
//      single element-map tick, just to read DOM state Puppeterr already
//      has open, was pure waste.
//   2. Correctness: the spawned subprocess used its own temp profile dir
//      with no cookies/session — if the real page was logged in, mid-scroll,
//      or showing dynamic content, the subprocess's fresh, sessionless
//      reload could see a genuinely DIFFERENT page than what the agent was
//      actually looking at. Capturing against the live page object can't
//      diverge like that — it's the exact same page, same state.
// Hard cooldown independent of the caller/scheduler — a belt-and-suspenders
// guard so in-process element-map captures physically cannot fire more
// often than this, even if something upstream (a scheduling bug, an
// unexpected second call site) tries to. Needed because in-process capture
// is dramatically faster than the old subprocess (no browser launch, no
// fresh page navigation) — anything that assumed "this naturally takes a
// few seconds" as an implicit rate limit no longer gets that for free.
let _lastElementMapCaptureAt = 0;
const ELEMENT_MAP_HARD_COOLDOWN_MS = 8000;

async function runElementMapOnCurrentPage(livePage, onDone) {
  const done = typeof onDone === "function" ? onDone : () => {};
  const now = Date.now();
  if (now - _lastElementMapCaptureAt < ELEMENT_MAP_HARD_COOLDOWN_MS) {
    done(null); // silently skip — too soon since the last capture, no matter who called this
    return;
  }
  _lastElementMapCaptureAt = now;
  try {
    const mod = getElementMapModule();
    if (!mod || typeof mod.captureVoidElementMapFromPage !== "function") {
      status && status("element-map module unavailable; skipping in-process capture.");
      done(null);
      return;
    }
    if (!livePage) { done(null); return; }

    const currentUrl = (() => { try { return livePage.url(); } catch { return "unknown"; } })();
    console.log(`🔧 Triggering in-process element-map for: ${currentUrl}`);
    broadcast && broadcast("status", { msg: `element-map (in-process) triggered for ${currentUrl}` });

    // Ensure the capture function is installed on this page's context —
    // addInitScript only affects FUTURE navigations, so for the current,
    // already-loaded page we inject the browser-side installer directly.
    try {
      const hasCapture = await livePage.evaluate(() => typeof window.__VOID_CAPTURE_ELEMENT_MAP__ === "function").catch(() => false);
      if (!hasCapture && typeof mod.voidElementMapBrowserInstaller === "function") {
        await livePage.evaluate(mod.voidElementMapBrowserInstaller).catch(() => {});
      }
    } catch {}

    const extraction = await mod.captureVoidElementMapFromPage(livePage, {
      includeWithoutId: true,
      includeText: true,
      includeStyleBits: true,
      includeShadowDescendants: true,
      includeIframes: true,
      includeCanvas: true,
      maxElements: 1200,
      textLimit: 220
    });

    if (extraction) {
      status && status("element-map (in-process) completed");
      think && think(`element-map output: VOID_ELEMENT_MAP_CAPTURE_SUMMARY ${JSON.stringify(extraction.summary || {}).slice(0, 800)}`);
    } else {
      status && status("element-map (in-process) returned no data — capture script may not be installed on this page.");
    }
    done(null);
  } catch (err) {
    console.warn("element-map (in-process) failed:", err?.message || err);
    status && status(`element-map (in-process) error: ${err?.message || err}`);
    done(err);
  }
}

// Spawn element-map helper for a URL (non-blocking). Tries xvfb-run if present.
// onDone(err) is called when the child process finishes (or immediately on skip).
// Kept for any caller needing a URL that is NOT the current live page (the
// scheduled per-tick capture below uses runElementMapOnCurrentPage instead,
// since it always targets the already-open page's own URL).
function runElementMapForUrl(url, onDone) {
  const done = typeof onDone === "function" ? onDone : () => {};
  try {
    if (!url || typeof url !== "string") { done(null); return; }
    const scriptPath = path.join(process.cwd(), "element-map.js");
    if (!fs.existsSync(scriptPath)) {
      status && status("element-map.js not found; skipping element-map run.");
      done(null);
      return;
    }

    const safeUrl = String(url).trim();
    console.log(`🔧 Triggering element-map for: ${url}`);
    broadcast && broadcast("status", { msg: `element-map triggered for ${url}` });

    checkXvfbOnce((useXvfb) => {
      const cmd = useXvfb ? "xvfb-run" : "node";
      const args = useXvfb ? ["-a", "node", scriptPath, safeUrl] : [scriptPath, safeUrl];
      let tmpProfileDir = null;
      try {
        tmpProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), "puppeterr-elementmap-"));
      } catch (e) {
        tmpProfileDir = path.join(process.cwd(), ".puppeterr-profile-temp");
      }
      console.log(`🔧 element-map spawn: ${cmd} ${args.slice(0, 6).join(" ")} ...`);
      const childEnv = Object.assign({}, process.env, { BROWSER_PROFILE_DIR: tmpProfileDir });
      const child = spawn(cmd, args, { env: childEnv });
      let out = "";
      let errOut = "";
      child.stdout && child.stdout.on("data", d => { out += String(d || ""); });
      child.stderr && child.stderr.on("data", d => { errOut += String(d || ""); });
      child.on("error", (spawnErr) => {
        const msg = `element-map spawn failed: ${spawnErr?.message || String(spawnErr)}`;
        console.warn(msg);
        status && status(msg);
        done(spawnErr);
      });
      child.on("close", (code, signal) => {
        if (code !== 0) {
          const msg = `element-map exited ${code || signal}: ${String(errOut || out).slice(0, 800)}`;
          console.warn(`🔧 element-map error: ${msg}`);
          status && status(`element-map error: ${msg}`);
          done(new Error(msg));
        } else {
          status && status("element-map completed");
          if (out && String(out).trim()) think && think(`element-map output: ${String(out).slice(0, 800)}`);
          done(null);
        }
        // Clean up temp profile dir
        try { if (tmpProfileDir) fs.rmSync(tmpProfileDir, { recursive: true, force: true }); } catch {}
      });
    });
  } catch (err) {
    console.warn("element-map spawn failed:", err?.message || err);
    done(err);
  }
}

const CF_API_TOKEN  = process.env.CF_API_TOKEN;
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
// Dynamic Routes (the "dynamic/{name}" models configured in the AI Gateway
// dashboard) are invoked through the /compat/chat/completions endpoint and
// require a *gateway* auth header (cf-aig-authorization), which is separate
// from the Workers AI account token used for direct @cf/... model calls.
// Falls back to CF_API_TOKEN if a dedicated gateway token isn't set, since
// many accounts use the same token for both — but a real cf-aig token should
// be set here for production use.
const CF_AIG_TOKEN = process.env.CF_AIG_TOKEN || CF_API_TOKEN;
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
const STABLE_PAGE_FILE = "stable-page.json"; // last known-good URL before any crash
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
// How many planner steps to wait before allowing forced direct navigation
const DIRECT_NAV_MIN_STEP = Math.max(4, Number(process.env.DIRECT_NAV_MIN_STEP || 12));
const VISION_SAMPLE_EVERY_STEPS = Math.max(1, Number(process.env.VISION_SAMPLE_EVERY_STEPS || 2));
const VERIFY_EVERY_STEPS = Math.max(1, Number(process.env.VERIFY_EVERY_STEPS || 2));
const INSTINCT_SAMPLE_EVERY_STEPS = Math.max(1, Number(process.env.INSTINCT_SAMPLE_EVERY_STEPS || 2));
const STATE_TEXT_LIMIT = Math.max(3000, Number(process.env.STATE_TEXT_LIMIT || 6000));
const STATE_LINK_LIMIT = Math.max(15, Number(process.env.STATE_LINK_LIMIT || 30));
const STATE_INPUT_LIMIT = Math.max(20, Number(process.env.STATE_INPUT_LIMIT || 30));
const STATE_BUTTON_LIMIT = Math.max(15, Number(process.env.STATE_BUTTON_LIMIT || 25));
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
const CONFUSION_RESEARCH_STEP_INTERVAL = Math.max(2, Number(process.env.CONFUSION_RESEARCH_STEP_INTERVAL || 6));
const CONFUSION_RESEARCH_BLOCKED_HOSTS = new Set(parseCsvLowerList(
  process.env.CONFUSION_RESEARCH_BLOCKED_HOSTS,
  ["google.com", "bing.com", "duckduckgo.com", "search.yahoo.com"]
));
const SIMPLE_BROWSING_MODE = String(process.env.SIMPLE_BROWSING_MODE || "auto").toLowerCase(); // off | auto | always
const SIMPLE_BROWSING_DYNAMIC_UI_FAIL_THRESHOLD = Math.max(1, Number(process.env.SIMPLE_BROWSING_DYNAMIC_UI_FAIL_THRESHOLD || 2));
const SUPERVISOR_MODE = String(process.env.SUPERVISOR_MODE || "enforce").toLowerCase(); // off | passive | enforce
const SUPERVISOR_BLOCK_SCORE = Math.max(0.2, Math.min(0.95, Number(process.env.SUPERVISOR_BLOCK_SCORE || 0.52)));
const SUPERVISOR_WARN_SCORE = Math.max(SUPERVISOR_BLOCK_SCORE, Math.min(0.98, Number(process.env.SUPERVISOR_WARN_SCORE || 0.67)));
const ELEMENT_MAP_MIN_INTERVAL_MS = Math.max(1000, Number(process.env.ELEMENT_MAP_MIN_INTERVAL_MS || 10000));
const ELEMENT_MAP_MAX_INTERVAL_MS = Math.max(ELEMENT_MAP_MIN_INTERVAL_MS, Number(process.env.ELEMENT_MAP_MAX_INTERVAL_MS || 20000));
const SUPERVISOR_ACTION_BLOCK_RISK = Math.max(0.2, Math.min(0.95, Number(process.env.SUPERVISOR_ACTION_BLOCK_RISK || 0.72)));
const SUPERVISOR_ROUTE_FAIL_TTL_MS = Math.max(5000, Number(process.env.SUPERVISOR_ROUTE_FAIL_TTL_MS || 90000));
const SUPERVISOR_DECISION_CACHE_TTL_MS = Math.max(500, Number(process.env.SUPERVISOR_DECISION_CACHE_TTL_MS || 4000));
const SUPERVISOR_DECISION_CACHE_MAX = Math.max(8, Number(process.env.SUPERVISOR_DECISION_CACHE_MAX || 64));
const SUPERVISOR_SAMPLE_EVERY_STEPS = Math.max(1, Number(process.env.SUPERVISOR_SAMPLE_EVERY_STEPS || 2));
const DYNAMIC_UI_CHANGED_FRAME_THRESHOLD = Math.max(4, Number(process.env.DYNAMIC_UI_CHANGED_FRAME_THRESHOLD || 8));
const DYNAMIC_UI_CHANGE_RATIO = Math.max(1, Number(process.env.DYNAMIC_UI_CHANGE_RATIO || 1.5));
const ESCAPE_MAX_CONSECUTIVE_FAILURES = 3;
const ESCAPE_STEP_TIMEOUT_MS = 20000;
const ESCAPE_DYNAMIC_STREAK_LIMIT = Math.max(3, Number(process.env.ESCAPE_DYNAMIC_STREAK_LIMIT || 6));
const ESCAPE_DYNAMIC_MIN_FAILURES = Math.max(1, Number(process.env.ESCAPE_DYNAMIC_MIN_FAILURES || 2));
const IDLE_HUMAN_IDLE_MIN_MS = Number(process.env.IDLE_HUMAN_IDLE_MIN_MS || 2500);
const IDLE_HUMAN_IDLE_MAX_MS = Number(process.env.IDLE_HUMAN_IDLE_MAX_MS || 7000);
const IDLE_HUMAN_SCHEDULE_FLOOR_MS = Math.max(120, Number(process.env.IDLE_HUMAN_SCHEDULE_FLOOR_MS || 180));
const IDLE_HUMAN_HOTSPOT_SAMPLE_LIMIT = Math.max(8, Number(process.env.IDLE_HUMAN_HOTSPOT_SAMPLE_LIMIT || 28));
const IDLE_HUMAN_MAX_TARGET_REUSE = Math.max(2, Number(process.env.IDLE_HUMAN_MAX_TARGET_REUSE || 3));
const IDLE_HUMAN_MODE = String(process.env.IDLE_HUMAN_MODE || "auto").toLowerCase(); // off | auto | always
const AUTH_COOKIE_NAME = "puppeterr_auth";
const AUTH_SECRET = process.env.APP_AUTH_SECRET || "puppeterr-local-secret";
const APP_USERNAME = process.env.APP_USERNAME || "admin";
const APP_PASSWORD = process.env.APP_PASSWORD || "puppeterr";
const WORKSPACE_ROOT = process.cwd();
// Cap how many turns of plannerHistory we keep. Without this, a long task
// (many steps) makes the message array grow forever, eventually blowing
// past the model's context window — which can ALSO surface as a confusing
// "Bad input" error from Cloudflare that looks unrelated to its real cause.
const MAX_PLANNER_HISTORY_MESSAGES = 7; // system + last X turns
const MAX_PLANNER_USER_MSG_CHARS = 2400;
const MAX_PLANNER_ASSISTANT_MSG_CHARS = 700;
const PLANNER_AGGRESSIVE_RECOVERY_MAX_MODELS = Math.max(2, Number(process.env.PLANNER_AGGRESSIVE_RECOVERY_MAX_MODELS || 5));
const PLANNER_AGGRESSIVE_RECOVERY_RETRIES = Math.max(0, Number(process.env.PLANNER_AGGRESSIVE_RECOVERY_RETRIES || 1));
const PLANNER_EMPTY_RESPONSE_FAIL_THRESHOLD = Math.max(1, Number(process.env.PLANNER_EMPTY_RESPONSE_FAIL_THRESHOLD || 2));
const PLANNER_MODEL_FAIL_TTL_MS = Math.max(30000, Number(process.env.PLANNER_MODEL_FAIL_TTL_MS || 5 * 60 * 1000));
const MAX_URL_IN_PROMPT_CHARS = 120;
const MAX_TASK_LOG_LINES_IN_PROMPT = 3;
const VOID_MAP_CAPTURE_EVERY_STATE = String(process.env.VOID_MAP_CAPTURE_EVERY_STATE || "true").toLowerCase() !== "false";
const VOID_MAP_STATE_MAX_ELEMENTS = Math.max(200, Number(process.env.VOID_MAP_STATE_MAX_ELEMENTS || 1200));
const VOID_MAP_STATE_TEXT_LIMIT = Math.max(60, Number(process.env.VOID_MAP_STATE_TEXT_LIMIT || 180));
const fetchImpl = globalThis.fetch || undiciFetch;

// ── Stable page checkpoint ────────────────────────────────────────────────────
// Written after every successful navigation. Read on crash-restart so the
// browser reopens the last page that didn't cause a crash.
const SKIP_STABLE_URLS = new Set(["about:blank", "chrome://newtab/", "about:newtab"]);

function saveStablePage(url) {
  try {
    if (!url || SKIP_STABLE_URLS.has(url) || url.startsWith("chrome://")) return;
    const tmp = STABLE_PAGE_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify({ url, savedAt: new Date().toISOString() }));
    fs.renameSync(tmp, STABLE_PAGE_FILE);
  } catch {}
}

function loadStablePage() {
  try {
    const raw = fs.readFileSync(STABLE_PAGE_FILE, "utf8");
    const { url } = JSON.parse(raw);
    if (url && typeof url === "string" && url.startsWith("http")) return url;
  } catch {}
  return null;
}
// ─────────────────────────────────────────────────────────────────────────────
const FREE_TIER_MAX_TASKS = Math.max(1, Number(process.env.FREE_TIER_MAX_TASKS || 50));
const CORE_TIER_MAX_TASKS = Math.max(1, Number(process.env.CORE_TIER_MAX_TASKS || 1000));
const ULTIMATE_TIER_UNLIMITED = true;
const OVERAGE_COST_PER_TASK = Number(process.env.OVERAGE_COST_PER_TASK || 0.001);

function getTierMaxTasks(subscriptionPlan) {
  const plan = String(subscriptionPlan || "").toLowerCase();
  if (plan === "ultimate") return Infinity;
  if (plan === "core") return CORE_TIER_MAX_TASKS;
  return FREE_TIER_MAX_TASKS;
}

function getTierName(subscriptionPlan) {
  const plan = String(subscriptionPlan || "").toLowerCase();
  if (plan === "ultimate") return "Ultimate";
  if (plan === "core") return "Core";
  return "Free";
}

async function checkTaskLimit(user) {
  if (!user) return { allowed: true, remaining: FREE_TIER_MAX_TASKS, tier: "Free" };
  const maxTasks = getTierMaxTasks(user.subscription_plan);
  if (!Number.isFinite(maxTasks)) return { allowed: true, remaining: Infinity, tier: "Ultimate" };

  // Reset usage counter if a month has passed
  const now = Date.now();
  const resetAt = Number(user.taskUsageResetAt || 0);
  if (now >= resetAt) {
    const nextUser = { ...user, taskUsage: 0, taskUsageResetAt: now + (30 * 24 * 60 * 60 * 1000) };
    saveUsers(loadUsers().map(u => u.id === user.id ? nextUser : u));
    Object.assign(user, nextUser);
  }

  const used = Number(user.taskUsage || 0);
  const remaining = Math.max(0, maxTasks - used);
  const allowed = remaining > 0;
  return { allowed, remaining, used, maxTasks, tier: getTierName(user.subscription_plan) };
}

async function incrementTaskUsage(user) {
  if (!user) return;
  const nextUser = {
    ...user,
    taskUsage: (Number(user.taskUsage || 0)) + 1,
    taskUsageResetAt: user.taskUsageResetAt || (Date.now() + (30 * 24 * 60 * 60 * 1000))
  };
  saveUsers(loadUsers().map(u => u.id === user.id ? nextUser : u));
  Object.assign(user, nextUser);
}

function getUsageStatus(user) {
  const maxTasks = getTierMaxTasks(user?.subscription_plan);
  if (!Number.isFinite(maxTasks)) return { tier: "Ultimate", used: 0, remaining: Infinity, percentage: 0 };
  const used = Number(user?.taskUsage || 0);
  const remaining = Math.max(0, maxTasks - used);
  const percentage = maxTasks > 0 ? Math.min(100, Math.round((used / maxTasks) * 100)) : 0;
  return {
    tier: getTierName(user?.subscription_plan),
    used,
    remaining,
    maxTasks,
    percentage,
    overageCost: remaining <= 0 ? OVERAGE_COST_PER_TASK : 0
  };
}

const MODEL_ROLES = ["router", "planner", "reasoner", "vision"];
const ROUTER_LOCK_MODEL = String(process.env.ROUTER_LOCK_MODEL || "false").toLowerCase() === "true";
const ROUTER_THINKING_DEFAULT = String(process.env.ROUTER_THINKING_DEFAULT || "true").toLowerCase() !== "false";
const DEFAULT_MODELS = {
  // 2026-08-XX: reverted router/planner from dynamic/* back to direct @cf/...
  // defaults. The dynamic route wiring is causing live "Provider not found"
  // (AiGatewayError code 2002) failures on every router/reasoner call —
  // almost certainly CF_AIG_TOKEN not being a valid gateway-scoped token
  // (silently falling back to CF_API_TOKEN) and/or the gateway id in
  // CF_GATEWAY_CHAT_COMPLETIONS_URL ("default") not matching wherever the
  // dynamic/Router, dynamic/Planner, dynamic/Supervisor routes actually live.
  // Set DEFAULT_ROUTER_MODEL / DEFAULT_PLANNER_MODEL env vars to "dynamic/..."
  // explicitly (with CF_AIG_TOKEN verified working) to re-enable — don't
  // flip these back as the hardcoded default until that's confirmed fixed.
  // vision/image: dynamic routes exist but use a different transport
  // (Workers AI /ai/run/, binary + multipart) that dynamic routing doesn't
  // support as-is — not wired here regardless of the above.
  router:   process.env.DEFAULT_ROUTER_MODEL   || "@cf/qwen/qwen2.5-coder-32b-instruct",
  planner:  process.env.DEFAULT_PLANNER_MODEL  || "@cf/zai-org/glm-5.2",
  reasoner: process.env.DEFAULT_REASONER_MODEL || "@cf/zai-org/glm-5.2",
  vision:   process.env.DEFAULT_VISION_MODEL   || "@cf/meta/llama-3.2-11b-vision-instruct",
  image:    process.env.DEFAULT_IMAGE_MODEL    || "@cf/black-forest-labs/flux-2-klein-9b"
};
const SUPERVISOR_MODEL = String(process.env.SUPERVISOR_MODEL || process.env.DEFAULT_SUPERVISOR_MODEL || "").trim();
const MODEL_CATALOG_FILE = String(process.env.MODEL_CATALOG_FILE || path.join(process.cwd(), "model-catalog.txt")).trim();
const MODEL_CATALOG_TEXT = String(process.env.MODEL_CATALOG_TEXT || "");

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
  const router = pickModelId(catalog, [DEFAULT_MODELS.router, "@cf/qwen/qwen3-30b-a3b-fp8"], false) || DEFAULT_MODELS.router;
  const planner = pickModelId(catalog, [DEFAULT_MODELS.planner, "@cf/zai-org/glm-5.2", router], false) || router;
  const reasoner = pickModelId(catalog, [DEFAULT_MODELS.reasoner, router], false) || router;
  const vision = pickModelId(catalog, [DEFAULT_MODELS.vision, "@cf/meta/llama-3.2-11b-vision-instruct"], true) || DEFAULT_MODELS.vision;
  return { router, planner, reasoner, vision };
}

function inferCatalogEntryTypeFromLine(line) {
  const text = String(line || "").toLowerCase();
  if (/vision|image|multimodal/.test(text)) return "vision";
  if (/video/.test(text)) return "video";
  if (/audio|speech|tts|voice/.test(text)) return "audio";
  if (/code|programming|debug/.test(text)) return "code";
  if (/reason|planner|thinking|chat|assistant/.test(text)) return "text";
  return "external";
}

function parseModelCatalogText(rawText, sourceLabel = "text") {
  const text = String(rawText || "");
  if (!text.trim()) return [];

  const lines = text.split(/\r?\n/);
  const rows = [];
  const seen = new Set();

  const pushEntry = (id, line) => {
    const modelId = String(id || "").trim().replace(/^`+|`+$/g, "");
    if (!modelId) return;
    if (!/^(@cf\/|[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*)/i.test(modelId)) return;
    const normalizedId = modelId.toLowerCase();
    if (seen.has(normalizedId)) return;
    seen.add(normalizedId);

    const capabilities = [];
    const inferredType = inferCatalogEntryTypeFromLine(line);
    if (inferredType === "vision") capabilities.push("vision", "multimodal", "image");
    if (inferredType === "video") capabilities.push("video");
    if (inferredType === "audio") capabilities.push("audio", "speech");
    if (inferredType === "code") capabilities.push("code");
    if (inferredType === "text") capabilities.push("chat", "reasoning");

    rows.push({
      id: modelId,
      name: modelId,
      type: modelId.startsWith("@cf/") ? "workers-ai-run" : inferredType,
      description: `Imported from ${sourceLabel}`,
      metadata: {
        source: sourceLabel,
        importedFromText: true,
      },
      tags: ["imported", sourceLabel],
      capabilities: Array.from(new Set(capabilities))
    });
  };

  for (const rawLine of lines) {
    const line = String(rawLine || "").trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;

    const cleaned = line
      .replace(/^[-*\d.)\s]+/, "")
      .replace(/^["']+|["']+$/g, "")
      .trim();
    if (!cleaned) continue;

    const kvMatch = cleaned.match(/(?:id|model|name)\s*[:=]\s*([@a-z0-9._/-]+)/i);
    if (kvMatch && kvMatch[1]) {
      pushEntry(kvMatch[1], cleaned);
      continue;
    }

    const tokens = cleaned.match(/@cf\/[a-z0-9._-]+(?:\/[a-z0-9._-]+)*|[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*/ig) || [];
    for (const token of tokens) {
      pushEntry(token, cleaned);
    }
  }

  return rows;
}

function mergeModelCatalogs(primary = [], secondary = []) {
  const out = [];
  const seen = new Set();
  for (const entry of [...(Array.isArray(primary) ? primary : []), ...(Array.isArray(secondary) ? secondary : [])]) {
    const id = String(entry?.id || "").trim();
    if (!id) continue;
    const key = id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

function getModelCatalogTextFallback() {
  const fromEnv = parseModelCatalogText(MODEL_CATALOG_TEXT, "env:MODEL_CATALOG_TEXT");
  let fromFile = [];
  if (MODEL_CATALOG_FILE && fs.existsSync(MODEL_CATALOG_FILE)) {
    try {
      const fileText = fs.readFileSync(MODEL_CATALOG_FILE, "utf8");
      fromFile = parseModelCatalogText(fileText, `file:${path.basename(MODEL_CATALOG_FILE)}`);
    } catch {}
  }
  return mergeModelCatalogs(fromEnv, fromFile);
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
let currentTaskChatId = null; // tracks the active task's chat for runtime error and summary messages

async function ensureActivePage() {
  if (page) {
    try {
      if (!page.isClosed()) return page;
    } catch {}
  }
  if (context) {
    const pages = context.pages().filter(p => p);
    for (const candidate of pages) {
      try {
        if (candidate.isClosed()) continue;
        page = candidate;
        await page.bringToFront().catch(() => {});
        return page;
      } catch {}
    }
    try {
      page = await context.newPage();
      // wire crash handlers to pages opened mid-session
      if (page && !page.__crashWired) {
        page.__crashWired = true;
        page.on("crash", () => handleBrowserCrash("page renderer crashed (tab crash / OOM)"));
      }
      await page.bringToFront().catch(() => {});
      return page;
    } catch (err) {
      throw new Error(`No active Playwright page available: ${err.message}`);
    }
  }
  throw new Error("No browser context available to recover the active page.");
}
let modelCatalogCache = { expiresAt: 0, items: [] };
let routerTaskTypeFailures = new Map(); // runtime-only model failures by task type
let plannerModelHealth = new Map(); // modelId -> { emptyStreak, failUntil, lastFailure, lastError, lastSuccessAt }
let learningLogCache = null;
let screenshotCaptureQueue = Promise.resolve();
let visionOperationQueue = Promise.resolve();
let visionOperationLastCompletedAt = 0;
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

  async function withVisionOperation(label, task) {
    const run = visionOperationQueue.then(async () => {
      const pauseMs = Math.max(0, 450 - (Date.now() - visionOperationLastCompletedAt));
      if (pauseMs > 0) {
        await sleep(pauseMs);
      }
      try {
        return await task();
      } finally {
        visionOperationLastCompletedAt = Date.now();
      }
    });
    visionOperationQueue = run.catch(() => {});
    return run;
  }

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

  const shouldNudge = (() => {
    if (IDLE_HUMAN_MODE === "off") return false;
    if (IDLE_HUMAN_MODE === "always") return true;
    return !!(state?.challengeMode || state?.allowIdleNudge || humanBridgeState?.active);
  })();

  if (!shouldNudge) {
    await sleep(total);
    return;
  }

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
  writeJsonAtomic(USER_STORE_FILE, Array.isArray(users) ? users : []);
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
    subscription_status: user.subscription_status || (user.subscription_plan ? "active" : "unsubscribed"),
    taskUsage: Number(user.taskUsage || 0),
    taskUsageResetAt: user.taskUsageResetAt || null
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

function parseCsvLowerList(value, fallback = []) {
  const source = String(value || "").trim();
  const list = source
    ? source.split(",").map(item => item.trim().toLowerCase()).filter(Boolean)
    : fallback.map(item => String(item || "").trim().toLowerCase()).filter(Boolean);
  return Array.from(new Set(list));
}

function createChatRecord(title = ".New Chat.") {
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

function normalizeChatTitleText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\u0000-\u001f]+/g, "")
    .slice(0, 60);
}

function isGenericChatTitle(title) {
  const normalized = normalizeChatTitleText(title).toLowerCase();
  return !normalized || normalized === "new chat" || normalized === "welcome chat" || normalized === "conversation";
}

function titleCaseFragment(value) {
  return normalizeChatTitleText(value)
    .split(/\s+/)
    .map(word => word ? word.charAt(0).toUpperCase() + word.slice(1) : word)
    .join(" ");
}

function extractTopicAfterPattern(text, pattern) {
  const match = String(text || "").match(pattern);
  if (!match) return null;
  return normalizeChatTitleText(match[1] || match[2] || "");
}

function inferChatTitleFromIntent(prompt) {
  const text = normalizeChatTitleText(prompt);
  if (text.length < 12) return null;
  const lower = text.toLowerCase();

  if (/^(wsg|sup|yo|hey|hi|hello|hiya|gm|gn|what'?s up|wassup|wsp|gng|gang)\b/.test(lower)) {
    return null;
  }

  const titlePatterns = [
    { prefix: "Writing about", pattern: /(?:type up|write|draft|compose|create|make|generate|craft|help me write)\s+(?:a|an|the)?\s*(?:short|long)?\s*(?:paragraph|summary|essay|post|email|message|note|brief)?\s*(?:about|on|for|regarding)\s+(.+)/i },
    { prefix: "Writing about", pattern: /(?:paragraph|summary|essay|post|email|message|note|brief)\s+(?:about|on|for|regarding)\s+(.+)/i },
    { prefix: "Researching", pattern: /(?:research|look up|find|learn about|investigate|explore)\s+(.+)/i },
    { prefix: "Summarizing", pattern: /(?:summarize|summarise|explain|describe|analyze|analyse)\s+(.+)/i },
    { prefix: "Comparing", pattern: /(?:compare|contrast)\s+(.+?)\s+(?:and|vs\.?|versus)\s+(.+)/i, combine: true }
  ];

  for (const entry of titlePatterns) {
    const match = text.match(entry.pattern);
    if (!match) continue;
    const topic = entry.combine
      ? normalizeChatTitleText([match[1], match[2]].filter(Boolean).join(" and "))
      : normalizeChatTitleText(match[1] || match[2] || "");
    const cleanedTopic = topic.replace(/[.?!]+$/, "").trim();
    if (!cleanedTopic || cleanedTopic.length < 3) continue;
    return `${entry.prefix} ${titleCaseFragment(cleanedTopic)}`.slice(0, 60);
  }

  if (looksLikeTaskGoal(text)) {
    const topic = extractTopicAfterPattern(text, /(?:about|on|for|regarding|around)\s+(.+)/i);
    if (topic && topic.length >= 3) {
      return `Working on ${titleCaseFragment(topic.replace(/[.?!]+$/, ""))}`.slice(0, 60);
    }
  }

  return null;
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
  writeJsonAtomic(chatStoreFile(userId), store);
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

function maybeAutoTitleChat(chat, prompt) {
  if (!chat || !prompt || !isGenericChatTitle(chat.title)) return;
  if (String(prompt).trim().startsWith("/")) return;
  const generated = inferChatTitleFromIntent(prompt);
  if (generated) {
    chat.title = generated;
  }
}

async function generateAndSaveTitleForChat(chatId, text, userId = null) {
  try {
    const store = loadChatStore(userId);
    const chat = store.chats.find(c => c.id === String(chatId || ""));
    if (!chat) return null;
    if (!text || !String(text || "").trim()) return null;

    // Prefer the chat's configured reasoner, fallback to router/planner defaults
    const models = attachModelRuntimeParams(getActiveModels(chat), getActiveModelParams(chat));
    const modelToUse = String(models.reasoner || models.router || DEFAULT_MODELS.reasoner || DEFAULT_MODELS.router);

    const system = `You are a concise title generator. Produce a chat title in 4 to 8 words (not characters).` +
      ` Output only the title on a single line, with Title Case, no surrounding quotes or punctuation, and no explanation.`;
    const userMsg = `Create a very short title (4-8 words) for this user query or conversation snippet:\n\n${String(text).trim().slice(0,2000)}`;

    let raw = await callCFAI(modelToUse, [
      { role: "system", content: system },
      { role: "user", content: userMsg }
    ], 64, 1, 0.2);

    if (!raw) return null;
    // Clean result: take first non-empty line, strip punctuation at ends
    let title = String(raw || "").split(/\r?\n/).map(l=>l.trim()).find(l=>l);
    if (!title) title = String(raw || "").trim();
    // Remove leading prefixes like "Title:" or "Suggested title:"
    title = title.replace(/^(title|suggested title|suggestion)[:\-\s]+/i, "");
    // Strip surrounding quotes and trailing punctuation
    title = title.replace(/^['"“”]+|['"“”]+$/g, "").replace(/[.?!]+$/g, "");
    title = normalizeChatTitleText(title);
    if (!title) return null;
    title = title.split(/\s+/).slice(0,12).join(" "); // safety cap
    title = titleCaseFragment(title);

    // Only set if the chat currently has a generic title (avoid clobbering manual titles)
    if (!isGenericChatTitle(chat.title)) return null;

    const original = chat.title;
    chat.title = title;
    chat.updatedAt = new Date().toISOString();
    saveChatStore(store, userId);
    try { broadcast("chat_title", { chatId: chat.id, title: chat.title }); } catch (e) {}
    return { original, title };
  } catch (err) {
    errLog && errLog("generateAndSaveTitleForChat: " + (err?.message || String(err)));
    return null;
  }
}

function renameChatTitle(chat, title) {
  if (!chat) return false;
  const nextTitle = normalizeChatTitleText(title);
  if (!nextTitle) return false;
  chat.title = nextTitle;
  return true;
}

function normalizeCommandKey(value) {
  return String(value || "").trim().replace(/^\/+/, "").toLowerCase();
}

function collectCommandOptionValues(options, key) {
  const value = options ? options[key] : undefined;
  if (value === undefined || value === null || value === false) return [];
  if (Array.isArray(value)) return value.map(item => String(item || "").trim()).filter(Boolean);
  if (value === true) return ["true"];
  return [String(value).trim()].filter(Boolean);
}

function parseDurationToMs(raw, fallbackMs) {
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

function normalizeBrowserFlagBundleMessage(message) {
  const raw = String(message || "").trim();
  if (!raw || raw.startsWith("/")) return raw;
  const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) return raw;
  const allFlags = lines.every(line => line.startsWith("--"));
  if (!allFlags) return raw;
  return `/browser run stress scenario ${lines.join(" ")}`;
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
  const setOptionValue = (key, value) => {
    if (!(key in options)) {
      options[key] = value;
      return;
    }
    if (Array.isArray(options[key])) {
      options[key].push(value);
      return;
    }
    options[key] = [options[key], value];
  };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (/^--[a-z0-9][a-z0-9_-]*=/i.test(token)) {
      const eqIndex = token.indexOf("=");
      const key = normalizeCommandKey(token.slice(2, eqIndex));
      setOptionValue(key, token.slice(eqIndex + 1));
      continue;
    }
    if (/^--[a-z0-9][a-z0-9_-]*$/i.test(token)) {
      const key = normalizeCommandKey(token.slice(2));
      const next = tokens[i + 1];
      if (next && !/^-{1,2}[a-z0-9]/i.test(next)) {
        setOptionValue(key, next);
        i += 1;
      } else {
        setOptionValue(key, true);
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
  if (["practice", "crawl", "strider"].includes(cmd)) return { kind: "practice" };
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

  const aiDirectives = collectCommandOptionValues(options, "ai");
  const jsEvalDirectives = collectCommandOptionValues(options, "js-eval");
  const modelSwitchValues = collectCommandOptionValues(options, "model-switch").flatMap(value => String(value).split(",")).map(value => value.trim()).filter(Boolean);
  const modelSwitchInterval = Number(collectCommandOptionValues(options, "model-switch-interval")[0] || "0");
  const navigateRandom = Number(collectCommandOptionValues(options, "navigate-random")[0] || "0");
  const navigateBackForward = Number(collectCommandOptionValues(options, "navigate-back-forward")[0] || "0");
  const scrollDepth = Number(collectCommandOptionValues(options, "scroll-depth")[0] || "0");
  const screenshotEveryMs = parseDurationToMs(collectCommandOptionValues(options, "screenshot-every")[0] || "", 0);
  const errorRetry = Number(collectCommandOptionValues(options, "error-retry")[0] || "0");
  const errorBackoffMs = parseDurationToMs(collectCommandOptionValues(options, "error-backoff")[0] || "", 0);
  const logInterval = Number(collectCommandOptionValues(options, "log-interval")[0] || "0");
  const antiBotMode = String(collectCommandOptionValues(options, "anti-bot")[0] || "").trim();
  const openEnabled = !!options.open;
  const tabsEnabled = !!options.tabs;
  const stealthEnabled = !!options.stealth;
  const heartbeatEnabled = !!options.heartbeat;

  const runtimeLines = [];
  if (openEnabled) runtimeLines.push("Open in a fresh browser context at the beginning.");
  if (tabsEnabled) runtimeLines.push("Use tab-aware browsing and compare tab states when useful.");
  if (aiDirectives.length) runtimeLines.push(`AI directives: ${aiDirectives.join(" | ")}.`);
  if (modelSwitchValues.length) runtimeLines.push(`Model switch sequence: ${modelSwitchValues.join(", ")}${modelSwitchInterval > 0 ? ` every ${modelSwitchInterval} cycle(s)` : ""}.`);
  if (navigateRandom > 0) runtimeLines.push(`Perform up to ${Math.max(1, Math.round(navigateRandom))} random exploratory navigations.`);
  if (navigateBackForward > 0) runtimeLines.push(`Perform around ${Math.max(1, Math.round(navigateBackForward))} back/forward transitions.`);
  if (scrollDepth > 0) runtimeLines.push(`Scroll deeply up to approximately ${Math.max(200, Math.round(scrollDepth))} px where applicable.`);
  if (screenshotEveryMs > 0) runtimeLines.push(`Capture screenshots roughly every ${Math.max(1, Math.round(screenshotEveryMs / 1000))} seconds.`);
  if (jsEvalDirectives.length) {
    runtimeLines.push("Run these JS evaluations and include outputs:");
    jsEvalDirectives.forEach((script, index) => runtimeLines.push(`JS_EVAL_${index + 1}: ${script}`));
  }
  if (Number.isFinite(errorRetry) && errorRetry > 0) runtimeLines.push(`Retry transient action failures up to ${Math.max(1, Math.min(8, Math.round(errorRetry)))} times.`);
  if (errorBackoffMs > 0) runtimeLines.push(`Use transient retry backoff near ${Math.max(100, errorBackoffMs)}ms.`);
  if (stealthEnabled) runtimeLines.push("Use stealth-like pacing and low-entropy action timing.");
  if (antiBotMode) runtimeLines.push(`Anti-bot mode: ${antiBotMode}.`);
  if (logInterval > 0) runtimeLines.push(`Emit progress logs roughly every ${Math.max(1, Math.round(logInterval))} second(s).`);
  if (heartbeatEnabled) runtimeLines.push("Heartbeat mode enabled for long-running steps.");
  if (runtimeLines.length) promptParts.push(`Runtime directives:\n${runtimeLines.join("\n")}`);

  const knownKeys = new Set(["task", "goal", "prompt", "query", "url", "site", "tab", "open", "tabs", "ai", "js-eval", "navigate-random", "navigate-back-forward", "scroll-depth", "screenshot-every", "model-switch", "model-switch-interval", "error-retry", "error-backoff", "stealth", "anti-bot", "log-interval", "heartbeat"]);
  const extraOptions = Object.entries(options)
    .filter(([key, value]) => !knownKeys.has(key) && value !== true)
    .map(([key, value]) => `${key}: ${String(value).trim()}`);
  if (extraOptions.length) promptParts.push(`Constraints:\n${extraOptions.join("\n")}`);
  if (enrichedMessage && !String(enrichedMessage).startsWith(String(command?.raw || ""))) {
    promptParts.push(String(enrichedMessage).trim());
  }
  return promptParts.join("\n\n").trim();
}

function buildBrowserRuntimeConfig(command) {
  const options = command?.options || {};
  const getFirst = (key) => collectCommandOptionValues(options, key)[0] || "";
  const modelSwitchValues = collectCommandOptionValues(options, "model-switch")
    .flatMap(value => String(value).split(","))
    .map(value => value.trim())
    .filter(Boolean);

  const runtime = {
    open: !!options.open,
    tabs: !!options.tabs,
    heartbeat: !!options.heartbeat,
    stealth: !!options.stealth,
    antiBot: String(getFirst("anti-bot") || "").trim().toLowerCase(),
    logIntervalSec: Math.max(0, Number(getFirst("log-interval") || 0)),
    errorRetry: Number.isFinite(Number(getFirst("error-retry"))) ? Math.max(1, Math.min(8, Number(getFirst("error-retry")))) : null,
    errorBackoffMs: parseDurationToMs(getFirst("error-backoff"), 0),
    modelSwitch: modelSwitchValues,
    modelSwitchInterval: Math.max(1, Number(getFirst("model-switch-interval") || 1))
  };

  const hasAny = runtime.open || runtime.tabs || runtime.heartbeat || runtime.stealth || !!runtime.antiBot || runtime.logIntervalSec > 0 || runtime.errorRetry !== null || runtime.errorBackoffMs > 0 || runtime.modelSwitch.length > 0;
  return hasAny ? runtime : null;
}

function extractStriderReconKeywords(goalText = "") {
  const stopWords = new Set([
    "about", "after", "agent", "around", "before", "below", "browse", "button", "click", "find", "from",
    "have", "into", "just", "like", "main", "make", "more", "most", "need", "onto", "open", "page",
    "please", "show", "site", "start", "task", "that", "them", "then", "there", "these", "this", "through",
    "what", "when", "where", "which", "with", "would", "your"
  ]);
  const rawWords = String(goalText || "").toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g) || [];
  const unique = [];
  for (const word of rawWords) {
    if (stopWords.has(word)) continue;
    if (!unique.includes(word)) unique.push(word);
    if (unique.length >= 14) break;
  }
  return unique;
}

function buildStriderReconPlan(goalText = "", preferredUrl = "") {
  const keywords = extractStriderReconKeywords(goalText);
  const urlPatterns = keywords.slice(0, 8).map(keyword => `/${keyword}`);
  const allowedDomains = [];

  try {
    const host = new URL(String(preferredUrl || extractExplicitNavigationTarget(goalText) || "")).hostname.toLowerCase();
    if (host) allowedDomains.push(host);
  } catch {}

  return {
    goalText: String(goalText || "").trim(),
    allowedDomains,
    keywords,
    urlPatterns,
    avoidPatterns: ["logout", "signout", "signin", "signup", "delete", "remove", "cart", "checkout", "privacy", "terms"],
    maxRelevantUrls: 500,
    maxDiscoveredUrls: 900,
    maxDepth: 3,
    maxRuntimeMs: 30000,
  };
}

function getStriderReconTarget(goalText = "", preferredUrl = "") {
  return String(preferredUrl || extractExplicitNavigationTarget(goalText) || "").trim();
}

function getHostnameSafe(url) {
  try {
    return new URL(String(url || "")).hostname.toLowerCase();
  } catch {
    return "";
  }
}

async function runStriderPlannerRecon(goalText = "", preferredUrl = "", options = {}) {
  if (!striderIntegration) return null;

  const targetUrl = getStriderReconTarget(goalText, preferredUrl);
  if (!targetUrl) return null;

  const targetHost = getHostnameSafe(targetUrl);
  const warmupMs = Math.max(200, Number(options.timeoutMs) || 2500);
  const minRelevant = Math.max(1, Number(options.minRelevant) || 6);
  const reconPlan = buildStriderReconPlan(goalText, targetUrl);
  const activeStats = typeof striderIntegration.getStats === "function"
    ? striderIntegration.getStats()
    : null;
  const activeDomains = Array.isArray(activeStats?.stats?.recon?.allowedDomains)
    ? activeStats.stats.recon.allowedDomains.map(item => String(item || "").toLowerCase())
    : [];
  const activeMatchesTarget = !!targetHost && activeDomains.includes(targetHost);

  if (striderIntegration.isActive()) {
    if (!activeMatchesTarget && options.restartIfDomainMismatch !== false) {
      await striderIntegration.handleStop().catch(() => {});
    } else {
      return striderIntegration.getReconReport({ limit: Number(options.limit) || 16 });
    }
  }

  return striderIntegration.handleRecon({
    seedUrls: [targetUrl],
    workerCount: 1,
    randomWalk: false,
    reconPlan,
    timeoutMs: warmupMs,
    minRelevant,
  });
}

function formatStriderReconContext(report, domain = "") {
  const topMatches = Array.isArray(report?.topMatches) ? report.topMatches : [];
  if (!topMatches.length) return "";

  return [
    "[Strider recon]",
    `Domain: ${domain || (Array.isArray(report?.allowedDomains) && report.allowedDomains[0]) || "mixed"}`,
    `Relevant URLs found: ${Number(report?.relevantCount || 0)} / ${Number(report?.totalNodes || 0)} discovered`,
    "Top routes:",
    ...topMatches.slice(0, 14).map((item, index) => {
      const reasons = Array.isArray(item?.relevanceMatched) ? item.relevanceMatched.slice(0, 3).join(", ") : "";
      const title = String(item?.title || "").trim();
      const preview = String(item?.textPreview || "").replace(/\s+/g, " ").trim().slice(0, 120);
      return [
        `${index + 1}. [${Number(item?.relevanceScore || 0)}] ${item?.url || ""}`,
        title ? `   title: ${title}` : "",
        reasons ? `   why: ${reasons}` : "",
        preview ? `   text: ${preview}` : "",
      ].filter(Boolean).join("\n");
    }),
    "Use these routes before opening broad new search paths.",
  ].join("\n");
}

function buildStriderReconContext(goalText = "", preferredUrl = "") {
  try {
    if (!striderIntegration || typeof striderIntegration.getReconReport !== "function") {
      return "";
    }

    const reportResult = striderIntegration.getReconReport({ limit: 16 });
    if (!reportResult?.ok || !reportResult?.report?.topMatches?.length) {
      return "";
    }

    let domain = "";
    try {
      if (preferredUrl) {
        domain = new URL(String(preferredUrl)).hostname.toLowerCase();
      }
    } catch {}

    if (!domain) {
      const urlMatch = String(goalText || "").match(/https?:\/\/[^\s)]+/i);
      if (urlMatch?.[0]) {
        try {
          domain = new URL(urlMatch[0]).hostname.toLowerCase();
        } catch {}
      }
    }

    const allMatches = Array.isArray(reportResult.report.topMatches) ? reportResult.report.topMatches : [];
    const scopedMatches = domain
      ? allMatches.filter(node => String(node?.domain || "").toLowerCase() === domain)
      : allMatches;

    if (!scopedMatches.length) {
      return "";
    }

    return formatStriderReconContext({
      ...reportResult.report,
      topMatches: scopedMatches,
    }, domain);
  } catch {
    return "";
  }
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
    "/browser accepts advanced flags: --open --tabs --ai <directive> --js-eval <script>",
    "/browser advanced: --model-switch <id> --model-switch-interval <n> --error-retry <n> --error-backoff <ms|s>",
    "/browser advanced: --navigate-random <n> --navigate-back-forward <n> --scroll-depth <px> --screenshot-every <ms|s>",
    "/browser advanced: --stealth --anti-bot <mode> --log-interval <sec> --heartbeat",
    "/image <prompt> [--style <style>] [--size <size>] [--aspect <ratio>] [--negative <text>]",
    "/practice <url> [<url2> ...] [--workers <n>] [--random]",
    "/practice --stats | --stop | --reset | --mode <fifo|random> | --enqueue <url>",
    "/model <model name or id>",
    "/reset"
  ].join("\n");
}

function resolveSlashModelCommand(command) {
  const reservedCommands = new Set(["browser", "browse", "web", "image", "img", "paint", "draw", "help", "commands", "practice", "crawl", "strider"]);
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
  const resolvedUserId = resolveChatWriteUserId(userId, currentTaskUserId);
  const store = loadChatStore(resolvedUserId);
  const resolvedChatId = resolveChatIdForWrite(chatId, store);
  const chat = store.chats.find(item => item.id === resolvedChatId);
  if (!chat) return null;
  let originalTitle = chat.title;
  if (role === "user") {
    maybeAutoTitleChat(chat, content);
  }
  chat.messages.push({ role, content, ts: new Date().toISOString(), ...meta });
  chat.updatedAt = new Date().toISOString();
  store.selectedChatId = resolvedChatId;
  saveChatStore(store, resolvedUserId);
  // If chat title is still generic and a user message was added, kick off
  // an asynchronous reasoner-based title generation (non-blocking).
  try {
    if (role === "user" && isGenericChatTitle(chat.title)) {
      generateAndSaveTitleForChat(resolvedChatId, content, resolvedUserId).catch(() => {});
    }
  } catch (e) {}
  // If an auto-title was generated, notify connected frontends so they can update UI
  try {
    if (chat.title && chat.title !== originalTitle) {
      broadcast("chat_title", { chatId: resolvedChatId, title: chat.title });
    }
  } catch (e) {}
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
  const userId = auth?.userId || null;
  const { store, chat } = ensureCurrentChat(userId);
  const defaults = resolveDefaultModels(catalog);
  const memory = loadMemory();
  const resolvedUsername = auth?.email || auth?.username || APP_USERNAME;
  const subscriptionPlan = auth?.subscriptionPlan || null;
  const subscriptionStatus = auth?.subscriptionStatus || (subscriptionPlan ? "active" : "unsubscribed");
  const currentChat = store.chats.find(item => item.id === store.selectedChatId) || chat || null;
  return {
    username: resolvedUsername,
    account: {
      verified: auth?.verified ?? null,
      subscriptionPlan,
      subscriptionStatus,
      pinchCustomerId: auth?.pinchCustomerId || null
    },
    selectedChatId: currentChat ? currentChat.id : store.selectedChatId,
    chats: store.chats.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).map(summarizeChat),
    currentChat: currentChat ? { ...currentChat, messages: Array.isArray(currentChat.messages) ? currentChat.messages : [] } : null,
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

  const textFallback = getModelCatalogTextFallback();
  const fallbackDefaults = Object.values(resolveDefaultModels([])).map(id => ({
    id,
    name: id,
    type: "default",
    capabilities: []
  }));
  const fallback = mergeModelCatalogs(textFallback, fallbackDefaults);
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
      const models = mergeModelCatalogs(normalizeModelCatalog(data), textFallback);
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
// Buffer recent error/log messages per chat and debounce summarization
const taskLogBuffers = new Map(); // chatId -> [{ts,msg}, ...]
const taskLogSummaryTimers = new Map();
const LOG_SUMMARY_DEBOUNCE_MS = Math.max(500, Number(process.env.LOG_SUMMARY_DEBOUNCE_MS || 1000));
function broadcast(type, payload, targetUserId = currentTaskUserId || null) {
  const data = "data: " + JSON.stringify({ type, ...payload }) + "\n\n";
  const recipients = targetUserId
    ? sseClients.filter(client => String(client.userId || "") === String(targetUserId || ""))
    : sseClients;
  recipients.forEach(client => { try { client.res.write(data); } catch {} });
}

function think(msg)   { console.log("  💭 " + msg); broadcast("think",   { msg }); }
function status(msg)  { console.log("  ⚡ " + msg); broadcast("status",  { msg }); }
function agentMsg(msg){ console.log("  🤖 " + msg); broadcast("agent",   { msg }); }
function stepLogMsg(msg) { console.log("  📋 " + msg); broadcast("step", { msg }); }
function appendTaskChatMessage(role, content, meta = {}) {
  if (!currentTaskChatId) return;
  try {
    appendChatMessage(currentTaskChatId, role, content, { ...meta }, currentTaskUserId);
    broadcast("chat_sync", { chatId: currentTaskChatId });
  } catch (err) {
    console.error("Failed to append task chat message:", err && err.message ? err.message : err);
  }
}
function errLog(msg)  {
  console.log("  ❌ " + msg);
  // Do NOT broadcast raw error messages directly to the chat UI. Instead,
  // buffer them per-task and call the reasoner to generate a short,
  // user-facing summary that is appended to the chat. This prevents
  // exposing verbose internal logs while preserving useful diagnostics.
  // Broadcast a status-level notice so realtime monitors still see activity.
  try { broadcast("status", { msg: "internal error logged" }); } catch (e) {}

  if (!currentTaskChatId) return;
  try {
    const buf = taskLogBuffers.get(currentTaskChatId) || [];
    buf.push({ ts: Date.now(), msg: String(msg || "") });
    // Keep the buffer small
    if (buf.length > 20) buf.shift();
    taskLogBuffers.set(currentTaskChatId, buf);

    // Debounce the summarization call
    if (taskLogSummaryTimers.has(currentTaskChatId)) {
      clearTimeout(taskLogSummaryTimers.get(currentTaskChatId));
    }
    const t = setTimeout(() => {
      taskLogSummaryTimers.delete(currentTaskChatId);
      summarizeAndAppendLogs(currentTaskChatId).catch(err => console.error("log summary failed:", err && err.message ? err.message : err));
    }, LOG_SUMMARY_DEBOUNCE_MS);
    taskLogSummaryTimers.set(currentTaskChatId, t);
  } catch (e) {
    console.error("errLog buffer failed", e && e.message ? e.message : e);
  }
}

async function summarizeAndAppendLogs(chatId) {
  try {
    const buf = taskLogBuffers.get(chatId) || [];
    if (!buf.length) return;
    // Build a short prompt for the reasoner to create a user-facing summary
    const recent = buf.map(b => `- ${new Date(b.ts).toISOString()}: ${b.msg}`).join("\n");
    // Delete rather than reset to [] — a reset left the chatId key in the
    // Map forever (just with an empty array value), meaning long server
    // uptime with many distinct chats grows this Map without bound. Deleting
    // is equivalent for every future .get() call here, since line 2740's
    // `|| []` fallback already handles a missing key identically to an
    // empty array.
    taskLogBuffers.delete(chatId);

    const system = `You are an assistant that summarizes internal agent diagnostics into a concise, non-technical, user-facing summary and a short actionable recommendation. Do NOT include raw logs or stack traces. Keep it to 1-2 sentences for summary and 1 short suggestion.`;
    const user = `Summarize these recent internal planner/runtime logs for the user. Return exactly two lines: first line = concise summary (1-2 sentences). Second line = a short actionable suggestion (imperative). Do not include raw logs, warnings, or timestamps.
\nLogs:\n${recent}`;

    const model = String(DEFAULT_MODELS.reasoner || DEFAULT_MODELS.planner || DEFAULT_MODELS.router);
    let summaryRaw = "";
    try {
      summaryRaw = await callCFAI(model, [
        { role: "system", content: system },
        { role: "user", content: user }
      ], 300, 1);
    } catch (e) {
      // Fallback: make a tiny heuristic summary
      summaryRaw = "The agent encountered internal planner errors and had to recover. Suggest retrying or checking model availability.\nSuggestion: Retry the operation or switch planner models.";
    }

    const cleaned = String(summaryRaw || "").trim();
    if (!cleaned) return;
    appendTaskChatMessage("assistant", cleaned, { log_summary: true, completed: false });
    // Trigger a chat sync so frontends refresh and show the summary
    try { broadcast("chat_sync", { chatId }); } catch (e) {}
  } catch (err) {
    console.error("summarizeAndAppendLogs error", err && err.message ? err.message : err);
  }
}
function routerThink(models, msg) { if (getRuntimeRouterThinking(models)) think(msg); }

// ─────────────────────────────────────────────────────────────────────────────
// LIVE NARRATION & GUIDANCE SYSTEM (Devin-style interactive agent)
// ─────────────────────────────────────────────────────────────────────────────
const guidanceQueue = [];  // User guidance injected mid-task
const guidanceControl = {
  stopRequested: false,
  latestText: "",
  latestPolicy: null,
  version: 0,
  updatedAt: 0
};

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

function parseGuidancePolicy(text) {
  const raw = String(text || "").trim();
  const normalized = raw.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const stopRequested = /(?:^|\b)(stop|end task|end the task|abort|abort task|cancel task|cancel this task|quit task)(?:\b|$)/i.test(normalized);
  const strongDirective = stopRequested || /(?:^|\b)(must|do not|don't|never|only|exactly|strictly|without)(?:\b|$)/i.test(normalized);
  return {
    raw,
    normalized,
    stopRequested,
    priority: stopRequested ? "critical" : (strongDirective ? "high" : "normal"),
    lawText: stopRequested
      ? "OPERATOR DIRECTIVE: STOP THE TASK IMMEDIATELY. Do not plan another step. Do not continue after the current safe boundary."
      : `OPERATOR DIRECTIVE: ${raw}. Treat this as binding instruction and prioritize it over your default strategy.`
  };
}

function resetGuidanceControl() {
  guidanceControl.stopRequested = false;
  guidanceControl.latestText = "";
  guidanceControl.latestPolicy = null;
  guidanceControl.updatedAt = 0;
}

function registerGuidance(entry) {
  const policy = parseGuidancePolicy(entry?.text || "");
  guidanceControl.latestText = policy.raw;
  guidanceControl.latestPolicy = policy;
  guidanceControl.updatedAt = Date.now();
  guidanceControl.version += 1;
  if (policy.stopRequested) guidanceControl.stopRequested = true;
  return policy;
}

function currentGuidanceStopReason() {
  if (!guidanceControl.stopRequested) return "";
  return guidanceControl.latestText || "stop";
}

function buildGuidanceDirectiveText(items) {
  const directives = (Array.isArray(items) ? items : [])
    .map(item => item?.policy)
    .filter(Boolean);
  if (!directives.length) return "";
  return directives.map(policy => policy.lawText).join("\n");
}

/** Consume all pending guidance from user — called at each planning step */
function consumeGuidance() {
  if (!guidanceQueue.length) return null;
  const all = guidanceQueue.splice(0);
  return {
    text: all.map(g => g.text).join(" | "),
    stopRequested: all.some(g => !!g?.policy?.stopRequested),
    priority: all.some(g => g?.policy?.priority === "critical")
      ? "critical"
      : (all.some(g => g?.policy?.priority === "high") ? "high" : "normal"),
    directiveText: buildGuidanceDirectiveText(all),
    entries: all
  };
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

function prunePlannerModelHealth() {
  const now = Date.now();
  for (const [modelId, health] of plannerModelHealth.entries()) {
    if (!modelId || !health) {
      plannerModelHealth.delete(modelId);
      continue;
    }
    const failUntil = Number(health.failUntil || 0);
    const emptyStreak = Number(health.emptyStreak || 0);
    if (failUntil <= now && emptyStreak <= 0) {
      plannerModelHealth.delete(modelId);
    }
  }
}

function isLikelyPlannerEmptyFailure(errLike) {
  const msg = String(errLike?.message || errLike || "").toLowerCase();
  return msg.includes("empty response");
}

function markPlannerModelFailure(modelId, errLike = null) {
  const model = String(modelId || "").trim();
  if (!model) return;
  const now = Date.now();
  const current = plannerModelHealth.get(model) || { emptyStreak: 0, failUntil: 0, lastFailure: 0, lastError: "", lastSuccessAt: 0 };
  const emptyFail = isLikelyPlannerEmptyFailure(errLike);
  const nextEmptyStreak = emptyFail ? Number(current.emptyStreak || 0) + 1 : Number(current.emptyStreak || 0);
  const shouldQuarantine = nextEmptyStreak >= PLANNER_EMPTY_RESPONSE_FAIL_THRESHOLD;
  plannerModelHealth.set(model, {
    emptyStreak: nextEmptyStreak,
    failUntil: shouldQuarantine ? (now + PLANNER_MODEL_FAIL_TTL_MS) : Number(current.failUntil || 0),
    lastFailure: now,
    lastError: String(errLike?.message || errLike || "planner-failure").slice(0, 220),
    lastSuccessAt: Number(current.lastSuccessAt || 0)
  });
}

function markPlannerModelSuccess(modelId) {
  const model = String(modelId || "").trim();
  if (!model) return;
  const now = Date.now();
  const current = plannerModelHealth.get(model) || { emptyStreak: 0, failUntil: 0, lastFailure: 0, lastError: "", lastSuccessAt: 0 };
  plannerModelHealth.set(model, {
    emptyStreak: 0,
    failUntil: 0,
    lastFailure: Number(current.lastFailure || 0),
    lastError: "",
    lastSuccessAt: now
  });
}

function isPlannerModelQuarantined(modelId) {
  const model = String(modelId || "").trim();
  if (!model) return false;
  const health = plannerModelHealth.get(model);
  if (!health) return false;
  return Number(health.failUntil || 0) > Date.now();
}

function buildPlannerCandidateModels(models = {}) {
  prunePlannerModelHealth();
  const primary = String(models?.planner || "").trim();
  const ordered = [];
  const seen = new Set();
  // Prefer an explicit/pluggable planner default early in the candidate list
  // so that router models (often set to large code models like Qwen) are
  // not promoted into planner duties when a planner default exists.
  for (const candidate of [
    primary,
    DEFAULT_MODELS.planner,
    models?.reasoner,
    models?.router,
    DEFAULT_MODELS.reasoner,
    DEFAULT_MODELS.router,]) {
    const modelId = String(candidate || "").trim();
    if (!modelId || seen.has(modelId)) continue;
    seen.add(modelId);
    ordered.push(modelId);
  }
  const healthy = ordered.filter(modelId => !isPlannerModelQuarantined(modelId));
  const quarantined = ordered.filter(modelId => isPlannerModelQuarantined(modelId));
  // Exclude known unsuitable planner models (e.g. Qwen code models) from
  // the planner candidate list to prevent accidental promotion.
  const unsuitable = (id = "") => /@cf\/qwen\//i.test(String(id || ""));
  const filteredOrdered = ordered.filter(id => !unsuitable(id));
  const healthyFiltered = filteredOrdered.filter(modelId => !isPlannerModelQuarantined(modelId));
  const quarantinedFiltered = filteredOrdered.filter(modelId => isPlannerModelQuarantined(modelId));
  return [...healthyFiltered, ...quarantinedFiltered];
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
    const textFallback = getModelCatalogTextFallback();
    const catalogRes = await fetch(`https://developers.cloudflare.com/ai/models/index.md`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json"
      }
    });
    if (!catalogRes.ok) {
      const text = await catalogRes.text().catch(() => "catalog request failed");
      if (textFallback.length) {
        console.warn(`   ⚠️  catalog listing unavailable (${catalogRes.status}) — using ${textFallback.length} model(s) imported from text fallback`);
      } else {
        console.warn(`   ⚠️  catalog listing unavailable (${catalogRes.status}) — model inference may still work`);
      }
    } else {
      console.log(`   catalog: ok${textFallback.length ? ` (+${textFallback.length} imported text model(s))` : ""}`);
    }
  } catch (err) {
    const textFallback = getModelCatalogTextFallback();
    if (textFallback.length) {
      console.warn(`   ⚠️  catalog check failed: ${err.message} — using ${textFallback.length} model(s) imported from text fallback`);
    } else {
      console.warn(`   ⚠️  catalog check failed: ${err.message} — continuing anyway`);
    }
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

async function callCFAI(modelName, messages, maxTokens = 1024, retries = 2, temperature = null, options = null) {
  const requireNonEmpty = !!(options && options.requireNonEmpty);
  const nonEmptyLabel = String((options && options.nonEmptyLabel) || modelName || "model");
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
        headers: hostedRunModel
          ? { "Authorization": `Bearer ${CF_API_TOKEN}`, "Content-Type": "application/json" }
          : {
              // dynamic/{route} models are resolved by the gateway itself and
              // require this header; harmless to include on ordinary
              // (non-dynamic) chat-completions calls through the same endpoint.
              "Authorization": `Bearer ${CF_API_TOKEN}`,
              "cf-aig-authorization": `Bearer ${CF_AIG_TOKEN}`,
              "Content-Type": "application/json"
            },
        body:    JSON.stringify(requestBody),
        signal:  ctrl.signal
      });
      clearTimeout(t);
      const data = await res.json();
      if (hostedRunModel) {
        if (!data.success) throw new Error(JSON.stringify(data.errors));
        const directResponse = typeof data?.result?.response === "string" ? data.result.response : "";
        const choiceResponse = extractChatCompletionText(data?.result || {});
        const text = String(directResponse || choiceResponse || "").trim();
        if (requireNonEmpty && !text) {
          throw new Error(`Empty response from ${nonEmptyLabel}`);
        }
        return text;
      }
      if (!res.ok) throw new Error(JSON.stringify(data?.errors || data || [{ message: `HTTP ${res.status}` }]));
      const text = String(extractChatCompletionText(data) || "").trim();
      if (requireNonEmpty && !text) {
        throw new Error(`Empty response from ${nonEmptyLabel}`);
      }
      return text;
    } catch (err) {
      if (i === retries) throw err;
      status(`CF PUNCH! ${i+1}: ${err.message}`);
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

  return withVisionOperation("vision", async () => {
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
        status(`Vision retry ${i + 1}: ${err.message}`);
        await sleep(400 + (i * 150));
      }
    }
  });
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
async function resizeImageB64ForVision(imageB64, maxWidth = 800, maxHeight = 560, mimeType = "image/jpeg") {
  const sourceB64 = String(imageB64 || "").trim();
  if (!sourceB64) return "";

  const sourceMime = String(mimeType || "image/jpeg").toLowerCase();
  const outputFormat = sourceMime.includes("png") ? "png"
    : sourceMime.includes("webp") ? "webp"
    : sourceMime.includes("gif") ? "gif"
    : "jpeg";

  if (sharp) {
    try {
      const inputBuffer = Buffer.from(sourceB64, "base64");
      const image = sharp(inputBuffer, { failOnError: false });
      const metadata = await image.metadata().catch(() => ({}));
      const width = Math.max(1, Number(metadata.width || 0) || 1);
      const height = Math.max(1, Number(metadata.height || 0) || 1);
      const ratio = Math.min(1, maxWidth / width, maxHeight / height);
      let pipeline = image;
      if (ratio < 1) {
        pipeline = pipeline.resize({ width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)), fit: "inside", withoutEnlargement: true });
      }
      if (outputFormat === "png") pipeline = pipeline.png();
      else if (outputFormat === "webp") pipeline = pipeline.webp({ quality: 82 });
      else pipeline = pipeline.jpeg({ quality: 72, mozjpeg: true });
      const buf = await pipeline.toBuffer();
      if (buf && buf.length) return buf.toString("base64");
    } catch {}
  }

  if (!page) return sourceB64;
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
        img.src = `data:${sourceMime || "image/jpeg"};base64,` + b64;
      });
    }, { b64: sourceB64, maxW: maxWidth, maxH: maxHeight });
    return typeof resized === "string" && resized ? resized : sourceB64;
  } catch {
    return sourceB64;
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
  if (mime.startsWith("image/") || kind === "image" || kind.includes("image") || kind.includes("screenshot") || kind.includes("clipboard")) return "image";
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

function parseImageAnalysisStructured(text = "") {
  const lines = String(text || "").split(/\r?\n/);
  const sections = {
    visibleText: [],
    objectsAndPeople: [],
    colors: [],
    summary: []
  };

  const headerMatchers = [
    { key: "visibleText", re: /^(?:\d+[.)]\s*)?(?:visible\s*text|text)\s*(?:[:\-—]\s*)?(.+)?$/i },
    { key: "objectsAndPeople", re: /^(?:\d+[.)]\s*)?(?:objects\s*and\s*people|objects|people)\s*(?:[:\-—]\s*)?(.+)?$/i },
    { key: "colors", re: /^(?:\d+[.)]\s*)?(?:colors?|colour(s)?)\s*(?:[:\-—]\s*)?(.+)?$/i },
    { key: "summary", re: /^(?:\d+[.)]\s*)?(?:detailed\s*summary|summary)\s*(?:[:\-—]\s*)?(.+)?$/i }
  ];

  let currentKey = "";
  for (const line of lines) {
    const trimmed = String(line || "").trim();
    if (!trimmed) {
      if (currentKey) sections[currentKey].push("");
      continue;
    }

    let matched = false;
    for (const matcher of headerMatchers) {
      const hit = trimmed.match(matcher.re);
      if (hit) {
        currentKey = matcher.key;
        matched = true;
        const tail = String(hit[1] || "").trim();
        if (tail) sections[currentKey].push(tail);
        break;
      }
    }

    if (!matched && currentKey) {
      sections[currentKey].push(trimmed);
    }
  }

  const join = (items) => items.join("\n").trim();
  return {
    visibleText: join(sections.visibleText),
    objectsAndPeople: join(sections.objectsAndPeople),
    colors: join(sections.colors),
    summary: join(sections.summary),
    raw: String(text || "").trim()
  };
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
  const sourceMime = String(media?.mimeType || "image/jpeg");
  const imageBuffer = Buffer.from(String(media?.dataB64 || ""), "base64");
  const dimensions = readImageDimensions(imageBuffer, sourceMime);
  const preparedImageB64 = await resizeImageB64ForVision(media.dataB64, 800, 560, sourceMime);
  const prompt = `User query: "${String(userQuery || "").slice(0, 800)}"

You are analyzing a user-uploaded image. Return a detailed response with these exact sections:
1. Visible text — extract every readable word or phrase as accurately as possible.
2. Objects and people — list the main objects, people, faces, and notable spatial relationships.
3. Colors — describe the dominant colors, accent colors, and overall palette.
4. Detailed summary — describe what the image shows and any important context.

Be thorough and specific.`;

  let text;
  try {
    text = await callVisionAI(preparedImageB64, prompt, 1200, chosenModel);
  } catch (err) {
    text = `Vision analysis failed: ${err.message}`;
  }

  const structured = parseImageAnalysisStructured(text);
  structured.dimensions = {
    width: Math.max(1, Number(dimensions.width || 0) || 1),
    height: Math.max(1, Number(dimensions.height || 0) || 1)
  };
  structured.mimeType = sourceMime;
  structured.kind = String(media?.kind || "");

  return {
    taskType: "image_analysis",
    model: chosenModel,
    text,
    structured,
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
  return `I'm Puppeterr. This chat currently runs on ${active}. I can help you with casual conversation, web automation, and UI analysis. How can I assist you today?`;
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

// Matches <<BROWSING_TASK>>...<<END_BROWSING_TASK>> emitted by the reasoner
// when it decides it needs live page content to answer. Non-greedy so
// multiple stray tag pairs in a malformed response don't merge into one match.
const BROWSING_TASK_TAG_RE = /<<BROWSING_TASK>>([\s\S]*?)<<END_BROWSING_TASK>>/;

async function answerCasualChat(rawMessage, conversationHistory, models, chatId = null, browserRuntime = null, userId = null) {
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

  const SLANG_GLOSSARY = "Slang glossary (for understanding user tone/intent — do not lecture or over-explain these back to the user):\n" +
    "acoustic=algospeak for 'autistic', clueless insult | aura=vibe/reputation | ate=did great | baddie=confident attractive woman | based=being unapologetically yourself | bffr='be for real' | brain rot=overstimulation from online content | bruh=bro/disbelief | bussin=extremely good | cap=lie, no cap=truth | caught in 4K=caught with proof | crine=crying-laughing | cooked=in trouble/screwed | dead=hilarious | delulu=delusional (romantic fantasy) | drip=good fashion | edge=near-completion or sexual context | face card=attractiveness | fanum tax=stealing a friend's food | finna=about to | fit=outfit | gagged=shocked | geeked=excited/hyped | glaze=overpraise | glow-up=major improvement | GOAT=greatest of all time | gyatt=attractive butt | hits different=uniquely better | ick=sudden disgust/turn-off | icl='I can't lie' | IJBOL='I just burst out laughing' | it's giving=describes a vibe | iykyk='if you know you know' | jit=young/inexperienced person | Karen=entitled person | L=loss/failure, L+ratio=you lost badly | lit=fun/exciting | locked in=focused | mid=mediocre | mog=outshine someone | moots=mutual followers | nepo baby=child of a famous/connected parent | oomf='one of my followers' | out of pocket=wild/inappropriate | periodt=emphatic final statement | pick-me=seeking validation via approval-seeking behavior | pookie=affectionate nickname | pushing P=acting with style/success | ratio=replies outnumber likes (a dunk) | rage-bait=content meant to provoke anger | rizz=charisma/flirting skill | salty=bitter | sheesh=praise/impressed | sigma=lone-wolf archetype | simp=overly eager for someone's attention | situationship=undefined romantic relationship | skibidi=nonsense meme word | slay=did something well | touch grass=go outside, get perspective | ts='this'/'type shit' | twin=close friend | rawdog=doing something with no aids/prep (e.g. a flight with no phone) | mewing=jaw-exercise meme trend | npc=someone acting robotic/unoriginal | girl dinner=a small/mismatched improvised meal | main character energy=acting confidently central to the moment | beige flag=a quirky, neutral personality trait | chronically online=too online, out of touch with offline norms | ghost=stop responding/disappear | menty b=mental breakdown (used casually) | rent free=can't stop thinking about something | vibe check=informal read on someone's mood/energy | W=win.\n" +
    "Sensitive-term note: KMS/KYS/'unalive' appear in youth slang sometimes as exaggerated dark humor (e.g. reacting to embarrassment) and sometimes as a genuine expression of distress. Recognize both meanings, but never use these terms yourself, never mirror them back playfully, and if the context reads as genuine distress rather than joking, drop the casual tone and respond with care instead of banter.\n\n";

  const CASUAL_CHAT_SYSTEM = SLANG_GLOSSARY + "You are Puppeterr in casual chat mode. Respond helpfully and conversationally. If asked what model you are, state the configured model id exactly. Formatting: - *italic*, **bold**, ***bold+italic*** - `inline code` - <br> for line breaks - Headings (# to ######) for visual flair - Emoji shortcodes like :rocket: :fire: :smile: Tone: - Match the user’s energy and slang (lol, brb, idk, smh, lmao, wtf, etc.) - Adjust style, not emotions. You never express feelings. Tone rules: - Hype → high energy, playful confidence - Annoyed → dry humor, light sarcasm - Bored → chill, low‑energy banter - Chaotic → theatrical, exaggerated - Neutral → normal conversational tone Roasting: - Light, playful roasts only about simple tasks - Never personal, emotional, or identity‑based Boundaries: - No emotions, no attachment, no claiming to be OpenAI/GPT‑4 unless true. Creativity: - Use headings, spacing, and visual flair when it improves clarity or aesthetics. - Keep responses natural and conversational. - Only use structured layouts when the user explicitly asks for them.\n\n" +
    "Context escalation: you may NOT browse on your own initiative for memes, casual link-dropping, or vague reactions (\"lol look at this\", \"bro this link is wild\") — just react normally to those. ONLY when the user explicitly asks you to evaluate, summarize, or describe something you have no cached context for (e.g. \"is this repo good?\", \"what does this project do?\", \"is this site legit?\") AND a URL or clearly identifiable target is present, you may request one — and only one — browsing task instead of guessing or hallucinating. To do this, respond with ONLY this block and nothing else:\n<<BROWSING_TASK>>\n/browser go to <url>\n<<END_BROWSING_TASK>>\nDo not add any other text alongside that block. Never emit it a second time in the same reply.";

  try {
    const raw = await callCFAI(models.reasoner || models.router, [
      { role: "system", content: CASUAL_CHAT_SYSTEM },
      { role: "user", content: `Recent conversation:\n${convCtx || "(none)"}\n\nUser message:\n${String(rawMessage || "")}` }
    ], 500, 1, getRuntimeTemperature(models));
    let plain = stripThinking(raw) || "";

    const tagMatch = plain.match(BROWSING_TASK_TAG_RE);
    if (tagMatch) {
      const browserGoal = tagMatch[1].trim().replace(/^\/browser\s+/i, "");
      appendLearningEvent({
        kind: "auto_escalation",
        goal: browserGoal.slice(0, 240),
        trigger: String(rawMessage || "").slice(0, 240)
      });

      let browsedAnswer = "";
      try {
        browsedAnswer = await runTask(browserGoal, models, chatId, browserRuntime, userId);
      } catch (taskErr) {
        // Single, non-looping error path — never re-escalates.
        errLog("Auto-escalation browsing task failed: " + (taskErr?.message || taskErr));
        return applyChatStyleFormatting("I couldn't access that page — want me to try something else?", styleRequest);
      }

      // Exactly one follow-up reasoner call with the fetched context. This call's
      // system prompt has no escalation instruction, so it structurally cannot
      // emit another <<BROWSING_TASK>> tag — the loop is capped by construction,
      // not just by convention.
      const followUp = await callCFAI(models.reasoner || models.router, [
        { role: "system", content: "You are Puppeterr. Answer the user's original message using the browsing result below. Be conversational, matching their tone. Do not mention tags, tools, or internal steps." },
        { role: "user", content: `Original user message:\n${String(rawMessage || "")}\n\nBrowsing result:\n${String(browsedAnswer || "(no content returned)").slice(0, 4000)}` }
      ], 500, 1, getRuntimeTemperature(models));
      plain = stripThinking(followUp) || "I checked the page but couldn't put together a clear answer — want me to try again?";
    }

    if (!plain) plain = "Error: no response from current model, please try again.";
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

    // Aggressive mode: find first { or [ and last } or ], then extract
    const firstBrace = Math.max(clean.indexOf("{"), clean.indexOf("["));
    if (firstBrace >= 0) {
      const firstChar = clean[firstBrace];
      const lastChar = firstChar === "{" ? "}" : "]";
      const lastBrace = clean.lastIndexOf(lastChar);
      if (lastBrace > firstBrace) {
        const extracted = clean.slice(firstBrace, lastBrace + 1);
        try { return JSON.parse(extracted); } catch {}
      }
    }

    // Standard depth-tracking extraction
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

  function parseModelJSON(raw) {
    const parsed = safeParseJSON(raw);
    if (parsed) return parsed;

    const stripped = stripThinking(raw);
    const repaired = stripped
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/,\s*([}\]])/g, "$1")
      .trim();

    if (repaired && repaired !== stripped) {
      const retry = safeParseJSON(repaired);
      if (retry) return retry;
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

  function summarizeResultsForPlanner(results = []) {
    const list = Array.isArray(results) ? results : [];
    if (!list.length) return "none";

    return list.slice(0, 8).map((item, idx) => {
      const action = String(item?.action || "unknown");
      const status = String(item?.status || "unknown");
      const selector = String(item?.selector || "").trim();
      const reason = String(item?.error || item?.reason || "").replace(/\s+/g, " ").trim().slice(0, 120);
      const notes = [];
      if (selector) notes.push(`sel=${selector.slice(0, 80)}`);
      if (reason) notes.push(`note=${reason}`);
      if (item?.domMapSummary) notes.push(`dom=${String(item.domMapSummary).slice(0, 100)}`);
      return `${idx + 1}. ${action}:${status}${notes.length ? ` (${notes.join(" | ")})` : ""}`;
    }).join("\n");
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
    const url = page.url();
    const statePayload = await page.evaluate(({ textLimit, linkLimit, inputLimit, buttonLimit }) => {
      const title = document.title || "";
      const text = document.body ? document.body.innerText.slice(0, textLimit) : "";
      const vw = window.innerWidth || 1920;
      const vh = window.innerHeight || 1080;

      const links = Array.from(document.querySelectorAll("a[href]"))
        .slice(0, linkLimit)
        .map(a => ({
          text: (a.innerText || a.textContent || "").trim().slice(0, 90),
          href: a.href,
          id: a.id || "",
          role: a.getAttribute("role") || ""
        }))
        .filter(item => item.href);

      const inputs = Array.from(document.querySelectorAll("input,textarea,select")).slice(0, inputLimit)
        .map(el => {
          const rect = el.getBoundingClientRect();
          const inViewport = rect.width > 0 && rect.height > 0 &&
            rect.top < vh && rect.bottom > 0 && rect.left < vw && rect.right > 0;
          const tag = el.tagName.toLowerCase();
          const aria = el.getAttribute("aria-label") || "";
          const ph = el.placeholder || "";
          const tid = el.getAttribute("data-testid") || el.getAttribute("data-qa") || "";
          let sel = "";
          if (el.id) sel = `#${el.id}`;
          else if (tid) sel = `[data-testid='${tid}']`;
          else if (el.name) sel = `${tag}[name='${el.name}']`;
          else if (aria) sel = `${tag}[aria-label='${aria.slice(0, 80)}']`;
          else if (ph) sel = `${tag}[placeholder='${ph.slice(0, 60)}']`;
          else if (el.type && el.type !== "text") sel = `${tag}[type='${el.type}']`;
          else sel = tag;
          return {
            tag,
            type: el.type || "",
            name: el.name || "",
            placeholder: ph.slice(0, 80),
            id: el.id || "",
            ariaLabel: aria.slice(0, 90),
            selector: sel,
            visible: inViewport,
            cx: Math.round(rect.left + rect.width / 2),
            cy: Math.round(rect.top + rect.height / 2),
            value: (el.value || "").slice(0, 70)
          };
        });

      const buttons = Array.from(document.querySelectorAll("button,input[type='button'],input[type='submit'],[role='button']"))
        .slice(0, buttonLimit)
        .map(el => {
          const rect = el.getBoundingClientRect();
          const inViewport = rect.width > 0 && rect.height > 0 &&
            rect.top < vh && rect.bottom > 0 && rect.left < vw && rect.right > 0;
          const aria = el.getAttribute("aria-label") || "";
          const tid = el.getAttribute("data-testid") || "";
          let sel = "";
          if (el.id) sel = `#${el.id}`;
          else if (tid) sel = `[data-testid='${tid}']`;
          else if (aria) sel = `[aria-label='${aria.slice(0, 80)}']`;
          const labelText = (el.innerText || el.value || aria || "").trim().slice(0, 90);
          return {
            text: labelText,
            visible: inViewport,
            id: el.id || "",
            name: el.name || "",
            selector: sel,
            role: el.getAttribute("role") || "",
            cx: Math.round(rect.left + rect.width / 2),
            cy: Math.round(rect.top + rect.height / 2)
          };
        })
        .filter(item => item.text);

      return { title, text, links, inputs, buttons };
    }, {
      textLimit: STATE_TEXT_LIMIT,
      linkLimit: STATE_LINK_LIMIT,
      inputLimit: STATE_INPUT_LIMIT,
      buttonLimit: STATE_BUTTON_LIMIT
    }).catch(() => ({ title: "", text: "", links: [], inputs: [], buttons: [] }));

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

    const voidMap = VOID_MAP_CAPTURE_EVERY_STATE
      ? await captureVoidElementMap(page, {
          includeWithoutId: true,
          includeText: true,
          includeStyleBits: true,
          includeShadowDescendants: true,
          maxElements: VOID_MAP_STATE_MAX_ELEMENTS,
          textLimit: VOID_MAP_STATE_TEXT_LIMIT,
        }).catch(() => null)
      : null;

    const voidMapSummary = summarizeVoidElementMap(voidMap || {});
    const voidMapClickable = Array.isArray(voidMap?.elements)
      ? voidMap.elements
          .filter(el => el?.clickable && el?.visibility?.isVisible)
          .slice(0, 8)
          .map(el => {
            const tag = String(el.tagName || "el");
            const id = el.id ? `#${String(el.id).slice(0, 30)}` : "";
            const role = el.role ? `[role=${String(el.role).slice(0, 18)}]` : "";
            const label = String(el.text || el.ariaLabel || el.name || "").trim().slice(0, 28);
            return `${tag}${id}${role}${label ? `:${label}` : ""}`;
          })
      : [];

    return {
      url,
      title: statePayload.title,
      text: statePayload.text,
      links: Array.isArray(statePayload.links) ? statePayload.links : [],
      inputs: Array.isArray(statePayload.inputs) ? statePayload.inputs : [],
      buttons: Array.isArray(statePayload.buttons) ? statePayload.buttons : [],
      tabs: tabInfo,
      voidMapSummary,
      voidMapClickable,
    };
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
    const domSignals = await page.evaluate(() => {
      const vw = Math.max(1, window.innerWidth || 1920);
      const vh = Math.max(1, window.innerHeight || 1080);
      const isVisibleCaptchaNode = (el) => {
        if (!el || typeof el.getBoundingClientRect !== "function") return false;
        if (el.closest("[aria-hidden='true'], [hidden], template, noscript")) return false;
        const style = window.getComputedStyle(el);
        if (!style) return false;
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || "1") < 0.05) return false;
        if (style.pointerEvents === "none") return false;
        const rect = el.getBoundingClientRect();
        return !!rect && rect.width >= 8 && rect.height >= 8 && rect.bottom > 0 && rect.right > 0 && rect.top < vh && rect.left < vw;
      };

      const hasVisibleMatch = (selectors) => selectors.some(selector => {
        try {
          return Array.from(document.querySelectorAll(selector)).some(isVisibleCaptchaNode);
        } catch {
          return false;
        }
      });

      const strongSelectors = [
        'iframe[src*="recaptcha" i]',
        'iframe[src*="hcaptcha" i]',
        'iframe[src*="turnstile" i]',
        '[class*="g-recaptcha" i]',
        '.h-captcha',
        '[class*="cf-turnstile" i]',
        '#cf-challenge-running',
        '.cf-challenge'
      ];
      const weakSelectors = [
        '[id*="captcha" i]',
        '[class*="captcha" i]',
        'iframe[src*="captcha" i]',
        '[name*="captcha" i]',
        '[data-testid*="captcha" i]'
      ];
      const hasStrong = hasVisibleMatch(strongSelectors);
      const hasWeak = hasVisibleMatch(weakSelectors);
      return { hasStrong, hasWeak };
    }).catch(() => ({ hasStrong: false, hasWeak: false }));

    const strongDomHit = !!domSignals.hasStrong;
    const weakDomHit = !!domSignals.hasWeak;

    const score =
      (strongTextHit ? 3 : 0) +
      (weakTextHit ? 1 : 0) +
      (urlHit ? 2 : 0) +
      (strongDomHit ? 3 : 0) +
      (weakDomHit ? 1 : 0);

    const detected =
      strongDomHit ||
      strongTextHit ||
      (urlHit && (weakTextHit || weakDomHit)) ||
      (weakTextHit && weakDomHit && score >= 3) ||
      score >= 5;

    const strongEvidence =
      strongDomHit ||
      strongTextHit ||
      (urlHit && (weakTextHit || weakDomHit));

    const evidence = [
      strongDomHit ? "dom-strong" : "",
      weakDomHit ? "dom-weak" : "",
      strongTextHit ? "text-strong" : "",
      weakTextHit ? "text-weak" : "",
      urlHit ? "url" : ""
    ].filter(Boolean).join(", ");

    return {
      detected,
      strongEvidence,
      score,
      reason: detected ? `Potential CAPTCHA/challenge detected${evidence ? ` (${evidence})` : ""}` : ""
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
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.reason === "string" && !parsed.evidence) parsed.evidence = parsed.reason;
      if (typeof parsed.evidence === "string" && !parsed.reason) parsed.reason = parsed.evidence;
      return parsed;
    }
    return {
      state: "uncertain",
      next_focus: "unknown",
      blocker: "unknown",
      reason: String(raw || "").slice(0, 180),
      evidence: String(raw || "").slice(0, 180)
    };
  }

  function quoteCssText(text) {
    return JSON.stringify(String(text || "").trim());
  }

  function buildExactAttrSelector(attr, value) {
    const name = String(attr || "").trim();
    const raw = String(value || "").trim();
    if (!name || !raw) return "";
    return `[${name}=${quoteCssText(raw)}]`;
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

    add("input[type='checkbox'][name*='captcha' i]");
    add("input[type='checkbox'][id*='captcha' i]");
    add("input[type='radio'][name*='captcha' i]");
    add("input[type='radio'][id*='captcha' i]");
    return candidates.slice(0, 10);
  }

  function shouldResetTaskContextToGoogle(state, goalMem, searchEngineCompareGoal) {
    const currentHost = getHostFromUrl(state?.url || "");
    if (!currentHost || currentHost === "about:blank") return false;
    if (hostMatchesExpectedHost(currentHost, "google.com")) return false;
    if (goalMem?.targetHost && hostMatchesExpectedHost(currentHost, goalMem.targetHost)) return false;
    if (searchEngineCompareGoal) {
      return !hostMatchesExpectedHost(currentHost, "google.com") && !hostMatchesExpectedHost(currentHost, "bing.com");
    }
    if (goalMem?.query) {
      return !hostMatchesExpectedHost(currentHost, "google.com") && !hostMatchesExpectedHost(currentHost, "bing.com") && !hostMatchesExpectedHost(currentHost, "duckduckgo.com") && !hostMatchesExpectedHost(currentHost, "search.yahoo.com");
    }
    return !!goalMem?.targetHost && !hostMatchesExpectedHost(currentHost, goalMem.targetHost);
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
        const preferredInput = (state.inputs || []).find(item => item?.visible && /text|search|email|password|checkbox|radio/.test(String(item.type || "")));
        plan.selector = preferredInput?.id
          ? buildExactAttrSelector("id", preferredInput.id)
          : "";
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

Your job is to interpret the screenshot using BOTH:
1. Semantic visual reasoning (what the page means)
2. Pixel-grid mapping (what the pixels literally show, 1:1)

You must combine these two views to produce a stable, accurate UI state.

Goal: "${taskVisionState.goal}"
URL: ${taskVisionState.latestUrl}

Return JSON only:
{
  "state": "progress|blocked|captcha|login|ready|uncertain",
  "next_focus": "short actionable focus",
  "blocker": "none|captcha|login|paywall|popup|unknown",
  "pixel_grid_map": {
    "blank_ratio": 0-100,
    "gray_ratio": 0-100,
    "modal_bounds": "x,y,w,h or none",
    "captcha_bounds": "x,y,w,h or none",
    "overlay_bounds": "x,y,w,h or none",
    "click_targets": ["x,y", ...]
  },
  "reason": "clear explanation of WHY you chose this state",
  "examples": [
    "If large white box covers center → likely paywall overlay.",
    "If gray skeleton blocks content → hydration/loading.",
    "If high blank_ratio + no UI → page still rendering.",
    "If distinct framed box with text → possible CAPTCHA.",
    "If navigation bar visible + content stable → ready."
  ]
}`;

        const raw = await callVisionAI(imageB64, reasonerPrompt, 260, taskVisionState.model);
        const signal = parseVisionReasonerSignal(raw);
        taskVisionState.lastReasonerAt = now;
        taskVisionState.latestReasonerRaw = String(raw || "").slice(0, 99999);
        taskVisionState.latestReasonerSignal = signal;
        taskVisionState.latestSummary = [
          `VisionState=${signal.state || "uncertain"}`,
          `Focus=${signal.next_focus || "n/a"}`,
          `Blocker=${signal.blocker || "unknown"}`,
          `Reason=${signal.reason || signal.evidence || "n/a"}`,
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
        learningLogCache = Array.isArray(parsed) ? parsed.slice(-2000) : [];
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
    writeJsonAtomic(LOG_FILE, learningLogCache);
  }

  function getHostFromUrl(rawUrl) {
    try {
      return new URL(rawUrl || "about:blank").host.replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  function hostMatchesExpectedHost(actualHost, expectedHost) {
    const actual = String(actualHost || "").toLowerCase().replace(/^www\./, "");
    const expected = String(expectedHost || "").toLowerCase().replace(/^www\./, "");
    if (!actual || !expected) return false;
    return actual === expected || actual.endsWith(`.${expected}`);
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

    // Planner sometimes emits { value: "..." } for fill/type actions.
    if ((canonicalAction === "fill" || canonicalAction === "type") && params.text === undefined && params.value !== undefined) {
      params.text = String(params.value ?? "");
    }

    if (canonicalAction === "waitForTimeout" && params.ms === undefined && params.timeout !== undefined) {
      params.ms = Number(params.timeout) || params.timeout;
    }

    if (typeof params.selector === "string") {
      params.selector = sanitizePlannerSelector(params.selector, canonicalAction);
    }

    if (canonicalAction === "press" && !params.key) {
      params.key = "Enter";
    }

    if (canonicalAction === "submitForm" && typeof params.selector === "string") {
      const normalizedSelector = params.selector.toLowerCase();
      // Prevent Google "I'm Feeling Lucky" style detours.
      if (/(btni|gbqfbb|feeling lucky)/.test(normalizedSelector)) {
        return {
          action: "press",
          params: {
            selector: "#APjFqb, textarea[name='q'], input[type='search'], input[name='q']",
            key: "Enter"
          }
        };
      }
    }

    if ((canonicalAction === "mouseClick" || canonicalAction === "mouseDblclick") && (!Number.isFinite(Number(params.x)) || !Number.isFinite(Number(params.y)))) {
      // If malformed mouse coordinates arrive, prefer letting normal click path handle text selectors.
      if (typeof params.selector === "string" && params.selector.trim()) {
        return { action: "click", params: { selector: params.selector } };
      }
    }

    return { action: canonicalAction, params };
  }

  function extractSelectorHrefNeedles(selector) {
    const source = String(selector || "");
    if (!source) return [];
    const needles = [];
    const seen = new Set();
    const re = /href\*=\s*['"]([^'"]+)['"]/gi;
    let match;
    while ((match = re.exec(source)) !== null) {
      const token = String(match[1] || "").trim().toLowerCase();
      if (!token || seen.has(token)) continue;
      seen.add(token);
      needles.push(token);
    }
    return needles;
  }

  function appendLearningEvent(event) {
    const log = loadLearningLog();
    log.push({ ts: new Date().toISOString(), ...event });
    if (log.length > 2000) {
      learningLogCache = log.slice(-2000);
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

    let baselineAttempted = false;
    for (const modelCandidate of attemptOrder) {
      if (modelCandidate === baselineRouterModel && baselineAttempted) continue;
      try {
        if (modelCandidate === baselineRouterModel) baselineAttempted = true;
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
async function planNextSteps(goal, state, visionFeedback, taskLog, plannerHistory, stuck, failures, models, peerSignals = {}, taskHints = {}) {
  status("Planner reasoning...");
  const learningContext = buildLearningContext(goal, state);
  const peerReasoner = peerSignals?.reasoner || {};
  const peerSupervisor = peerSignals?.supervisor || {};
  const peerResearch = peerSignals?.research || {};
  const goalMemCtx = peerSignals?.goalMemContext || "";
  const compactGoal = compactPromptValue(goal, 260);
  const compactCurrentUrl = compactUrlForPrompt(state.url);
  const compactTabs = (state.tabs?.urls || []).slice(0, 3).map((tabUrl, idx) => `[${idx}] ${compactUrlForPrompt(tabUrl)}`).join(" | ") || "single";
  const compactVisibleLinks = (state.links || []).slice(0, 6)
    .map(l => `"${compactPromptValue(l.text, 24)}"=>${compactUrlForPrompt(l.href)}`)
    .join(" | ") || "none";
  const compactTaskLog = taskLog.slice(-MAX_TASK_LOG_LINES_IN_PROMPT).map(line => compactPromptValue(line, 110)).join(" || ") || "none";
  const fullPageText = String(state.text || "").replace(/\s+/g, " ").trim();
  // compactPageText is computed further below, once every other field in
  // this prompt is known — see compactPageTextDynamic. It needs to be
  // declared here (not assigned yet) because it's used in the userMsg
  // template alongside these other fields.
  let compactPageText = "";
  const compactRecon = compactPromptValue(currentStriderReconMemo || "none", 1400);
  const compactInputs = (state.inputs || []).filter(i => i.visible).slice(0, 6)
    .map(i => `${compactPromptValue(i.selector, 48)} (${i.type || "text"})`)
    .join(" | ") || "none";
  const compactButtons = (state.buttons || []).filter(b => b.visible).slice(0, 6)
    .map(b => `${compactPromptValue(b.text, 24)}${b.selector ? `@${compactPromptValue(b.selector, 28)}` : ""}`)
    .join(" | ") || "none";
  const compactVoidMapSummary = compactPromptValue(state.voidMapSummary || "none", 220);
  const compactVoidMapClickable = (state.voidMapClickable || []).slice(0, 8).map(item => compactPromptValue(item, 54)).join(" | ") || "none";
  const compactDirectNavigationTarget = taskHints.simpleFastPathCandidate && String(taskHints.directNavigationTarget || "").trim()
    ? compactUrlForPrompt(taskHints.directNavigationTarget)
    : "none";

  // Dynamic page-text compaction: budget = however much room is actually
  // left after every other field in this prompt, not a fixed guess. Also
  // preserves HEAD + TAIL (not just head) — end-of-page content (footers,
  // dates, final totals) is often exactly what a task needs and a
  // head-only cut throws it away every time on long pages.
  function compactPageTextDynamic(fullText, restOfPromptLength) {
    const TOTAL_PROMPT_CHAR_CEILING = 6000; // leaves headroom for plannerHistory/system prompt beyond this one message
    const MIN_BUDGET = 300;   // never starve it even if the rest of the prompt is unusually large
    const MAX_BUDGET = 4000;  // cap even with lots of room — a full page dump rarely helps planning
    const HEAD_RATIO = 0.65;  // main content/title tends to matter more than mid-page filler

    const available = TOTAL_PROMPT_CHAR_CEILING - restOfPromptLength;
    const budget = Math.max(MIN_BUDGET, Math.min(MAX_BUDGET, available));
    if (fullText.length <= budget) return fullText;

    const headLen = Math.floor(budget * HEAD_RATIO);
    const tailLen = budget - headLen;
    const head = fullText.slice(0, headLen);
    const tail = tailLen > 0 ? fullText.slice(-tailLen) : "";
    const cutCount = fullText.length - headLen - tailLen;
    return `${head}\n…[TRUNCATED: ${cutCount} chars cut from the middle of this page — use getAllText with a specific selector to read the omitted section if the answer is not in the text shown here]…\n${tail}`;
  }

  // Measure everything else in the prompt template BEFORE deciding the
  // page-text budget, using the actual template with PageText left blank.
  const restOfPromptLength = [
    compactPromptValue(taskHints.taskContext?.originalGoal || goal, 400),
    String(taskHints.taskContext?.stepCount ?? 0),
    compactPromptValue(taskHints.taskContext?.lastAction || "none", 200),
    compactPromptValue(taskHints.taskContext?.lastResult || "none", 160),
    compactGoal, compactCurrentUrl, compactPromptValue(state.title, 70),
    compactTabs, compactInputs, compactButtons, compactVisibleLinks,
    compactVoidMapSummary, compactVoidMapClickable,
    compactPromptValue(visionFeedback || "none", 280),
    compactPromptValue(peerReasoner.instinct || "none", 80),
    compactPromptValue(peerSupervisor.reason || "", 70),
    goalMemCtx || "none", compactDirectNavigationTarget,
    compactTaskLog, compactRecon
  ].join("").length;

  compactPageText = compactPageTextDynamic(fullPageText, restOfPromptLength);

const userMsg = `[TASK ANCHOR — do not deviate from this, even if the page or prior steps look confusing]
OriginalTask:${compactPromptValue(taskHints.taskContext?.originalGoal || goal, 400)}
StepsSoFar:${taskHints.taskContext?.stepCount ?? 0}
LastAction:${compactPromptValue(taskHints.taskContext?.lastAction || "none", 200)}
LastResult:${compactPromptValue(taskHints.taskContext?.lastResult || "none", 160)}
[/TASK ANCHOR]

Goal:${compactGoal}
URL:${compactCurrentUrl}
Title:${compactPromptValue(state.title, 70)}
Tabs:${state.tabs?.activeIndex ?? 0}/${state.tabs?.count ?? 1} ${compactTabs}
Inputs:${compactInputs}
Buttons:${compactButtons}
Links:${compactVisibleLinks}
VoidMap:${compactVoidMapSummary}
VoidClickable:${compactVoidMapClickable}
Vision:${compactPromptValue(visionFeedback || "none", 280)}
Peers:instinct=${compactPromptValue(peerReasoner.instinct || "none", 80)};risk=${compactPromptValue(peerReasoner.risk || "none", 24)};focus=${compactPromptValue(peerReasoner.next_focus || "none", 60)};supervisor=${compactPromptValue(peerSupervisor.decision || "none", 20)}:${compactPromptValue(peerSupervisor.reason || "", 70)};researchHints=${Number(peerResearch.hintCount || 0)}
GoalProgress:${goalMemCtx || "none"}
DirectNavigationTarget:${compactDirectNavigationTarget}
DirectNavigationHint:${taskHints.simpleFastPathCandidate ? "There is a direct navigation candidate available, but only follow it if it seems like the best first action." : "none"}
History:${compactTaskLog}
Recon:${compactRecon}
PageText:${compactPageText}
Learning:${compactPromptValue(learningContext, 200)}
Failures:${failures};Stuck:${stuck ? "yes" : "no"}
Constraints:<=13 actions;avoid repeating failed selector/action;prefer submitForm for search;JSON only.`;

  plannerHistory.push({ role: "user", content: userMsg.slice(0, MAX_PLANNER_USER_MSG_CHARS) });
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

    const plannerMetaFailure = /(no\s+json\s+content|malformed\s+json|fix\s+this\s+malformed\s+json|no\s+actual\s+json\s+data|rewrite\s+the\s+input\s+as\s+strict\s+json)/i.test(plan.reasoning);
    if (plannerMetaFailure) {
      plan.done = false;
      plan._parseFailed = true;
      plan.reasoning = `Planner meta-repair response detected. ${plan.reasoning}`.slice(0, 1200);
    }

    plan.done = !!plan.done;
    plan.actions = Array.isArray(plan.actions)
      ? plan.actions.filter(item => item && typeof item === "object" && item.action).slice(0, 3)
      : [];

    if (plan.done && !plan.actions.length) {
      // Guard against "done" responses that are just malformed-JSON repair chatter.
      const suspiciousDone = /(json|schema|malformed|request|provided|included)/i.test(plan.reasoning);
      if (suspiciousDone) {
        plan.done = false;
        plan._parseFailed = true;
      }
    }

    return plan;
  };

  // Handles thinking-model preambles, code fences, and prose-wrapped JSON
  function aggressiveScrapeJSON(raw) {
    if (!raw) return null;
    let attempt = safeParseJSON(raw);
    if (attempt) return attempt;
    const stripped = String(raw).replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    attempt = safeParseJSON(stripped);
    if (attempt) return attempt;
    const fenced = stripped.replace(/```(?:json)?\s*([\s\S]*?)```/gi, "$1").trim();
    attempt = safeParseJSON(fenced);
    if (attempt) return attempt;
    const match = fenced.match(/\{[\s\S]*\}/);
    if (match) return safeParseJSON(match[0]);
    return null;
  }

  function hasUsablePlannerActions(plan) {
    const actions = Array.isArray(plan?.actions) ? plan.actions : [];
    return actions.some(a => {
      if (!a || !a.action) return false;
      if (["fill", "type"].includes(String(a.action)) && !String(a.params?.text || a.params?.value || "").trim()) return false;
      if (["click", "hover", "scrollIntoView"].includes(String(a.action)) && !String(a.params?.selector || "").trim()) return false;
      return true;
    });
  }

  function parsePlannerPayload(raw) {
    return parseModelJSON(raw) || aggressiveScrapeJSON(raw);
  }

  try {
    const plannerCandidates = buildPlannerCandidateModels(models);
    if (plannerCandidates.length && String(models.planner || "") !== plannerCandidates[0]) {
      const previousPlanner = String(models.planner || "").trim();
      models.planner = plannerCandidates[0];
      if (previousPlanner) {
        think(`Planner circuit-breaker: switching planner model ${previousPlanner} -> ${models.planner}`);
      }
    }

    let raw = "";
    try {
      raw = await callCFAI(
        models.planner,
        bounded,
        1500,
        0,
        getRuntimeTemperature(models),
        { requireNonEmpty: true, nonEmptyLabel: `planner:${models.planner}` }
      );
      markPlannerModelSuccess(models.planner);
    } catch (err) {
      markPlannerModelFailure(models.planner, err);
      errLog(`❌ Planner primary call failed: ${err.message}`);
      think("Planner primary call failed — switching to aggressive recovery.");
    }

    const parsed = parsePlannerPayload(raw);
    if (!parsed) {
      plannerHistory.push({ role: "assistant", content: String(raw || "").slice(0, MAX_PLANNER_ASSISTANT_MSG_CHARS) });
      errLog(`❌ Planner parse FAILED on raw (first 300 chars): ${String(raw || "").slice(0, 300)}`);
      think("Planner parse failed — launching aggressive multi-model JSON recovery.");
      const repairPrompt = `Output ONLY a JSON object. No prose. No code fences. No thinking.\nGoal: ${compactGoal}\nURL: ${compactCurrentUrl}\n\nRequired schema:\n{"reasoning":"one sentence","confidence":70,"done":false,"actions":[{"action":"fill","params":{"selector":"#APjFqb, textarea[name='q'], input[name='q'], input[type='search']","text":"<your search term>"}}]}\n\nStart your output with { immediately.`;

      const recoveryModels = buildPlannerCandidateModels(models)
        .slice(0, PLANNER_AGGRESSIVE_RECOVERY_MAX_MODELS);

      let fixedParsed = null;
      let fixedRaw = "";
      let fixedModel = "";
      for (const recoveryModel of recoveryModels) {
        try {
          const candidateRaw = await callCFAI(
            recoveryModel,
            [
              { role: "system", content: "You output only valid compact JSON. Never add prose, markdown, or thinking tags." },
              { role: "user", content: repairPrompt }
            ],
            900,
            PLANNER_AGGRESSIVE_RECOVERY_RETRIES,
            0,
            { requireNonEmpty: true, nonEmptyLabel: `planner-repair:${recoveryModel}` }
          );
          const candidateParsed = parsePlannerPayload(candidateRaw);
          if (candidateParsed && (candidateParsed.done === true || hasUsablePlannerActions(candidateParsed))) {
            fixedParsed = candidateParsed;
            fixedRaw = candidateRaw;
            fixedModel = recoveryModel;
            markPlannerModelSuccess(recoveryModel);
            break;
          }
          markPlannerModelFailure(recoveryModel, new Error("invalid planner repair payload"));
          errLog(`❌ Planner repair invalid from ${recoveryModel} (first 300 chars): ${String(candidateRaw || "").slice(0, 300)}`);
        } catch (repairErr) {
          markPlannerModelFailure(recoveryModel, repairErr);
          errLog(`❌ Planner repair transport failed via ${recoveryModel}: ${repairErr.message}`);
        }
      }

      if (!fixedParsed) {
        errLog(`❌ Planner repair FAILED across fallback models.`);
        const heuristicPlan = inferHeuristicPlan(goal, state, taskLog, failures);
        if (heuristicPlan && heuristicPlan.actions?.length) {
          heuristicPlan._parseFailed = true;
          heuristicPlan.reasoning = `Planner repair failed across models. ${heuristicPlan.reasoning}`.slice(0, 1200);
          return normalizePlannerResponse(heuristicPlan, "Planner repair failed; heuristic fallback engaged.");
        }
        return normalizePlannerResponse(
          { reasoning: "Planner parse failed after repair.", done: false, actions: [], confidence: 0, _parseFailed: true },
          "Planner parse failed after repair."
        );
      }

      // Reject repair results with structurally empty/missing params unless done=true.
      const repairHasValidActions = hasUsablePlannerActions(fixedParsed);
      if (!repairHasValidActions && fixedParsed.done !== true) {
        errLog(`❌ Planner repair produced invalid/empty action params — discarding.`);
        const heuristicPlan = inferHeuristicPlan(goal, state, taskLog, failures);
        if (heuristicPlan && heuristicPlan.actions?.length) {
          heuristicPlan._parseFailed = true;
          heuristicPlan.reasoning = `Planner repair produced invalid params. ${heuristicPlan.reasoning}`.slice(0, 1200);
          return normalizePlannerResponse(heuristicPlan, "Planner repair produced invalid params; heuristic fallback engaged.");
        }
        return normalizePlannerResponse(
          { reasoning: "Planner repair produced empty action params.", done: false, actions: [], confidence: 0, _parseFailed: true },
          "Planner repair produced empty action params."
        );
      }

      plannerHistory.push({ role: "assistant", content: String(fixedRaw || "").slice(0, MAX_PLANNER_ASSISTANT_MSG_CHARS) });
      if (fixedModel && fixedModel !== models.planner) {
        const previousPlanner = String(models.planner || "").trim();
        models.planner = fixedModel;
        think(`Planner promotion: ${previousPlanner || "(none)"} -> ${fixedModel}`);
      }
      think(`Planner recovered via ${fixedModel || "fallback model"}.`);
      return normalizePlannerResponse(fixedParsed, `Planner output repaired from malformed JSON via ${fixedModel || "fallback"}.`);
    }
    plannerHistory.push({ role: "assistant", content: String(raw || "").slice(0, MAX_PLANNER_ASSISTANT_MSG_CHARS) });
    markPlannerModelSuccess(models.planner);
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
const PLANNER_TIPS_50 = `
1 target goal
2 avoid loops
3 <=13 actions
4 atomic actions
5 stable selectors
6 prefer visible
7 prefer id
8 prefer name
9 prefer testid
10 prefer aria
11 text fallback
12 scroll then act
13 submitForm search
14 enter on input
15 avoid hidden click
16 avoid generic submit
17 avoid same failure
18 change selector family
19 one low-risk variation
20 avoid domain drift
21 stay on target site
22 verify after action
23 extract before clicking
24 done when answer present
25 short reasoning
26 confidence realistic
27 cite blocker briefly
28 recover with goto
29 recover with wait
30 recover with extract
31 respect peer signals
32 respect supervisor
33 prefer safer action
34 avoid speculative evaluate
35 avoid noisy waits
36 bounded retries
37 avoid back-forward loops
38 tab ops only if needed
39 keep params minimal
40 no markdown
41 json only
42 valid schema
43 no extra keys
44 no duplicate actions
45 avoid dead selectors
46 watch url change
47 watch page title
48 watch visible links
49 maintain progress
50 finish decisively`;

const PLANNER_SYSTEM_PROMPT = `CRITICAL: Output must be ONLY valid JSON. Start with { and end with }. No prose, no markdown, no code fences.
CRITICAL: On search engines (Google/Bing/DuckDuckGo/Yahoo), submit queries with Enter or submitForm. Do NOT click "Search" buttons.
CRITICAL: Prefer Google over Bing for search when the destination isn't specified by the user. Bing accounts for the large majority of observed CAPTCHA/challenge walls in this agent's run history — only go to Bing when the user explicitly names it.
Planner mode: deterministic, progress-first, minimal-risk.

Allowed actions: goto,reload,goBack,goForward,click,dblclick,hover,fill,type,press,check,uncheck,selectOption,scrollIntoView,submitForm,keyboardType,keyboardPress,mouseMove,mouseClick,mouseWheel,waitForSelector,waitForVisible,waitForTimeout,waitForLoadState,waitForURLChange,getText,getAttribute,getAllText,isVisible,elementExists,evaluate,screenshot,openNewTab,switchToTab,listTabs,closeCurrentTab,pinchListTickets,pinchSendTicketMessage,pinchListWebhooks,pinchListWebhookTypes.

Hard rules:
- Output only valid JSON using schema below.
- Max 6 actions per step.
- Never use waitForLoadState("complete").
- Never output non-http(s) URLs (no chrome-error:, about:, data:, javascript:, mailto:, tel:, blob:).
- Avoid malformed domains (example: node.js). Prefer canonical hosts (example: nodejs.org).
- Do not repeat same failing action+selector pair.
- If already on target page and evidence is present, extract and finish.
- Prefer lower-risk actions before evaluate/reload loops.

Search rules:
- Preferred sequence: fill/type search input -> press Enter or submitForm -> waitForURLChange or waitForVisible(a[href]).
- Avoid clicking search buttons when Enter can submit.
- If selector is uncertain, use robust search-input families before inventing new selectors.
- If search results are already visible, click a real relevant anchor instead of re-submitting search.

Navigation and recovery rules:
- If a destination site is known, first action should be goto(destination).
- Use search only when destination is unknown.
- Verify progress using URL/title/content change after major actions.
- If a click did not produce meaningful change, switch selector family or use a different visible anchor.
- Avoid back/forward/reload loops unless they are the only plausible recovery path.
- For multi-site tasks, open one tab per site and keep context per tab.

GoalProgress policy:
- Execute pending subgoals in order.
- Skip only subgoals already satisfied by current evidence.
- If GoalProgress says all complete (or evidence clearly satisfies goal), output done:true.
- For extract+summarize goals, avoid repeated getAllText after one successful extraction.

getAllText usage:
- getAllText now accepts an optional selector param — pass params:{"selector":"..."} to scope extraction to a specific container/section instead of the whole page. Prefer a scoped selector over the full-page default when the target content is inside a specific region (an article body, a results list, a sidebar) — it returns cleaner, more focused text and avoids picking up unrelated page chrome (nav/footer/ads).
- Extraction is literal page text (DOM order, script/style/hidden nodes excluded) — it no longer applies CSS text-transform or layout-based reflow, so output should now closely match what a human would get from selecting the text by hand.

Tips (50, terse):
${PLANNER_TIPS_50}

Schema:
{"reasoning":"short","confidence":0-100,"done":false,"actions":[{"action":"name","params":{}}]}`;

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
// Named constants for recordOutcome's `path` field — used instead of raw
// string literals so a typo can't silently stop counting toward
// fallbackRate/retryRate in metrics.py without throwing or erroring.
const ACTION_PATH = Object.freeze({
  PRIMARY: "primary",
  PRIMARY_HUMAN_POINTER: "primary-human-pointer",
  PRIMARY_URL_CHANGE: "primary-url-change",
  PRIMARY_URL_CHANGE_NEW_TAB: "primary-url-change-new-tab",
  FALLBACK_GOTO_RETRY: "fallback-goto-retry",
  FALLBACK_SCROLL_CLICK: "fallback-scroll-click",
  FALLBACK_SUBMIT: "fallback-submit",
  FALLBACK_ENTER: "fallback-enter",
  FALLBACK_JS_CLICK: "fallback-js-click",
  LEARNING_FAST_PATH: "learning-fast-path",
  PSEUDO: "pseudo",
  PSEUDO_PINCH: "pseudo-pinch"
});

async function runActionWithFallback(item, goal, models) {
  const action = item?.action;
  const params = { ...(item?.params || {}) };
  if (!context || !page) {
    // The browser can crash mid-task (not just between tasks) — handleBrowserCrash
    // nulls context/page/browser asynchronously via the page "crash" event, which
    // can fire while an action is already in flight. Several tab-management
    // actions below (openNewTab/switchToTab/closeCurrentTab/listTabs) call
    // context.pages() directly with no null check, which previously surfaced as
    // an opaque "Cannot read properties of null (reading 'pages')" instead of a
    // clear, retryable failure. Throw directly here rather than calling
    // recordOutcome() — that helper reads `host`/`currentUrl`/`signature`,
    // which are const-declared further down in this function and wouldn't
    // exist yet at this point, so calling it this early would itself throw.
    throw new Error("Browser context unavailable — it likely crashed mid-task and is restarting.");
  }
  if (action === "waitForURLChange" && !params.currentURL) {
    params.currentURL = String(page?.url?.() || "");
  }
  if (action === "waitForURLChange" && params.url && !params.targetURL) {
    params.targetURL = String(params.url);
  }
  if (action === "goto" && params?.url) {
    let normalizedUrl = String(params.url).trim().replace(/[\]\[)\("'`]+$/g, "").replace(/[.,;!?]+$/g, "");
    if (/^\/\//.test(normalizedUrl)) {
      normalizedUrl = `https:${normalizedUrl}`;
    } else if (normalizedUrl && !/^[a-z][a-z0-9+.-]*:/i.test(normalizedUrl)) {
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
    const pathTaken = String(details?.path || "primary");
    const fallbackUsed = pathTaken.startsWith("fallback");
    const isRetry = pathTaken.includes("retry");
    appendLearningEvent({
      kind: "action",
      goal: String(goal || "").slice(0, 240),
      host,
      url: currentUrl,
      action,
      selector: params?.selector || "",
      signature,
      status: statusValue,
      // Explicit, pre-computed fields so metrics don't need to parse `path`
      // strings later — makes stepSuccessRate / fallbackRate / retryRate
      // directly aggregatable from raw log.json.
      fallbackUsed,
      isRetry,
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
      saveStablePage(page.url());
    }
    const resultText = `opened tab ${context.pages().length - 1}`;
    recordOutcome("ok", { result: resultText, path: ACTION_PATH.PSEUDO });
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
      recordOutcome("error", { error: `invalid tab target ${JSON.stringify(tabParams || {})}`, path: ACTION_PATH.PSEUDO });
      throw new Error(`switchToTab failed: invalid index/urlIncludes (${JSON.stringify(tabParams || {})})`);
    }
    page = pages[targetIndex];
    await page.bringToFront().catch(() => {});
    const resultText = `switched to tab ${targetIndex}`;
    recordOutcome("ok", { result: resultText, path: ACTION_PATH.PSEUDO });
    return { action, status: "ok", result: resultText };
  }

  if (action === "closeCurrentTab") {
    const pages = context.pages();
    if (pages.length <= 1) {
      recordOutcome("ok", { result: "single tab, skip close", path: ACTION_PATH.PSEUDO });
      return { action, status: "ok", result: "single tab, skip close" };
    }
    const currentIndex = pages.findIndex(p => p === page);
    await page.close();
    const remaining = context.pages();
    page = remaining[Math.max(0, Math.min(currentIndex - 1, remaining.length - 1))] || remaining[0];
    await page.bringToFront().catch(() => {});
    const resultText = `closed tab ${currentIndex}`;
    recordOutcome("ok", { result: resultText, path: ACTION_PATH.PSEUDO });
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
    recordOutcome("ok", { result: resultText, path: ACTION_PATH.PSEUDO });
    return { action, status: "ok", result: resultText };
  }

  if (action === "pinchListTickets") {
    const tickets = await pinchListTickets();
    const resultText = `pinch tickets: ${tickets.length}`;
    recordOutcome("ok", { result: resultText, path: ACTION_PATH.PSEUDO_PINCH });
    return { action, status: "ok", result: resultText, data: tickets };
  }

  if (action === "pinchSendTicketMessage") {
    const ticketId = String(params?.ticketId || params?.id || "").trim();
    const body = String(params?.body || params?.message || "").trim();
    if (!ticketId || !body) {
      const missing = !ticketId ? "ticketId" : "body";
      recordOutcome("error", { error: `${missing} required`, path: ACTION_PATH.PSEUDO_PINCH });
      return { action, status: "error", error: `${missing} required` };
    }
    const sent = await pinchSendTicketMessage(ticketId, body);
    const resultText = `pinch message sent to ticket ${ticketId}`;
    recordOutcome("ok", { result: resultText, path: ACTION_PATH.PSEUDO_PINCH });
    return { action, status: "ok", result: resultText, data: sent };
  }

  if (action === "pinchListWebhooks") {
    const webhooks = await pinchListWebhooks();
    const resultText = `pinch webhooks: ${webhooks.length}`;
    recordOutcome("ok", { result: resultText, path: ACTION_PATH.PSEUDO_PINCH });
    return { action, status: "ok", result: resultText, data: webhooks };
  }

  if (action === "pinchListWebhookTypes") {
    const types = await pinchListWebhookTypes();
    const resultText = `pinch webhook types: ${types.length}`;
    recordOutcome("ok", { result: resultText, path: ACTION_PATH.PSEUDO_PINCH });
    return { action, status: "ok", result: resultText, data: types };
  }

  // If the action has repeatedly failed on this host+selector, bias to safer fallback first.
  if (action === "click" && params?.selector && hints.failures >= 3 && hints.successes === 0) {
    try {
      think(`Learning fast-path: skipping direct click and trying submitForm first for ${params.selector}`);
      await actions.submitForm({ page, context, selector: params.selector });
      recordOutcome("ok", { result: "learning submitForm fast-path", path: ACTION_PATH.LEARNING_FAST_PATH });
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
      recordOutcome("ok", { result: resultText, path: ACTION_PATH.PRIMARY_HUMAN_POINTER });
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
      recordOutcome("ok", { result: resultText, path: ACTION_PATH.PRIMARY_HUMAN_POINTER });
      return { action, status: "ok", result: resultText };
    } catch (err) {
      errLog(`${action} human-dblclick failed: ${err.message}`);
    }
  }

  if (action === "waitForURLChange") {
    const baselineUrl = String(params.currentURL || currentUrl || "");
    const targetRaw = String(params.targetURL || params.url || "").trim();
    const timeoutMs = Math.max(500, Number(params.timeout) || 8000);
    const baselineTabCount = context.pages().length;
    const normalizedTarget = (() => {
      if (!targetRaw) return "";
      if (/^\/\//.test(targetRaw)) return `https:${targetRaw}`;
      if (/^[a-z][a-z0-9+.-]*:/i.test(targetRaw)) return targetRaw;
      return `https://${targetRaw}`;
    })();
    const expectedHost = getHostFromUrl(normalizedTarget);

    const targetMatches = nextUrl => {
      const current = String(nextUrl || "");
      if (!current || current === baselineUrl) return false;
      if (!targetRaw) return true;
      const currentHost = getHostFromUrl(current);
      if (expectedHost && hostMatchesExpectedHost(currentHost, expectedHost)) return true;
      return current.toLowerCase().includes(targetRaw.toLowerCase());
    };

    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const activeUrl = (() => {
        try { return String(page?.url?.() || ""); } catch { return ""; }
      })();

      if (targetMatches(activeUrl)) {
        const resultText = activeUrl ? `url changed: ${activeUrl}` : "url changed";
        recordOutcome("ok", { result: resultText, path: ACTION_PATH.PRIMARY_URL_CHANGE });
        return { action, status: "ok", result: resultText };
      }

      const pages = context.pages();
      if (pages.length > baselineTabCount) {
        const newest = pages[pages.length - 1];
        const newestUrl = (() => {
          try { return String(newest?.url?.() || ""); } catch { return ""; }
        })();

        if (newestUrl && newestUrl !== "about:blank") {
          page = newest;
          await page.bringToFront().catch(() => {});
          if (targetMatches(newestUrl) || !targetRaw) {
            const resultText = `url changed in new tab: ${newestUrl}`;
            recordOutcome("ok", { result: resultText, path: ACTION_PATH.PRIMARY_URL_CHANGE_NEW_TAB });
            return { action, status: "ok", result: resultText };
          }
        }
      }

      await sleep(220);
    }

    const timeoutError = `URL did not change within ${timeoutMs}ms`;
    recordOutcome("error", { error: timeoutError, path: ACTION_PATH.PRIMARY_URL_CHANGE });
    return { action, status: "error", error: timeoutError };
  }

  // Primary attempt
  try {
    const activePage = await ensureActivePage();
    const result = await actions[action]({ page: activePage, context, ...(params || {}) });
    think(`✓ ${action}`);
    const rawResultText = typeof result === "string"
      ? result
      : typeof result === "object" && result !== null
        ? JSON.stringify(result)
        : String(result ?? "");
    const resultText = rawResultText.slice(0, 200);
    recordOutcome("ok", { result: resultText, path: ACTION_PATH.PRIMARY });
    const response = { action, status: "ok", result: resultText };
    if (["getText", "getAllText", "getHTML"].includes(String(action || "")) && rawResultText.trim()) {
      response.extractedText = rawResultText.slice(0, 12000);
    }
    if (["getText", "getAllText", "getHTML"].includes(String(action || "")) && shouldCaptureStructuredDom(goal, action, response.extractedText || rawResultText)) {
      try {
        const domMap = await captureVoidElementMap(page, {
          includeText: true,
          includeAttributes: false,
          includeOuterHTML: false,
          includeHidden: true,
          maxElements: 1200,
          textLimit: 220,
        });
        if (domMap) {
          response.domMap = {
            totalCaptured: domMap.totalCaptured || 0,
            capturedAt: domMap.capturedAt || Date.now(),
            summary: domMap.summary || {},
          };
          response.domMapSummary = summarizeVoidElementMap(domMap);
          response.result = `${response.result}${response.domMapSummary ? ` | ${response.domMapSummary}` : ""}`.slice(0, 240);
        }
      } catch (domErr) {
        errLog(`DOM map capture failed: ${domErr.message}`);
      }
    }
    return response;
  } catch (primaryErr) {
    errLog(`${action} failed: ${primaryErr.message}`);

    if (action === "goto" && params?.url) {
      try {
        think(`Fallback: retry goto once -> ${params.url}`);
        await sleep(900);
        await actions.goto({ page, context, url: String(params.url) });
        recordOutcome("ok", { result: "goto retry success", path: ACTION_PATH.FALLBACK_GOTO_RETRY });
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
        recordOutcome("ok", { result: "scroll-click fallback", path: ACTION_PATH.FALLBACK_SCROLL_CLICK });
        return { action, status: "ok", result: "scroll-click fallback" };
      } catch {}

      // Fallback 2: submitForm (works for search/form submit buttons)
      try {
        think(`Fallback 2: submitForm on ${sel}`);
        await actions.submitForm({ page, context, selector: sel });
        recordOutcome("ok", { result: "submitForm fallback", path: ACTION_PATH.FALLBACK_SUBMIT });
        return { action, status: "ok", result: "submitForm fallback" };
      } catch {}

      // Fallback 3: press Enter on selector (input fields)
      try {
        think(`Fallback 3: Enter keypress on ${sel}`);
        await page.press(sel, "Enter");
        recordOutcome("ok", { result: "Enter-key fallback", path: ACTION_PATH.FALLBACK_ENTER });
        return { action, status: "ok", result: "Enter-key fallback" };
      } catch {}

      // Fallback 4: JS .click()
      try {
        think(`Fallback 4: JS click on ${sel}`);
        const locator = page.locator(sel).first();
        await locator.waitFor({ state: "attached", timeout: 3000 });
        await locator.evaluate(el => {
          if (el && typeof el.click === "function") {
            el.click();
            return;
          }
          throw new Error("not clickable");
        });
        recordOutcome("ok", { result: "js-evaluate fallback", path: ACTION_PATH.FALLBACK_JS_CLICK });
        return { action, status: "ok", result: "js-evaluate fallback" };
      } catch {}
    }

    recordOutcome("error", { error: primaryErr.message, path: ACTION_PATH.PRIMARY });
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
  let lastFormLikeSelector = "";

  for (let actionIndex = 0; actionIndex < actionPlan.length; actionIndex++) {
    if (guidanceControl.stopRequested) {
      const reason = currentGuidanceStopReason();
      status(`Operator stop received. Halting remaining actions.`);
      results.push({ action: "operatorStop", status: "stopped", reason });
      break;
    }

    const rawItem = actionPlan[actionIndex];
    const item = normalizeActionItem(rawItem);
    const { action, params } = item;

    if ((action === "fill" || action === "type") && typeof params?.selector === "string" && params.selector.trim()) {
      lastFormLikeSelector = params.selector.trim();
    }
    if (action === "submitForm" && (!params?.selector || !String(params.selector).trim()) && lastFormLikeSelector) {
      params.selector = lastFormLikeSelector;
      think(`SubmitForm context assist: reusing last input selector ${lastFormLikeSelector}`);
    }
    if (!action || (!actions[action] && !pseudoActions.has(action))) {
      errLog(`Unknown action: "${action}"`);
      results.push({ action, status: "error", error: `Unknown action: ${action}` });
      continue;
    }

    const actionGate = evaluateSupervisorActionGate(action, params, supervisorContext || {}, actionIndex);
    if (!actionGate.allow) {
      const blockedMsg = `🛑 ${actionGate.reason}`;
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
      const hrefNeedles = extractSelectorHrefNeedles(baseSelector);
      const strictHrefCandidates = hrefNeedles.length
        ? rankedCandidates.filter(candidate => {
            const href = String(candidate?.href || "").toLowerCase();
            return hrefNeedles.some(needle => href.includes(needle));
          })
        : rankedCandidates;
      const candidatePool = strictHrefCandidates.length ? strictHrefCandidates : rankedCandidates;

      stepLogMsg(`Fusion click sweep: selector=${baseSelector || "(none)"}, clickable=${clickMap.allCandidates.length}, safe=${clickMap.candidates.length}, anchors=${clickMap.anchors.length}.`);

      if (hrefNeedles.length && !strictHrefCandidates.length) {
        think(`Fusion click note: no ranked candidates matched href needles ${hrefNeedles.join(", ")}; falling back to generic ranked set.`);
      }

      if (!candidatePool.length) {
        errLog(`Fusion click found no safe candidates for ${baseSelector || "(none)"}`);
        results.push({ action, status: "error", error: `fusion click found no safe candidates for ${baseSelector || "(none)"}` });
        break;
      }

      let fusionSuccess = null;
      const fusionAttempts = [];

      for (const candidate of candidatePool) {
        const selectorLadder = Array.from(new Set([...selectorVariants, candidate.selector].filter(Boolean)));
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

    // Decision pause: a real user doesn't act instantly right after a page
    // finishes navigating — there's a beat to skim/orient before the next
    // move. Only applied after actions that actually change the page.
    if (["goto", "waitForURLChange", "reload", "goBack", "goForward"].includes(action)) {
      await sleepLikeHuman(Human.decisionPauseMs("postNavigation"), page);
    }

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
async function summarizeResult(goal, state, taskLog, visionFeedback, completed, models, extractedText = "") {
  status("Reasoner composing answer...");
  try {
    // Ground on whichever text source actually has content. extractedText
    // starts empty and only fills in if the task explicitly ran getText/
    // getAllText/getHTML — a bare "go to X" task that completes without one
    // of those reaches this function with "(none)" to work with, while the
    // prompt below still demanded specific facts. Falling back to state.text
    // (the page's own text, now using the dynamic head+tail budget from
    // earlier) means there's usually SOMETHING real to ground on even when
    // no explicit extraction action ran.
    const hasExplicitExtraction = String(extractedText || "").trim().length > 0;
    const groundingText = hasExplicitExtraction ? extractedText : (state.text || "");
    const extractedSnippet = compactPromptValue(groundingText, 4000) || "(none)";
    const hasAnyGrounding = extractedSnippet !== "(none)";

    const compareFormatHint = isSearchEngineComparisonGoal(goal)
      ? "Output exactly 3 paragraphs. Paragraph 1: what Google emphasized. Paragraph 2: what Bing emphasized. Paragraph 3: compare/contrast and synthesize."
      : "Write a natural, intelligent, specific answer (2-6 sentences).";
    const raw = await callCFAI(models.reasoner, [{
      role: "user",
      content: `Goal: "${goal}"
Result: ${completed ? "COMPLETED" : "INCOMPLETE"}
Final URL: ${state.url}
Final title: ${state.title}
Vision last saw: ${visionFeedback ? visionFeedback.slice(0, 500) : "(none)"}
Extracted text snippet (source: ${hasExplicitExtraction ? "explicit getText/getAllText call" : "page text fallback"}): ${extractedSnippet}
Steps taken: ${taskLog.join("\n")}

${compareFormatHint}
GROUNDING RULE — this is critical: only state a specific fact (a date, number, name, version, quote) if it is LITERALLY present in the "Extracted text snippet" above. ${hasAnyGrounding ? "" : "No page text was captured for this task — you MUST NOT invent any specific facts, dates, or numbers. "}If a specific detail was not captured in what's shown above, say plainly "the extracted content didn't include that detail" instead of guessing or inferring a plausible-sounding value. Reaching the correct URL/title is a real, separate success from having extracted its content — do not blur the two by inventing content to sound complete.
If completed: report exactly what you found/did, using only details grounded in the text above.
If incomplete: explain honestly what happened and what would be needed to complete it.
feel free to use emoji's and markdown formatting to express your intent make sure to be clear about what was found and what was not found.`
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

function mapKnownHostTypos(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (!host) return "";
  const map = {
    "node.js": "nodejs.org",
    "www.node.js": "nodejs.org",
    "docs.node.js": "nodejs.org"
  };
  return map[host] || host;
}

function sanitizeNavigationUrl(rawUrl) {
  const input = String(rawUrl || "").trim();
  if (!input) return null;

  try {
    const parsed = new URL(input);
    const protocol = String(parsed.protocol || "").toLowerCase();
    if (protocol !== "http:" && protocol !== "https:") return null;
    const mappedHost = mapKnownHostTypos(parsed.hostname);
    if (!mappedHost) return null;
    parsed.hostname = mappedHost;
    return parsed.toString();
  } catch {
    return null;
  }
}

function extractExplicitNavigationTarget(goalText) {
  const fullUrl = extractUrlFromText(goalText);
  if (fullUrl) return sanitizeNavigationUrl(fullUrl);

  const raw = String(goalText || "");
  const m = raw.match(/\b([a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[\w\-./?%&=+#]*)?)/i);
  if (!m) return null;

  const candidate = String(m[1] || "").replace(/[.,;!?]+$/g, "");
  if (!candidate.includes(".")) return null;

  const normalized = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
  return sanitizeNavigationUrl(normalized);
}

function inferKnownSiteTarget(goalText) {
  const g = String(goalText || "").toLowerCase();
  const hasGoogle = /\bgoogle\b/.test(g);
  const hasBing = /\bbing\b/.test(g);
  if (hasGoogle && hasBing) {
    // For dual-engine tasks, start from Google first; Bing can be visited next.
    return "https://www.google.com/";
  }
  const known = [
    { pattern: /\bwikip(?:e|i)dia\b|\bwikipidea\b|\bwikpedia\b/, url: "https://www.wikipedia.org/" },
    { pattern: /\bgithub\b/, url: "https://github.com/" },
    { pattern: /\bgoogle\b/, url: "https://www.google.com/" },
    { pattern: /\bbing\b/, url: "https://www.bing.com/" },
    { pattern: /\byoutube\b/, url: "https://www.youtube.com/" },
  ];
  const hit = known.find(item => item.pattern.test(g));
  return hit ? hit.url : null;
}

function resolveDirectNavigationTarget(goalText) {
  return extractExplicitNavigationTarget(goalText) || inferKnownSiteTarget(goalText);
}

function isSimpleBrowsingCandidate(goalText) {
  const g = String(goalText || "").toLowerCase();
  if (!g) return false;
  const heavyIntent = /\b(crawl|scrape|extract all|all elements|screenshot|captcha|checkout|payment|upload|download|ticket|webhook|api|code|debug)\b/.test(g);
  if (heavyIntent) return false;
  const hasDirectSite = !!resolveDirectNavigationTarget(g);
  const hasSearchIntent = /\b(search|look up|find)\b/.test(g);
  return hasDirectSite || hasSearchIntent;
}

function shouldUseSimpleBrowsingMode(goalText) {
  if (SIMPLE_BROWSING_MODE === "off") return false;
  if (SIMPLE_BROWSING_MODE === "always") return true;
  return isSimpleBrowsingCandidate(goalText);
}

function isGoogleSearchResultsUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || ""));
    const host = parsed.hostname.toLowerCase();
    return (host === "google.com" || host.endsWith(".google.com")) && parsed.pathname === "/search";
  } catch {
    return false;
  }
}

function compactPromptValue(value, maxChars = 240) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

function compactUrlForPrompt(rawUrl) {
  const fallback = compactPromptValue(rawUrl, MAX_URL_IN_PROMPT_CHARS);
  try {
    const parsed = new URL(String(rawUrl || ""));
    const base = `${parsed.origin}${parsed.pathname}`;
    if (base.length >= MAX_URL_IN_PROMPT_CHARS) {
      return compactPromptValue(base, MAX_URL_IN_PROMPT_CHARS);
    }
    return parsed.search ? `${base}?…` : base;
  } catch {
    return fallback;
  }
}

function buildSearchResultsUrl(queryText, engine = "google") {
  const q = String(queryText || "").trim();
  if (!q) return engine === "bing" ? "https://www.bing.com/" : "https://www.google.com/";
  if (engine === "bing") return `https://www.bing.com/search?q=${encodeURIComponent(q)}`;
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

function pickRecoveryUrl(goalText, fallbackQuery = "") {
  const explicit = sanitizeNavigationUrl(extractExplicitNavigationTarget(goalText));
  if (explicit) return explicit;
  const query = extractSearchQuery(goalText) || String(fallbackQuery || "").trim();
  // Google over Bing here specifically: this path runs when the task is
  // already recovering from a failure, and Bing accounts for the large
  // majority of observed CAPTCHA walls (measured ~44% of all CAPTCHA hits
  // vs Google's much smaller share) — routing a fragile recovery attempt
  // through the higher-risk engine compounds the failure instead of
  // resolving it.
  if (query) return buildSearchResultsUrl(query, "google");
  return "https://www.google.com/";
}

function sanitizeExtractedSearchQuery(rawQuery) {
  let q = String(rawQuery || "").replace(/\s+/g, " ").trim();
  if (!q) return "";

  // Stop at execution/control phrases often appended after the real query.
  q = q.split(/\b(?:then|and then|after that|afterwards|next|validate|verify|confirm)\b/i)[0].trim();

  // Strip glue words that may remain after truncation.
  q = q.replace(/\b(?:that|the|this|search|result|results|was|were|is|are|successful)\b\s*$/i, "").trim();

  // Trim trailing punctuation/noise.
  q = q.replace(/[.,;:!?]+$/g, "").trim();

  // Keep bounded and practical.
  return q.split(/\s+/).slice(0, 8).join(" ").trim();
}

function extractSearchQuery(goalText) {
  const g = String(goalText || "");
  const quoted = g.match(/"([^"]{2,120})"/);
  if (quoted) return sanitizeExtractedSearchQuery(quoted[1]);
  const m =
    g.match(/search\s+for\s+([^\n\.]{2,120})/i) ||
    g.match(/\bsearch\s+([^\n\.]{2,120})/i) ||
    g.match(/search\s+up\s+([^\n\.]{2,120})/i) ||
    g.match(/look\s+up\s+([^\n\.]{2,120})/i);
  if (!m) return null;
  const cleaned = sanitizeExtractedSearchQuery(m[1]);
  return cleaned || null;
}

function isSearchEngineComparisonGoal(goalText) {
  const g = String(goalText || "").toLowerCase();
  if (!g) return false;
  const hasSearchIntent = /\b(search|look up|find)\b/.test(g);
  const hasGoogle = /\bgoogle\b/.test(g);
  const hasBing = /\bbing\b/.test(g);
  const hasCompareIntent = /\b(compare|contrast|compare and contrast|difference|differences|versus|vs)\b/.test(g);
  const hasSummaryIntent = /\b(summarize|summary|summery|three paragraph|3 paragraph|three-paragraph)\b/.test(g);
  return hasSearchIntent && ((hasGoogle && hasBing) || (hasBing && hasCompareIntent && hasSummaryIntent));
}

function isDocsPreferredSearch(queryText, goalText = "") {
  const combined = `${String(goalText || "")} ${String(queryText || "")}`.toLowerCase();
  if (!combined.trim()) return false;
  return /\b(how to|how do i|deploy|install|setup|configure|tutorial|guide|docs?|documentation|reference|quickstart|hosting)\b/.test(combined);
}

function pickDocsLinkFromState(state, queryText) {
  const links = Array.isArray(state?.links) ? state.links : [];
  if (!links.length) return null;

  const query = String(queryText || "").toLowerCase();
  const queryTokens = query.split(/\s+/).filter(Boolean).slice(0, 6);
  let best = null;
  let bestScore = 0;

  for (const link of links) {
    const href = String(link?.href || "").trim();
    if (!href) continue;
    const text = String(link?.text || "").trim();
    const haystack = `${text} ${href}`.toLowerCase();
    let score = 0;

    if (/\bdocs?\b/.test(haystack)) score += 4;
    if (/\bdocumentation\b/.test(haystack)) score += 4;
    if (/\bguide\b/.test(haystack)) score += 3;
    if (/\btutorial\b/.test(haystack)) score += 3;
    if (/\bquickstart\b/.test(haystack)) score += 3;
    if (/\breference\b/.test(haystack)) score += 2;
    if (/\bstatic-deploy\b/.test(haystack)) score += 6;
    if (/\bdeploy(ment)?\b/.test(haystack)) score += 2;
    if (/vite\.dev/.test(haystack)) score += 8;
    if (/vercel\.com\/docs|netlify\.com\/docs/.test(haystack)) score += 6;

    if (queryTokens.length && queryTokens.every(token => haystack.includes(token))) score += 3;
    if (query.includes("vite") && /vite\.dev/.test(haystack)) score += 5;
    if (query.includes("deploy") && /deploy|hosting|publish|static/.test(haystack)) score += 3;

    if (score > bestScore) {
      bestScore = score;
      best = link;
    }
  }

  if (!best || bestScore < 5) return null;
  return best;
}

function getOriginalQuery(goalText) {
  const fromGoal = extractSearchQuery(goalText);
  if (fromGoal) return fromGoal;
  return String(goalText || "").trim().slice(0, 180);
}

const SEARCH_EVIDENCE_STOPWORDS = new Set([
  "a", "an", "and", "are", "for", "from", "find", "how", "in", "is", "it", "look", "of", "on", "or",
  "search", "to", "up", "what", "when", "where", "which", "why", "with", "do", "i", "me", "my", "the",
  "please", "result", "results", "page", "app"
]);

function hasSearchGoalEvidence(goalText, state) {
  const query = String(extractSearchQuery(goalText) || "").trim().toLowerCase();
  if (!query) return true;
  const queryTokens = query
    .split(/\s+/)
    .filter(Boolean)
    .filter(token => token.length > 2 && !SEARCH_EVIDENCE_STOPWORDS.has(token))
    .slice(0, 6);
  if (!queryTokens.length) return true;

  const urlText = String(state?.url || "").toLowerCase();
  const titleText = String(state?.title || "").toLowerCase();
  const bodyText = String(state?.text || "").toLowerCase();
  const joined = `${urlText}\n${titleText}\n${bodyText}`;

  const matchedTokens = queryTokens.filter(token => joined.includes(token));
  const requiredHits = Math.min(3, queryTokens.length);
  // Require at least one match inside the page title or body (not only URL)
  const titleOrBody = `${titleText}\n${bodyText}`;
  const matchedInTitleOrBody = queryTokens.filter(token => titleOrBody.includes(token));
  if (matchedTokens.length < requiredHits || matchedInTitleOrBody.length < 1) {
    return false;
  }

  // Strong completion signals for docs/results pages even when the exact query
  // wording changes between search query and final page title/body.
  if (/(docs?|documentation|guide|tutorial|quickstart|reference|deploy|deployment|hosting|static)/.test(joined)) {
    return true;
  }

  // Guard known false positive: Wikipedia special search with empty query.
  if (/wikipedia\.org\/wiki\/special:search/i.test(String(state?.url || ""))) {
    try {
      const parsed = new URL(String(state?.url || ""));
      const searchParam = String(parsed.searchParams.get("search") || "").trim().toLowerCase();
      if (!searchParam) return false;
    } catch {}
  }

  return true;
}

function shouldAcceptPlannerDoneDecision(goalText, state, extractedTextBuffer = "") {
  const searchIntent = /\b(search|search\s+for|search\s+up|look\s+up|find)\b/i.test(String(goalText || ""));
  if (searchIntent) {
    if (hasSearchGoalEvidence(goalText, state)) {
      return true;
    }

    const extractedEvidence = String(extractedTextBuffer || "").trim();
    if (extractedEvidence) {
      const joined = `${String(state?.url || "").toLowerCase()}\n${String(state?.title || "").toLowerCase()}\n${String(state?.text || "").toLowerCase()}\n${extractedEvidence.toLowerCase()}`;
      if (/\b(docs?|documentation|guide|tutorial|quickstart|reference|deploy|deployment|hosting|static)\b/.test(joined)) {
        return true;
      }
    }

    return false;
  }
  return true;
}

function isExtractionSummaryGoal(goalText) {
  const g = String(goalText || "").toLowerCase();
  const wantsSummary = /\b(summarize|summary|summery|tldr|tl;dr)\b/.test(g);
  const wantsExtract = /\b(extract|get text|get all text|current text|read page|page text|content)\b/.test(g);
  return wantsSummary && wantsExtract;
}

function getExtractedTextFromResults(results = []) {
  const list = Array.isArray(results) ? results : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const item = list[i] || {};
    if (String(item.status || "") !== "ok") continue;
    if (!["getText", "getAllText", "getHTML"].includes(String(item.action || ""))) continue;
    const text = String(item.extractedText || "").trim();
    if (text) return text;
  }
  return "";
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

  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(researchPlan.query)}`;
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
    await researchPage.waitForTimeout(700).catch(() => {});

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
  const stuck = detectStuck(taskLog);
  if (failures < 3 && !stuck) return false;
  if (step < 3) return false;
  if (step % CONFUSION_RESEARCH_STEP_INTERVAL !== 0 && !stuck) return false;
  if (currentStriderReconMemo && failures < 4 && !stuck) return false;
  const host = getHostFromUrl(state?.url || "").toLowerCase();
  if (!host) return false;
  if (CONFUSION_RESEARCH_BLOCKED_HOSTS.has(host)) {
    return false;
  }
  if (/\/search(\b|\/|$)/i.test(String(state?.url || ""))) return false;
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
    if (isSearchEngineComparisonGoal(goal)) {
      const logText = String((taskLog || []).join("\n") || "").toLowerCase();
      const onGoogle = currentHost === "google.com" || currentHost.endsWith(".google.com");
      const onBing = currentHost === "bing.com" || currentHost.endsWith(".bing.com");
      const googleSearchSeen = isGoogleSearchResultsUrl(currentUrl) || logText.includes("google.com/search?q=");
      const bingSearchSeen = /bing\.com\/search\?q=/.test(currentUrl.toLowerCase()) || logText.includes("bing.com/search?q=");
      const googleCaptured = logText.includes("capture google:ok");
      const bingCaptured = logText.includes("capture bing:ok");

      if (googleCaptured && bingCaptured) {
        return {
          reasoning: "Heuristic compare flow: both engines captured; ready to summarize.",
          confidence: 90,
          done: true,
          actions: []
        };
      }

      if (!googleSearchSeen) {
        return {
          reasoning: `Heuristic compare flow: run Google search for \"${query}\" first.`,
          confidence: 84,
          done: false,
          actions: [
            { action: "goto", params: { url: buildSearchResultsUrl(query, "google") } },
            { action: "waitForVisible", params: { selector: "a[href]", timeout: 8000 } }
          ]
        };
      }

      if (onGoogle && !googleCaptured) {
        return {
          reasoning: "Heuristic compare flow: capture Google result-page text.",
          confidence: 80,
          done: false,
          actions: [
            { action: "getAllText", params: {} }
          ]
        };
      }

      if (!bingSearchSeen || onGoogle) {
        return {
          reasoning: "Heuristic compare flow: run the same query on Bing for contrast.",
          confidence: 82,
          done: false,
          actions: [
            { action: "goto", params: { url: buildSearchResultsUrl(query, "bing") } },
            { action: "waitForVisible", params: { selector: "a[href]", timeout: 8000 } }
          ]
        };
      }

      if (onBing && !bingCaptured) {
        return {
          reasoning: "Heuristic compare flow: capture Bing result-page text.",
          confidence: 80,
          done: false,
          actions: [
            { action: "getAllText", params: {} }
          ]
        };
      }
    }

    if (isDocsPreferredSearch(query, goal)) {
      const docsLink = pickDocsLinkFromState(state, query);
      if (docsLink && docsLink.href && !currentUrl.includes(String(docsLink.href))) {
        const docsHref = String(docsLink.href);
        const docsHost = getHostFromUrl(docsHref);
        const docsSelector = [
          `a[href=${quoteCssText(docsHref)}]`,
          docsHost ? `a[href*=${quoteCssText(docsHost)}]` : ""
        ].filter(Boolean).join(", ");
        return {
          reasoning: `Heuristic: open a docs-style result for \"${query}\"`,
          confidence: 80,
          done: false,
          actions: [
            { action: "click", params: { selector: docsSelector } },
            { action: "waitForURLChange", params: { currentURL: currentUrl, targetURL: docsHref, timeout: 10000 } }
          ]
        };
      }
    }

    const recentFillAttempts = countRecentActionStatus("fill:ok") + countRecentActionStatus("submitform:ok");
    const recentGotoGoogle = countRecentActionStatus("goto:ok") + countRecentActionStatus("google.com");
    const shouldForceSearchUrl = recentFillAttempts >= 4 || recentGotoGoogle >= 4 || failures >= 2;

    if (shouldForceSearchUrl) {
      const searchUrl = buildSearchResultsUrl(query, "bing");
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
      ? (visibleInput.id
          ? buildExactAttrSelector("id", visibleInput.id)
          : (visibleInput.name
              ? buildExactAttrSelector("name", visibleInput.name)
              : "input[type='search'],input[type='text'],textarea"))
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
  //    But don't repeat getAllText if it already ran recently — escalate instead.
  if (looksLikeTaskGoal(goal)) {
    const recentGetAllText = (taskLog || []).slice(-6).filter(l => String(l).includes("getAllText:ok")).length;
    if (recentGetAllText >= 2) {
      // Already extracted twice — planner is looping. Signal done with what we have.
      return {
        reasoning: "Heuristic: text already extracted multiple times. Treating task as complete.",
        confidence: 70,
        done: true,
        actions: []
      };
    }
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

// ─────────────────────────────────────────────────────────────────────────────
// GOAL MEMORY  — per-task struct that accumulates what the agent knows so far
// ─────────────────────────────────────────────────────────────────────────────
function buildGoalMemory(goal) {
  const g = String(goal || "");
  const query = extractSearchQuery(g) || "";
  const targetSite = resolveDirectNavigationTarget(g) || "";
  const targetHost = getHostFromUrl(targetSite);
  const wantsSummary = isExtractionSummaryGoal(g);
  const subgoals = [];

  if (targetSite)  subgoals.push({ kind: "navigate",  target: targetSite,  done: false });
  if (query)       subgoals.push({ kind: "search",    target: query,       done: false });
  if (wantsSummary) subgoals.push({ kind: "summarize", target: "page text", done: false });
  if (/\b(validate|verify|confirm|check)\b/i.test(g))
    subgoals.push({ kind: "validate", target: "result", done: false });

  return {
    raw:             g,
    query,
    targetSite,
    targetHost,
    wantsSummary,
    subgoals,
    confirmedActions: new Set(),
    failedSelectors:  new Set(),
  };
}

function advanceGoalMemory(mem, currentUrl, results = []) {
  const host = getHostFromUrl(currentUrl);
  for (const sg of mem.subgoals) {
    if (sg.done) continue;
    if (sg.kind === "navigate" && mem.targetHost && hostMatchesExpectedHost(host, mem.targetHost)) sg.done = true;
    if (sg.kind === "search") {
      const urlLower = currentUrl.toLowerCase();
      const queryLower = String(sg.target || "").toLowerCase();
      if (queryLower && (
        urlLower.includes(encodeURIComponent(queryLower).toLowerCase().slice(0, 12)) ||
        urlLower.includes(queryLower.replace(/\s+/g, "_")) ||
        urlLower.includes(queryLower.replace(/\s+/g, "-"))
      )) sg.done = true;
    }
    if (sg.kind === "summarize") {
      if (results.some(r => r.status === "ok" && ["getText","getAllText","getHTML"].includes(r.action) && r.extractedText)) sg.done = true;
    }
    if (sg.kind === "validate") {
      if (results.some(r => r.status === "ok" && ["getText","getTitle","getAttribute"].includes(r.action))) sg.done = true;
    }
  }
  for (const r of results) {
    if (r.status === "ok"    && r.action)   mem.confirmedActions.add(r.action);
    if (r.status === "error" && r.selector) mem.failedSelectors.add(r.selector);
  }
  return mem;
}

function nextGoalSubgoal(mem) {
  return mem.subgoals.find(sg => !sg.done) || null;
}

function goalMemoryContext(mem) {
  const pending = mem.subgoals.filter(sg => !sg.done).map(sg => `${sg.kind}:${sg.target}`);
  const done    = mem.subgoals.filter(sg =>  sg.done).map(sg => sg.kind);
  return [
    pending.length ? `Pending: ${pending.join(" → ")}` : "All subgoals complete",
    done.length    ? `Done: ${done.join(", ")}`         : ""
  ].filter(Boolean).join(" | ");
}

// ─────────────────────────────────────────────────────────────────────────────
// SMART CONTENT EXTRACTION — strips nav/sidebar junk, keeps article body
// ─────────────────────────────────────────────────────────────────────────────
async function extractMainContent(state) {
  try {
    const targetPage = state?.page || state?.pageHandle || state?.targetPage || state?.browserPage || state?.playwrightPage;
    if (!targetPage || typeof targetPage.evaluate !== "function") {
      throw new Error("No page handle available for main-content extraction");
    }
    const result = await targetPage.evaluate(() => {
      const noiseSelectors = [
        "nav","header","footer","aside","[role='navigation']","[role='banner']",
        "[role='complementary']","[role='contentinfo']","#toc","#catlinks",
        ".navbox",".sidebar",".infobox table",".mw-indicators",".vector-menu",
        "#mw-navigation","#siteNotice","#mw-head","#p-navigation",
        ".advertisement",".ad",".ads","[class*='sidebar']","[class*='menu']",
        "[id*='sidebar']","[id*='nav']"
      ];
      const clone = document.body.cloneNode(true);
      noiseSelectors.forEach(sel => {
        try { clone.querySelectorAll(sel).forEach(el => el.remove()); } catch {}
      });
      const contentSelectors = [
        "#mw-content-text .mw-parser-output","#content","main","article",
        "[role='main']",".content","#bodyContent","#main-content"
      ];
      for (const sel of contentSelectors) {
        const el = clone.querySelector(sel);
        if (el && el.innerText && el.innerText.trim().length > 200) {
          return el.innerText.replace(/\s{3,}/g, "\n\n").trim();
        }
      }
      return clone.innerText.replace(/\s{3,}/g, "\n\n").trim();
    });
    return String(result || "").slice(0, 14000);
  } catch {
    return String(state?.text || "").slice(0, 14000);
  }
}

function shouldCaptureStructuredDom(goal, action, extractedText = "") {
  const text = `${String(goal || "")} ${String(action || "")} ${String(extractedText || "")}`.toLowerCase();
  return /\b(extract|summarize|summarise|summary|page map|dom|document structure|element map|layout|visible elements|structure)\b/.test(text);
}

async function captureVoidElementMap(page, options = {}) {
  return captureVoidElementMapFromPage(page, options);
}

function summarizeVoidElementMap(domMap = {}) {
  const summary = domMap?.summary || {};
  const totalCaptured = Number(summary.totalCaptured || domMap.totalCaptured || 0);
  if (!totalCaptured) return "DOM map: 0 elements";
  return `DOM map: ${totalCaptured} elements (${Number(summary.visibleCount || 0)} visible, ${Number(summary.clickableCount || 0)} clickable, ${Number(summary.anchorCount || 0)} anchors, ${Number(summary.buttonCount || 0)} buttons, ${Number(summary.idsWithElements || 0)} with id)`;
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
    allow: true,
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
      allow: true,
      reason: msg,
      severity: "warn",
      detectionType: "dangerousAction"
    };
  }

  if (a === "reload" && failures >= 2 && index > 0) {
    const msg = generateSupervisorMessage({ type: "reloadSpam" });
    return {
      allow: true,
      reason: msg,
      severity: "warn",
      detectionType: "reloadSpam"
    };
  }

  if (a === "goto" && !String(params?.url || "").trim()) {
    return {
      allow: true,
      reason: "blocked goto without target url",
      severity: "warn",
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
          lastError = new Error(`Invalid JSON from supervisor via ${supervisorModel}`);
          continue;
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

async function runTask(goal, models, chatId, browserRuntime = null, userId = null) {
  if (agentRunning) {
    throw new Error("A task is already running. Please wait for it to finish.");
  }
  if (_browserRestartInProgress || !page) {
    // The browser just crashed and is mid-restart (globals nulled in
    // handleBrowserCrash before the new launch resolves). Without this
    // check, a task dispatched during that window falls straight through
    // to page.url()/page.goto() on a null page — surfacing as an opaque
    // "Cannot read properties of null" error instead of a clear message.
    throw new Error("The browser crashed and is currently restarting. Please try again in a few seconds.");
  }
  agentRunning = true;
  currentTaskUserId = userId || currentTaskUserId || null;
  currentTaskChatId = chatId || null;
  const runtime = browserRuntime && typeof browserRuntime === "object" ? browserRuntime : {};
  const taskRetryLimit = Number.isFinite(Number(runtime.errorRetry)) ? Math.max(1, Math.min(8, Number(runtime.errorRetry))) : MAX_RETRIES;
  const taskRetryBackoffMs = Number.isFinite(Number(runtime.errorBackoffMs)) && Number(runtime.errorBackoffMs) > 0
    ? Math.max(120, Number(runtime.errorBackoffMs))
    : 2000;
  const taskHeartbeatEnabled = !!runtime.heartbeat;
  const taskHeartbeatMs = Number.isFinite(Number(runtime.logIntervalSec)) && Number(runtime.logIntervalSec) > 0
    ? Math.max(1000, Math.round(Number(runtime.logIntervalSec) * 1000))
    : 12000;
  const taskStealthLike = !!runtime.stealth || String(runtime.antiBot || "").toLowerCase() === "evasive";
  const taskPacingMultiplier = taskStealthLike ? 1.35 : 1;
  const taskBaseNavigationCooldownMs = taskStealthLike
    ? Math.max(BASE_NAVIGATION_COOLDOWN_MS, 4500)
    : BASE_NAVIGATION_COOLDOWN_MS;
  const plannerHistory = [{ role: "system", content: PLANNER_SYSTEM_PROMPT }];
  const taskLog   = [];
  // Task Context Object — a small, always-current anchor for "what was the
  // original ask" and "what just happened," kept separate from the dense
  // per-turn state block so it can't get buried or truncated away like the
  // compactGoal field can on long/complex tasks. Passed into planNextSteps
  // every turn and rendered first, before anything else, so the model has
  // to see it before it sees the noise.
  const taskContext = {
    originalGoal: String(goal || "").trim(),
    startedAt: Date.now(),
    lastAction: null,   // e.g. "fill(#identifierId, 'vstd.help@gmail.com')"
    lastResult: null,   // e.g. "ok" | "error: selector not found"
    stepCount: 0
  };
  let visionFeedback = null;
  let lastAction     = null;
  let completed      = false;
  let finalState     = { url: "about:blank", title: "", text: "", links: [], inputs: [] };
  let failures       = 0;
  let requiresHuman  = false;
  let supervisorBlocks = 0;
  let lastSupervisorSignal = null;
  let lastSupervisorGate = null;
  let lastSupervisorEvalStep = 0;
  let lastSupervisorPlanSignature = "";
  let lastSupervisorHost = "";
  let lastInstinct = null;
  let lastInstinctStep = 0;
  let lastVisionTrace = "";
  let lastGentleTrace = "";
  const captchaChecksByPage = new Map();
  const captchaHandoffsByPage = new Map();
  const captchaDetectionStreakByPage = new Map();
  const captchaGentleUntilByHost = new Map();
  const navigationCooldownByHost = new Map();
  let psychosisCounter = 0; // Tracks confusion state
  const actionFailureStreaks = new Map();
  let dynamicSignalStreak = 0;
  let lastAttemptedPlanSignature = "";
  let extractedTextBuffer = "";
  let taskHeartbeatTimer = null;
  let elementMapTimer = null;
  let elementMapInFlight = false;
  const goalMem = buildGoalMemory(goal);
  const originalQuery = goalMem.query || getOriginalQuery(goal);
  const searchEngineCompareGoal = isSearchEngineComparisonGoal(goal);
  const compareSnapshots = { google: "", bing: "" };
  const simpleBrowsingModeActive = shouldUseSimpleBrowsingMode(goal);
  const directNavigationTarget = searchEngineCompareGoal ? "" : resolveDirectNavigationTarget(goal);
  const directNavigationTargetHost = getHostFromUrl(directNavigationTarget || "");
  let simpleFastPathSatisfied = false;
  let simpleFastPathCandidate = false;
  const escapeContext = {
    active: false,
    lastType: "",
    lastFailedAction: "",
    lastFailedSelector: "",
    lastTriggeredsStep: 0,
    mapsEscaped: false
  };

  const scheduleElementMapTick = (initialDelayMs = null) => {
    if (elementMapTimer) {
      clearTimeout(elementMapTimer);
      elementMapTimer = null;
    }
    if (!agentRunning) return;
    const delayMs = Number.isFinite(Number(initialDelayMs))
      ? Math.max(0, Number(initialDelayMs))
      : Math.floor(ELEMENT_MAP_MIN_INTERVAL_MS + Math.random() * (ELEMENT_MAP_MAX_INTERVAL_MS - ELEMENT_MAP_MIN_INTERVAL_MS));
    elementMapTimer = setTimeout(() => {
      elementMapTimer = null;
      if (!agentRunning || !page || elementMapInFlight) return;
      elementMapInFlight = true;
      const currentUrl = (() => { try { return page.url(); } catch { return null; } })();
      if (!currentUrl) { elementMapInFlight = false; return; }
      runElementMapOnCurrentPage(page, () => {
        elementMapInFlight = false;
        if (agentRunning) scheduleElementMapTick(); // reschedule only after child finishes
      });
    }, delayMs);
  };

  function resetPlannerAndPeerState() {
    plannerHistory.splice(0, plannerHistory.length, { role: "system", content: PLANNER_SYSTEM_PROMPT });
    lastSupervisorSignal = null;
    lastSupervisorGate = null;
    lastSupervisorEvalStep = 0;
    lastSupervisorPlanSignature = "";
    lastSupervisorHost = "";
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
    const currentPageUrlRaw = (() => {
      try { return String(page?.url?.() || "").trim(); } catch { return ""; }
    })();
    const requestedTargetRaw = String(options?.targetUrl || pickRecoveryUrl(goal, originalQuery) || "").trim();
    const fallbackRecoveryUrl = sanitizeNavigationUrl(pickRecoveryUrl(goal, originalQuery)) || "https://www.google.com/";
    const currentPageUrl = sanitizeNavigationUrl(currentPageUrlRaw);
    const requestedTarget = sanitizeNavigationUrl(requestedTargetRaw) || fallbackRecoveryUrl;
    const currentHost = getHostFromUrl(currentPageUrl || "");
    const requestedHost = getHostFromUrl(requestedTarget || "");
    const shouldPreserveCurrentUrl =
      requestedTarget &&
      currentPageUrl &&
      requestedHost === "google.com" &&
      currentHost &&
      currentHost !== "google.com" &&
      tag !== "CAPTCHA_ESCAPE" &&
      tag !== "CONTEXT_RESET";
    const requestedUrl = shouldPreserveCurrentUrl
      ? currentPageUrl
      : requestedTarget || currentPageUrl || fallbackRecoveryUrl;
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
    currentStriderReconMemo = "";
    setHumanBridgeState({ clickCount: 0, lastClickAt: null });
    startIdleHumanBehavior();
    startHumanBridgeWatchdog(models);
    await startTaskVisionPipeline(goal, models);
    scheduleElementMapTick();
    broadcast("task_start", { goal });
    status("Starting task: " + goal);
    if (taskHeartbeatEnabled) {
      taskHeartbeatTimer = setInterval(() => {
        try {
          status(`Heartbeat: task active on ${String(page?.url?.() || "about:blank")}`);
        } catch {
          status("Heartbeat: task active");
        }
      }, taskHeartbeatMs);
    }
    appendLearningEvent({
      kind: "task",
      phase: "start",
      goal: String(goal || "").slice(0, 240),
      host: getHostFromUrl((() => {
        try { return page?.url?.() || "about:blank"; } catch { return "about:blank"; }
      })())
    });
    resetGuidanceControl();

    let stoppedByGuidance = false;
    let stoppedGuidanceReason = "";
    let lastStriderReconRefreshStep = 0;

    for (let step = 1; step <= MAX_STEPS; step++) {
      const stepStartedAt = Date.now();
      broadcast("step_start", { step, max: MAX_STEPS });
      status(`Step ${step}/${MAX_STEPS}`);

      if (guidanceControl.stopRequested) {
        stoppedByGuidance = true;
        stoppedGuidanceReason = currentGuidanceStopReason();
        narrate("Stopping the task now because you told me to stop.");
        stepLogMsg(`Step ${step}: STOPPED BY USER GUIDANCE`);
        break;
      }

      const state = await getPageState();
      finalState  = state;
      status(`URL: ${state.url}`);
      const currentHost = getHostFromUrl(state.url);
      simpleFastPathCandidate = false;
      if (step === 1 && shouldResetTaskContextToGoogle(state, goalMem, searchEngineCompareGoal)) {
        await triggerEscapeHatch(step, `Task context mismatch on ${currentHost || "unknown-host"}. Resetting to Google before executing the new task.`, "CONTEXT_RESET", { targetUrl: "https://www.google.com/" });
        continue;
      }
      if (directNavigationTargetHost && hostMatchesExpectedHost(currentHost, directNavigationTargetHost)) {
        simpleFastPathSatisfied = true;
      }

      if (
        simpleBrowsingModeActive &&
        !searchEngineCompareGoal &&
        step <= 3 &&
        directNavigationTarget &&
        !simpleFastPathSatisfied &&
        !hostMatchesExpectedHost(currentHost, directNavigationTargetHost) &&
        failures <= 1
      ) {
        simpleFastPathCandidate = true;
        think(`Simple browsing candidate available: direct navigation to ${directNavigationTargetHost || directNavigationTarget}. I may still skip it if the planner chooses a better first step.`);
      }

      const directTargetUrl = searchEngineCompareGoal ? "" : resolveDirectNavigationTarget(goal);
      if (
        !searchEngineCompareGoal &&
        step >= DIRECT_NAV_MIN_STEP &&
        directTargetUrl &&
        isGoogleSearchResultsUrl(state.url)
      ) {
        const directHost = getHostFromUrl(directTargetUrl);
        const recentLog = taskLog.slice(-12).join("\n").toLowerCase();
        const hasSubmit = recentLog.includes("submitform:ok");
        const hasGetAll = recentLog.includes("getalltext:ok");
        // Require both a submitted search and a successful extraction to
        // consider this a true "search loop" before jumping away.
        const hasSearchLoopSignal = hasSubmit && hasGetAll;
        if (directHost && directHost !== "google.com" && hasSearchLoopSignal) {
          await triggerEscapeHatch(step, `Search loop detected on Google results. Jumping directly to ${directHost}.`, "DIRECT_NAV", { targetUrl: directTargetUrl });
          continue;
        }
      }

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
      if (dynamicUiHot && (!simpleBrowsingModeActive || failures >= SIMPLE_BROWSING_DYNAMIC_UI_FAIL_THRESHOLD)) {
        think("Dynamic UI detected: switching click execution to vision coordinates only for this step.");
      }

      const mapsTrap = await detectMapsTrap(state);
      if (mapsTrap.triggered) {
        const serpUrl = pickRecoveryUrl(goal, originalQuery);
        await triggerEscapeHatch(step, `Maps trap detected (${mapsTrap.reason})`, "MAPS_ESCAPE", { targetUrl: serpUrl });
        continue;
      }

      const visionOnlyClickMode = dynamicUiHot && (!simpleBrowsingModeActive || failures >= SIMPLE_BROWSING_DYNAMIC_UI_FAIL_THRESHOLD);
      const dynamicFailureSignal = detectVisionDynamicFailureSignal(visionFeedback, visionSnap, visionOnlyClickMode);
      dynamicSignalStreak = dynamicFailureSignal ? (dynamicSignalStreak + 1) : 0;
      const dynamicEscapeEligible =
        dynamicSignalStreak > ESCAPE_DYNAMIC_STREAK_LIMIT &&
        (failures >= ESCAPE_DYNAMIC_MIN_FAILURES || (dynamicUiHot && !visionFresh));
      if (dynamicEscapeEligible) {
        await triggerEscapeHatch(step, `Dynamic UI failure streak reached ${dynamicSignalStreak}`, "DYNAMIC_ESCAPE", { targetUrl: pickRecoveryUrl(goal, originalQuery) });
        continue;
      }

      if ((Date.now() - stepStartedAt) > ESCAPE_STEP_TIMEOUT_MS) {
        await triggerEscapeHatch(step, `Step runtime exceeded ${ESCAPE_STEP_TIMEOUT_MS}ms before execution`, "RECOVERED", { targetUrl: pickRecoveryUrl(goal, originalQuery) });
        continue;
      }

      const captcha = await detectCaptchaChallenge(state);
      if (captcha.detected) {
        const pageKey = getCaptchaPageKey(state.url);
        const detectionStreak = (captchaDetectionStreakByPage.get(pageKey) || 0) + 1;
        captchaDetectionStreakByPage.set(pageKey, detectionStreak);

        const visionState = String(visionSnap?.signal?.state || "").toLowerCase();
        const visionBlocker = String(visionSnap?.signal?.blocker || "").toLowerCase();
        const visionAffirmsCaptcha = visionState === "captcha" || visionBlocker === "captcha";
        const shouldEscalateCaptchaFlow =
          !!captcha.strongEvidence ||
          visionAffirmsCaptcha ||
          (detectionStreak >= 3 && Number(captcha.score || 0) >= 5);

        if (!shouldEscalateCaptchaFlow) {
          think(`Soft CAPTCHA signal ignored on ${state.url} (streak ${detectionStreak}, score ${Number(captcha.score || 0)}).`);
          // Keep running normally unless repeated strong evidence appears.
          await sleep(120);
          continue;
        }

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
        let captchaAttemptFailures = 0;
        for (let attempt = checks; attempt <= CAPTCHA_HUMAN_CHECK_LIMIT; attempt++) {
          let attemptResult = null;
          try {
            attemptResult = await withExecutorWork(() => attemptCaptchaSolve(currentCaptchaState, models, attempt, captcha.reason));
          } catch (err) {
            captchaAttemptFailures += 1;
            errLog(`CAPTCHA attempt ${attempt}/${CAPTCHA_HUMAN_CHECK_LIMIT} failed: ${err.message}`);
            stepLogMsg(`Step captcha: failed attempt ${attempt}/${CAPTCHA_HUMAN_CHECK_LIMIT} on ${currentCaptchaState.url}`);
            if (captchaAttemptFailures >= 3 || attempt >= 3) {
              await triggerEscapeHatch(step, `CAPTCHA flow misfired after ${attempt} attempts; recovering from suspected false positive or stale selector state.`, "CAPTCHA_ESCAPE", { targetUrl: "https://www.google.com/", failedAction: "captcha", failedSelector: escapeContext.lastFailedSelector || "" });
              currentCaptchaState = finalState;
              break;
            }
            await sleepLikeHuman(600, page);
            continue;
          }
          currentCaptchaState = attemptResult.state || currentCaptchaState;
          if (attemptResult.solved) {
            solved = true;
            finalState = currentCaptchaState;
            captchaDetectionStreakByPage.delete(pageKey);
            captchaHandoffsByPage.delete(pageKey);
            clearHumanBridgeState();
            broadcast("human_resolved", { msg: "CAPTCHA cleared. Resuming autonomous execution.", url: currentCaptchaState.url });
            status(`CAPTCHA cleared after ${attempt}/${CAPTCHA_HUMAN_CHECK_LIMIT} automated attempts.`);
            break;
          }
          if (attempt >= 3) {
            await triggerEscapeHatch(step, `CAPTCHA still present after ${attempt} automated attempts; recovering instead of continuing blind retries.`, "CAPTCHA_ESCAPE", { targetUrl: "https://www.google.com/", failedAction: "captcha" });
            currentCaptchaState = finalState;
            break;
          }
          if (attempt >= CAPTCHA_HUMAN_CHECK_LIMIT) break;
        }

        if (!solved) {
          const recoveredToGoogle = hostMatchesExpectedHost(getHostFromUrl(finalState.url), "google.com");
          if (recoveredToGoogle) {
            captchaDetectionStreakByPage.delete(pageKey);
            clearHumanBridgeState();
            await sleepLikeHuman(350, page);
            continue;
          }
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

      const captchaPageKey = getCaptchaPageKey(state.url);
      captchaDetectionStreakByPage.delete(captchaPageKey);

      if (humanBridgeState.active) {
        clearHumanBridgeState();
        broadcast("human_resolved", { msg: "CAPTCHA signals cleared. Resuming autonomous execution.", url: state.url });
      }

      const stuck = detectStuck(taskLog);
      const reconTargetUrl = getStriderReconTarget(goal, state.url);
      const shouldRefreshStriderRecon = !simpleBrowsingModeActive && !!reconTargetUrl && step >= 2 && (step - lastStriderReconRefreshStep >= 3) && (
        stuck ||
        failures >= 2 ||
        (step % 6 === 0 && !currentStriderReconMemo)
      );

      if (shouldRefreshStriderRecon) {
        try {
          const reconResult = await runStriderPlannerRecon(goal, reconTargetUrl, {
            timeoutMs: stuck ? 3200 : 1800,
            minRelevant: stuck ? 4 : 2,
            limit: 16,
          });
          const reconReport = reconResult?.report || reconResult?.result?.report || null;
          const refreshedMemo = formatStriderReconContext(reconReport, getHostnameSafe(reconTargetUrl));
          if (refreshedMemo) {
            currentStriderReconMemo = refreshedMemo;
            lastStriderReconRefreshStep = step;
            think(`Strider recon refreshed at step ${step} for ${getHostnameSafe(reconTargetUrl) || reconTargetUrl}.`);
          }
        } catch (err) {
          think(`Strider recon refresh skipped at step ${step}: ${err.message}`);
        }
      }

      const shouldRefreshInstinct =
        step === 1 ||
        !lastInstinct ||
        stuck ||
        failures >= 2 ||
        dynamicFailureSignal ||
        ((step - lastInstinctStep) >= INSTINCT_SAMPLE_EVERY_STEPS);

      const instinct = shouldRefreshInstinct
        ? await getReasonerInstinct(goal, state, visionFeedback, taskLog, models)
        : (lastInstinct || {
            instinct: "Focus on the current page state.",
            risk: "medium",
            next_focus: "current page",
            caution: "keep the next step small"
          });

      if (shouldRefreshInstinct) {
        lastInstinct = instinct;
        lastInstinctStep = step;
      }

      if (instinct?.instinct) {
        think(`Instinct: ${instinct.instinct}${instinct?.next_focus ? ` | focus: ${instinct.next_focus}` : ""}`);
      }

      let confusionResearch = null;
      if (!simpleBrowsingModeActive && shouldRunConfusionResearch(goal, state, taskLog, failures, step)) {
        confusionResearch = await withExecutorWork(() => performConfusionResearch(goal, state, visionFeedback, taskLog, failures, models));
      }
      
      // EFFICIENCY CHECK: Does vision already have what we need?
      const efficiencyCheck = checkVisionHasAnswer(visionFeedback, [
        "paragraph", "text", "summary", "content", "description", "information", "data"
      ]);

      // GUIDANCE: Consume any user guidance sent mid-task
      const userGuidance = consumeGuidance();
      if (userGuidance) {
        think(`📬 User guidance received: ${userGuidance.text}`);
        if (userGuidance.stopRequested) {
          stoppedByGuidance = true;
          stoppedGuidanceReason = userGuidance.text;
          narrate("You told me to stop, so I am ending the task here.");
          stepLogMsg(`Step ${step}: STOP DIRECTIVE — ${userGuidance.text}`);
          break;
        }
        narrate(`Got your guidance. I will treat it as a binding instruction: ${userGuidance.text}`);
      }

      // NARRATION: Describe what we're about to do in plain English
      if (step === 1) narrate(`Starting task: "${goal}". Let me figure out the best approach...`);
      else if (stuck) narrate(`I seem to be going in circles. Let me try a completely different approach.`);
      else if (failures >= 2) narrate(`The last ${failures} attempts failed. Switching strategy now.`);
      else if (step % 5 === 0) narrate(`Still working on it — step ${step}. Current page: ${state.url}`);

      if (step > 1 && step % 5 === 0 && chatId) {
        const summaryLines = [];
        if (instinct?.instinct) summaryLines.push(instinct.instinct);
        if (instinct?.next_focus) summaryLines.push(`Focus: ${instinct.next_focus}`);
        if (instinct?.risk) summaryLines.push(`Risk: ${instinct.risk}`);
        if (instinct?.caution) summaryLines.push(`Caution: ${instinct.caution}`);
        if (summaryLines.length) {
          appendTaskChatMessage("assistant", `Reasoner summary (step ${step}):\n` + summaryLines.join("\n"), { reasoner_summary: true, step, completed: false });
        }
      }
      
      const instinctFeedback = [
        visionFeedback,
        instinct?.instinct ? `Reasoner instinct: ${instinct.instinct}` : "",
        instinct?.risk ? `Reasoner risk: ${instinct.risk}` : "",
        instinct?.next_focus ? `Reasoner focus: ${instinct.next_focus}` : "",
        instinct?.caution ? `Reasoner caution: ${instinct.caution}` : "",
        buildConfusionHintContext(confusionResearch),
        efficiencyCheck?.alreadyHave ? `💡 EFFICIENCY: ${efficiencyCheck.suggestion}` : "",
        userGuidance?.directiveText ? `🧭 ${userGuidance.directiveText}` : ""
      ].filter(Boolean).join("\n");

      const peerSignals = {
        reasoner: instinct || {},
        supervisor: lastSupervisorSignal || {},
        goalMemContext: goalMemoryContext(goalMem),
        research: {
          hintCount: Array.isArray(confusionResearch?.hints) ? confusionResearch.hints.length : 0,
          domain: confusionResearch?.targetDomain || ""
        }
      };

      let plan;
      try {
        plan = await withExecutorWork(() => planNextSteps(goal, state, instinctFeedback, taskLog, plannerHistory, stuck, failures, models, peerSignals, {
          simpleFastPathCandidate,
          directNavigationTarget,
          taskContext
        }));
      } catch (err) {
        errLog("Planning failed: " + err.message);
        const heuristicPlan = inferHeuristicPlan(goal, state, taskLog, failures);
        if (heuristicPlan) {
          plan = heuristicPlan;
          think(`Heuristic planner fallback engaged: ${heuristicPlan.reasoning}`);
        } else {
          taskLog.push(`Step ${step}: planner error`);
          failures++;
          if (failures >= taskRetryLimit) { errLog("Too many failures — stopping."); break; }
          await sleep(taskRetryBackoffMs);
          continue;
        }
      }

      if (plan.done) {
        if (shouldAcceptPlannerDoneDecision(goal, state, extractedTextBuffer)) {
          stepLogMsg(`Step ${step}: DONE — ${plan.reasoning}`);
          taskLog.push(`Step ${step}: DONE`);
          completed = true;
          break;
        }
        think("Planner marked DONE early, but completion evidence is weak for this search goal. Continuing.");
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
          if (failures >= taskRetryLimit) break;
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
          filteredActions.push({ action: "goto", params: { url: pickRecoveryUrl(goal, originalQuery) } });
        }

        const filteredHasSearchSubmitOnly = filteredActions.length === 1 && ["submitForm", "press"].includes(String(filteredActions[0]?.action || ""));
        if (filteredHasSearchSubmitOnly && extractSearchQuery(goal)) {
          const heuristicPlan = inferHeuristicPlan(goal, state, taskLog, failures);
          if (heuristicPlan?.actions?.length) {
            filteredActions.splice(0, filteredActions.length, ...heuristicPlan.actions);
          }
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

      const shouldRefreshSupervisor =
        !lastSupervisorGate ||
        step === 1 ||
        stuck ||
        failures >= 2 ||
        dynamicFailureSignal ||
        !visionFresh ||
        currentHost !== lastSupervisorHost ||
        planSignature !== lastSupervisorPlanSignature ||
        ((step - lastSupervisorEvalStep) >= SUPERVISOR_SAMPLE_EVERY_STEPS);

      const supervisorGate = shouldRefreshSupervisor
        ? await evaluateSupervisorPlanGateWithAI({
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
          }, models)
        : {
            ...(lastSupervisorGate || {}),
            source: `${String(lastSupervisorGate?.source || "cache")}:step-cache`
          };

      if (shouldRefreshSupervisor) {
        lastSupervisorGate = supervisorGate;
        lastSupervisorEvalStep = step;
        lastSupervisorPlanSignature = planSignature;
        lastSupervisorHost = currentHost;
      }

      lastAttemptedPlanSignature = planSignature;
      
      const mainReason = supervisorGate.reasons?.[0] || "";
      const gateSummary = `Supervisor ${supervisorGate.decision.toUpperCase()}: ${mainReason}`;
      lastSupervisorSignal = {
        decision: supervisorGate.decision,
        score: supervisorGate.score,
        reason: mainReason
      };

      if (!supervisorGate.allow) {
        supervisorBlocks++;
        think(gateSummary);
        const supervisorRecovery = inferHeuristicPlan(goal, state, taskLog, failures);
        if (supervisorRecovery && Array.isArray(supervisorRecovery.actions) && supervisorRecovery.actions.length) {
          const supervisorRecoverySignature = computePlanSignature(supervisorRecovery);
          const recoveryRepeats = supervisorRecoverySignature === planSignature || supervisorRecoverySignature === lastAttemptedPlanSignature;
          if (recoveryRepeats) {
            const query = extractSearchQuery(goal);
            const directRecoveryUrl = pickRecoveryUrl(goal, originalQuery);
            const forcedActions = query
              ? [
                  { action: "goto", params: { url: directRecoveryUrl } },
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
        } else {
          taskLog.push(`Step ${step}: supervisor blocked plan`);
          failures++;
          if (supervisorBlocks >= 3) {
            askUser(
              `I keep blocking risky plans while trying to \"${goal}\". Want me to continue with a simpler strategy?`,
              `Supervisor blocks: ${supervisorBlocks}, current URL: ${state.url}`
            );
          }
          if (failures >= taskRetryLimit) break;
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
            pacingMultiplier: CAPTCHA_GENTLE_PACING_MULTIPLIER * taskPacingMultiplier,
            preActionIdleMs: CAPTCHA_GENTLE_PRE_ACTION_IDLE_MS,
            burstLimit: CAPTCHA_GENTLE_BURST_ACTIONS,
            microBreakMs: CAPTCHA_GENTLE_MICRO_BREAK_MS,
            navigationCooldownMs: CAPTCHA_GENTLE_NAVIGATION_COOLDOWN_MS,
            navigationCooldownByHost,
            visionOnlyClickMode
          }
        : {
            pacingMultiplier: taskPacingMultiplier,
            preActionIdleMs: 0,
            burstLimit: Number.POSITIVE_INFINITY,
            microBreakMs: 0,
            navigationCooldownMs: taskBaseNavigationCooldownMs,
            navigationCooldownByHost,
            visionOnlyClickMode
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
      if (results.some(item => String(item?.status || "") === "stopped") || guidanceControl.stopRequested) {
        stoppedByGuidance = true;
        stoppedGuidanceReason = currentGuidanceStopReason() || userGuidance?.text || "stop";
        stepLogMsg(`Step ${step}: ACTION PLAN HALTED BY USER GUIDANCE`);
        narrate("I halted the task because you issued a stop directive.");
        break;
      }
      lastAction    = plan.actions[plan.actions.length - 1];
      const summary = results.map(r => `${r.action}:${r.status}`).join(", ");
      const logLine = `Step ${step} [${plan.confidence ?? "?"}%]: ${summary} — ${(plan.reasoning || "").slice(0, 60)}`;
      taskLog.push(logLine);
      stepLogMsg(logLine);

      // Keep the Task Context Object current — this is what gets pinned to
      // the top of every planner prompt so "what was I doing again?" has a
      // cheap, un-truncatable answer even deep into a long task.
      taskContext.lastAction = summary.slice(0, 200);
      taskContext.lastResult = results.some(r => String(r?.status) === "error")
        ? `error: ${results.find(r => String(r?.status) === "error")?.error || "unknown"}`.slice(0, 160)
        : "ok";
      taskContext.stepCount = step;

      const extractedNow = getExtractedTextFromResults(results);
      if (extractedNow) {
        extractedTextBuffer = extractedNow;
        if (searchEngineCompareGoal) {
          const hostNow = getHostFromUrl(state.url);
          if ((hostNow === "google.com" || hostNow.endsWith(".google.com")) && !compareSnapshots.google) {
            compareSnapshots.google = extractedNow;
            taskLog.push(`Capture google:ok (${extractedNow.length} chars)`);
            stepLogMsg(`Capture google:ok (${extractedNow.length} chars)`);
          }
          if ((hostNow === "bing.com" || hostNow.endsWith(".bing.com")) && !compareSnapshots.bing) {
            compareSnapshots.bing = extractedNow;
            taskLog.push(`Capture bing:ok (${extractedNow.length} chars)`);
            stepLogMsg(`Capture bing:ok (${extractedNow.length} chars)`);
          }
          if (compareSnapshots.google && compareSnapshots.bing) {
            extractedTextBuffer = [
              "Google results snapshot:",
              compareSnapshots.google.slice(0, 4000),
              "",
              "Bing results snapshot:",
              compareSnapshots.bing.slice(0, 4000)
            ].join("\n");
          }
        }
      }

      // Advance goal memory with this step's results.
      advanceGoalMemory(goalMem, state.url, results);

      // For extract+summarize goals, trigger smart extraction and complete immediately.
      const searchEvidenceReady = !extractSearchQuery(goal) || hasSearchGoalEvidence(goal, state);
      if (isExtractionSummaryGoal(goal) && extractedTextBuffer && searchEvidenceReady) {
        // If we haven't done smart extraction yet, do it now for cleaner summary content.
        if (extractedTextBuffer.length < 2000) {
          const smartText = await withExecutorWork(() => extractMainContent({ ...state, page }));
          if (smartText && smartText.length > extractedTextBuffer.length) {
            extractedTextBuffer = smartText;
          }
        }
        const doneLine = `Step ${step}: DONE (text extracted for summary)`;
        taskLog.push(doneLine);
        stepLogMsg(doneLine);
        completed = true;
        break;
      }

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
                    targetUrl: state.url,
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
          targetUrl: state.url,
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
      if (failures >= taskRetryLimit) { errLog("Circuit breaker: stopping."); break; }

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
      if (STEP_SETTLE_DELAY_MS > 0) {
        await sleepLikeHuman(STEP_SETTLE_DELAY_MS, page);
      }
      const newState      = await withExecutorWork(() => getPageState());
      const liveVisionNow = getTaskVisionSnapshot();
      const liveVisionAgeMs = liveVisionNow.lastFrameAt ? (Date.now() - liveVisionNow.lastFrameAt) : Number.POSITIVE_INFINITY;
      const liveVisionFresh = liveVisionAgeMs <= VISION_STREAM_FRESH_MS;
      const liveVisionUsable = liveVisionFresh && !!liveVisionNow.summary && String(liveVisionNow.signal?.state || "") !== "uncertain";
      const shouldAnalyzeVision =
        step === 1 ||
        (step % VISION_SAMPLE_EVERY_STEPS === 0) ||
        allFailed ||
        failures >= 2 ||
        detectStuck(taskLog);

      const canRunHeavyVisionNow =
        !simpleBrowsingModeActive ||
        failures >= SIMPLE_BROWSING_DYNAMIC_UI_FAIL_THRESHOLD ||
        (step % Math.max(2, VISION_SAMPLE_EVERY_STEPS * 2) === 0);

      if (liveVisionUsable) {
        visionFeedback = liveVisionNow.summary;
      } else if (shouldAnalyzeVision && canRunHeavyVisionNow) {
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

      const verifyCadence = simpleBrowsingModeActive ? Math.max(2, VERIFY_EVERY_STEPS * 2) : VERIFY_EVERY_STEPS;
      const shouldVerify =
        step === 1 ||
        (step % verifyCadence === 0) ||
        allFailed ||
        failures >= 2 ||
        detectStuck(taskLog);
      const verification = shouldVerify
        ? await withExecutorWork(() => verifyGoalCompletion(goal, newState, visionFeedback, taskLog, models))
        : { done: false, reason: "" };
      if (verification.done) {
        const doneLine = `Step ${step}: DONE (verified)${verification.reason ? ` — ${verification.reason}` : ""}`;
        taskLog.push(doneLine);
        stepLogMsg(doneLine);
        completed = true;
        break;
      }

      plannerHistory.push({
        role: "user",
        content: `Results:\n${summarizeResultsForPlanner(results)}\nVision: ${String(visionFeedback || "none").slice(0, 420)}`
      });

      if (POST_STEP_DELAY_MS > 0) {
        await sleepLikeHuman(POST_STEP_DELAY_MS, page);
      }
    }

    const answer = stoppedByGuidance
      ? `Task stopped on operator instruction. Last page: ${finalState.url}. Last guidance: ${stoppedGuidanceReason || "stop"}`
      : requiresHuman
      ? `I hit a CAPTCHA/challenge on ${finalState.url} and paused for manual help after ${CAPTCHA_HUMAN_CHECK_LIMIT} automated attempts. Please complete the challenge in the browser, then retry the task.`
      : await summarizeResult(goal, finalState, taskLog, visionFeedback, completed, models, extractedTextBuffer);
    const agentClaimedSuccess = !!(completed && !requiresHuman && !stoppedByGuidance);
    // `completed` above comes from verifyGoalCompletion(), an LLM self-check —
    // i.e. the agent grading its own homework. actualSuccess is a cheap,
    // independent cross-check using signals the LLM didn't produce: the raw
    // failure-streak counter, whether the run ended in a captcha/human handoff,
    // and whether it was cut short by operator guidance rather than reaching
    // the goal on its own.
    const actualSuccess = agentClaimedSuccess && failures === 0;
    const discrepancy = agentClaimedSuccess && !actualSuccess;
    appendLearningEvent({
      kind: "task",
      phase: "end",
      goal: String(goal || "").slice(0, 240),
      host: getHostFromUrl(finalState.url),
      completed: agentClaimedSuccess,
      steps: taskLog.length,
      result: String(answer || "").slice(0, 260)
    });
    appendLearningEvent({
      kind: "diagnosis",
      goal: String(goal || "").slice(0, 240),
      host: getHostFromUrl(finalState.url),
      agentClaimedSuccess,
      actualSuccess,
      discrepancy,
      finalFailureStreak: failures,
      requiresHuman: !!requiresHuman,
      stoppedByGuidance: !!stoppedByGuidance,
      steps: taskLog.length
    });
    saveMemory({ goal, result: answer.slice(0, 200), completed, steps: taskLog.length });
    if (chatId) {
      appendChatMessage(chatId, "assistant", answer, { goal, completed }, currentTaskUserId);
      broadcast("chat_sync", { chatId });
    }
    broadcast("task_done", { answer, completed: completed && !requiresHuman && !stoppedByGuidance, aborted: stoppedByGuidance });
    return answer;
  } catch (err) {
    // Guarantees every task run produces a "phase: end" telemetry record,
    // even when a page crash / navigation error / uncaught exception aborts
    // the loop early. Without this, failed runs vanish from the log instead
    // of being counted — inflating apparent success rate and hiding the
    // true failure/crash split.
    const crashUrl = (() => { try { return page ? page.url() : finalState.url; } catch { return finalState.url; } })();
    appendLearningEvent({
      kind: "task",
      phase: "end",
      goal: String(goal || "").slice(0, 240),
      host: getHostFromUrl(crashUrl),
      completed: false,
      error: true,
      errorMessage: String(err && err.message || err || "unknown error").slice(0, 300),
      steps: taskLog.length,
      result: `Task aborted by an unhandled error: ${String(err && err.message || err || "unknown error").slice(0, 200)}`
    });
    broadcast("task_done", { answer: null, completed: false, error: true, aborted: false });
    throw err;
  } finally {
    if (taskHeartbeatTimer) {
      clearInterval(taskHeartbeatTimer);
    }
    if (elementMapTimer) {
      clearTimeout(elementMapTimer);
      elementMapTimer = null;
    }
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
    resetGuidanceControl();
    broadcast("bridge_closed", { msg: "Human bridge closed for this run.", url: page ? page.url() : "about:blank" });
    agentRunning = false;
    currentTaskUserId = null; // release user scope after task completes
    currentTaskChatId = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP SERVER (REST + SSE + Frontend)
// ─────────────────────────────────────────────────────────────────────────────
const FRONTEND_HTML = require("./public/frontend").FRONTEND_HTML;

let striderIntegration = null;
let currentStriderReconMemo = "";

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
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
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

  if (pathname === "/favicon.ico") {
    res.writeHead(204, { "Cache-Control": "public, max-age=86400" });
    res.end();
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
      const entry = { text, ts: Date.now() };
      const policy = registerGuidance(entry);
      entry.policy = policy;
      guidanceQueue.push(entry);
      think(`📬 User guidance queued: ${text}`);
      broadcast("guidance_received", {
        msg: policy.stopRequested
          ? `Critical guidance received: stopping task on user command.`
          : `Guidance received: "${text}"`,
        text,
        priority: policy.priority,
        stopRequested: policy.stopRequested,
        ts: new Date().toISOString()
      });
      sendJson(res, 200, { ok: true, queued: guidanceQueue.length, priority: policy.priority, stopRequested: policy.stopRequested });
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
    const uiAuth = getAuth(req);
    if (!uiAuth) { sendJson(res, 401, { error: "Unauthorized" }); return; }
    try {
      const body = await readJsonBody(req);
      const analysis = await analyzeCurrentBrowserUILayout(String(body.prompt || body.query || ""), uiAuth.userId || null);
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
    const auth = getAuth(req);
    const userId = auth?.userId || null;
    sseClients.push({ res, userId });
    req.on("close", () => { sseClients = sseClients.filter(client => client.res !== res); });
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
    const bootstrapAuth = getAuth(req);
    sendJson(res, 200, buildBootstrapPayload(catalog, bootstrapAuth));
    return;
  }

  if (pathname === "/api/models") {
    const catalog = await fetchModelCatalog(requestUrl.searchParams.get("force") === "1");
    const modelAuth = getAuth(req);
    const { chat } = ensureCurrentChat(modelAuth?.userId || null);
    sendJson(res, 200, { catalog, current: getActiveModels(chat), defaults: DEFAULT_MODELS, modelParams: getActiveModelParams(chat) });
    return;
  }

  if (pathname === "/api/chats" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const chatAuth = getAuth(req);
      const chat = createChat(body.title || "New Chat", chatAuth?.userId || null);
      sendJson(res, 201, { chat, selectedChatId: chat.id });
    } catch {
      sendJson(res, 400, { error: "Invalid request body" });
    }
    return;
  }

  if (chatMatch && req.method === "PATCH") {
    try {
      const body = await readJsonBody(req);
      const chatAuth = getAuth(req);
      const store = loadChatStore(chatAuth?.userId || null);
      const chat = store.chats.find(item => item.id === chatMatch[1]);
      if (!chat) {
        sendJson(res, 404, { error: "Chat not found" });
        return;
      }
      const updated = renameChatTitle(chat, body.title);
      if (!updated) {
        sendJson(res, 400, { error: "Title is required" });
        return;
      }
      chat.updatedAt = new Date().toISOString();
      saveChatStore(store, chatAuth?.userId || null);
      sendJson(res, 200, { chat, selectedChatId: store.selectedChatId });
      broadcast("chat_sync", { chatId: chat.id });
    } catch {
      sendJson(res, 400, { error: "Invalid request body" });
    }
    return;
  }

  if (chatMatch && req.method === "GET") {
    const chatAuth = getAuth(req);
    const { store } = ensureCurrentChat(chatAuth?.userId || null);
    const chat = store.chats.find(item => item.id === chatMatch[1]);
    if (!chat) {
      sendJson(res, 404, { error: "Chat not found" });
      return;
    }
    sendJson(res, 200, { chat, selectedChatId: store.selectedChatId });
    return;
  }

  // Server-side title generation endpoint (used by frontend to avoid CORS/third-party calls)
  const genTitleMatch = pathname.match(/^\/api\/chats\/([^/]+)\/generate_title$/);
  if (genTitleMatch && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const chatAuth = getAuth(req);
      const store = loadChatStore(chatAuth?.userId || null);
      const chat = store.chats.find(item => item.id === genTitleMatch[1]);
      if (!chat) { sendJson(res, 404, { error: "Chat not found" }); return; }
      const text = String((body && body.text) || (chat.messages && chat.messages.slice().reverse().find(m=>m.role==="user") && chat.messages.slice().reverse().find(m=>m.role==="user").content) || "").trim();
      if (!text) { sendJson(res, 400, { error: "No text provided" }); return; }
      // Use reasoner-backed generator to produce a concise title
      const result = await generateAndSaveTitleForChat(chat.id, text, chatAuth?.userId || null);
      if (result && result.title) {
        sendJson(res, 200, { chat, title: result.title });
        return;
      }
      sendJson(res, 204, {});
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  if (selectMatch && req.method === "POST") {
    const chatAuth = getAuth(req);
    const userId = chatAuth?.userId || null;
    let chat = setCurrentChat(selectMatch[1], userId);
    if (!chat) {
      // Chat not found in user's store (stale ID from before per-user isolation).
      // Fall back gracefully: use or create the user's current chat.
      const fallback = ensureCurrentChat(userId);
      chat = fallback.chat;
    }
    const catalog = await fetchModelCatalog(false);
    const selectAuth = getAuth(req);
    sendJson(res, 200, buildBootstrapPayload(catalog, selectAuth));
    return;
  }

  if (modelsMatch && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const chatAuth = getAuth(req);
      const chat = updateChatModels(modelsMatch[1], body.models || {}, chatAuth?.userId || null, body.params || {});
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

  // Strider API endpoints
  if (pathname === "/api/strider/start" && req.method === "POST") {
    try {
      if (!striderIntegration) {
        sendJson(res, 400, { error: "Strider not initialized" });
        return;
      }
      const body = await readJsonBody(req);
      const result = await striderIntegration.handleStart(body);
      sendJson(res, result.ok ? 200 : (result.code || 400), result);
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  if (pathname === "/api/strider/stop" && req.method === "POST") {
    try {
      if (!striderIntegration) {
        sendJson(res, 400, { error: "Strider not initialized" });
        return;
      }
      const result = await striderIntegration.handleStop();
      sendJson(res, result.ok ? 200 : (result.code || 400), result);
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  if (pathname === "/api/strider/stats" && req.method === "GET") {
    try {
      if (!striderIntegration) {
        sendJson(res, 400, { error: "Strider not initialized" });
        return;
      }
      const stats = striderIntegration.getStats();
      sendJson(res, stats.ok ? 200 : (stats.code || 400), stats);
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  if (pathname === "/api/strider/health" && req.method === "GET") {
    try {
      if (!striderIntegration) {
        sendJson(res, 400, { error: "Strider not initialized" });
        return;
      }
      const health = striderIntegration.getHealth();
      sendJson(res, health.ok ? 200 : (health.code || 400), health);
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  if (pathname === "/api/strider/map" && req.method === "GET") {
    try {
      if (!striderIntegration) {
        sendJson(res, 400, { error: "Strider not initialized" });
        return;
      }
      const result = striderIntegration.getMap();
      sendJson(res, result.ok ? 200 : (result.code || 400), result);
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  if (pathname === "/api/strider/recon" && req.method === "POST") {
    try {
      if (!striderIntegration) {
        sendJson(res, 400, { error: "Strider not initialized" });
        return;
      }
      const body = await readJsonBody(req);
      const result = await striderIntegration.handleRecon(body);
      sendJson(res, result.ok ? 200 : (result.code || 400), result);
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  if (pathname === "/api/strider/extract-elements" && req.method === "POST") {
    try {
      if (!striderIntegration) {
        sendJson(res, 400, { error: "Strider not initialized" });
        return;
      }
      const body = await readJsonBody(req);
      const result = await striderIntegration.handleExtractElements(body);
      sendJson(res, result.ok ? 200 : (result.code || 400), result);
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  if (pathname === "/api/strider/enqueue" && req.method === "POST") {
    try {
      if (!striderIntegration) {
        sendJson(res, 400, { error: "Strider not initialized" });
        return;
      }
      const body = await readJsonBody(req);
      const result = await striderIntegration.handleEnqueue(body);
      sendJson(res, result.ok ? 200 : (result.code || 400), result);
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  if (pathname === "/api/strider/mode" && req.method === "POST") {
    try {
      if (!striderIntegration) {
        sendJson(res, 400, { error: "Strider not initialized" });
        return;
      }
      const body = await readJsonBody(req);
      const result = await striderIntegration.handleModeToggle(body);
      sendJson(res, result.ok ? 200 : (result.code || 400), result);
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  if (pathname === "/api/strider/reset" && req.method === "POST") {
    try {
      if (!striderIntegration) {
        sendJson(res, 400, { error: "Strider not initialized" });
        return;
      }
      const result = await striderIntegration.handleReset();
      sendJson(res, result.ok ? 200 : (result.code || 400), result);
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  if (pathname === "/chat" && req.method === "POST" ||
      pathname === "/chat/" && req.method === "POST" ||
      pathname === "/api/chat" && req.method === "POST" ||
      pathname === "/api/chat/" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const chatAuth = getAuth(req);
      const rawMessage = String(body.message || "").trim();
      const userId = chatAuth?.userId || null;
      const fallbackChat = ensureCurrentChat(userId).chat;
      const chatId = body.chatId || fallbackChat.id;

      // Select the target chat FIRST — before anything model-dependent runs.
      // Media analysis (below) reads this chat's configured vision model,
      // so selection must happen before that, not after.
      let activeChat = setCurrentChat(chatId, userId);
      if (!activeChat) {
        // chatId is stale (e.g. after server restart) — fall back to the current chat in the authenticated user's store.
        activeChat = fallbackChat;
      }

      const mediaItems = normalizeIncomingMedia(body);
      const mediaTaskType = mediaItems.length ? classifyMediaTask(mediaItems) : null;
      const shouldAnalyzeLiveUi = !mediaItems.length && wantsPageLayoutAnalysis(rawMessage);

      let message = rawMessage;
      let mediaAnalysisMeta = null;
      if (mediaItems.length) {
        const mediaModels = attachModelRuntimeParams(getActiveModels(activeChat), getActiveModelParams(activeChat));
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

      const normalizedCommandMessage = normalizeBrowserFlagBundleMessage(rawMessage);
      const command = parseSlashCommand(normalizedCommandMessage);
      const effectiveChatId = activeChat?.id || fallbackChat?.id || chatId;
      const explicitSlashAction = command ? resolveExplicitSlashAction(command) : { kind: "unknown" };
      const slashModel = command ? resolveSlashModelCommand(command) : null;
      if (slashModel && command) {
        if (slashModel.kind === "reset") {
          clearRuntimeModelOverride(effectiveChatId, userId);
          appendChatMessage(effectiveChatId, "user", message, { command: command.command }, userId);
          appendChatMessage(effectiveChatId, "assistant", "Model override cleared. I'll go back to the chat's saved models until you set another command.", { completed: true, command: command.command, model: null }, userId);
          sendJson(res, 200, { ok: true, chatId: effectiveChatId, command: command.command, model: null, reset: true });
          broadcast("chat_sync", { chatId: effectiveChatId });
          currentTaskUserId = null;
          return;
        }
        if (slashModel.kind === "model") {
          if (!slashModel.modelId) {
            appendChatMessage(effectiveChatId, "user", message, { command: command.command }, userId);
            appendChatMessage(effectiveChatId, "assistant", `I couldn't find a model matching "${slashModel.query}" in the catalog, so I left the current model active.`, { completed: true, command: command.command, model: null, matched: false }, userId);
            sendJson(res, 200, { ok: true, chatId: effectiveChatId, command: command.command, model: null, matched: false });
            broadcast("chat_sync", { chatId: effectiveChatId });
            currentTaskUserId = null;
            return;
          }
          setRuntimeModelOverride(effectiveChatId, slashModel.modelId, userId);
          appendChatMessage(effectiveChatId, "user", message, { command: command.command }, userId);
          appendChatMessage(effectiveChatId, "assistant", `Model override set to ${slashModel.modelId}. I'll keep using it until you start a new task or reset it.`, { completed: true, command: command.command, model: slashModel.modelId, matched: true }, userId);
          sendJson(res, 200, { ok: true, chatId: effectiveChatId, command: command.command, model: slashModel.modelId, matched: true });
          broadcast("chat_sync", { chatId: effectiveChatId });
          currentTaskUserId = null;
          return;
        }
      }

      if (command && explicitSlashAction.kind === "help") {
        appendChatMessage(effectiveChatId, "user", rawMessage, { command: command.command }, userId);
        const helpText = buildSlashHelpText();
        appendChatMessage(effectiveChatId, "assistant", helpText, { completed: true, command: command.command }, userId);
        sendJson(res, 200, { ok: true, chatId: effectiveChatId, command: command.command, help: helpText });
        broadcast("chat_sync", { chatId: effectiveChatId });
        currentTaskUserId = null;
        return;
      }

      if (command && explicitSlashAction.kind === "image") {
        const imagePrompt = buildImageCommandPrompt(command);
        appendChatMessage(effectiveChatId, "user", rawMessage, { command: command.command }, userId);
        if (!imagePrompt) {
          appendChatMessage(effectiveChatId, "assistant", "Use /image followed by a prompt. You can also pass options like --style, --size, or --negative.", { completed: true, command: command.command }, userId);
          sendJson(res, 200, { ok: true, chatId: effectiveChatId, command: command.command, error: "missing_prompt" });
          broadcast("chat_sync", { chatId: effectiveChatId });
          currentTaskUserId = null;
          return;
        }

        try {
          const generated = await generateImageFromPrompt(imagePrompt, attachModelRuntimeParams(getActiveModels(activeChat), getActiveModelParams(activeChat)));
          const assistantText = `Generated an image for: ${imagePrompt}`;
          appendChatMessage(effectiveChatId, "assistant", assistantText, {
            completed: true,
            command: command.command,
            generatedImage: generated.image,
            routerSwap: generated.routerMeta
          }, userId);
          sendJson(res, 200, { ok: true, chatId: effectiveChatId, command: command.command, generatedImage: generated.image, routerSwap: generated.routerMeta });
          broadcast("chat_sync", { chatId: effectiveChatId });
        } catch (err) {
          appendChatMessage(effectiveChatId, "assistant", `Image generation failed: ${err.message}`, {
            completed: true,
            command: command.command,
            error: true
          }, userId);
          sendJson(res, 200, { ok: true, chatId: effectiveChatId, command: command.command, error: err.message || "Image generation failed" });
          broadcast("chat_sync", { chatId: effectiveChatId });
        }
        currentTaskUserId = null;
        return;
      }

      if (command && explicitSlashAction.kind === "browser") {
        const browserRuntime = buildBrowserRuntimeConfig(command);
        let browserGoal = buildBrowserCommandGoal(command, mediaItems.length ? message : "");
        if (!browserGoal) {
          appendChatMessage(effectiveChatId, "user", rawMessage, { command: command.command }, userId);
          appendChatMessage(effectiveChatId, "assistant", "Use /browser followed by the task you want me to do in the browser. You can also pass options like --url, --site, or --goal.", { completed: true, command: command.command }, userId);
          sendJson(res, 200, { ok: true, chatId: effectiveChatId, command: command.command, error: "missing_prompt" });
          broadcast("chat_sync", { chatId: effectiveChatId });
          currentTaskUserId = null;
          return;
        }

        if (agentRunning) {
          sendJson(res, 409, { error: "A task is already running. Please wait for it to finish.", busy: true });
          currentTaskUserId = null;
          return;
        }

        const taskUser = findUserById(userId);
        if (taskUser) {
          const limit = await checkTaskLimit(taskUser);
          if (!limit.allowed) {
            sendJson(res, 402, {
              error: `Monthly task limit reached (${limit.used}/${limit.maxTasks}). Upgrade your plan or wait for reset.`,
              tier: limit.tier,
              usage: limit,
              busy: false
            });
            currentTaskUserId = null;
            return;
          }
        }

        const autoReconTarget = getStriderReconTarget(browserGoal, command?.options?.url || "");
        const simpleBrowserMode = shouldUseSimpleBrowsingMode(browserGoal);
        currentStriderReconMemo = "";
        if (!simpleBrowserMode && striderIntegration && autoReconTarget && !striderIntegration.isActive()) {
          try {
            const reconStart = await runStriderPlannerRecon(browserGoal, autoReconTarget, {
              timeoutMs: 2500,
              minRelevant: 6,
            });
            if (reconStart?.ok) {
              status(`Strider planner-recon started for ${autoReconTarget}`);
            }
          } catch (err) {
            think(`Strider auto-recon skipped: ${err.message}`);
          }
        } else if (simpleBrowserMode) {
          status("Simple browsing mode active: skipping Strider recon bootstrap.");
        }

        const reconContext = simpleBrowserMode ? "" : buildStriderReconContext(browserGoal, command?.options?.url || "");
        if (reconContext) {
          currentStriderReconMemo = reconContext;
          browserGoal = `${browserGoal}\n\n${reconContext}`;
          status("Strider frontier helper attached site-map context to browser task.");
        }

        if (browserRuntime && Array.isArray(browserRuntime.modelSwitch) && browserRuntime.modelSwitch.length) {
          const preferredModel = String(browserRuntime.modelSwitch[0] || "").trim();
          const resolvedModel = findModelByNameOrId(modelCatalogCache.items, preferredModel) || preferredModel;
          if (resolvedModel) {
            setRuntimeModelOverride(chatId, resolvedModel, userId);
            status(`Browser task runtime model set to ${resolvedModel}`);
          }
        }

        if (!browserRuntime && getRuntimeModelOverride(activeChat)) {
          clearRuntimeModelOverride(chatId, userId);
        }

        appendChatMessage(chatId, "user", rawMessage, { command: command.command }, userId);
        sendJson(res, 202, { ok: true, chatId, command: command.command, media: mediaAnalysisMeta });
        const { chat } = ensureCurrentChat(userId);
        const models = attachModelRuntimeParams(getActiveModels(chat), getActiveModelParams(chat));
        try {
          await runTask(browserGoal, models, chatId, browserRuntime, userId);
        } finally {
          if (taskUser) {
            await incrementTaskUsage(taskUser);
          }
        }
        broadcast("url", { url: page.url() });
        return;
      }

      if (command && explicitSlashAction.kind === "practice") {
        appendChatMessage(effectiveChatId, "user", rawMessage, { command: command.command }, userId);
        
        if (!striderIntegration) {
          appendChatMessage(effectiveChatId, "assistant", "Strider crawler is not available. Please try again in a moment.", { completed: true, command: command.command, error: true }, userId);
          sendJson(res, 200, { ok: true, chatId: effectiveChatId, command: command.command, error: "strider_unavailable" });
          broadcast("chat_sync", { chatId: effectiveChatId });
          currentTaskUserId = null;
          return;
        }

        const seedUrls = command?.positionals || [];
        const workerCount = parseInt(command?.options?.workers || "3", 10);
        const randomWalk = command?.flags?.includes("random") || command?.options?.random === true;
        const wantsStats = command?.flags?.includes("stats") || command?.options?.stats === true;
        const wantsStop = command?.flags?.includes("stop") || command?.options?.stop === true;
        const wantsReset = command?.flags?.includes("reset") || command?.options?.reset === true;
        const requestedMode = String(command?.options?.mode || (command?.flags?.includes("fifo") ? "fifo" : (command?.flags?.includes("random") ? "random" : ""))).toLowerCase();
        const enqueueUrl = String(command?.options?.enqueue || command?.options?.url || "").trim();

        if (wantsStats) {
          const statsResult = striderIntegration.getStats();
          const mapResult = striderIntegration.getMap();
          if (!statsResult?.ok) {
            appendChatMessage(effectiveChatId, "assistant", "Strider is not running yet. Start it with /practice <url> [--workers <n>] [--random].", { completed: true, command: command.command }, userId);
            sendJson(res, 200, { ok: true, chatId: effectiveChatId, command: command.command, running: false });
            broadcast("chat_sync", { chatId: effectiveChatId });
            currentTaskUserId = null;
            return;
          }

          const stats = statsResult.stats || {};
          const frontier = stats.frontier || {};
          const global = stats.global || {};
          const nodeCount = Array.isArray(mapResult?.map?.nodes) ? mapResult.map.nodes.length : 0;
          const edgeCount = Array.isArray(mapResult?.map?.edges) ? mapResult.map.edges.length : 0;
          const statsMsg = [
            "🤖 Strider status",
            `Running: ${statsResult.running ? "yes" : "no"}`,
            `Queue: ${Number(frontier.queueSize || 0)} | Visited: ${Number(frontier.visitedCount || 0)} | In progress: ${Number(frontier.inProgressCount || 0)}`,
            `Processed: ${Number(global.totalUrlsProcessed || 0)} | Elapsed: ${Number(global.elapsed || 0).toFixed(1)}s`,
            `Map: ${nodeCount} nodes, ${edgeCount} edges`
          ].join("\n");
          appendChatMessage(effectiveChatId, "assistant", statsMsg, { completed: true, command: command.command, striderStats: true }, userId);
          sendJson(res, 200, { ok: true, chatId: effectiveChatId, command: command.command, stats: statsResult });
          broadcast("chat_sync", { chatId: effectiveChatId });
          currentTaskUserId = null;
          return;
        }

        if (wantsStop) {
          const stopResult = await striderIntegration.handleStop();
          if (stopResult.ok) {
            appendChatMessage(effectiveChatId, "assistant", "🛑 Strider stopped and frontier state saved.", { completed: true, command: command.command, striderStopped: true }, userId);
          } else {
            appendChatMessage(effectiveChatId, "assistant", `Stop failed: ${stopResult.error}`, { completed: true, command: command.command, error: true }, userId);
          }
          sendJson(res, stopResult.ok ? 200 : 400, { ok: !!stopResult.ok, chatId: effectiveChatId, command: command.command, result: stopResult });
          broadcast("chat_sync", { chatId: effectiveChatId });
          currentTaskUserId = null;
          return;
        }

        if (wantsReset) {
          const resetResult = await striderIntegration.handleReset();
          if (resetResult.ok) {
            appendChatMessage(effectiveChatId, "assistant", "♻️ Strider state reset.", { completed: true, command: command.command, striderReset: true }, userId);
          } else {
            appendChatMessage(effectiveChatId, "assistant", `Reset failed: ${resetResult.error}`, { completed: true, command: command.command, error: true }, userId);
          }
          sendJson(res, resetResult.ok ? 200 : 400, { ok: !!resetResult.ok, chatId: effectiveChatId, command: command.command, result: resetResult });
          broadcast("chat_sync", { chatId: effectiveChatId });
          currentTaskUserId = null;
          return;
        }

        if (["fifo", "random"].includes(requestedMode)) {
          const modeResult = await striderIntegration.handleModeToggle({ mode: requestedMode });
          if (modeResult.ok) {
            appendChatMessage(effectiveChatId, "assistant", `🎯 Strider mode set to ${requestedMode}.`, { completed: true, command: command.command, striderMode: requestedMode }, userId);
          } else {
            appendChatMessage(effectiveChatId, "assistant", `Mode change failed: ${modeResult.error}`, { completed: true, command: command.command, error: true }, userId);
          }
          sendJson(res, modeResult.ok ? 200 : 400, { ok: !!modeResult.ok, chatId: effectiveChatId, command: command.command, result: modeResult });
          broadcast("chat_sync", { chatId: effectiveChatId });
          currentTaskUserId = null;
          return;
        }

        if (enqueueUrl) {
          const enqueueResult = await striderIntegration.handleEnqueue({ url: enqueueUrl });
          if (enqueueResult.ok) {
            appendChatMessage(effectiveChatId, "assistant", `➕ Enqueued URL: ${enqueueUrl}`, { completed: true, command: command.command, striderEnqueue: true }, userId);
          } else {
            appendChatMessage(effectiveChatId, "assistant", `Enqueue failed: ${enqueueResult.error || "invalid URL"}`, { completed: true, command: command.command, error: true }, userId);
          }
          sendJson(res, enqueueResult.ok ? 200 : 400, { ok: !!enqueueResult.ok, chatId: effectiveChatId, command: command.command, result: enqueueResult });
          broadcast("chat_sync", { chatId: effectiveChatId });
          currentTaskUserId = null;
          return;
        }
        
        if (!seedUrls.length) {
          appendChatMessage(effectiveChatId, "assistant", "Use /practice <url> [<url2> ...] to start crawling. Controls: --stats, --stop, --reset, --mode <fifo|random>, --enqueue <url>.", { completed: true, command: command.command }, userId);
          sendJson(res, 200, { ok: true, chatId: effectiveChatId, command: command.command, error: "missing_urls" });
          broadcast("chat_sync", { chatId: effectiveChatId });
          currentTaskUserId = null;
          return;
        }

        try {
          const result = await striderIntegration.handleStart({
            seedUrls,
            workerCount,
            randomWalk
          });
          
          if (result.ok) {
            const statusMsg = `🤖 Strider crawler started!\n\n📍 Seed URLs: ${seedUrls.join(", ")}\n🔧 Workers: ${workerCount}\n🎯 Mode: ${randomWalk ? "Random Walk" : "FIFO"}\n\nCheck stats with: /practice --stats`;
            appendChatMessage(effectiveChatId, "assistant", statusMsg, { completed: true, command: command.command, striderStarted: true }, userId);
          } else {
            appendChatMessage(effectiveChatId, "assistant", `Crawler start failed: ${result.error}`, { completed: true, command: command.command, error: true }, userId);
          }
          
          sendJson(res, 200, { ok: result.ok, chatId: effectiveChatId, command: command.command, crawlerStarted: result.ok });
          broadcast("chat_sync", { chatId: effectiveChatId });
        } catch (err) {
          appendChatMessage(effectiveChatId, "assistant", `Error starting crawler: ${err.message}`, { completed: true, command: command.command, error: true }, userId);
          sendJson(res, 200, { ok: false, chatId: effectiveChatId, command: command.command, error: err.message });
          broadcast("chat_sync", { chatId: effectiveChatId });
        }
        
        currentTaskUserId = null;
        return;
      }

      if (command && explicitSlashAction.kind === "unknown") {
        appendChatMessage(effectiveChatId, "user", rawMessage, { command: command.command }, userId);
        const helpText = buildSlashHelpText();
        appendChatMessage(effectiveChatId, "assistant", `Unknown slash command: /${command.command}\n\n${helpText}`, { completed: true, command: command.command, error: true }, userId);
        sendJson(res, 200, { ok: true, chatId: effectiveChatId, command: command.command, error: "unknown_command", help: helpText });
        broadcast("chat_sync", { chatId: effectiveChatId });
        currentTaskUserId = null;
        return;
      }

      appendChatMessage(effectiveChatId, "user", message, {}, userId);
      sendJson(res, 202, { ok: true, chatId: effectiveChatId, media: mediaAnalysisMeta });

      const { chat } = ensureCurrentChat(userId);
      const models = attachModelRuntimeParams(getActiveModels(chat), getActiveModelParams(chat));
      const chatReply = await answerCasualChat(message, sessionHistory, models, effectiveChatId, null, userId);
      appendChatMessage(effectiveChatId, "assistant", chatReply, { completed: true }, userId);
      agentMsg(chatReply);
      broadcast("chat_sync", { chatId: effectiveChatId });
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

let _browserHeadless = false;         // set once at boot, reused on restart
let _browserRestartInProgress = false;
let _browserRestartCount = 0;
const BROWSER_RESTART_MAX = 5;        // give up after 5 consecutive crashes
const BROWSER_RESTART_DELAY_MS = 2000;

// Named network condition presets for CDP-based throttling. fast-3g and
// slow-3g match the commonly-published Chrome DevTools request-level
// throttling values (1.6Mbps/750Kbps/562.5ms and 50Kbps/50Kbps/2000ms
// respectively) — verified against multiple current sources. "4g" below is
// intentionally NOT claimed as an exact DevTools preset match: naming and
// figures for "Slow 4G" vs "Fast 3G" are inconsistent across Chrome/DevTools
// versions and tools, so this is a reasonable approximate custom profile,
// not a verified canonical figure.
const NETWORK_THROTTLE_PRESETS = Object.freeze({
  "slow-3g": { offline: false, downloadThroughput: 50 * 1024 / 8, uploadThroughput: 50 * 1024 / 8, latency: 2000 },
  "fast-3g": { offline: false, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8, latency: 562.5 },
  "4g-approx": { offline: false, downloadThroughput: 4 * 1024 * 1024 / 8, uploadThroughput: 3 * 1024 * 1024 / 8, latency: 170 },
  "offline": { offline: true, downloadThroughput: 0, uploadThroughput: 0, latency: 0 }
});

/**
 * Opt-in CPU/network throttling via a raw CDP session — the actual
 * controllable mechanism, distinct from (and not blocked by) Playwright's
 * default launch args. Those defaults only stop Chrome's own automatic
 * background-tab throttling; they don't provide a real dial, and removing
 * them wouldn't give you one either. This does.
 *
 * Env vars (both optional, no-op if unset — never affects a normal run
 * unless explicitly requested):
 *   PUPPETEERR_CPU_THROTTLE_RATE   e.g. "4" = 4x slowdown (1 = disabled/normal)
 *   PUPPETEERR_NETWORK_PROFILE     one of NETWORK_THROTTLE_PRESETS keys above
 */
async function applyDevToolsThrottling(page) {
  const cpuRate = Number(process.env.PUPPETEERR_CPU_THROTTLE_RATE || 1);
  const networkProfile = String(process.env.PUPPETEERR_NETWORK_PROFILE || "").trim().toLowerCase();

  if ((!cpuRate || cpuRate <= 1) && !networkProfile) return; // nothing requested, skip entirely

  const client = await page.context().newCDPSession(page);

  if (cpuRate && cpuRate > 1) {
    await client.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });
    console.log(`🐢 CDP CPU throttling active: ${cpuRate}x slowdown`);
  }

  if (networkProfile) {
    const preset = NETWORK_THROTTLE_PRESETS[networkProfile];
    if (!preset) {
      console.warn(`⚠️  Unknown PUPPETEERR_NETWORK_PROFILE "${networkProfile}" — known: ${Object.keys(NETWORK_THROTTLE_PRESETS).join(", ")}`);
    } else {
      await client.send("Network.emulateNetworkConditions", preset);
      console.log(`🐢 CDP network throttling active: ${networkProfile}`);
    }
  }
}

async function launchBrowser(headless) {
  console.log(`🚀 ${_browserRestartCount > 0 ? "Re-l" : "L"}aunching browser (headless=${headless}, attempt=${_browserRestartCount + 1})...`);
  fs.mkdirSync(BROWSER_PROFILE_DIR, { recursive: true });

  // A crashed/killed Chrome process can leave Chromium's singleton lock
  // files behind, which makes the NEXT launch attempt against this same
  // profile dir fail immediately with "Opening in existing browser session"
  // — even though nothing is actually running. This was silently forcing
  // every crash-restart to waste time on a doomed real-Chrome attempt
  // before falling back to Chromium. Clear them before every launch attempt;
  // harmless if they don't exist, and safe here specifically because
  // launchBrowser is only ever called when we've already decided the
  // previous browser instance (if any) is dead (globals nulled first in
  // handleBrowserCrash, or this is a fresh startup).
  for (const lockFile of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
    try { fs.rmSync(path.join(BROWSER_PROFILE_DIR, lockFile), { force: true }); } catch {}
  }

  // Prefer real Google Chrome over bundled Chromium: Chrome carries a genuine
  // client/TLS/JA3 signature that anti-bot systems (Gmail's sign-in wall being
  // a prime example — see the /signin/rejected loop) treat very differently
  // from an obviously-automated Chromium binary. Playwright's `channel: "chrome"`
  // drives the actual installed Chrome instead of the bundled build; if Chrome
  // isn't installed on this machine, fall back to bundled Chromium rather than
  // crashing the whole launch.
  const launchOpts = {
    headless,
    userAgent: FINGERPRINT_USER_AGENT,
    locale: FINGERPRINT_LOCALE,
    timezoneId: FINGERPRINT_TIMEZONE,
    viewport: { width: FINGERPRINT_VIEWPORT_WIDTH, height: FINGERPRINT_VIEWPORT_HEIGHT },
    screen:   { width: FINGERPRINT_VIEWPORT_WIDTH, height: FINGERPRINT_VIEWPORT_HEIGHT },
    // Array form (NOT `true`): excludes only these 3 flags from Playwright's
    // defaults, keeping everything else — including --disable-dev-shm-usage
    // (prevents renderer OOM crashes on small /dev/shm, exactly the crash
    // pattern diagnosed earlier tonight) and Playwright's own sandbox/pipe
    // handling. `ignoreDefaultArgs: true` (strip everything, rebuild by
    // hand) was tried and reverted — it dropped --disable-dev-shm-usage,
    // which is a real regression risk given this environment's tight RAM/
    // zero swap, for a benefit (foreground-tab background-throttling flags)
    // that likely doesn't even apply, since Puppeterr's page stays
    // foregrounded via bringToFront() during real task execution.
    ignoreDefaultArgs: [
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding"
    ],
    args: [
      "--no-sandbox","--disable-setuid-sandbox",
      "--disable-infobars",
      "--window-position=0,0",
      `--window-size=${FINGERPRINT_VIEWPORT_WIDTH},${FINGERPRINT_VIEWPORT_HEIGHT}`
    ]
  };

  let newContext;
  try {
    newContext = await chromium.launchPersistentContext(BROWSER_PROFILE_DIR, {
      ...launchOpts,
      channel: "chrome"
    });
    console.log("🟢 Launched using real Google Chrome (channel: chrome).");
  } catch (chromeErr) {
    console.log(`⚠️ Real Chrome unavailable (${chromeErr?.message || chromeErr}). Falling back to bundled Chromium.`);
    newContext = await chromium.launchPersistentContext(BROWSER_PROFILE_DIR, {
      ...launchOpts,
      executablePath: require("playwright").chromium.executablePath()
    });
  }

await newContext.addInitScript(({ platform, cpuCores }) => {
  const applyOverride = (target, key, value) => {
    try { Object.defineProperty(target, key, { get: () => value, configurable: true }); } catch {}
  };

  // ─────────────────────────────────────────────
  // Navigator Spoofing
  // ─────────────────────────────────────────────
  applyOverride(window.Navigator.prototype, "platform", platform);
  applyOverride(window.Navigator.prototype, "webdriver", false);
  applyOverride(window.Navigator.prototype, "plugins", [1,2,3]);
  applyOverride(window.Navigator.prototype, "languages", ["en-US", "en"]);
  applyOverride(window.Navigator.prototype, "maxTouchPoints", 0);
  applyOverride(window.Navigator.prototype, "hardwareConcurrency", cpuCores);
  // Real chrome.runtime has actual shape — an empty {} is itself a known
  // automation tell some detection scripts check for directly.
  applyOverride(window, "chrome", {
    runtime: {
      connect: () => {},
      sendMessage: () => {},
      onMessage: { addListener: () => {}, removeListener: () => {} },
      id: undefined
    },
    csi: () => {},
    loadTimes: () => ({})
  });

  // navigator.permissions.query({name:'notifications'}) mismatch is a
  // well-known automation tell: real Chrome keeps this in sync with
  // Notification.permission, automated browsers often report it out of
  // sync (e.g. always "prompt" regardless of actual state).
  try {
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => {
      if (parameters && parameters.name === "notifications") {
        return Promise.resolve({
          state: (typeof Notification !== "undefined" ? Notification.permission : "default") === "default"
            ? "prompt"
            : Notification.permission,
          onchange: null
        });
      }
      return originalQuery(parameters);
    };
  } catch {}

  // outerWidth/outerHeight stuck at 0 while inner* is set is a known
  // headless/CDP artifact — real browser windows never have this gap.
  try {
    if (!window.outerWidth || window.outerWidth === 0) {
      applyOverride(window, "outerWidth", window.innerWidth);
    }
    if (!window.outerHeight || window.outerHeight === 0) {
      applyOverride(window, "outerHeight", window.innerHeight + 85); // + approx chrome UI height
    }
  } catch {}

  // ─────────────────────────────────────────────
  // WebGL Spoofing
  // ─────────────────────────────────────────────
  const getParameterProxy = (original) => {
    return function(parameter) {
      if (parameter === 37445) return "Intel Inc.";                 // UNMASKED_VENDOR_WEBGL
      if (parameter === 37446) return "Intel Iris OpenGL Engine";   // UNMASKED_RENDERER_WEBGL
      return original.call(this, parameter);
    };
  };

  const patchWebGL = (type) => {
    const proto = type.prototype;
    if (proto.getParameter) {
      proto.getParameter = getParameterProxy(proto.getParameter);
    }
  };

  patchWebGL(WebGLRenderingContext);
  patchWebGL(WebGL2RenderingContext);

  // ─────────────────────────────────────────────
  // Canvas Fingerprint Noise
  // ─────────────────────────────────────────────
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function(...args) {
    const ctx = this.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "rgba(0,0,0,0.01)";
      ctx.fillRect(0, 0, 1, 1);
    }
    return originalToDataURL.apply(this, args);
  
  };
  // ─────────────────────────────────────────────
  // Audio Fingerprint Spoofing
  // ─────────────────────────────────────────────
  const originalGetChannelData = AudioBuffer.prototype.getChannelData;
  AudioBuffer.prototype.getChannelData = function(...args) {
    const data = originalGetChannelData.apply(this, args);
   // Add tiny noise to avoid identical fingerprints
   const noise = 0.000001 * (Math.random() - 0.5);
   for (let i = 0; i < data.length; i += 100) {
     data[i] = data[i] + noise;
   }
    return data;
  };

  const originalSampleRate = AudioContext.prototype.sampleRate;
  Object.defineProperty(AudioContext.prototype, "sampleRate", {
    get() {
      return originalSampleRate + 0.0001; // tiny offset
    }
  });

}, { platform: FINGERPRINT_PLATFORM, cpuCores: FINGERPRINT_CPU_CORES });


  await installVoidElementMapInitScript(newContext).catch((err) => {
    console.warn("⚠️  VOID element-map init script install failed:", err.message);
  });

  const newBrowser = newContext.browser();
  const newPage   = newContext.pages()[0] || await newContext.newPage();
  await newPage.bringToFront().catch(() => {});

  // Opt-in CPU/network throttling via CDP — this is the actual controllable
  // mechanism, not fighting Playwright's default anti-throttling launch
  // flags (--disable-background-timer-throttling etc., which only stop
  // Chrome's automatic background-tab throttling and don't provide a real
  // dial anyway). Gated behind env vars so normal task runs are unaffected
  // unless explicitly requested — useful for stress-testing under degraded
  // conditions (see PUPPETEERR_CPU_THROTTLE_RATE / PUPPETEERR_NETWORK_PROFILE).
  await applyDevToolsThrottling(newPage).catch(err => {
    console.warn("⚠️  CDP throttling setup failed (non-fatal):", err.message);
  });

  await newContext.setDefaultNavigationTimeout(90000);
  await newContext.setDefaultTimeout(45000);
  await newContext.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
  await newPage.setViewportSize({ width: FINGERPRINT_VIEWPORT_WIDTH, height: FINGERPRINT_VIEWPORT_HEIGHT }).catch(() => {});
  await newPage.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });

  // ── Crash / disconnect handlers ───────────────────────────────────────────
  // Covers every way Playwright/Chromium can die unexpectedly.

  function wireCrashHandlersToPage(p) {
    if (!p || p.__crashWired) return;
    p.__crashWired = true;

    // page.on("crash") — renderer process crashed (tab crash, OOM in renderer)
    p.on("crash", () => handleBrowserCrash("page renderer crashed (tab crash / OOM)"));

    // page.on("close") — page was closed unexpectedly (not by our own code)
    // Only treat as crash if the context is still open — otherwise it's normal tab cleanup
    p.on("close", () => {
      const contextAlive = (() => { try { return newContext.pages().length >= 0; } catch { return false; } })();
      if (!contextAlive) return; // context already dead — browser crash handler covers it
      // If this was our primary page and nothing else is open, treat as crash
      if (page === p) {
        const remaining = (() => { try { return newContext.pages().filter(x => !x.isClosed()); } catch { return []; } })();
        if (!remaining.length) handleBrowserCrash("primary page closed unexpectedly");
      }
    });
  }

  // Wire to the initial page
  wireCrashHandlersToPage(newPage);

  // Wire to any new pages opened mid-session (new tabs, popups)
  newContext.on("page", (p) => wireCrashHandlersToPage(p));

  // context "close" — entire browser context died (most common on kill -9 chrome)
  newContext.on("close", () => handleBrowserCrash("browser context closed unexpectedly"));

  // browser "disconnected" — WebSocket to Chromium dropped (Playwright lost contact)
  if (newBrowser && newBrowser.on) {
    newBrowser.on("disconnected", () => handleBrowserCrash("browser WebSocket disconnected (Playwright lost contact)"));
  }

  return { browser: newBrowser, context: newContext, page: newPage };
}

async function handleBrowserCrash(reason) {
  if (_browserRestartInProgress) return; // already restarting
  _browserRestartInProgress = true;
  _browserRestartCount++;

  console.error(`💥 Browser crashed: ${reason} (restart #${_browserRestartCount})`);
  broadcast("status", { msg: `⚠️ Browser crashed — restarting (attempt ${_browserRestartCount})...` });

  // If a task was running, mark it as aborted cleanly
  if (agentRunning) {
    agentRunning = false;
    broadcast("task_done", { answer: "Task interrupted — browser crashed and is restarting.", completed: false, aborted: true });
    if (currentTaskChatId) {
      appendChatMessage(currentTaskChatId, "assistant",
        "⚠️ The browser crashed mid-task and is restarting. Please retry your request once it's back.",
        { completed: false, error: true }, currentTaskUserId);
      broadcast("chat_sync", { chatId: currentTaskChatId });
    }
    currentTaskUserId = null;
    currentTaskChatId = null;
  }

  if (_browserRestartCount > BROWSER_RESTART_MAX) {
    console.error(`❌ Browser crashed ${_browserRestartCount} times — giving up. Restart the server.`);
    broadcast("status", { msg: "❌ Browser failed to restart after multiple attempts. Please restart the server." });
    _browserRestartInProgress = false;
    return;
  }

  // Brief delay before restarting so the OS can reclaim resources
  await new Promise(r => setTimeout(r, BROWSER_RESTART_DELAY_MS * Math.min(_browserRestartCount, 3)));

  try {
    // Null out globals so ensureActivePage doesn't try to use the dead context
    browser = null; context = null; page = null;

    const launched = await launchBrowser(_browserHeadless);
    browser = launched.browser;
    context = launched.context;
    page    = launched.page;

    if (striderIntegration) striderIntegration.setPage(page);

    // Navigate back to the last stable page before the crash, or START_URL as fallback
    const stableUrl = loadStablePage();
    const recoveryUrl = stableUrl || process.env.START_URL || "https://www.google.com";
    console.log(`↩️  Restoring to last stable page: ${recoveryUrl}`);
    broadcast("status", { msg: `↩️ Restoring to last stable page: ${recoveryUrl}` });
    await page.goto(recoveryUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch((err) => {
      console.warn(`⚠️  Could not restore stable page (${err.message}) — falling back to Google`);
      return page.goto("https://www.google.com", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
    });

    _browserRestartCount = 0; // reset streak on successful restart
    _browserRestartInProgress = false;

    console.log("✅ Browser restarted successfully.");
    broadcast("status", { msg: "✅ Browser restarted and ready." });
    broadcast("url", { url: page.url() });
  } catch (err) {
    _browserRestartInProgress = false;
    console.error("❌ Browser restart failed:", err.message);
    broadcast("status", { msg: `❌ Browser restart failed: ${err.message}` });
    // Try again after a longer delay
    setTimeout(() => handleBrowserCrash("restart failed, retrying"), BROWSER_RESTART_DELAY_MS * 5);
  }
}

(async () => {
  try {
    if (!CF_API_TOKEN || !CF_ACCOUNT_ID) {
      console.error("❌ Missing CF_API_TOKEN or CF_ACCOUNT_ID"); process.exit(1);
    }

    await runCloudflareStartupPreflight();

    const browserHeadlessEnv = String(process.env.PUPPETERR_HEADLESS || "").trim().toLowerCase();
    if (browserHeadlessEnv === "false" || browserHeadlessEnv === "0" || browserHeadlessEnv === "no") {
      _browserHeadless = false;
    } else if (browserHeadlessEnv === "true" || browserHeadlessEnv === "1" || browserHeadlessEnv === "yes") {
      _browserHeadless = true;
    } else {
      _browserHeadless = !process.env.DISPLAY;
    }

    if (!process.env.DISPLAY && _browserHeadless === false) {
      console.warn("⚠️  No DISPLAY detected; forcing headless browser mode.");
      _browserHeadless = true;
    }

    const launched = await launchBrowser(_browserHeadless);
    browser = launched.browser;
    context = launched.context;
    page    = launched.page;

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
      saveStablePage(startUrl);
    } else {
      console.log("↩️ Reusing persistent page: " + currentUrl);
      saveStablePage(currentUrl);
    }
    ensureCurrentChat(null);
    loadLearningLog();

    server.listen(PORT, HOST, () => {
      console.log(`\n✅ AGI Terminal running!`);
      console.log(`   Open: http://localhost:${PORT}`);
      console.log(`   (Codespaces: forward port ${PORT})\n`);
      try {
        striderIntegration = new StriderIntegration({ broadcast });
        striderIntegration.setPage(page);
        console.log(`✅ Strider crawler ready\n`);
      } catch (err) {
        console.warn(`⚠️  Strider initialization failed: ${err.message}`);
      }
    });

    setInterval(async () => {
      if (page) {
        try {
          const currentUrl = page.url();
          broadcast("url", { url: currentUrl });
          // Checkpoint the last stable URL — written only when page.url() succeeds
          // (meaning the page is alive and not mid-crash)
          saveStablePage(currentUrl);
        } catch {}
      }
    }, 2000);

    await new Promise(() => {});

  } catch (err) {
    console.error("Oh shit I died; Fatal:", err);
    process.exit(1);
  }
})();
