const { chromium } = require("playwright-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const readline = require("readline");
const fs = require("fs");
const vm = require("vm");

chromium.use(StealthPlugin());

const CF_API_TOKEN = process.env.CF_API_TOKEN;
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const MODEL = "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b";
const SESSION_FILE = "session1.json";
const MAX_STEPS = 20;

let browser, context, page;
let stepLog = [];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function askQuestion(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(query, ans => { rl.close(); resolve(ans); }));
}

// ── STRIP <think> blocks from DeepSeek R1 responses ──────────────────────────
function stripThinking(text) {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

// ── Extract code block from markdown if present ───────────────────────────────
function extractCode(text) {
  const fenced = text.match(/```(?:javascript|js)?\n([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  // If no code block, return as-is (maybe it's raw code)
  return text.trim();
}

// ── Call DeepSeek via Cloudflare Workers AI ───────────────────────────────────
async function askDeepSeek(messages) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${MODEL}`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ messages, max_tokens: 1024 })
    }
  );
  const data = await res.json();
  if (!data.success) throw new Error("CF AI error: " + JSON.stringify(data.errors));
  return stripThinking(data.result.response);
}

// ── Take screenshot and return base64 ────────────────────────────────────────
async function getScreenshotB64() {
  const buf = await page.screenshot({ type: "jpeg", quality: 60 });
  return buf.toString("base64");
}

// ── Get page state summary (URL + title + visible text snippet) ───────────────
async function getPageState() {
  const url = page.url();
  const title = await page.title();
  // Get visible text (truncated) — way cheaper than full DOM
  const text = await page.evaluate(() => {
    return document.body
      ? document.body.innerText.slice(0, 2000)
      : "";
  });
  return { url, title, text };
}

// ── Safely execute Playwright code returned by DeepSeek ──────────────────────
// Runs in a vm sandbox with page/sleep injected
async function executeCode(code) {
  console.log("\n📦 Executing:\n" + code + "\n");
  try {
    const script = new vm.Script(`(async () => { ${code} })()`);
    const sandbox = {
      page,
      sleep,
      console,
      // expose common Playwright helpers so DeepSeek can use them
      waitFor: (sel, opts) => page.waitForSelector(sel, opts),
      click: (sel) => page.click(sel),
      fill: (sel, val) => page.fill(sel, val),
      type: (sel, val, opts) => page.type(sel, val, opts),
      goto: (url) => page.goto(url, { waitUntil: "domcontentloaded" }),
      screenshot: () => page.screenshot({ path: "view.png" }),
      url: () => page.url(),
    };
    vm.createContext(sandbox);
    await script.runInContext(sandbox);
    return { ok: true };
  } catch (err) {
    console.log("❌ Execution error: " + err.message);
    return { ok: false, error: err.message };
  }
}

// ── Check if goal is done by asking DeepSeek ─────────────────────────────────
async function checkGoalDone(goal, state) {
  const prompt = `Goal: "${goal}"
Current URL: ${state.url}
Page title: ${state.title}
Page text snippet: ${state.text}

Is the goal achieved? Reply with ONLY "YES" or "NO" and one sentence why.`;

  const res = await askDeepSeek([
    { role: "system", content: "You are a goal-checking assistant. Be strict. Only say YES if the goal is clearly and fully achieved." },
    { role: "user", content: prompt }
  ]);

  console.log("🎯 Goal check: " + res);
  return res.toUpperCase().startsWith("YES");
}

// ── Main agent loop ───────────────────────────────────────────────────────────
async function runAgent(goal) {
  console.log("\n🤖 AGENT START");
  console.log("🎯 Goal: " + goal);
  console.log("─".repeat(50));

  const history = [
    {
      role: "system",
      content: `You are a browser automation agent controlling a Playwright browser.
Your job is to achieve the user's goal step by step.

Rules:
- Output ONLY raw JavaScript code using Playwright's \`page\` object. No prose, no explanation.
- Use async/await. The code runs inside an async function so await is available.
- Use \`await sleep(ms)\` for waits.
- Use \`await page.goto(url)\` to navigate.
- Use \`await page.click(selector)\` to click.
- Use \`await page.fill(selector, value)\` to fill inputs.
- Use \`await page.waitForSelector(selector)\` to wait for elements.
- Keep each step small — one or two actions max.
- If you're unsure, navigate to the page first and wait.
- NEVER output markdown, backticks, or explanations. Raw JS only.`
    }
  ];

  for (let step = 1; step <= MAX_STEPS; step++) {
    console.log(`\n${"═".repeat(50)}`);
    console.log(`STEP ${step}/${MAX_STEPS}`);

    // Get current page state
    const state = await getPageState();
    const screenshotB64 = await getScreenshotB64();

    console.log(`📍 URL: ${state.url}`);
    console.log(`📄 Title: ${state.title}`);

    // Save screenshot for viewing
    const buf = Buffer.from(screenshotB64, "base64");
    fs.writeFileSync("view.png", buf);

    // Check if goal is already done
    if (step > 1) {
      const done = await checkGoalDone(goal, state);
      if (done) {
        console.log("\n✅ GOAL ACHIEVED! Agent stopping.");
        break;
      }
    }

    // Build prompt for this step
    const stepPrompt = `Goal: "${goal}"
Step: ${step}
Current URL: ${state.url}
Page title: ${state.title}
Page visible text:
${state.text}

Step log so far:
${stepLog.map((s, i) => `${i+1}. ${s}`).join("\n") || "none"}

What is the next single action to take? Output ONLY Playwright JS code.`;

    history.push({ role: "user", content: stepPrompt });

    console.log("🧠 Asking DeepSeek...");
    let code;
    try {
      const response = await askDeepSeek(history);
      code = extractCode(response);
      history.push({ role: "assistant", content: response });
    } catch (err) {
      console.log("❌ DeepSeek error: " + err.message);
      await sleep(2000);
      continue;
    }

    if (!code || code.length < 5) {
      console.log("⚠️  DeepSeek returned empty code, retrying...");
      continue;
    }

    // Execute the code
    const result = await executeCode(code);
    stepLog.push(`Step ${step}: ${code.slice(0, 80)}... → ${result.ok ? "OK" : "ERROR: " + result.error}`);

    if (!result.ok) {
      // Feed the error back so DeepSeek can self-correct
      history.push({
        role: "user",
        content: `That code threw an error: "${result.error}". Try a different approach.`
      });
    }

    // Wait a beat for page to settle
    await sleep(1500);
  }

  console.log("\n📋 STEP LOG:");
  stepLog.forEach(s => console.log("  " + s));
}

// ── Boot ──────────────────────────────────────────────────────────────────────
(async () => {
  try {
    // Validate env vars
    if (!CF_API_TOKEN || !CF_ACCOUNT_ID) {
      console.error("❌ Missing CF_API_TOKEN or CF_ACCOUNT_ID env vars!");
      process.exit(1);
    }

    console.log("🚀 Launching browser...");
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"]
    });

    const hasSession = fs.existsSync(SESSION_FILE);
    context = await browser.newContext({
      storageState: hasSession ? SESSION_FILE : undefined,
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      locale: "en-US",
      viewport: { width: 1280, height: 800 }
    });

    page = await context.newPage();

    if (hasSession) {
      console.log("📋 Loaded saved session from " + SESSION_FILE);
    }

    // Start on Google (looks human)
    await page.goto("https://www.google.com", { waitUntil: "domcontentloaded" });
    await sleep(1000);

    // Ask user for goal
    console.log("\n🤖 Autonomous Browser Agent");
    console.log("   Powered by DeepSeek R1 + Playwright");
    console.log("   Screenshots save to view.png each step\n");

    const goal = await askQuestion("🎯 What is your goal? > ");
    if (!goal.trim()) {
      console.log("No goal given, exiting.");
      process.exit(0);
    }

    await runAgent(goal);

    console.log("\nDone! Press Ctrl+C to exit.");
    await new Promise(() => {});

  } catch (err) {
    console.error("💥 Fatal:", err);
    process.exit(1);
  }
})();