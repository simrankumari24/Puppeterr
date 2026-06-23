const express = require("express");
const { chromium } = require("playwright-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
chromium.use(StealthPlugin());
const fs = require("fs");

const EMAIL = "Naimish.sah@gmail.com";
const PASSWORD = "N@imish@1";
const PROJECT_URL = "https://replit.com/@supermanss/Eaglercraft-112-Server-Hosting";
const SESSION_FILE = "session1.json";
const PORT = 3000;

const app = express();
app.use(express.json());

let page = null;
let context = null;
let browser = null;
let cursorX = 0;
let cursorY = 0;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// --+-- INJECT CURSOR TRACKER into every page --+--
// Draws a red dot on the screenshot so you can see where the cursor is
async function injectCursorOverlay(pg) {
  await pg.addInitScript(() => {
    // Track real mouse position in a global so we can read it anytime
    window.__cursorX = 0;
    window.__cursorY = 0;
    document.addEventListener("mousemove", e => {
      window.__cursorX = e.clientX;
      window.__cursorY = e.clientY;
    }, true);
  });
}

// Draws cursor dot onto screenshot buffer using raw JPEG manipulation
// Simple approach: we just move the playwright mouse to cursorX/Y before screenshotting
async function getScreenshotWithCursor() {
  // Move mouse to last known position so it shows in screenshot
  await page.mouse.move(cursorX, cursorY);
  const buf = await page.screenshot({ type: "jpeg", quality: 80 });
  return buf;
}

// --+-- SCREENSHOT --+--
app.get("/screenshot", async (req, res) => {
  if (!page) return res.status(500).send("No page yet");
  try {
    const buf = await getScreenshotWithCursor();
    res.set("Content-Type", "image/jpeg");
    res.set("Cache-Control", "no-store");
    res.send(buf);
  } catch (e) {
    res.status(500).send(e.message);
  }
});

// --+-- URL --+--
app.get("/url", (req, res) => {
  if (!page) return res.send("no page");
  res.send(page.url());
});

// --+-- BUNDLE (for AI prompt) --+--
app.get("/bundle", async (req, res) => {
  try {
    if (!page) return res.status(500).send("No page yet");
    const screenshot = await page.screenshot({ type: "jpeg", quality: 60 });
    const dom = await page.content();
    const url = page.url();
    res.json({
      url,
      dom: dom.slice(0, 20000), // cap at 20k chars so prompt isn't massive
      screenshot: screenshot.toString("base64"),
    });
  } catch (e) {
    res.status(500).send(e.message);
  }
});

// --+-- UI --+--
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Remote Control</title>
  <style>
    * { box-sizing: border-box; }
    body { background:#0d0d0d; color:#eee; font-family:monospace; display:flex; flex-direction:column; align-items:center; padding:16px; gap:10px; margin:0; }
    h2 { color:#7effa0; margin:0; }
    #meta { display:flex; gap:24px; font-size:12px; color:#888; }
    #urlbar { color:#5bc8ff; font-size:13px; word-break:break-all; max-width:820px; }
    #viewport { position:relative; display:inline-block; }
    #view { border:2px solid #333; display:block; max-width:100%; }
    /* Cursor dot overlay */
    #cursor-dot {
      position:absolute;
      width:14px; height:14px;
      border-radius:50%;
      background:rgba(255,80,80,0.85);
      border:2px solid white;
      pointer-events:none;
      transform:translate(-50%,-50%);
      transition: left 0.05s, top 0.05s;
      box-shadow: 0 0 6px 2px rgba(255,80,80,0.5);
    }
    #controls { display:flex; gap:6px; flex-wrap:wrap; justify-content:center; max-width:820px; }
    button { background:#1a1a1a; color:#eee; border:1px solid #444; padding:6px 12px; cursor:pointer; border-radius:4px; font-family:monospace; font-size:12px; }
    button:hover { background:#2a2a2a; border-color:#7effa0; color:#7effa0; }
    button.danger { border-color:#ff5555; }
    button.danger:hover { background:#2a0000; color:#ff5555; }
    #log { width:820px; max-width:100%; height:130px; overflow-y:auto; background:#000; border:1px solid #222; padding:8px; font-size:11px; color:#7effa0; white-space:pre-wrap; }
    #typebox { display:flex; gap:6px; width:820px; max-width:100%; }
    #typeinput { flex:1; background:#1a1a1a; border:1px solid #444; color:#eee; padding:6px 10px; font-family:monospace; font-size:12px; border-radius:4px; }
    #typeinput:focus { outline:none; border-color:#7effa0; }
  </style>
</head>
<body>
  <h2>🖥 Remote Control</h2>
  <div id="urlbar">URL: loading...</div>
  <div id="meta">
    <span id="fps">FPS: --</span>
    <span id="cursorpos">Cursor: --</span>
    <span id="pingms">Ping: --</span>
  </div>

  <div id="viewport">
    <img id="view" width="820">
    <div id="cursor-dot"></div>
  </div>

  <div id="controls">
    <button onclick="action('type_email')">📧 Type Email</button>
    <button onclick="action('type_password')">🔐 Type Password</button>
    <button onclick="action('save_session')">💾 Save Session</button>
    <button onclick="action('goto_dashboard')">🏠 Dashboard</button>
    <button onclick="action('goto_project')">🚀 Go To Project</button>
    <button onclick="action('scroll_down')">⬇ Scroll Down</button>
    <button onclick="action('scroll_up')">⬆ Scroll Up</button>
    <button onclick="getBundle()">📋 Copy AI Bundle</button>
    <button class="danger" onclick="action('reload')">🔄 Reload Page</button>
  </div>

  <!-- Type anything box -->
  <div id="typebox">
    <input id="typeinput" placeholder="Type text here then press Enter to send to browser..." />
    <button onclick="sendTyped()">Send</button>
  </div>

  <div id="log">Ready...
</div>

  <script>
    const img = document.getElementById("view");
    const log = document.getElementById("log");
    const urlbar = document.getElementById("urlbar");
    const dot = document.getElementById("cursor-dot");
    const cursorpos = document.getElementById("cursorpos");
    const fpsEl = document.getElementById("fps");
    const pingEl = document.getElementById("pingms");
    const typeinput = document.getElementById("typeinput");

    let lastFrame = Date.now();
    let frameCount = 0;
    let capturing = false;

    function addLog(msg) {
      const ts = new Date().toLocaleTimeString();
      log.textContent += "[" + ts + "] " + msg + "\\n";
      log.scrollTop = log.scrollHeight;
    }

    // Screenshot loop — as fast as server can respond
    async function screenshotLoop() {
      while (true) {
        if (!capturing) {
          const t0 = Date.now();
          capturing = true;
          try {
            const res = await fetch("/screenshot?t=" + Date.now());
            const blob = await res.blob();
            img.src = URL.createObjectURL(blob);
            const ping = Date.now() - t0;
            pingEl.textContent = "Ping: " + ping + "ms";
            frameCount++;
          } catch (e) {}
          capturing = false;
        }
        await new Promise(r => setTimeout(r, 50)); // max ~20fps
      }
    }

    // FPS counter
    setInterval(() => {
      fpsEl.textContent = "FPS: " + frameCount;
      frameCount = 0;
    }, 1000);

    // URL updater
    setInterval(async () => {
      try {
        const u = await fetch("/url");
        urlbar.textContent = "URL: " + await u.text();
      } catch {}
    }, 1000);

    screenshotLoop();

    // Mouse tracking — move cursor dot + send to server
    img.addEventListener("mousemove", async (e) => {
      const rect = img.getBoundingClientRect();
      const x = Math.round((e.clientX - rect.left) * (1280 / rect.width));
      const y = Math.round((e.clientY - rect.top)  * (800  / rect.height));

      // Move dot on screen (in display coords)
      dot.style.left = (e.clientX - rect.left) + "px";
      dot.style.top  = (e.clientY - rect.top)  + "px";
      cursorpos.textContent = "Cursor: " + x + ", " + y;

      // Tell server where mouse is (throttled)
      fetch("/mousemove", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({x,y})
      }).catch(()=>{});
    });

    // When YOUR mouse LEAVES the image — fade dot, mark as desynced
    let cursorDesynced = false;
    img.addEventListener("mouseleave", () => {
      cursorDesynced = true;
      dot.style.opacity = "0.3";
      dot.style.background = "rgba(255,200,0,0.85)"; // goes yellow when desynced
      addLog("⚠ Your cursor left — dot desynced. Will re-center on return.");
    });

    // When YOUR mouse RETURNS — snap YOUR dot to center of image
    // Playwright's cursor stays wherever it was — only YOUR dot resyncs
    img.addEventListener("mouseenter", (e) => {
      if (!cursorDesynced) return;
      const rect = img.getBoundingClientRect();
      // Snap dot to where your mouse actually entered
      dot.style.left = (e.clientX - rect.left) + "px";
      dot.style.top  = (e.clientY - rect.top)  + "px";
      dot.style.opacity = "1";
      dot.style.background = "rgba(255,80,80,0.85)"; // back to red = synced
      cursorDesynced = false;
      addLog("✅ Your cursor re-synced.");
    });

    // Click
    img.addEventListener("click", async (e) => {
      const rect = img.getBoundingClientRect();
      const x = Math.round((e.clientX - rect.left) * (1280 / rect.width));
      const y = Math.round((e.clientY - rect.top)  * (800  / rect.height));
      addLog("Click: " + x + ", " + y);
      await fetch("/click", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({x,y})
      });
    });

    // Right click
    img.addEventListener("contextmenu", async (e) => {
      e.preventDefault();
      const rect = img.getBoundingClientRect();
      const x = Math.round((e.clientX - rect.left) * (1280 / rect.width));
      const y = Math.round((e.clientY - rect.top)  * (800  / rect.height));
      addLog("Right-click: " + x + ", " + y);
      await fetch("/rightclick", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({x,y})
      });
    });

    // Scroll
    img.addEventListener("wheel", async (e) => {
      e.preventDefault();
      await fetch("/scroll", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ delta: e.deltaY })
      });
    }, { passive: false });

    // Keyboard — only when NOT typing in the text box
    document.addEventListener("keydown", async (e) => {
      if (document.activeElement === typeinput) return;
      if (e.ctrlKey && ["r","l","t","w"].includes(e.key)) return;
      addLog("Key: " + e.key);
      await fetch("/key", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({key:e.key})
      });
    });

    // Type box
    typeinput.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        await sendTyped();
      }
    });

    async function sendTyped() {
      const text = typeinput.value;
      if (!text) return;
      addLog("Type: " + text);
      await fetch("/type", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({text})
      });
      typeinput.value = "";
    }

    async function action(name) {
      addLog("Action: " + name);
      const res = await fetch("/action", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:name})
      });
      addLog("-> " + await res.text());
    }

    async function getBundle() {
      addLog("Building AI bundle...");
      const res = await fetch("/bundle");
      if (!res.ok) { addLog("Error: " + res.status); return; }
      const data = await res.json();
      const prompt = \`You are a browser automation assistant.

URL: \${data.url}

DOM (truncated):
\${data.dom}

Screenshot: [base64 JPEG attached]
\${data.screenshot}

Tell me:
1. What state the page is in
2. What the next actions should be
3. Playwright JS code to perform them\`;
      try {
        await navigator.clipboard.writeText(prompt);
        addLog("Copied to clipboard!");
      } catch {
        console.log(prompt);
        addLog("Could not copy — check devtools console.");
      }
    }
  </script>
</body>
</html>`);
});

// --+-- MOUSE MOVE (for cursor tracking) --+--
app.post("/mousemove", async (req, res) => {
  try {
    cursorX = req.body.x;
    cursorY = req.body.y;
    await page.mouse.move(req.body.x, req.body.y);
    res.send("ok");
  } catch (e) { res.status(500).send(e.message); }
});

// --+-- CLICK --+--
app.post("/click", async (req, res) => {
  try {
    cursorX = req.body.x;
    cursorY = req.body.y;
    await page.mouse.click(req.body.x, req.body.y);
    res.send("ok");
  } catch (e) { res.status(500).send(e.message); }
});

// --+-- RIGHT CLICK --+--
app.post("/rightclick", async (req, res) => {
  try {
    await page.mouse.click(req.body.x, req.body.y, { button: "right" });
    res.send("ok");
  } catch (e) { res.status(500).send(e.message); }
});

// --+-- SCROLL --+--
app.post("/scroll", async (req, res) => {
  try {
    await page.mouse.wheel(0, req.body.delta);
    res.send("ok");
  } catch (e) { res.status(500).send(e.message); }
});

// --+-- KEY --+--
app.post("/key", async (req, res) => {
  try {
    await page.keyboard.press(req.body.key);
    res.send("ok");
  } catch (e) { res.status(500).send(e.message); }
});

// --+-- TYPE TEXT --+--
app.post("/type", async (req, res) => {
  try {
    await page.keyboard.type(req.body.text, { delay: 40 });
    res.send("ok");
  } catch (e) { res.status(500).send(e.message); }
});

// --+-- ACTIONS --+--
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
        res.send("Saved to " + SESSION_FILE);
        break;
      case "goto_dashboard":
        await page.goto("https://replit.com/~", { waitUntil: "domcontentloaded" });
        res.send("Dashboard. URL: " + page.url());
        break;
      case "goto_project":
        await page.goto(PROJECT_URL, { waitUntil: "domcontentloaded" });
        res.send("Project. URL: " + page.url());
        break;
      case "scroll_down":
        await page.mouse.wheel(0, 500);
        res.send("Scrolled down.");
        break;
      case "scroll_up":
        await page.mouse.wheel(0, -500);
        res.send("Scrolled up.");
        break;
      case "reload":
        await page.reload({ waitUntil: "domcontentloaded" });
        res.send("Reloaded. URL: " + page.url());
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
    const hasSession = fs.existsSync(SESSION_FILE);

    browser = await chromium.launch({
      headless: false,
      args: [
        "--no-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-infobars",
        "--start-maximized",
        "--window-position=0,0",
        "--window-size=1920,1080"
      ]
    });

    context = await browser.newContext({
      storageState: hasSession ? SESSION_FILE : undefined,
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      locale: "en-US",
      viewport: null,
      permissions: ["geolocation"],
      javaScriptEnabled: true,
      colorScheme: "light"
    });

    page = await context.newPage();
    await injectCursorOverlay(page);

    app.listen(PORT, () => {
      console.log("Remote Control running!");
      console.log("Open: http://localhost:" + PORT);
      console.log("(Codespaces: forward port " + PORT + ")\n");
    });

    if (hasSession) {
      console.log("Found " + SESSION_FILE + " — loading session...");
      await page.goto("https://replit.com/~", { waitUntil: "domcontentloaded" });
      await sleep(3000);
      const url = page.url();
      console.log("URL: " + url);
      if (url.includes("replit.com/~") || url.includes("replit.com/@")) {
        console.log("Logged in! Going to project...");
        await page.goto(PROJECT_URL, { waitUntil: "domcontentloaded" });
        await sleep(2000);
        console.log("On project: " + page.url());
      } else {
        console.log("Session expired — deleting " + SESSION_FILE);
        fs.unlinkSync(SESSION_FILE);
        await page.goto("https://replit.com/login", { waitUntil: "domcontentloaded" });
        console.log("Use Remote Control UI to log in.");
      }
    } else {
      console.log("No session — starting on Google, then going to Replit login.");
      // Start on Google so browser history looks human before hitting Replit
      await page.goto("https://www.google.com", { waitUntil: "domcontentloaded" });
    }

    console.log("Ctrl+C to exit.");
    await new Promise(() => {});
  } catch (err) {
    console.error("Fatal error:", err);
    process.exit(1);
  }
})();