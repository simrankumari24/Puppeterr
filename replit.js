const express = require("express");
const { chromium } = require("playwright");
const fs = require("fs");
const readline = require("readline");

const EMAIL = "Naimish.sah@gmail.com";
const PASSWORD = "N@imish@1";
const PROJECT_URL = "https://replit.com/@supermanss/Eaglercraft-112-Server-Hosting";
const SESSION_FILE = "session.json";
const PORT = 8080;

const app = express();
app.use(express.json());

let page = null;
let context = null;
let browser = null;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// --+-- BLOCK 7: SEE MODE (served via /screenshot) --+--
app.get("/screenshot", async (req, res) => {
  if (!page) return res.status(500).send("No page yet");
  try {
    const buf = await page.screenshot({ type: "jpeg", quality: 80 });
    res.set("Content-Type", "image/jpeg");
    res.set("Cache-Control", "no-store");
    res.send(buf);
  } catch (e) {
    res.status(500).send(e.message);
  }
});

// --+-- REMOTE CONTROL UI --+--
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Replit Remote Control</title>
  <style>
    body { background:#111; color:#eee; font-family:monospace; display:flex; flex-direction:column; align-items:center; padding:16px; gap:12px; }
    h2 { color:#7effa0; }
    img { border:2px solid #444; cursor:crosshair; max-width:100%; }
    #controls { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
    button { background:#222; color:#eee; border:1px solid #555; padding:6px 14px; cursor:pointer; border-radius:4px; font-family:monospace; }
    button:hover { background:#333; }
    #log { width:820px; max-width:100%; height:120px; overflow-y:auto; background:#000; border:1px solid #333; padding:8px; font-size:12px; color:#7effa0; }
  </style>
</head>
<body>
  <h2>Replit Remote Control</h2>
  <img id="view" width="820">
  <div id="controls">
    <button onclick="action('type_email')">Type Email</button>
    <button onclick="action('type_password')">Type Password</button>
    <button onclick="action('save_session')">Save Session</button>
    <button onclick="action('goto_dashboard')">Dashboard</button>
    <button onclick="action('goto_project')">Go To Project</button>
  </div>
  <div id="log">Ready...\n</div>
  <script>
    const img = document.getElementById("view");
    const log = document.getElementById("log");

    function addLog(msg) { log.textContent += msg + "\\n"; log.scrollTop = log.scrollHeight; }

    setInterval(() => { img.src = "/screenshot?t=" + Date.now(); }, 300);

    img.addEventListener("click", async (e) => {
      const rect = img.getBoundingClientRect();
      const x = Math.round((e.clientX - rect.left) * (1280 / rect.width));
      const y = Math.round((e.clientY - rect.top)  * (800  / rect.height));
      addLog("Click: " + x + ", " + y);
      await fetch("/click", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({x,y}) });
    });

    document.addEventListener("keydown", async (e) => {
      if (e.ctrlKey && ["r","l","t","w"].includes(e.key)) return;
      addLog("Key: " + e.key);
      await fetch("/key", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({key:e.key}) });
    });

    async function action(name) {
      addLog("Action: " + name);
      const res = await fetch("/action", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({action:name}) });
      addLog("-> " + await res.text());
    }
  </script>
</body>
</html>`);
});

// --+-- FORWARD CLICK --+--
app.post("/click", async (req, res) => {
  try { await humanClick(req.body.x, req.body.y); res.send("ok"); }
  catch (e) { res.status(500).send(e.message); }
});

// --+-- FORWARD KEY --+--
app.post("/key", async (req, res) => {
  try { await page.keyboard.press(req.body.key); res.send("ok"); }
  catch (e) { res.status(500).send(e.message); }
});

// --+-- ACTION BUTTONS --+--
app.post("/action", async (req, res) => {
  try {
    switch (req.body.action) {
      case "type_email":
        await page.click('input[type="email"], input[name="username"]');
        await page.type('input[type="email"], input[name="username"]', EMAIL, { delay: 50 });
        res.send("Email typed.");
        break;
      case "type_password":
        await page.click('input[type="password"]');
        await page.type('input[type="password"]', PASSWORD, { delay: 50 });
        res.send("Password typed.");
        break;
      case "save_session":
        const storage = await context.storageState();
        fs.writeFileSync(SESSION_FILE, JSON.stringify(storage, null, 2));
        res.send("Session saved to session.json!");
        break;
      case "goto_dashboard":
        await page.goto("https://replit.com/~", { waitUntil: "domcontentloaded" });
        res.send("Dashboard. URL: " + page.url());
        break;
      case "goto_project":
        await page.goto(PROJECT_URL, { waitUntil: "domcontentloaded" });
        res.send("Project. URL: " + page.url());
        break;
      default:
        res.send("Unknown action.");
    }
  } catch (e) {
    res.status(500).send("Error: " + e.message);
  }
});

// --+-- BOOT --+--
(async () => {
  try {
    browser = await chromium.launch({
    headless: false,
    args: [
    "--no-sandbox",
    "--disable-blink-features=AutomationControlled",
    "--disable-infobars",
    "--start-maximized"
   ]
 });
const hasSession = fs.existsSync(SESSION_FILE);

    context = await browser.newContext({
      storageState: hasSession ? SESSION_FILE : undefined,
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      locale: "en-US",
      viewport: null
    });

    page = await context.newPage();

    app.listen(PORT, () => {
      console.log("Remote Control running!");
      console.log("Open in browser: http://localhost:" + PORT);
      console.log("(Codespaces: forward port " + PORT + " and open preview)\n");
    });

    if (hasSession) {
      console.log("Found session.json — loading saved session...");
      await page.goto("https://replit.com/~", { waitUntil: "domcontentloaded" });
      await sleep(3000);
      const url = page.url();
      console.log("URL: " + url);
      if (url.includes("replit.com/~") || url.includes("replit.com/@")) {
        console.log("Logged in! Navigating to project...");
        await page.goto(PROJECT_URL, { waitUntil: "domcontentloaded" });
        await sleep(2000);
        console.log("On project page: " + page.url());
      } else {
        console.log("Session expired — deleting session.json, please log in via Remote Control.");
        fs.unlinkSync(SESSION_FILE);
        await page.goto("https://replit.com/login", { waitUntil: "domcontentloaded" });
      }
    } else {
      console.log("No session.json — use Remote Control UI to log in:");
      console.log("  1. Click 'Type Email' then 'Type Password'");
      console.log("  2. Solve any CAPTCHA by clicking in the browser view");
      console.log("  3. Click 'Save Session' once on the dashboard");
      await page.goto("https://google.com", { waitUntil: "domcontentloaded" });
    }

    console.log("\nCtrl+C to exit.");
    await new Promise(() => {});

  } catch (err) {
    console.error("Fatal error:", err);
    process.exit(1);
  }
})();