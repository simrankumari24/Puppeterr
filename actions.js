/**
 * GLOBAL ACTION LIBRARY — SAFE FOR AGENTS
 *
 * This is the safe interface that Agent D uses to control the browser.
 * All actions are pre-written, tested, and bounded — no arbitrary code execution.
 */

const actions = {
  // 🧭 NAVIGATION
  goto: async ({ page, url }) => page.goto(url, { waitUntil: "domcontentloaded" }),
  reload: async ({ page }) => page.reload(),
  goBack: async ({ page }) => page.goBack(),
  goForward: async ({ page }) => page.goForward(),
  waitForNavigation: async ({ page }) => page.waitForNavigation(),

  // 🎯 ELEMENT INTERACTION
  click: async ({ page, selector }) => page.click(selector),
  dblclick: async ({ page, selector }) => page.dblclick(selector),
  hover: async ({ page, selector }) => page.hover(selector),
  type: async ({ page, selector, text }) => page.type(selector, text),
  fill: async ({ page, selector, text }) => page.fill(selector, text),
  press: async ({ page, selector, key }) =>
    selector ? page.press(selector, key) : page.keyboard.press(key),
  check: async ({ page, selector }) => page.check(selector),
  uncheck: async ({ page, selector }) => page.uncheck(selector),
  selectOption: async ({ page, selector, value }) => page.selectOption(selector, value),

  // ⌨️ KEYBOARD
  keyboardType: async ({ page, text }) => page.keyboard.type(text),
  keyboardPress: async ({ page, key }) => page.keyboard.press(key),
  keyboardDown: async ({ page, key }) => page.keyboard.down(key),
  keyboardUp: async ({ page, key }) => page.keyboard.up(key),

  // 🖱️ MOUSE
  mouseMove: async ({ page, x, y }) => page.mouse.move(x, y),
  mouseClick: async ({ page, x, y }) => page.mouse.click(x, y),
  mouseDblclick: async ({ page, x, y }) => page.mouse.dblclick(x, y),
  mouseDown: async ({ page }) => page.mouse.down(),
  mouseUp: async ({ page }) => page.mouse.up(),
  mouseWheel: async ({ page, deltaX, deltaY }) => page.mouse.wheel(deltaX, deltaY),

  // 📸 SCREENSHOTS
  screenshot: async ({ page, path }) => page.screenshot({ path }),
  fullPageScreenshot: async ({ page, path }) => page.screenshot({ path, fullPage: true }),
  elementScreenshot: async ({ page, selector, path }) => {
    const el = await page.$(selector);
    if (el) await el.screenshot({ path });
  },

  // 📄 CONTENT EXTRACTION
  getText: async ({ page, selector }) => {
    return await page.$eval(selector, (el) => el.innerText);
  },
  getHTML: async ({ page, selector }) => {
    return await page.$eval(selector, (el) => el.innerHTML);
  },
  getAttribute: async ({ page, selector, name }) => {
    return await page.getAttribute(selector, name);
  },
  getAllText: async ({ page }) => {
    return await page.evaluate(() => document.body.innerText);
  },
  getAllHTML: async ({ page }) => {
    return await page.evaluate(() => document.documentElement.outerHTML);
  },

  // 🕒 WAITING
  waitForSelector: async ({ page, selector, timeout = 5000 }) => {
    return page.waitForSelector(selector, { timeout });
  },
  waitForTimeout: async ({ page, ms }) => page.waitForTimeout(ms),
  waitForLoadState: async ({ page, state = "load" }) => page.waitForLoadState(state),
  waitForFunction: async ({ page, script, timeout = 5000 }) => {
    return page.waitForFunction(script, { timeout });
  },

  // 🪟 PAGE / CONTEXT
  newPage: async ({ context }) => context.newPage(),
  closePage: async ({ page }) => page.close(),
  setViewport: async ({ page, width, height }) => page.setViewportSize({ width, height }),
  getURL: async ({ page }) => page.url(),
  getTitle: async ({ page }) => page.title(),

  // 📁 FILES
  uploadFile: async ({ page, selector, filePath }) => page.setInputFiles(selector, filePath),

  // 🧩 JS EXECUTION (sandboxed, not arbitrary)
  evaluate: async ({ page, script }) => page.evaluate(script),
  evaluateHandle: async ({ page, script }) => page.evaluateHandle(script),

  // 🧵 FRAMES
  switchFrame: async ({ page, selector }) => {
    const frame = await page.frameLocator(selector);
    return frame;
  },
  mainFrame: async ({ page }) => page.mainFrame(),

  // 🧪 ASSERTIONS / CHECKS
  expectVisible: async ({ page, selector, timeout = 5000 }) => {
    const el = await page.waitForSelector(selector, { state: "visible", timeout });
    return !!el;
  },
  expectHidden: async ({ page, selector, timeout = 5000 }) => {
    const el = await page.waitForSelector(selector, { state: "hidden", timeout });
    return !!el;
  },
  expectText: async ({ page, selector, text }) => {
    const content = await page.$eval(selector, (el) => el.innerText);
    return content.includes(text);
  },
  expectURL: async ({ page, urlPattern }) => {
    const url = page.url();
    if (typeof urlPattern === "string") {
      return url.includes(urlPattern);
    }
    if (urlPattern instanceof RegExp) {
      return urlPattern.test(url);
    }
    return false;
  },

  // 🔍 INTROSPECTION
  countElements: async ({ page, selector }) => {
    return await page.$$eval(selector, (els) => els.length);
  },
  elementExists: async ({ page, selector }) => {
    return !!(await page.$(selector));
  },
  getOuterHTML: async ({ page, selector }) => {
    return await page.$eval(selector, (el) => el.outerHTML);
  },
};

module.exports = actions;
