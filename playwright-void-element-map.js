const { chromium } = require("playwright");
const path = require("path");

const BROWSER_PROFILE_DIR = process.env.BROWSER_PROFILE_DIR || path.join(process.cwd(), ".puppeterr-profile");
const FINGERPRINT_USER_AGENT = process.env.FINGERPRINT_USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FINGERPRINT_LOCALE = process.env.FINGERPRINT_LOCALE || "en-US";
const FINGERPRINT_TIMEZONE = process.env.FINGERPRINT_TIMEZONE || "America/New_York";
const FINGERPRINT_VIEWPORT_WIDTH = Math.max(960, Number(process.env.FINGERPRINT_VIEWPORT_WIDTH || 1366));
const FINGERPRINT_VIEWPORT_HEIGHT = Math.max(600, Number(process.env.FINGERPRINT_VIEWPORT_HEIGHT || 768));
const POST_NAV_SETTLE_MS = Math.max(0, Number(process.env.VOID_POST_NAV_SETTLE_MS || 1200));
const HOLD_OPEN_MS = Math.max(0, Number(process.env.VOID_HOLD_OPEN_MS || 2500));

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

  await context.addInitScript(() => {
    const captureElementMap = (options = {}) => {
      const includeWithoutId = options.includeWithoutId !== false;
      const maxElements = Number.isFinite(Number(options.maxElements)) ? Math.max(0, Number(options.maxElements)) : 0;
      const includeText = options.includeText !== false;
      const textLimit = Number.isFinite(Number(options.textLimit)) ? Math.max(0, Number(options.textLimit)) : 500;
      const includeStyleBits = options.includeStyleBits !== false;
      const includeShadowDescendants = options.includeShadowDescendants !== false;

      const nodes = [];
      const pushFromRoot = (root) => {
        const list = root.querySelectorAll(includeWithoutId ? "*" : "[id]");
        for (const node of list) nodes.push(node);
      };

      pushFromRoot(document);

      if (includeShadowDescendants) {
        const queue = [...nodes];
        for (let i = 0; i < queue.length; i++) {
          const host = queue[i];
          if (!host || !host.shadowRoot) continue;
          const shadowNodes = host.shadowRoot.querySelectorAll(includeWithoutId ? "*" : "[id]");
          for (const shadowNode of shadowNodes) {
            nodes.push(shadowNode);
            queue.push(shadowNode);
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
        const isVisible = rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0;
        const hasPointer = style.cursor === "pointer";
        const hasInlineClick = typeof element.onclick === "function" || element.hasAttribute("onclick");
        const hasRoleButton = String(element.getAttribute("role") || "").toLowerCase() === "button";
        const clickable = tag === "a" || tag === "button" || hasInlineClick || hasPointer || hasRoleButton;
        const ownerRoot = element.getRootNode && element.getRootNode();

        const record = {
          index,
          tagName: tag,
          id: element.id || "",
          class: classValue,
          role: element.getAttribute("role") || "",
          name: element.getAttribute("name") || "",
          ariaLabel: element.getAttribute("aria-label") || "",
          href: element.getAttribute("href") || "",
          src: element.getAttribute("src") || "",
          shadowRoot: element.shadowRoot ? "present" : null,
          shadowContext: ownerRoot && ownerRoot !== document ? "shadow-descendant" : "document",
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
        };

        if (includeStyleBits) {
          record.visibility.display = style.display;
          record.visibility.visibility = style.visibility;
          record.visibility.opacity = style.opacity;
          record.visibility.pointerEvents = style.pointerEvents;
        }

        if (includeText) {
          record.text = String(element.innerText || element.textContent || "").trim().slice(0, textLimit);
        }

        return record;
      });

      window.__VOID_ELEMENT_MAP__ = result;
      window.__VOID_ELEMENT_MAP_CAPTURED_AT__ = Date.now();
      console.log("VOID_ELEMENT_MAP", result);
      return result;
    };

    // Intentionally do not auto-capture inside init script.
    // We call this after navigation settles so dynamic JS-rendered nodes are included.
    window.__VOID_CAPTURE_ELEMENT_MAP__ = captureElementMap;
  });

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

  const extraction = await page.evaluate(async () => {
    const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await settle();
    if (typeof window.__VOID_CAPTURE_ELEMENT_MAP__ !== "function") {
      throw new Error("VOID capture function missing in page context");
    }
    const result = window.__VOID_CAPTURE_ELEMENT_MAP__({ includeWithoutId: true });
    return {
      total: Array.isArray(result) ? result.length : 0,
      capturedAt: Number(window.__VOID_ELEMENT_MAP_CAPTURED_AT__ || 0),
    };
  });

  console.log("VOID_ELEMENT_MAP_CAPTURE_SUMMARY", extraction);
  if (HOLD_OPEN_MS > 0) {
    await page.waitForTimeout(HOLD_OPEN_MS);
  }

  await context.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});