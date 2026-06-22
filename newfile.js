const puppeteer = require("puppeteer");
const fs = require("fs");
const readline = require("readline");

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function askQuestion(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(query, ans => { rl.close(); resolve(ans); }));
}

async function startScreenshotLoop(page, path = "./view.jpg") {
  const tmp = path + ".tmp";
  let running = true;
  const loop = (async () => {
    while (running) {
      try {
        // Write to a temp file first, then atomically rename over view.jpg
        // so VS Code never sees a half-written / corrupted JPEG
        await page.screenshot({ path: tmp, type: "jpeg", quality: 80, fullPage: true });
        fs.renameSync(tmp, path);
      } catch {}
      await sleep(1000);
    }
  })();
  return () => { running = false; return loop; };
}

async function main() {
  const EMAIL = "Naimish.sah@gmail.com";
  const PROJECT_URL = "https://replit.com/@supermanss/Eaglercraft-112-Server-Hosting";
  const DASHBOARD_URL = "https://replit.com/~";
  const VIEW_PATH = "./preview.jpg";

  let stopScreenshots = () => {};

  // ── Clean shutdown on Ctrl+C ───────────────────────────────────────────────
  process.on("SIGINT", async () => {
    console.log("\n\n🛑 Ctrl+C caught — cleaning up...");
    stopScreenshots();
    await sleep(500);
    if (fs.existsSync(VIEW_PATH)) {
      fs.unlinkSync(VIEW_PATH);
      console.log("🗑️  preview.jpg deleted.");
    }
    if (fs.existsSync(VIEW_PATH + ".tmp")) fs.unlinkSync(VIEW_PATH + ".tmp");
    console.log("✅ Clean exit.");
    process.exit(0);
  });

  console.log("🚀 Launching browser (headed mode to bypass Cloudflare)...");
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1280, height: 800 },
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled"
    ]
  });

  const page = await browser.newPage();

  // Spoof user agent + language headers so Cloudflare sees a real browser
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  );
  await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });

  // Start screenshot loop immediately (assigned to outer var so SIGINT can stop it)
  stopScreenshots = await startScreenshotLoop(page, VIEW_PATH);
  console.log("📸 Screenshot loop running → preview.jpg (updates every second)\n");

  // ── STEP 1: Navigate to login ──────────────────────────────────────────────
  console.log("🌐 Navigating to Replit login page...");
  await page.goto("https://replit.com/login", { waitUntil: "networkidle2", timeout: 30000 });
  await sleep(2000);
  console.log("✅ On login page. Check preview.jpg");

  // ── STEPS 2-5: Login retry loop ───────────────────────────────────────────
  let loggedIn = false;
  let attempt = 0;

  while (!loggedIn) {
    attempt++;
    console.log(`\n🔑 Login attempt #${attempt}...`);

    // Go to login page fresh each attempt
    await page.goto("https://replit.com/login", { waitUntil: "networkidle2", timeout: 30000 });
    await sleep(2000);

    // Enter email
    console.log(`📧 Entering email: ${EMAIL}`);
    try {
      await page.waitForSelector(
        'input[name="username"], input[type="email"], input[placeholder*="email" i], input[placeholder*="username" i]',
        { timeout: 10000 }
      );
      const emailInput =
        await page.$('input[name="username"]') ||
        await page.$('input[type="email"]') ||
        await page.$('input[placeholder*="email" i]') ||
        await page.$('input[placeholder*="username" i]');

      if (emailInput) {
        await emailInput.click({ clickCount: 3 });
        await emailInput.type(EMAIL, { delay: 60 });
        console.log("✅ Email entered.");
      } else {
        console.log("⚠️  Email field not found. Check preview.jpg.");
      }
    } catch (e) {
      console.log("⚠️  Email field error:", e.message);
    }

    await sleep(500);

    // Ask for password
    console.log("\n🔐 Enter your password and press Enter:");
    const password = await askQuestion("Password: ");

    try {
      const pwInput = await page.$('input[type="password"]');
      if (pwInput) {
        await pwInput.click({ clickCount: 3 });
        await pwInput.type(password, { delay: 60 });
        console.log("✅ Password entered.");
      } else {
        console.log("⚠️  Password field not found. Check preview.jpg.");
      }
    } catch (e) {
      console.log("⚠️  Password field error:", e.message);
    }

    await sleep(500);

    // Submit
    console.log("🖱️  Submitting...");
    try {
      const loginBtn = await page.$('button[type="submit"], button[data-cy="login-btn"]');
      if (loginBtn) await loginBtn.click();
      else await page.keyboard.press("Enter");
    } catch {
      await page.keyboard.press("Enter");
    }

    console.log("⏳ Waiting for login to complete...");
    await sleep(20000);

    // Check dashboard
    console.log("🏠 Checking dashboard...");
    await page.goto(DASHBOARD_URL, { waitUntil: "networkidle2", timeout: 30000 });
    await sleep(3000);

    const currentUrl = page.url();
    console.log(`📍 Current URL: ${currentUrl}`);

    if (currentUrl.includes("replit.com/~") || currentUrl.includes("replit.com/@")) {
      console.log("✅ SUCCESS: Logged in! Dashboard confirmed.");
      loggedIn = true;
    } else {
      console.log(`❌ Not logged in yet (attempt #${attempt}). Check view.jpg — then try again.`);
      console.log("   (Wrong password? CAPTCHA? Try again below)\n");
      await sleep(1000);
      // loop back and ask for password again
    }
  }

  await sleep(2000);

  // ── STEP 6: Navigate to project ───────────────────────────────────────────
  console.log(`\n🚀 Navigating to your project: ${PROJECT_URL}`);
  await page.goto(PROJECT_URL, { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(4000);

  const projectUrl = page.url();
  console.log(`📍 Current URL: ${projectUrl}`);

  if (projectUrl.includes("Eaglercraft") || projectUrl.includes("supermanss")) {
    console.log("✅ SUCCESS: On your Eaglercraft project page!");
  } else {
    console.log("⚠️  URL looks unexpected. Check preview.jpg.");
  }

  console.log("\n✅ All done! Script staying alive — preview.jpg updates every second.");
  console.log("   Press Ctrl+C to exit.\n");

  // Stay alive
  await new Promise(() => {});
}

main().catch(err => {
  console.error("💥 Fatal error:", err);
  process.exit(1);
});