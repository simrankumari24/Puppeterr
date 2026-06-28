/**
 * GLOBAL ACTION LIBRARY — SAFE FOR AGENTS
 * Shared across all execution contexts (Executor, Reasoner fallback, etc.)
 */

// Valid Playwright load states — "complete" is NOT valid and causes hard errors.
const VALID_LOAD_STATES = new Set(["load", "domcontentloaded", "networkidle", "commit"]);

function sanitizeLoadState(raw) {
  const s = String(raw || "load").toLowerCase().trim();
  if (s === "complete") return "load";
  return VALID_LOAD_STATES.has(s) ? s : "load";
}

const actions = {
  // 🧭 NAVIGATION
  goto: async ({ page, url }) => page.goto(url, { waitUntil: "domcontentloaded" }),
  reload: async ({ page }) => page.reload({ waitUntil: "domcontentloaded" }),
  goBack: async ({ page }) => page.goBack({ waitUntil: "domcontentloaded" }),
  goForward: async ({ page }) => page.goForward({ waitUntil: "domcontentloaded" }),
  waitForNavigation: async ({ page }) => page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 8000 }).catch(() => "timeout"),

  // 🎯 ELEMENT INTERACTION
  // smartClick: scroll into view, verify visibility, then click. Falls back to
  // JS .click() if Playwright's click still fails (e.g. hidden submit buttons).
  click: async ({ page, selector }) => {
    const el = await page.$(selector);
    if (!el) throw new Error(`Element not found: ${selector}`);
    await el.scrollIntoViewIfNeeded().catch(() => {});
    const box = await el.boundingBox();
    if (!box || box.width === 0 || box.height === 0) {
      // Element exists but has no visible box — use JS click as escape hatch
      await page.evaluate(sel => {
        const node = document.querySelector(sel);
        if (node) node.click();
      }, selector);
      return "js-click fallback";
    }
    await page.click(selector, { timeout: 8000 });
  },

  dblclick: async ({ page, selector }) => {
    const el = await page.$(selector);
    if (el) await el.scrollIntoViewIfNeeded().catch(() => {});
    await page.dblclick(selector, { timeout: 8000 });
  },

  hover: async ({ page, selector }) => {
    const el = await page.$(selector);
    if (el) await el.scrollIntoViewIfNeeded().catch(() => {});
    await page.hover(selector, { timeout: 8000 });
  },

  type: async ({ page, selector, text }) => page.type(selector, String(text || ""), { delay: 35 }),
  fill: async ({ page, selector, text }) => page.fill(selector, String(text || "")),
  press: async ({ page, selector, key }) => selector ? page.press(selector, key) : page.keyboard.press(key),
  check: async ({ page, selector }) => page.check(selector),
  uncheck: async ({ page, selector }) => page.uncheck(selector),
  selectOption: async ({ page, selector, value }) => page.selectOption(selector, value),

  // scrollIntoView: make an element visible before interacting
  scrollIntoView: async ({ page, selector }) => {
    await page.$eval(selector, el => el.scrollIntoView({ block: "center", behavior: "smooth" }));
  },

  // submitForm: click submit or press Enter on focused element — great for search boxes
  submitForm: async ({ page, selector }) => {
    if (selector) {
      const el = await page.$(selector);
      if (el) {
        await el.focus().catch(() => {});
        await page.keyboard.press("Enter");
        return "enter-submit";
      }
    }
    await page.keyboard.press("Enter");
  },

  // ⌨️ KEYBOARD
  keyboardType: async ({ page, text }) => page.keyboard.type(String(text || ""), { delay: 28 }),
  keyboardPress: async ({ page, key }) => page.keyboard.press(key),
  keyboardDown: async ({ page, key }) => page.keyboard.down(key),
  keyboardUp: async ({ page, key }) => page.keyboard.up(key),

  // 🖱️ MOUSE
  mouseMove: async ({ page, x, y }) => page.mouse.move(Number(x), Number(y)),
  mouseClick: async ({ page, x, y }) => page.mouse.click(Number(x), Number(y)),
  mouseDblclick: async ({ page, x, y }) => page.mouse.dblclick(Number(x), Number(y)),
  mouseDown: async ({ page }) => page.mouse.down(),
  mouseUp: async ({ page }) => page.mouse.up(),
  mouseWheel: async ({ page, deltaX, deltaY }) => page.mouse.wheel(Number(deltaX) || 0, Number(deltaY) || 0),

  // 📸 SCREENSHOTS
  screenshot: async ({ page, path }) => page.screenshot({ path }),
  fullPageScreenshot: async ({ page, path }) => page.screenshot({ path, fullPage: true }),

  // 📄 CONTENT EXTRACTION
  getText: async ({ page, selector }) => await page.$eval(selector, el => el.innerText),
  getHTML: async ({ page, selector }) => await page.$eval(selector, el => el.innerHTML),
  getAttribute: async ({ page, selector, name }) => await page.getAttribute(selector, name),
  getAllText: async ({ page }) => await page.evaluate(() => document.body.innerText),

  // 🕒 WAITING — note: "complete" is NOT a valid Playwright load state (sanitized → "load")
  waitForSelector: async ({ page, selector, timeout = 8000 }) => page.waitForSelector(selector, { timeout }),
  waitForVisible: async ({ page, selector, timeout = 8000 }) => page.waitForSelector(selector, { state: "visible", timeout }),
  waitForTimeout: async ({ page, ms }) => page.waitForTimeout(Math.min(Number(ms) || 500, 8000)),
  waitForLoadState: async ({ page, state = "load" }) => page.waitForLoadState(sanitizeLoadState(state), { timeout: 12000 }),
  waitForURLChange: async ({ page, currentURL, timeout = 8000 }) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (page.url() !== currentURL) return "url-changed";
      await page.waitForTimeout(250);
     }
   throw new Error(`URL did not change within ${timeout}ms (still at ${currentURL})`);
  },

  // 🪟 PAGE INFO
  getURL: async ({ page }) => page.url(),
  getTitle: async ({ page }) => page.title(),
  setViewport: async ({ page, width, height }) => page.setViewportSize({ width, height }),

  // 📁 FILES
  uploadFile: async ({ page, selector, filePath }) => page.setInputFiles(selector, filePath),

  // 🧩 JS EXECUTION
  evaluate: async ({ page, script }) => page.evaluate(script),

  // 🧪 ASSERTIONS
  expectVisible: async ({ page, selector, timeout = 6000 }) => page.waitForSelector(selector, { state: "visible", timeout }),
  expectHidden: async ({ page, selector, timeout = 5000 }) => page.waitForSelector(selector, { state: "hidden", timeout }),
  expectText: async ({ page, selector, text }) => {
    const content = await page.$eval(selector, el => el.innerText);
    return content.includes(text);
  },
  expectURL: async ({ page, urlPattern }) => {
    const url = page.url();
    return typeof urlPattern === "string" ? url.includes(urlPattern) : urlPattern.test(url);
  },

  // 🔍 INTROSPECTION
  countElements: async ({ page, selector }) => await page.$$eval(selector, els => els.length),
  elementExists: async ({ page, selector }) => !!(await page.$(selector)),
  isVisible: async ({ page, selector }) => {
    const el = await page.$(selector);
    if (!el) return false;
    const box = await el.boundingBox();
    return !!(box && box.width > 0 && box.height > 0);
  },
};

module.exports = actions;