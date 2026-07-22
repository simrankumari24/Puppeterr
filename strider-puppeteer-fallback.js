/**
 * Strider Puppeteer Fallback
 * 
 * Handles dynamic JS-heavy pages when fetch fails.
 * Also implements escape hatch for bot traps.
 */

const PUPPETEER_TIMEOUT = 12000;
const PUPPETEER_NAV_TIMEOUT = 10000;
const REDIRECT_LIMIT = 5;
const SCROLL_STEPS = 4;
const CLICK_LIMIT = 3;

const DEFAULT_SNAPSHOT_OPTIONS = {
  mode: 'id_only', // id_only | all_elements_fast | all_elements_full
  includeScreenshot: true,
  settleMs: 120,
  maxElements: 5000,
  includeText: false,
  includeAttributes: false,
  includeOuterHTML: false,
  includeHidden: true,
  textLimit: 180,
};

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null) return !!fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return !!fallback;
}

function normalizeSnapshotOptions(raw = {}) {
  const modeRaw = String(raw.mode || DEFAULT_SNAPSHOT_OPTIONS.mode).trim().toLowerCase();
  const validMode = ['id_only', 'all_elements_fast', 'all_elements_full'].includes(modeRaw)
    ? modeRaw
    : DEFAULT_SNAPSHOT_OPTIONS.mode;

  const includeScreenshot = parseBoolean(raw.includeScreenshot, DEFAULT_SNAPSHOT_OPTIONS.includeScreenshot);
  const settleMs = Math.max(0, Math.min(5000, Number(raw.settleMs) || DEFAULT_SNAPSHOT_OPTIONS.settleMs));
  const maxElements = Math.max(0, Number(raw.maxElements) || DEFAULT_SNAPSHOT_OPTIONS.maxElements);
  const textLimit = Math.max(0, Math.min(2000, Number(raw.textLimit) || DEFAULT_SNAPSHOT_OPTIONS.textLimit));

  const isFull = validMode === 'all_elements_full';
  const includeText = parseBoolean(raw.includeText, isFull ? true : DEFAULT_SNAPSHOT_OPTIONS.includeText);
  const includeAttributes = parseBoolean(raw.includeAttributes, isFull ? true : DEFAULT_SNAPSHOT_OPTIONS.includeAttributes);
  const includeOuterHTML = parseBoolean(raw.includeOuterHTML, isFull ? true : DEFAULT_SNAPSHOT_OPTIONS.includeOuterHTML);
  const includeHidden = parseBoolean(raw.includeHidden, DEFAULT_SNAPSHOT_OPTIONS.includeHidden);

  return {
    mode: validMode,
    includeScreenshot,
    settleMs,
    maxElements,
    includeText,
    includeAttributes,
    includeOuterHTML,
    includeHidden,
    textLimit,
  };
}

class PuppeteerFallback {
  constructor(frontier, page = null) {
    this.frontier = frontier;
    this.page = page; // Reuse Puppeterr's page instance if available
    this.stats = {
      puppeteered: 0,
      failed: 0,
      linksExtracted: 0,
      textsExtracted: 0,
      elementMapsExtracted: 0,
      screenshotsCaptured: 0,
      escapeHatches: 0,
    };
    this.redirectCount = 0;
    this.lastResponse = null;
    this.snapshotOptions = normalizeSnapshotOptions(DEFAULT_SNAPSHOT_OPTIONS);
  }

  /**
   * Set the browser page instance (shared from Puppeterr agent)
   */
  setPage(page) {
    this.page = page;
  }

  setSnapshotOptions(options = {}) {
    this.snapshotOptions = normalizeSnapshotOptions(options);
  }

  getSnapshotOptions() {
    return { ...(this.snapshotOptions || DEFAULT_SNAPSHOT_OPTIONS) };
  }

  /**
   * Extract links via Puppeteer on a dynamic page
   */
  async extract(url, discoveredFrom = null, parentDepth = 0) {
    if (!this.page) {
      return { success: false, reason: 'no_page' };
    }

    try {
      // Navigate with timeout
      const startUrl = this.page.url();
      this.lastResponse = await this.page.goto(url, {
        waitUntil: 'networkidle',
        timeout: PUPPETEER_NAV_TIMEOUT,
      });
      const endUrl = this.page.url();
      this.redirectCount = startUrl && endUrl && startUrl !== endUrl ? this.redirectCount + 1 : 0;

      // Give the page a moment to settle after JS hydration.
      await this.page.waitForTimeout(300);

      // Simulate a light human-style scroll so lazy-loaded content appears.
      await this.simulateScroll();

      // Nudge a few interactive elements to surface hidden routes.
      await this.simulateClicks(url);

      // Check for escape hatch triggers
      const shouldEscape = await this.checkEscapeConditions(url);
      if (shouldEscape) {
        this.stats.escapeHatches++;
        return { success: false, reason: 'escape_hatch', escape: true };
      }

      // Extract the DOM after the page has finished running its JS.
      const snapshot = await this.collectPageSnapshot(this.snapshotOptions);

      if (snapshot.text) {
        this.stats.textsExtracted++;
      }

      if (Array.isArray(snapshot.elements) && snapshot.elements.length > 0) {
        this.stats.elementMapsExtracted++;
      }

      if (snapshot.screenshot) {
        this.stats.screenshotsCaptured++;
      }

      const links = await this.collectLinksFromPage();

      // Resolve and enqueue links
      let enqueued = 0;
      for (const link of links) {
        const resolved = await this.resolveUrl(link, url);
        if (resolved && this.frontier.enqueue(resolved, url, Number(parentDepth || 0) + 1)) {
          enqueued++;
        }
      }

      this.frontier.markVisited(url, 'puppeteered');
      this.stats.puppeteered++;
      this.stats.linksExtracted += links.length;

      return {
        success: true,
        snapshot,
        linksFound: links.length,
        linksEnqueued: enqueued,
      };
    } catch (error) {
      const reason = error.name === 'TimeoutError' ? 'timeout' : 'extract_error';
      this.frontier.markFailed(url, reason);
      this.stats.failed++;
      return { success: false, reason, error: error.message };
    }
  }

  /**
   * Extract links from the live DOM after JS has executed
   */
  async collectLinksFromPage() {
    return this.page.evaluate(() => {
        const hrefs = new Set();

        const isAllowedHref = (href) => {
          const normalized = String(href || '').trim();
          if (!normalized) return false;
          return !(
            normalized.startsWith('#') ||
            normalized.startsWith('mailto:') ||
            normalized.startsWith('tel:') ||
            normalized.startsWith('javascript:') ||
            normalized.startsWith('data:') ||
            normalized.startsWith('blob:')
          );
        };

        document.querySelectorAll('a[href], link[href], area[href], [data-href], [ng-href]').forEach(el => {
          const href = el.getAttribute('href') || el.getAttribute('data-href') || el.getAttribute('ng-href');
          if (isAllowedHref(href)) {
            hrefs.add(href);
          }
        });

        // Some pages stash real destinations in JS-generated attributes.
        document.querySelectorAll('[onclick]').forEach(el => {
          const onclick = el.getAttribute('onclick') || '';
          const match = onclick.match(/(?:location(?:\.href)?|window\.location(?:\.href)?)\s*=\s*['"]([^'"]+)['"]/i);
          if (match && isAllowedHref(match[1])) {
            hrefs.add(match[1]);
          }
        });

        return Array.from(hrefs);
      });
  }

  /**
   * Capture a lightweight page snapshot for downstream reasoning.
   */
  async collectPageSnapshot(options = {}) {
    const snapshotConfig = normalizeSnapshotOptions(options);
    let snapshot;

    if (snapshotConfig.mode === 'all_elements_fast' || snapshotConfig.mode === 'all_elements_full') {
      const allResult = await this.extractAllElements({
        settleMs: snapshotConfig.settleMs,
        maxElements: snapshotConfig.maxElements,
        includeText: snapshotConfig.includeText,
        includeAttributes: snapshotConfig.includeAttributes,
        includeHidden: snapshotConfig.includeHidden,
        includeOuterHTML: snapshotConfig.includeOuterHTML,
        textLimit: snapshotConfig.textLimit,
      });

      if (!allResult?.success) {
        throw new Error(allResult?.error || allResult?.reason || 'live_dom_extract_failed');
      }

      snapshot = {
        ...(allResult.snapshot || {}),
        extractionMode: allResult.mode || snapshotConfig.mode,
      };
    } else {
      snapshot = await this.page.evaluate(() => {
      const text = String(document.body?.innerText || document.documentElement?.innerText || '').trim();
      const elements = Array.from(document.querySelectorAll('[id]')).map((element) => {
        const rect = element.getBoundingClientRect();
        const classValue = typeof element.className === 'string'
          ? element.className
          : element.getAttribute('class') || '';

        return {
          tagName: element.tagName.toLowerCase(),
          id: element.id || '',
          class: classValue,
          role: element.getAttribute('role'),
          name: element.getAttribute('name'),
          'aria-label': element.getAttribute('aria-label'),
          boundingBox: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
        };
      });

      return {
        url: window.location.href,
        title: document.title || '',
        text,
        elements,
        extractionMode: 'id_only',
      };
      });
    }

    let screenshot = null;
    if (snapshotConfig.includeScreenshot) {
      try {
        const buffer = await this.page.screenshot({
          type: 'jpeg',
          quality: 60,
          fullPage: false,
          animations: 'disabled',
          caret: 'hide',
        });

        screenshot = {
          mimeType: 'image/jpeg',
          base64: buffer.toString('base64'),
        };
      } catch {
        screenshot = null;
      }
    }

    return {
      ...snapshot,
      screenshot,
    };
  }

  /**
   * Extract all live DOM elements from the current page (or a target URL).
   * This runs in the browser context, so JS-rendered/dynamic nodes are included.
   */
  async extractAllElements(options = {}) {
    if (!this.page) {
      return { success: false, reason: 'no_page' };
    }

    const targetUrl = String(options.url || '').trim();
    const settleMs = Math.max(0, Math.min(5000, Number(options.settleMs) || 220));
    const maxElements = Math.max(0, Number(options.maxElements) || 0); // 0 => no cap
    const includeText = String(options.includeText || 'false').toLowerCase() === 'true' || options.includeText === true;
    const includeAttributes = String(options.includeAttributes || 'false').toLowerCase() === 'true' || options.includeAttributes === true;
    const includeHidden = String(options.includeHidden || 'true').toLowerCase() !== 'false';
    const includeOuterHTML = String(options.includeOuterHTML || 'false').toLowerCase() === 'true' || options.includeOuterHTML === true;
    const textLimit = Math.max(0, Math.min(2000, Number(options.textLimit) || 180));

    try {
      if (targetUrl) {
        await this.page.goto(targetUrl, {
          waitUntil: 'domcontentloaded',
          timeout: PUPPETEER_NAV_TIMEOUT,
        });
      }

      if (settleMs > 0) {
        await this.page.waitForTimeout(settleMs);
      }

      const extractedAt = new Date().toISOString();
      const snapshot = await this.page.evaluate((config) => {
        const toSafeNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
        const trim = (value, limit) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);

        const elements = [];
        const tagCounts = {};
        const walker = document.createTreeWalker(document.documentElement || document.body, NodeFilter.SHOW_ELEMENT);
        let node = walker.currentNode;
        let index = 0;

        const readAttributes = (el) => {
          if (!config.includeAttributes) return undefined;
          const map = {};
          const attrs = el.attributes ? Array.from(el.attributes) : [];
          for (const attr of attrs) {
            map[attr.name] = trim(attr.value, 240);
          }
          return map;
        };

        const isVisible = (el, rect) => {
          if (!rect) return false;
          if (rect.width <= 0 || rect.height <= 0) return false;
          const vw = Math.max(1, window.innerWidth || 1920);
          const vh = Math.max(1, window.innerHeight || 1080);
          if (rect.right < 0 || rect.bottom < 0 || rect.left > vw || rect.top > vh) return false;
          const style = window.getComputedStyle(el);
          if (!style) return true;
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || '1') <= 0.01) return false;
          return true;
        };

        while (node) {
          const el = node;
          const tag = String(el.tagName || '').toLowerCase();
          const rect = el.getBoundingClientRect();
          const visible = isVisible(el, rect);

          if (config.includeHidden || visible) {
            const record = {
              index,
              tagName: tag,
              id: el.id || '',
              class: typeof el.className === 'string' ? el.className : (el.getAttribute('class') || ''),
              role: el.getAttribute('role') || '',
              name: el.getAttribute('name') || '',
              type: el.getAttribute('type') || '',
              href: el.getAttribute('href') || '',
              src: el.getAttribute('src') || '',
              value: trim(el.value || '', config.textLimit),
              placeholder: trim(el.getAttribute('placeholder') || '', config.textLimit),
              ariaLabel: trim(el.getAttribute('aria-label') || '', config.textLimit),
              checked: !!el.checked,
              disabled: !!el.disabled,
              visible,
              boundingBox: {
                x: toSafeNumber(rect.x),
                y: toSafeNumber(rect.y),
                width: toSafeNumber(rect.width),
                height: toSafeNumber(rect.height),
              },
            };

            if (config.includeText) {
              record.text = trim(el.innerText || el.textContent || '', config.textLimit);
            }
            if (config.includeOuterHTML) {
              record.outerHTML = trim(el.outerHTML || '', 1000);
            }

            const attrs = readAttributes(el);
            if (attrs) record.attributes = attrs;

            elements.push(record);
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;

            if (config.maxElements > 0 && elements.length >= config.maxElements) {
              break;
            }
          }

          node = walker.nextNode();
          index += 1;
        }

        return {
          url: String(window.location.href || ''),
          title: String(document.title || ''),
          totalCaptured: elements.length,
          totalDomNodesVisited: index + (node ? 1 : 0),
          tagCounts,
          elements,
        };
      }, {
        maxElements,
        includeText,
        includeAttributes,
        includeHidden,
        includeOuterHTML,
        textLimit,
      });

      return {
        success: true,
        mode: 'live_dom_all_elements',
        extractedAt,
        options: {
          maxElements,
          includeText,
          includeAttributes,
          includeHidden,
          includeOuterHTML,
          textLimit,
          settleMs,
        },
        snapshot,
      };
    } catch (error) {
      return {
        success: false,
        reason: error?.name === 'TimeoutError' ? 'timeout' : 'extract_error',
        error: error.message,
      };
    }
  }

  /**
   * Simulate a short user scroll to trigger lazy-loaded content.
   */
  async simulateScroll() {
    const viewportHeight = await this.page.evaluate(() => Math.max(1, window.innerHeight || 900));

    for (let i = 0; i < SCROLL_STEPS; i++) {
      await this.page.mouse.wheel(0, Math.floor(viewportHeight * 0.8));
      await this.page.waitForTimeout(200);
    }
  }

  /**
   * Simulate a few safe clicks on visible links/buttons.
   */
  async simulateClicks(baseUrl) {
    const candidates = await this.page.evaluate((limit) => {
      const items = [];
      const selectors = 'a[href], button, [role="button"]';
      const elements = Array.from(document.querySelectorAll(selectors));

      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        const visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0;
        if (!visible) continue;

        const href = el.getAttribute('href') || el.getAttribute('data-href') || el.getAttribute('ng-href') || '';
        items.push({
          tagName: el.tagName,
          text: (el.textContent || '').trim().slice(0, 120),
          href,
          x: Math.max(0, Math.floor(rect.left + rect.width / 2)),
          y: Math.max(0, Math.floor(rect.top + rect.height / 2)),
        });

        if (items.length >= limit) break;
      }

      return items;
    }, CLICK_LIMIT);

    for (const candidate of candidates) {
      try {
        await this.page.mouse.click(candidate.x, candidate.y, { delay: 50 });
        await this.page.waitForTimeout(250);
        await this.page.goBack({ waitUntil: 'networkidle', timeout: 5000 }).catch(() => {});
      } catch {
        // Ignore click failures and keep crawling.
      }
    }
  }

  /**
   * Check for bot traps and escape hatch triggers
   */
  async checkEscapeConditions(url) {
    try {
      // Check for too many redirects
      if (this.redirectCount > REDIRECT_LIMIT) {
        console.warn(`⚠️  Too many redirects: ${url}`);
        return true;
      }

      // Check for forced download or malware patterns
      const headers = await this.page.evaluate(() => {
        return {
          url: window.location.href,
          title: document.title,
        };
      });

      // Detect infinite loop patterns
      if (headers.title.toLowerCase().includes('redirect')) {
        return true;
      }

      // Check page response headers for dangerous patterns
      const response = this.lastResponse;
      if (response) {
        const contentDisposition = response.headers()['content-disposition'];
        if (contentDisposition && contentDisposition.includes('attachment')) {
          console.warn(`⚠️  Forced download detected: ${url}`);
          return true;
        }
      }

      return false;
    } catch (error) {
      console.warn(`⚠️  Escape hatch check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Resolve relative URLs within the page context
   */
  async resolveUrl(href, baseUrl) {
    try {
      const normalizedHref = String(href || '').trim();
      if (
        !normalizedHref ||
        normalizedHref.startsWith('#') ||
        normalizedHref.startsWith('mailto:') ||
        normalizedHref.startsWith('tel:') ||
        normalizedHref.startsWith('javascript:') ||
        normalizedHref.startsWith('data:') ||
        normalizedHref.startsWith('blob:')
      ) {
        return null;
      }

      const base = new URL(baseUrl);

      if (normalizedHref.startsWith('//')) {
        return new URL(base.protocol + normalizedHref).toString();
      }

      if (normalizedHref.startsWith('http://') || normalizedHref.startsWith('https://')) {
        return new URL(normalizedHref).toString();
      }

      return new URL(normalizedHref, baseUrl).toString();
    } catch {
      return null;
    }
  }

  /**
   * Get stats
   */
  getStats() {
    return this.stats;
  }

  /**
   * Reset stats
   */
  resetStats() {
    this.stats = { puppeteered: 0, failed: 0, linksExtracted: 0, textsExtracted: 0, elementMapsExtracted: 0, screenshotsCaptured: 0, escapeHatches: 0 };
  }
}

module.exports = PuppeteerFallback;
