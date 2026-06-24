const playwright = require("playwright");
const readline = require("readline");
const fs = require("fs");
const actions = require("./actions");

const CF_API_TOKEN = process.env.CF_API_TOKEN;
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const MODEL = "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b";

let browser, context, page;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => rl.question(q, ans => { rl.close(); res(ans); }));
}

function stripThinking(t) {
  return t.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

// Pull a JSON array out of a model response that may be fenced or wrapped in prose.
function extractSteps(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  let s = fenced ? fenced[1] : text;
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start !== -1 && end !== -1) s = s.slice(start, end + 1);
  return JSON.parse(s);
}

async function callLLM(system, user) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${MODEL}`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        max_tokens: 1024
      })
    }
  );

  const data = await res.json();
  if (!data.success) {
    throw new Error("CF AI error: " + JSON.stringify(data.errors || data));
  }
  return stripThinking(data.result.response);
}

// ─────────────────────────────────────────────
// AGENTS
// ─────────────────────────────────────────────

async function agentA(goal) {
  const sys = `You are Agent A (planner). Output ONLY a clarified version of the goal.`;
  return await callLLM(sys, goal);
}

async function agentB(prompt) {
  const sys = `You are Agent B (prompt checker). Output ONLY the validated prompt.`;
  return await callLLM(sys, prompt);
}

async function agentC(validated) {
  const sys = `You are Agent C (task steps). Output ONLY a numbered list of browser actions.`;
  return await callLLM(sys, validated);
}

const ACTION_NAMES = Object.keys(actions);

async function agentD(steps, hint = "") {
  const sys = `You are Agent D (action compiler).
Convert the numbered steps into a JSON array of browser actions.

Output ONLY a JSON array. No prose, no markdown fences, no explanation.

Each element is an object: { "action": "<name>", ...params }.
You may ONLY use these action names:
${ACTION_NAMES.join(", ")}

Common params:
- goto:  { "action": "goto", "url": "https://..." }
- click: { "action": "click", "selector": "css selector" }
- fill:  { "action": "fill", "selector": "css selector", "text": "value" }
- type:  { "action": "type", "selector": "css selector", "text": "value" }
- press: { "action": "press", "selector": "css selector", "key": "Enter" }
- waitForSelector: { "action": "waitForSelector", "selector": "css selector" }

Example:
[
  { "action": "goto", "url": "https://www.google.com" },
  { "action": "fill", "selector": "textarea[name='q']", "text": "cats" },
  { "action": "press", "selector": "textarea[name='q']", "key": "Enter" }
]`;
  return await callLLM(sys, steps + (hint ? "\n\n" + hint : ""));
}

// ─────────────────────────────────────────────
// EXECUTE ACTIONS (safe library only — no arbitrary code)
// ─────────────────────────────────────────────

async function runSteps(steps) {
  if (!Array.isArray(steps)) {
    throw new Error("Expected an array of steps, got: " + typeof steps);
  }
  for (const step of steps) {
    const { action, ...params } = step || {};
    const fn = actions[action];
    if (typeof fn !== "function") {
      console.log("Skipping unknown action:", action);
      continue;
    }
    console.log("-> " + action, params);
    const result = await fn({ page, context, browser, ...params });
    if (result !== undefined && typeof result !== "object") {
      console.log("   result:", result);
    }
  }
}

// ─────────────────────────────────────────────
// MAIN LOOP
// ─────────────────────────────────────────────

async function runPipeline(rawGoal) {
  console.log("\n=== PIPELINE START ===");

  const goal = await agentA(rawGoal);
  const validated = await agentB(goal);
  const stepList = await agentC(validated);

  let raw = await agentD(stepList);
  let steps;
  try {
    steps = extractSteps(raw);
  } catch (err) {
    console.log("Could not parse actions, retrying Agent D...", err.message);
    raw = await agentD(stepList, "Your previous output was not valid JSON. Output ONLY a JSON array.");
    steps = extractSteps(raw);
  }

  await runSteps(steps);

  console.log("=== PIPELINE END ===\n");
}

// ─────────────────────────────────────────────
// BROWSER LAUNCH
// ─────────────────────────────────────────────

function findChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const candidates = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    `${process.env.HOME || ""}/.local/bin/google-chrome`
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null; // fall back to Playwright's bundled Chromium
}

// ─────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────

(async () => {
  if (!CF_API_TOKEN || !CF_ACCOUNT_ID) {
    console.error("Missing CF_API_TOKEN or CF_ACCOUNT_ID env vars.");
    process.exit(1);
  }

  const chromePath = findChrome();
  const launchOpts = {
    headless: process.env.HEADLESS === "1",
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
    console.log("Using Chrome at " + chromePath);
  } else {
    console.log("Using Playwright's bundled Chromium");
  }

  browser = await playwright.chromium.launch(launchOpts);
  context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await context.newPage();

  await page.goto("https://www.google.com");

  try {
    while (true) {
      const goal = await ask("Goal (or exit): ");
      if (goal.trim().toLowerCase() === "exit") break;
      try {
        await runPipeline(goal);
      } catch (err) {
        console.log("Pipeline error:", err.message);
      }
    }
  } finally {
    await browser.close();
  }
})();
