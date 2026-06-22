// --- BLOCK 1: Boot Chrome + Page + Screenshot Loop ---

const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");

const VIEW_PATH = path.join(__dirname, "view.jpg");

let screenshotInterval = null;

async function startScreenshotLoop(page) {
  if (screenshotInterval) return;

  screenshotInterval = setInterval(async () => {
    try {
      // Capture to buffer then write in one shot — no corrupt partial files
      const buf = await page.screenshot({ type: "jpeg", quality: 80 });
      fs.writeFileSync(VIEW_PATH, buf);
    } catch (err) {
      console.log("Screenshot error:", err.message);
    }
  }, 1000); // ✅ FIXED: was 10000 (10s), now 1000 (1s)
}

async function bootBrowser() {
  console.log("Launching Chrome…");

  const browser = await puppeteer.launch({
    headless: false,
    executablePath: "/usr/bin/google-chrome",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-blink-features=AutomationControlled"  // ✅ helps avoid Cloudflare
    ]
  });

  const page = await browser.newPage();

  // Spoof a real browser so Cloudflare doesn't block us
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  );
  await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });

  await startScreenshotLoop(page);

  return { browser, page };
}

// --- BLOCK 2: Navigate to Replit login page ---

async function goToLogin(page) {
  console.log("Opening Replit login page…");

  await page.goto("https://replit.com/login", {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  await new Promise(r => setTimeout(r, 1500));
  console.log("Login page loaded.");
}

// --- BLOCK 3: Full two-step login ---
// Replit login is TWO steps:
//   Step 1 → type email → click Continue
//   Step 2 → password field appears → type password → click Log In

async function doLogin(page) {

  // ── Step 1: Email ──────────────────────────────────────────────────────────
  console.log("Waiting for email field…");
  await page.waitForSelector(
    'input[name="username"], input[name="email"], input[type="email"]',
    { timeout: 20000 }
  );

  // Find whichever selector exists
  const emailSel =
    (await page.$('input[name="username"]')) ? 'input[name="username"]' :
    (await page.$('input[name="email"]'))    ? 'input[name="email"]'    :
                                               'input[type="email"]';

  await page.click(emailSel, { clickCount: 3 });
  await page.type(emailSel, "Naimish.sah@gmail.com", { delay: 40 });
  console.log("✅ Email typed.");

  // ── Step 2: Click Continue (first submit) ─────────────────────────────────
  console.log("Clicking Continue…");
  await page.waitForSelector('button[type="submit"]', { timeout: 10000 });
  await page.click('button[type="submit"]');
  console.log("Continue clicked — waiting for password field to appear…");

  // Wait for password field — this proves step 1 succeeded
  await page.waitForSelector(
    'input[type="password"], input[name="password"]',
    { timeout: 15000 }
  );
  console.log("✅ Password field appeared.");

  await new Promise(r => setTimeout(r, 400));

  // ── Step 3: Type password ──────────────────────────────────────────────────
  const pwSel = (await page.$('input[name="password"]'))
    ? 'input[name="password"]'
    : 'input[type="password"]';

  await page.click(pwSel, { clickCount: 3 });
  await page.type(pwSel, "N@imish@1", { delay: 50 });
  console.log("✅ Password typed.");

  // ── Step 4: Click Log In (second submit) ──────────────────────────────────
  console.log("Clicking Log In…");
  await page.waitForSelector('button[type="submit"]', { timeout: 10000 });

  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20000 })
      .catch(() => console.log("⚠️  Nav timeout — might still be loading…")),
    page.click('button[type="submit"]')
  ]);

  console.log("Log In clicked.");
}

// --- BLOCK 4: Confirm we landed on dashboard ---

async function confirmDashboard(page) {
  console.log("Checking dashboard…");

  // Give the SPA a moment to settle after login redirect
  await new Promise(r => setTimeout(r, 3000));

  const url = page.url();
  console.log(`📍 Current URL: ${url}`);

  if (url.includes("replit.com/~") || url.includes("replit.com/@")) {
    console.log("✅ Logged in! Dashboard confirmed.");
    return true;
  } else {
    console.log("❌ Not on dashboard — login may have failed. Check view.jpg.");
    return false;
  }
}

// --- BLOCK 5: Navigate to project ---

async function goToProject(page) {
  const PROJECT_URL = "https://replit.com/@supermanss/Eaglercraft-112-Server-Hosting";
  console.log(`\n🚀 Navigating to project…`);

  await page.goto(PROJECT_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));

  const url = page.url();
  console.log(`📍 Project URL: ${url}`);

  if (url.includes("Eaglercraft") || url.includes("supermanss")) {
    console.log("✅ On project page!");
  } else {
    console.log("⚠️  Unexpected URL — check view.jpg.");
  }
}

// --- MAIN ---

(async () => {
  try {
    const { browser, page } = await bootBrowser();
    console.log("📸 Screenshot loop running → view.jpg\n");

    await goToLogin(page);
    await doLogin(page);

    const ok = await confirmDashboard(page);
    if (!ok) {
      console.log("Staying alive so you can check view.jpg. Ctrl+C to exit.");
      await new Promise(() => {});
    }

    await goToProject(page);

    console.log("\n✅ All done! Staying alive — view.jpg updates every second.");
    console.log("Press Ctrl+C to exit.");
    await new Promise(() => {});

  } catch (err) {
    console.error("💥 Fatal error:", err);
  }
})();