const { chromium } = require("playwright");
const path = require("path");

const BROWSER_PROFILE_DIR = process.env.BROWSER_PROFILE_DIR || path.join(process.cwd(), ".puppeterr-profile");
const FINGERPRINT_USER_AGENT = process.env.FINGERPRINT_USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FINGERPRINT_LOCALE = process.env.FINGERPRINT_LOCALE || "en-US";
const FINGERPRINT_TIMEZONE = process.env.FINGERPRINT_TIMEZONE || "America/New_York";
const FINGERPRINT_VIEWPORT_WIDTH = Math.max(960, Number(process.env.FINGERPRINT_VIEWPORT_WIDTH || 1366));
const FINGERPRINT_VIEWPORT_HEIGHT = Math.max(600, Number(process.env.FINGERPRINT_VIEWPORT_HEIGHT || 768));
const POST_NAV_SETTLE_MS = Math.max(0, Number(process.env.VOID_POST_NAV_SETTLE_MS || 1200));
const HOLD_OPEN_MS = Math.max(0, Number(process.env.VOID_HOLD_OPEN_MS || 1000));

// The actual browser-side installer, extracted as its own named function
// (not just inlined in installVoidElementMapInitScript's addInitScript call)
// so it can ALSO be invoked directly via page.evaluate() against an
// already-loaded page. addInitScript only takes effect on future
// navigations/reloads — it cannot retroactively install anything into a
// page that's already sitting there, which is exactly the case when
// capturing against Puppeterr's live, already-navigated page.
function voidElementMapBrowserInstaller() {
  if (typeof window.__VOID_CAPTURE_ELEMENT_MAP__ === "function") return;

  window.__VOID_CAPTURE_ELEMENT_MAP__ = (options = {}) => {
    const includeWithoutId = options.includeWithoutId !== false;
      const maxElements = Number.isFinite(Number(options.maxElements)) ? Math.max(0, Number(options.maxElements)) : 0;
      const includeText = options.includeText !== false;
      const textLimit = Number.isFinite(Number(options.textLimit)) ? Math.max(0, Number(options.textLimit)) : 500;
      const includeStyleBits = options.includeStyleBits !== false;
      const includeShadowDescendants = options.includeShadowDescendants !== false;
      const includeIframes = options.includeIframes !== false;
      const includeCanvas = options.includeCanvas !== false;

      const trim = (value, limit) => String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);

      const classifySector = (el) => {
        let node = el;
        while (node && node !== document.documentElement) {
          const tag = node.tagName && node.tagName.toLowerCase();
          if (tag === "header") return "header";
          if (tag === "nav") return "nav";
          if (tag === "main") return "main";
          if (tag === "footer") return "footer";
          node = node.parentElement || node.parentNode;
        }
        return "unknown";
      };

      const classifySemanticType = (el, text, role) => {
        const t = (text || "").toLowerCase();
        const r = (role || "").toLowerCase();

        if (r === "button") {
          if (t.includes("send") || t.includes("submit") || t.includes("save") || t.includes("apply")) return "action-button";
          if (t.includes("compose") || t.includes("new") || t.includes("create")) return "create-button";
        }

        if (r === "textbox" || r === "searchbox") {
          if (t.includes("search")) return "search-input";
          return "text-input";
        }

        if (r === "navigation" || r === "menu" || r === "menubar") return "navigation";

        if (t.includes("inbox") || t.includes("sent") || t.includes("drafts") || t.includes("spam") || t.includes("trash")) {
          return "mail-folder";
        }

        if (t.includes("subject")) return "subject-label";
        if (t.includes("to")) return "recipient-label";
        if (t.includes("cc")) return "cc-label";
        if (t.includes("bcc")) return "bcc-label";

        if (t.includes("settings") || t.includes("preferences")) return "settings";
        if (t.includes("help") || t.includes("support")) return "help";

        return "generic";
      };

      const nodes = [];
      const pushFromRoot = (root, shadowContext = "document") => {
        if (!root) return;
        const list = root.querySelectorAll(includeWithoutId ? "*" : "[id]");
        for (const node of list) {
          node.__VOID_SHADOW_CONTEXT__ = shadowContext;
          nodes.push(node);
        }
      };

      // main document
      pushFromRoot(document, "document");

      // shadow DOM recursion
      if (includeShadowDescendants) {
        const queue = [...nodes];
        for (let i = 0; i < queue.length; i++) {
          const host = queue[i];
          if (!host || !host.shadowRoot) continue;
          pushFromRoot(host.shadowRoot, "shadow-descendant");
        }
      }

      // iframe traversal (same-origin only)
      if (includeIframes) {
        const iframes = document.querySelectorAll("iframe");
        for (const frame of iframes) {
          try {
            const doc = frame.contentDocument;
            if (!doc) continue;
            pushFromRoot(doc, "iframe-descendant");
            if (includeShadowDescendants) {
              const frameNodes = doc.querySelectorAll(includeWithoutId ? "*" : "[id]");
              const queue = [...frameNodes];
              for (let i = 0; i < queue.length; i++) {
                const host = queue[i];
                if (!host || !host.shadowRoot) continue;
                pushFromRoot(host.shadowRoot, "iframe-shadow-descendant");
              }
            }
          } catch (e) {
            // cross-origin iframe, ignore
          }
        }
      }

      const selected = maxElements > 0 ? nodes.slice(0, maxElements) : nodes;

      const result = selected.map((element, index) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const classValue = typeof element.className === "string"
          ? element.className
          : element.getAttribute("class") || "";

        const tag = element.tagName.toLowerCase();
        const role = String(element.getAttribute("role") || "").toLowerCase();
        const ariaLabel = element.getAttribute("aria-label") || "";
        const ariaLabelledBy = element.getAttribute("aria-labelledby") || "";
        const ariaDescribedBy = element.getAttribute("aria-describedby") || "";

        const isVisible =
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity || "1") > 0;

        const hasPointer = style.cursor === "pointer";
        const hasInlineClick = typeof element.onclick === "function" || element.hasAttribute("onclick");
        const hasRoleButton = role === "button";
        const clickable = tag === "a" || tag === "button" || hasInlineClick || hasPointer || hasRoleButton;

        const ownerRoot = element.getRootNode && element.getRootNode();
        const shadowContext =
          element.__VOID_SHADOW_CONTEXT__ ||
          (ownerRoot && ownerRoot !== document ? "shadow-descendant" : "document");

        const text = includeText
          ? trim(element.innerText || element.textContent || "", textLimit)
          : "";

        const sector = classifySector(element);
        const semanticType = classifySemanticType(element, text, role);

const summary = (() => {
  if (!isVisible) return "Hidden element";
  if (clickable && semanticType === "action-button") return "Action button (submit/send/apply)";
  if (clickable && semanticType === "create-button") return "Creation button (new/compose/create)";
  if (clickable && tag === "a") return "Clickable link";
  if (clickable && tag === "button") return "Clickable button";
  if (role === "textbox" || role === "searchbox") return "Text input field";
  if (semanticType === "search-input") return "Search input field";
  if (semanticType === "navigation") return "Navigation element";
  if (semanticType === "mail-folder") return "Mail folder link";
  if (semanticType === "settings") return "Settings or preferences element";
  if (semanticType === "help") return "Help or support element";
  if (text && text.length > 0) return `Text element: "${text}"`;
  return "Generic DOM element";
})();

const record = {
  index,
  tagName: tag,
  id: element.id || "",
  class: classValue,
  role,
  name: element.getAttribute("name") || "",
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  href: element.getAttribute("href") || "",
  src: element.getAttribute("src") || "",
  shadowRoot: element.shadowRoot ? "present" : null,
  shadowContext,
  boundingBox: {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height
  },
  visibility: {
    hidden: !!element.hidden,
    isVisible,
  },
  clickable,
  sector,
  semanticType,
  text,
  summary,
};


        if (includeStyleBits) {
          record.visibility.display = style.display;
          record.visibility.visibility = style.visibility;
          record.visibility.opacity = style.opacity;
          record.visibility.pointerEvents = style.pointerEvents;
        }

        if (includeText) {
          record.text = text;
        }

        return record;
      });

      // canvas/WebGL metadata
      let canvasSummary = null;
      if (includeCanvas) {
        const canvases = document.querySelectorAll("canvas");
        canvasSummary = [...canvases].map((c, idx) => {
          const rect = c.getBoundingClientRect();
          let ctxType = null;
          try {
            if (c.getContext("2d")) ctxType = "2d";
            else if (c.getContext("webgl") || c.getContext("webgl2")) ctxType = "webgl";
          } catch (e) {}
          return {
            index: idx,
            width: c.width,
            height: c.height,
            boundingBox: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            },
            contextType: ctxType
          };
        });
      }

      const visibleCount = result.filter(el => el.visibility?.isVisible).length;
      const clickableCount = result.filter(el => el.clickable).length;
      const anchorCount = result.filter(el => el.tagName === "a").length;
      const buttonCount = result.filter(el => el.tagName === "button").length;
      const idsWithElements = result.filter(el => el.id).length;

      const payload = {
        totalCaptured: result.length,
        capturedAt: Date.now(),
        summary: {
          totalCaptured: result.length,
          visibleCount,
          clickableCount,
          anchorCount,
          buttonCount,
          idsWithElements,
          canvasCount: canvasSummary ? canvasSummary.length : 0,
        },
        elements: result,
        canvas: canvasSummary,
      };

      window.__VOID_ELEMENT_MAP__ = payload;
      window.__VOID_ELEMENT_MAP_CAPTURED_AT__ = payload.capturedAt;
      return payload;
    };
}

function installVoidElementMapInitScript(context) {
  if (!context || typeof context.addInitScript !== "function") return Promise.resolve();
  return context.addInitScript(voidElementMapBrowserInstaller);
}

async function captureVoidElementMapFromPage(page, options = {}) {
  if (!page || typeof page.evaluate !== "function") return null;
  const cfg = {
    includeWithoutId: options.includeWithoutId !== false,
    includeText: options.includeText !== false,
    includeStyleBits: options.includeStyleBits !== false,
    includeShadowDescendants: options.includeShadowDescendants !== false,
    includeIframes: options.includeIframes !== false,
    includeCanvas: options.includeCanvas !== false,
    maxElements: Number.isFinite(Number(options.maxElements)) ? Math.max(0, Number(options.maxElements)) : 1200,
    textLimit: Number.isFinite(Number(options.textLimit)) ? Math.max(0, Number(options.textLimit)) : 220,
  };
  return page.evaluate((config) => {
    if (typeof window.__VOID_CAPTURE_ELEMENT_MAP__ !== "function") {
      return null;
    }
    const captured = window.__VOID_CAPTURE_ELEMENT_MAP__(config);
    return captured || null;
  }, cfg).catch(() => null);
}

async function main() {
  const context = await chromium.launchPersistentContext(BROWSER_PROFILE_DIR, {
    headless: false,
    executablePath: chromium.executablePath(),
    userAgent: FINGERPRINT_USER_AGENT,
    locale: FINGERPRINT_LOCALE,
    timezoneId: FINGERPRINT_TIMEZONE,
    viewport: { width: FINGERPRINT_VIEWPORT_WIDTH, height: FINGERPRINT_VIEWPORT_HEIGHT },
    screen: { width: FINGERPRINT_VIEWPORT_WIDTH, height: FINGERPRINT_VIEWPORT_HEIGHT },
    args: [
      "--no-sandbox", "--disable-setuid-sandbox",
      "--disable-infobars",
      "--window-position=0,0",
      `--window-size=${FINGERPRINT_VIEWPORT_WIDTH},${FINGERPRINT_VIEWPORT_HEIGHT}`
    ]
  });

  await installVoidElementMapInitScript(context);

  const page = await context.newPage();
  page.on("console", (msg) => {
    const type = msg.type();
    const text = msg.text();
    console.log(`[page:${type}] ${text}`);
  });

  const targetUrl = process.argv[2] || "https://example.com";

  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load").catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 7000 }).catch(() => {});
  await page.waitForTimeout(POST_NAV_SETTLE_MS);

  // Infinite scroll + hydration sweep
  await page.evaluate(async () => {
    for (let i = 0; i < 30; i++) {
      window.scrollBy(0, window.innerHeight);
      await new Promise(r => setTimeout(r, 250));
    }
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 500));
  });

  const extraction = await captureVoidElementMapFromPage(page, {
    includeWithoutId: true,
    includeText: true,
    includeStyleBits: true,
    includeShadowDescendants: true,
    includeIframes: true,
    includeCanvas: true,
    maxElements: 1200,
    textLimit: 220,
  });

  console.log("VOID_ELEMENT_MAP_CAPTURE_SUMMARY", extraction?.summary || extraction || null);
  if (extraction && extraction.elements) {
  console.log("\n=== VOID ELEMENT LIST ===\n");
  extraction.elements.forEach(el => {
    console.log(
      `[${el.index}] <${el.tagName}> id="${el.id}" clickable=${el.clickable} visible=${el.visibility?.isVisible}\n` +
      `    summary: ${el.summary}\n` +
      `    text: "${el.text || ""}"\n`
    );
  });
}

  if (HOLD_OPEN_MS > 0) {
    await page.waitForTimeout(HOLD_OPEN_MS);
  }

  await context.close();
}

module.exports = {
  installVoidElementMapInitScript,
  captureVoidElementMapFromPage,
  voidElementMapBrowserInstaller,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}