/**
 * pipeline.js — Autonomous multi-agent browser pipeline.
 *
 * Flow:
 *   Agent A (planner)  -> clarifies the raw goal
 *   Agent B (checker)  -> validates / tightens the prompt
 *   Agent C (tasker)   -> produces a high-level numbered plan
 *   Agent D (compiler) -> turns the plan + live page state into JSON actions
 *   Goal checker       -> decides when the goal is achieved
 *
 * Actions are ONLY ever run through the safe library in actions.js — no
 * arbitrary code execution. The loop observes the page, asks the model for the
 * next 1-3 actions, runs them, feeds back results/errors, and repeats until the
 * goal is met or MAX_STEPS is hit.
 */

const playwright = require("playwright");
const readline = require("readline");
const fs = require("fs");
const path = require("path");
const actions = require("./actions");

// ─────────────────────────────────────────────
// CONFIG (env-driven)
// ─────────────────────────────────────────────
const CFG = {
  CF_API_TOKEN: process.env.CF_API_TOKEN,
  CF_ACCOUNT_ID: process.env.CF_ACCOUNT_ID,
  MODEL: process.env.MODEL || "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
  MAX_STEPS: parseInt(process.env.MAX_STEPS || "15", 10),
  HEADLESS: process.env.HEADLESS === "1",
  START_URL: process.env.START_URL || "https://www.google.com",
  CHROME_PATH: process.env.CHROME_PATH || "",
  SESSION_FILE: process.env.SESSION_FILE || "session.json",
  SCREENSHOT_DIR: process.env.SCREENSHOT_DIR || "screenshots",
  LLM_TIMEOUT_MS: parseInt(process.env.LLM_TIMEOUT_MS || "60000", 10),
  LLM_RETRIES: parseInt(process.env.LLM_RETRIES || "2", 10)
};

const ACTION_NAMES = Object.keys(actions);

let browser, context, page;
let shuttingDown = false;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─────────────────────────────────────────────
// LOGGING
// ─────────────────────────────────────────────
function log(level, ...args) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${level.padEnd(5)} |`, ...args);
}
const truncate = (s, n = 400) =>
  typeof s === "string" && s.length > n ? s.slice(0, n) + "…" : s;

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => rl.question(q, ans => { rl.close(); res(ans); }));
}

// ─────────────────────────────────────────────
// LLM
// ─────────────────────────────────────────────
function stripThinking(t) {
  return t.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

async function callLLM(system, user) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CFG.CF_ACCOUNT_ID}/ai/run/${CFG.MODEL}`;
  let lastErr;
  for (let attempt = 0; attempt <= CFG.LLM_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CFG.LLM_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${CFG.CF_API_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: system },
            { role: "user", content: user }
          ],
          max_tokens: 1024
        }),
        signal: controller.signal
      });
      const data = await res.json();
      if (!data.success) throw new Error("CF AI error: " + JSON.stringify(data.errors || data));
      return stripThinking(data.result.response);
    } catch (err) {
      lastErr = err;
      if (attempt < CFG.LLM_RETRIES) {
        log("WARN", `LLM call failed (${err.message}); retry ${attempt + 1}/${CFG.LLM_RETRIES}`);
        await sleep(1000 * (attempt + 1));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

// Pull a JSON array (or single object) out of a possibly fenced / prose response.
function extractSteps(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  let s = fenced ? fenced[1] : text;
  const a = s.indexOf("[");
  const b = s.lastIndexOf("]");
  if (a !== -1 && b !== -1 && b > a) {
    s = s.slice(a, b + 1);
  } else {
    const oa = s.indexOf("{");
    const ob = s.lastIndexOf("}");
    if (oa !== -1 && ob !== -1) s = "[" + s.slice(oa, ob + 1) + "]";
  }
  const parsed = JSON.parse(s);
  return Array.isArray(parsed) ? parsed : [parsed];
}

// ─────────────────────────────────────────────
// AGENTS
// ─────────────────────────────────────────────
async function agentA(goal) {
  return callLLM(
    `You are Agent A (planner). Restate the user's goal as a single clear, concrete sentence. Output ONLY the clarified goal.`,
    goal
  );
}

async function agentB(prompt) {
  return callLLM(
    `You are Agent B (prompt checker). Fix ambiguity and make the goal verifiable. Output ONLY the validated goal.`,
    prompt
  );
}

async function agentC(validated) {
  return callLLM(
    `You are Agent C (tasker). Break the goal into a short numbered list of high-level browser steps. Output ONLY the numbered list.`,
    validated
  );
}

function agentDSystemPrompt() {
  return `You are Agent D (action compiler) inside an observe-think-act loop.
Given the goal, the plan, the recent history, and the CURRENT page state, output the NEXT 1-3 browser actions to make progress.

Output ONLY a JSON array of action objects. No prose, no markdown fences.
Each object: { "action": "<name>", ...params }.
You may ONLY use these actions:
${ACTION_NAMES.join(", ")}

Param shapes:
- { "action": "goto", "url": "https://..." }
- { "action": "click", "selector": "css selector" }
- { "action": "fill", "selector": "css selector", "text": "value" }
- { "action": "type", "selector": "css selector", "text": "value" }
- { "action": "press", "selector": "css selector", "key": "Enter" }
- { "action": "waitForSelector", "selector": "css selector" }
- { "action": "getText", "selector": "css selector" }
- { "action": "getAllText" }

Rules:
- Prefer selectors from the "Interactive elements" list when available.
- Keep batches small (1-3 actions). Use one navigation/submit per batch.
- If the previous batch errored, choose a different selector or approach.
- Use Google's search box selector: textarea[name='q'].`;
}

async function agentD(userContext) {
  return callLLM(agentDSystemPrompt(), userContext);
}

async function checkGoalDone(goal, state) {
  const res = await callLLM(
    `You are a strict goal-checking assistant. Reply with ONLY "YES" or "NO" then one short reason. Say YES only if the goal is clearly and fully achieved.`,
    `Goal: "${goal}"
URL: ${state.url}
Title: ${state.title}
Visible text (truncated):
${truncate(state.text, 1500)}`
  );
  log("CHECK", res.split("\n")[0]);
  return /^\s*YES\b/i.test(res);
}

// ─────────────────────────────────────────────
// OBSERVE
// ─────────────────────────────────────────────
async function getPageState() {
  const url = page.url();
  let title = "";
  try { title = await page.title(); } catch { /* page may be navigating */ }

  const data = await page.evaluate(() => {
    const text = document.body ? document.body.innerText.slice(0, 2000) : "";
    const els = [];
    const sel = "a, button, input, textarea, select, [role=button]";
    const nodes = Array.from(document.querySelectorAll(sel)).slice(0, 40);
    for (const el of nodes) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      let hint = el.tagName.toLowerCase();
      if (el.id) hint += `#${el.id}`;
      else if (el.name) hint += `[name='${el.name}']`;
      else if (el.getAttribute("aria-label")) hint += `[aria-label='${el.getAttribute("aria-label")}']`;
      const label = (el.innerText || el.value || el.placeholder || "").trim().slice(0, 50);
      els.push(`${hint}${label ? ` — "${label}"` : ""}`);
    }
    return { text, els: els.slice(0, 25) };
  }).catch(() => ({ text: "", els: [] }));

  return { url, title, text: data.text, elements: data.els };
}

// ─────────────────────────────────────────────
// EXECUTE (safe library only)
// ─────────────────────────────────────────────
async function runSteps(steps) {
  const results = [];
  for (const step of steps) {
    const { action, ...params } = step || {};
    const fn = actions[action];
    if (typeof fn !== "function") {
      log("WARN", "Unknown action:", action);
      results.push({ action, ok: false, error: "unknown action" });
      continue;
    }
    log("ACT", action, JSON.stringify(params));
    try {
      const value = await fn({ page, context, browser, ...params });
      const out = value !== undefined && typeof value !== "object" ? truncate(String(value), 200) : undefined;
      if (out !== undefined) log("OUT", out);
      results.push({ action, ok: true, value: out });
    } catch (err) {
      log("ERR", action, "→", err.message.split("\n")[0]);
      results.push({ action, ok: false, error: err.message.split("\n")[0] });
      break; // stop the batch; the error is fed back next step
    }
  }
  return results;
}

// ─────────────────────────────────────────────
// AGENT LOOP
// ─────────────────────────────────────────────
async function runAgent(rawGoal) {
  log("INFO", "=== PIPELINE START ===");
  log("INFO", "Raw goal:", rawGoal);

  const clarified = await agentA(rawGoal);
  const validated = await agentB(clarified);
  const plan = await agentC(validated);
  log("PLAN", "\n" + plan);

  const history = [];

  for (let step = 1; step <= CFG.MAX_STEPS && !shuttingDown; step++) {
    log("INFO", `── STEP ${step}/${CFG.MAX_STEPS} ──`);
    const state = await getPageState();
    log("STATE", `${state.title || "(no title)"} | ${state.url}`);

    await saveScreenshot(`step-${step}`);

    if (step > 1 && await checkGoalDone(validated, state)) {
      log("DONE", "Goal achieved.");
      break;
    }

    const userContext = `Goal: "${validated}"

Plan:
${plan}

Recent history:
${history.slice(-6).map((h, i) => `${i + 1}. ${h}`).join("\n") || "none"}

Current page:
URL: ${state.url}
Title: ${state.title}
Interactive elements:
${state.elements.map(e => "  - " + e).join("\n") || "  (none detected)"}

Visible text (truncated):
${truncate(state.text, 1200)}

Output the next 1-3 actions as JSON.`;

    let raw;
    try {
      raw = await agentD(userContext);
    } catch (err) {
      log("ERR", "Agent D failed:", err.message);
      break;
    }

    let steps;
    try {
      steps = extractSteps(raw);
    } catch {
      log("WARN", "Bad JSON from Agent D, retrying once...");
      try {
        raw = await agentD(userContext + "\n\nYour last output was not valid JSON. Output ONLY a JSON array.");
        steps = extractSteps(raw);
      } catch (err) {
        log("ERR", "Agent D still produced invalid JSON:", err.message);
        history.push("Agent D produced invalid JSON.");
        continue;
      }
    }

    if (!steps.length) {
      log("WARN", "Empty action list; skipping.");
      continue;
    }

    const results = await runSteps(steps);
    for (const r of results) {
      history.push(
        r.ok
          ? `${r.action} OK${r.value !== undefined ? " → " + r.value : ""}`
          : `${r.action} FAILED: ${r.error}`
      );
    }

    await sleep(1200);
  }

  log("INFO", "=== PIPELINE END ===");
  log("INFO", "History:\n  " + history.join("\n  "));
}

// ─────────────────────────────────────────────
// BROWSER / SESSION
// ─────────────────────────────────────────────
function findChrome() {
  if (CFG.CHROME_PATH && fs.existsSync(CFG.CHROME_PATH)) return CFG.CHROME_PATH;
  const candidates = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    `${process.env.HOME || ""}/.local/bin/google-chrome`
  ];
  for (const c of candidates) if (c && fs.existsSync(c)) return c;
  return null; // fall back to Playwright's bundled Chromium
}

async function saveScreenshot(name) {
  try {
    if (!fs.existsSync(CFG.SCREENSHOT_DIR)) fs.mkdirSync(CFG.SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(CFG.SCREENSHOT_DIR, `${name}.png`) });
  } catch (err) {
    log("WARN", "Screenshot failed:", err.message.split("\n")[0]);
  }
}

async function saveSession() {
  try {
    if (!context) return;
    const state = await context.storageState();
    fs.writeFileSync(CFG.SESSION_FILE, JSON.stringify(state, null, 2));
    log("INFO", "Session saved to", CFG.SESSION_FILE);
  } catch (err) {
    log("WARN", "Could not save session:", err.message.split("\n")[0]);
  }
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  log("INFO", "Shutting down...");
  await saveSession();
  try { if (browser) await browser.close(); } catch { /* ignore */ }
  process.exit(0);
}

// ─────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────
(async () => {
  if (!CFG.CF_API_TOKEN || !CFG.CF_ACCOUNT_ID) {
    console.error("Missing CF_API_TOKEN or CF_ACCOUNT_ID env vars.");
    process.exit(1);
  }

  const chromePath = findChrome();
  const launchOpts = {
    headless: CFG.HEADLESS,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-infobars",
      "--disable-blink-features=AutomationControlled",
      "--window-size=1280,800"
    ]
  };
  if (chromePath) {
    launchOpts.executablePath = chromePath;
    log("INFO", "Using Chrome at", chromePath);
  } else {
    log("INFO", "Using Playwright's bundled Chromium");
  }

  browser = await playwright.chromium.launch(launchOpts);

  const hasSession = fs.existsSync(CFG.SESSION_FILE);
  context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    storageState: hasSession ? CFG.SESSION_FILE : undefined
  });
  if (hasSession) log("INFO", "Loaded session from", CFG.SESSION_FILE);

  page = await context.newPage();

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await page.goto(CFG.START_URL, { waitUntil: "domcontentloaded" });

  try {
    while (!shuttingDown) {
      const goal = await ask("\nGoal (or 'exit'): ");
      if (!goal.trim() || goal.trim().toLowerCase() === "exit") break;
      try {
        await runAgent(goal);
        await saveSession();
      } catch (err) {
        log("ERR", "Pipeline error:", err.message);
      }
    }
  } finally {
    await saveSession();
    try { if (browser) await browser.close(); } catch { /* ignore */ }
  }
})();
