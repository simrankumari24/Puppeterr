/**
 * GLOBAL ACTION LIBRARY — SAFE FOR AGENTS
 * Shared across all execution contexts (Executor, Reasoner fallback, etc.)
 */

// Valid Playwright load states — "complete" is NOT valid and causes hard errors.
const VALID_LOAD_STATES = new Set(["load", "domcontentloaded", "networkidle", "commit"]);
const Human = require("./Human.js");

const TRANSIENT_DOM_ERROR_RE = /(Execution context was destroyed|Target closed|Navigation failed|Node is detached|Element is not attached|detached from document|most likely because of a navigation|frame was detached|Timeout \d+ms exceeded)/i;

function isTransientDomError(err) {
  return TRANSIENT_DOM_ERROR_RE.test(String(err?.message || err || ""));
}

async function withTransientRetry(run, options = {}) {
  const retries = Math.max(0, Number(options.retries ?? 2));
  const delayMs = Math.max(40, Number(options.delayMs ?? 180));
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await run(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt >= retries || !isTransientDomError(err)) throw err;
      await new Promise(resolve => setTimeout(resolve, delayMs + (attempt * 90)));
    }
  }
  throw lastErr;
}

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
    return withTransientRetry(async () => {
      const locator = page.locator(selector).first();
      await locator.waitFor({ state: "attached", timeout: 8000 });
      await locator.scrollIntoViewIfNeeded().catch(() => {});
      const box = await locator.boundingBox().catch(() => null);
      if (!box || box.width === 0 || box.height === 0) {
        // Element exists but has no visible box — use JS click as escape hatch
        await page.evaluate(sel => {
          const node = document.querySelector(sel);
          if (node) node.click();
        }, selector);
        return "js-click fallback";
      }
      await locator.click({ timeout: 8000 });
      return "clicked";
    }, { retries: 2, delayMs: 220 });
  },

  dblclick: async ({ page, selector }) => {
    return withTransientRetry(async () => {
      const locator = page.locator(selector).first();
      await locator.waitFor({ state: "attached", timeout: 8000 });
      await locator.scrollIntoViewIfNeeded().catch(() => {});
      await locator.dblclick({ timeout: 8000 });
      return "dblclicked";
    }, { retries: 2, delayMs: 200 });
  },

  hover: async ({ page, selector }) => {
    return withTransientRetry(async () => {
      const locator = page.locator(selector).first();
      await locator.waitFor({ state: "attached", timeout: 8000 });
      await locator.scrollIntoViewIfNeeded().catch(() => {});
      await locator.hover({ timeout: 8000 });
      return "hovered";
    }, { retries: 2, delayMs: 180 });
  },

  type: async ({ page, selector, text }) => withTransientRetry(async () => {
    const selectorCandidates = String(selector || "")
      .split(",")
      .map(item => item.trim())
      .filter(Boolean);
    if (!selectorCandidates.length) {
      throw new Error("type requires a selector");
    }

    // Real per-keystroke entropy (variable speed, word pauses, occasional
    // backspace-correct "typos") instead of a fixed 35ms-per-char delay —
    // see Human.js generateTypingPlan. Only meaningful here because `type`
    // dispatches real key events one at a time; `fill` below sets the DOM
    // value directly and has no per-keystroke moment to humanize.
    async function typeHumanlike(locator, str) {
      const plan = Human.generateTypingPlan(str);
      for (const step of plan) {
        await locator.page().waitForTimeout(step.delayBeforeMs);
        if (step.backspace) {
          await locator.press("Backspace");
        } else {
          await locator.pressSequentially(step.char, { delay: 0 });
        }
      }
    }

    let lastErr = null;
    for (const candidate of selectorCandidates) {
      try {
        const locator = page.locator(candidate).first();
        await locator.waitFor({ state: "visible", timeout: 3500 });
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await locator.click({ timeout: 3000 }).catch(() => {});
        await typeHumanlike(locator, String(text || ""));
        return "typed";
      } catch (err) {
        lastErr = err;
      }
    }

    // Fallback: try attached state in case visibility checks are flaky.
    for (const candidate of selectorCandidates) {
      try {
        const locator = page.locator(candidate).first();
        await locator.waitFor({ state: "attached", timeout: 2500 });
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await locator.click({ timeout: 2500 }).catch(() => {});
        await typeHumanlike(locator, String(text || ""));
        return "typed";
      } catch (err) {
        lastErr = err;
      }
    }

    throw lastErr || new Error(`type failed for selector ${selector}`);
  }, { retries: 2, delayMs: 220 }),
  fill: async ({ page, selector, text }) => withTransientRetry(async () => {
    const selectorCandidates = String(selector || "")
      .split(",")
      .map(item => item.trim())
      .filter(Boolean);
    if (!selectorCandidates.length) {
      throw new Error("fill requires a selector");
    }

    let lastErr = null;
    for (const candidate of selectorCandidates) {
      try {
        const locator = page.locator(candidate).first();
        await locator.waitFor({ state: "visible", timeout: 3500 });
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await locator.fill(String(text || ""), { timeout: 12000 });
        return "filled";
      } catch (err) {
        lastErr = err;
      }
    }

    // Fallback: if visibility is unstable, try attached candidates.
    for (const candidate of selectorCandidates) {
      try {
        const locator = page.locator(candidate).first();
        await locator.waitFor({ state: "attached", timeout: 2500 });
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await locator.fill(String(text || ""), { timeout: 12000 });
        return "filled";
      } catch (err) {
        lastErr = err;
      }
    }

    throw lastErr || new Error(`fill failed for selector ${selector}`);
  }, { retries: 2, delayMs: 220 }),
  press: async ({ page, selector, key }) => withTransientRetry(async () => {
    if (!selector) return page.keyboard.press(key);
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: "attached", timeout: 6000 });
    await locator.press(key, { timeout: 6000 });
    return "pressed";
  }, { retries: 1, delayMs: 160 }),
  check: async ({ page, selector }) => page.check(selector),
  uncheck: async ({ page, selector }) => page.uncheck(selector),
  selectOption: async ({ page, selector, value }) => page.selectOption(selector, value),

  // scrollIntoView: make an element visible before interacting
  scrollIntoView: async ({ page, selector }) => {
    return withTransientRetry(async () => {
      const locator = page.locator(selector).first();
      await locator.waitFor({ state: "attached", timeout: 6000 });
      await locator.scrollIntoViewIfNeeded();
      return "scrolled";
    }, { retries: 2, delayMs: 180 });
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
  mouseWheel: async ({ page, deltaX, deltaY }) => {
    // Accelerate -> steady -> decelerate -> occasional overshoot + correction,
    // instead of one flat wheel event — see Human.js generateScrollPhysics.
    const chunks = Human.generateScrollPhysics(Number(deltaY) || 0, Number(deltaX) || 0);
    for (const chunk of chunks) {
      await page.mouse.wheel(chunk.deltaX, chunk.deltaY);
      await page.waitForTimeout(chunk.delayMs);
    }
    return `scrolled ${Number(deltaY) || 0}px (physics-based, ${chunks.length} chunks)`;
  },

  // 📸 SCREENSHOTS
  screenshot: async ({ page, path }) => page.screenshot({ path }),
  fullPageScreenshot: async ({ page, path }) => page.screenshot({ path, fullPage: true }),

  // 📄 CONTENT EXTRACTION
  getText: async ({ page, selector }) => {
    const fallbackSelector = String(selector || "").trim() || "main, article, [role='main'], body";
    try {
      const locator = page.locator(fallbackSelector).first();
      await locator.waitFor({ state: "attached", timeout: 6000 }).catch(() => {});
      await locator.scrollIntoViewIfNeeded().catch(() => {});
      return await locator.innerText({ timeout: 6000 });
    } catch {
      return page.evaluate((sel) => {
        const node = document.querySelector(sel) || document.querySelector("main") || document.querySelector("article") || document.body;
        return String(node?.innerText || "");
      }, fallbackSelector);
    }
  },
  getHTML: async ({ page, selector }) => {
    const fallbackSelector = String(selector || "").trim() || "main, article, [role='main'], body";
    try {
      const locator = page.locator(fallbackSelector).first();
      await locator.waitFor({ state: "attached", timeout: 6000 }).catch(() => {});
      await locator.scrollIntoViewIfNeeded().catch(() => {});
      return await locator.innerHTML({ timeout: 6000 });
    } catch {
      return page.evaluate((sel) => {
        const node = document.querySelector(sel) || document.querySelector("main") || document.querySelector("article") || document.body;
        return String(node?.innerHTML || "");
      }, fallbackSelector);
    }
  },
  getAttribute: async ({ page, selector, name }) => await page.getAttribute(selector, name),
  // Scoped to `selector` if given (defaults to whole page, same fallback
  // chain as getText/getHTML). Uses a manual textContent walk instead of
  // innerText: innerText is layout-dependent (applies CSS text-transform,
  // can reflow/reorder around complex layouts) which was producing garbled
  // output on some pages. textContent-in-DOM-order, with script/style/
  // hidden nodes skipped, is a much closer match to "what's literally on
  // the page" — closer to a Ctrl+A selection than a rendered-layout read.
  getAllText: async ({ page, selector }) => {
    const fallbackSelector = String(selector || "").trim() || "body";
    try {
      const locator = page.locator(fallbackSelector).first();
      await locator.waitFor({ state: "attached", timeout: 6000 }).catch(() => {});
      return await locator.evaluate((node) => {
        const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);
        const isHidden = (el) => {
          if (!el || el.nodeType !== 1) return false;
          if (el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true") return true;
          const style = window.getComputedStyle(el);
          return style.display === "none" || style.visibility === "hidden";
        };
        const parts = [];
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
          acceptNode(textNode) {
            const parent = textNode.parentElement;
            if (!parent || SKIP_TAGS.has(parent.tagName) || isHidden(parent)) return NodeFilter.FILTER_REJECT;
            return textNode.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
          }
        });
        let current;
        while ((current = walker.nextNode())) parts.push(current.textContent.trim().replace(/[ \t]+/g, " "));
        return parts.join("\n").replace(/\n{3,}/g, "\n\n");
      });
    } catch {
      return page.evaluate((sel) => {
        const node = document.querySelector(sel) || document.body;
        return String(node?.textContent || "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
      }, fallbackSelector);
    }
  },

  // 🕒 WAITING — note: "complete" is NOT a valid Playwright load state (sanitized → "load")
  waitForSelector: async ({ page, selector, timeout = 8000 }) => withTransientRetry(async () => {
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: "attached", timeout });
    return "selector-attached";
  }, { retries: 2, delayMs: 150 }),
  waitForVisible: async ({ page, selector, timeout = 8000 }) => withTransientRetry(async () => {
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: "visible", timeout });
    return "selector-visible";
  }, { retries: 2, delayMs: 170 }),
  waitForTimeout: async ({ page, ms }) => page.waitForTimeout(Math.min(Number(ms) || 500, 8000)),
  waitForLoadState: async ({ page, state = "load" }) => page.waitForLoadState(sanitizeLoadState(state), { timeout: 12000 }),
  waitForURLChange: async ({ page, currentURL, targetURL, url, timeout = 8000 }) => {
    const baseline = String(currentURL || page.url() || "");
    if (!baseline) {
      throw new Error("waitForURLChange requires a currentURL baseline");
    }

    const targetRaw = String(targetURL || url || "").trim();
    const targetHost = (() => {
      if (!targetRaw) return "";
      try {
        const normalized = /^https?:\/\//i.test(targetRaw) ? targetRaw : `https://${targetRaw}`;
        return new URL(normalized).host.replace(/^www\./i, "").toLowerCase();
      } catch {
        return "";
      }
    })();

    const start = Date.now();
    while (Date.now() - start < timeout) {
      const current = String(page.url() || "");
      if (current !== baseline) {
        if (!targetRaw) return "url-changed";

        if (targetHost) {
          const currentHost = (() => {
            try { return new URL(current).host.replace(/^www\./i, "").toLowerCase(); } catch { return ""; }
          })();
          if (currentHost === targetHost) return `url-changed:${currentHost}`;
        } else if (current.toLowerCase().includes(targetRaw.toLowerCase())) {
          return "url-changed:target-match";
        }
      }
      await page.waitForTimeout(250);
     }
   throw new Error(`URL did not change to expected target within ${timeout}ms (baseline ${baseline}, now ${page.url()}, target ${targetRaw || "<any>"})`);
  },

  // 🪟 PAGE INFO
  getURL: async ({ page }) => page.url(),
  getTitle: async ({ page }) => page.title(),
  setViewport: async ({ page, width, height }) => page.setViewportSize({ width, height }),

  // 📁 FILES
  uploadFile: async ({ page, selector, filePath }) => page.setInputFiles(selector, filePath),

  // 🧩 JS EXECUTION
  // Wrap in new Function() rather than passing the raw string to
  // page.evaluate() directly. The planner frequently generates scripts like
  // "return document.title;" — a bare top-level return, which is a
  // SyntaxError ("Illegal return statement") when evaluated as a raw
  // string/expression, since a return statement is only valid inside a
  // function body. new Function(script) makes the script text INTO a
  // function body, so bare returns become valid; scripts that already
  // wrap themselves in an IIFE, or that are just a plain expression with
  // no return at all, continue to work unchanged either way.
  evaluate: async ({ page, script }) => {
    let fn;
    try {
      fn = new Function(String(script || ""));
    } catch (err) {
      throw new Error(`evaluate script has a syntax error: ${err.message}`);
    }
    return page.evaluate(fn);
  },

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
