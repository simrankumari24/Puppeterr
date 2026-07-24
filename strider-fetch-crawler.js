/**
 * Strider Fetch Crawler
 * 
 * Simple, fast fetch-based crawler for extracting links from static pages.
 * Falls back to Puppeteer for JS-heavy pages.
 */

const cheerio = require('cheerio');

const FETCH_TIMEOUT = 8000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Strider/1.0';
const STEALTH_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

class FetchCrawler {
  constructor(frontier, runtimeOptions = {}) {
    this.frontier = frontier;
    this.runtimeOptions = {
      stealth: false,
      antiBot: 'off',
      ...(runtimeOptions || {}),
    };
    this.stats = {
      fetched: 0,
      failed: 0,
      linksExtracted: 0,
    };
  }

  setRuntimeOptions(options = {}) {
    this.runtimeOptions = {
      ...this.runtimeOptions,
      ...(options || {}),
    };
  }

  /**
   * Fetch a URL and extract links
   */
  async fetch(url, discoveredFrom = null, parentDepth = 0) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: this.buildHeaders(),
        redirect: 'follow',
      });

      if (!response.ok) {
        if (response.status === 403 || response.status === 401) {
          this.frontier.markFailed(url, `http_${response.status}`);
          return { success: false, reason: 'auth_wall' };
        }
        this.frontier.markFailed(url, `http_${response.status}`);
        return { success: false, reason: 'http_error' };
      }

      // Check if it's HTML
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) {
        this.frontier.markFailed(url, 'not_html');
        return { success: false, reason: 'not_html' };
      }

      const html = await response.text();
      const links = this.extractLinks(html, url);
      const snapshot = this.extractPageSnapshot(html, url);

      // Enqueue extracted links
      let enqueued = 0;
      for (const link of links) {
        if (this.frontier.enqueue(link, url, Number(parentDepth || 0) + 1)) {
          enqueued++;
        }
      }

      this.frontier.markVisited(url, 'visited');
      this.stats.fetched++;
      this.stats.linksExtracted += links.length;

      return {
        success: true,
        snapshot,
        linksFound: links.length,
        linksEnqueued: enqueued,
      };
    } catch (error) {
      const reason = error.name === 'AbortError' ? 'timeout' : 'fetch_error';
      this.frontier.markFailed(url, reason);
      this.stats.failed++;
      return { success: false, reason, error: error.message };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  buildHeaders() {
    const stealthEnabled = Boolean(this.runtimeOptions?.stealth) || String(this.runtimeOptions?.antiBot || 'off') !== 'off';
    if (!stealthEnabled) {
      return { 'User-Agent': USER_AGENT };
    }

    return {
      'User-Agent': STEALTH_USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9',
      'DNT': '1',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    };
  }

  /**
   * Extract links from HTML
   */
  extractLinks(html, sourceUrl) {
    const links = new Set();
    try {
      const $ = cheerio.load(html);

      // Extract href from <a> tags
      $('a[href]').each((i, el) => {
        const href = $(el).attr('href');
        if (href) {
          const resolved = this.resolveUrl(href, sourceUrl);
          if (resolved) {
            links.add(resolved);
          }
        }
      });

      // Also extract from common JS-heavy links (data-href, ng-href)
      $('[data-href], [ng-href]').each((i, el) => {
        const href = $(el).attr('data-href') || $(el).attr('ng-href');
        if (href) {
          const resolved = this.resolveUrl(href, sourceUrl);
          if (resolved) {
            links.add(resolved);
          }
        }
      });
    } catch (error) {
      console.warn(`⚠️  Link extraction error: ${error.message}`);
    }

    return Array.from(links);
  }

  extractPageSnapshot(html, sourceUrl) {
    try {
      const $ = cheerio.load(html);
      const title = $('title').first().text().trim();
      const text = $('body').text().replace(/\s+/g, ' ').trim();
      return {
        url: sourceUrl,
        title,
        text,
        elements: [],
        screenshot: null,
      };
    } catch {
      return {
        url: sourceUrl,
        title: '',
        text: '',
        elements: [],
        screenshot: null,
      };
    }
  }

  /**
   * Resolve relative URLs
   */
  resolveUrl(href, sourceUrl) {
    try {
      const normalizedHref = String(href || '').trim();

      if (!normalizedHref) {
        return null;
      }

      // Skip fragments, mail, tel, etc.
      if (
        normalizedHref.startsWith('#') ||
        normalizedHref.startsWith('mailto:') ||
        normalizedHref.startsWith('tel:') ||
        normalizedHref.startsWith('javascript:') ||
        normalizedHref.startsWith('data:') ||
        normalizedHref.startsWith('blob:')
      ) {
        return null;
      }

      // Handle protocol-relative URLs
      if (normalizedHref.startsWith('//')) {
        const sourceProto = new URL(sourceUrl).protocol;
        return new URL(sourceProto + normalizedHref).toString();
      }

      // Handle absolute URLs
      if (normalizedHref.startsWith('http://') || normalizedHref.startsWith('https://')) {
        return new URL(normalizedHref).toString();
      }

      // Handle relative URLs
      return new URL(normalizedHref, sourceUrl).toString();
    } catch {
      return null;
    }
  }

  /**
   * Get crawler stats
   */
  getStats() {
    return this.stats;
  }

  /**
   * Reset stats
   */
  resetStats() {
    this.stats = { fetched: 0, failed: 0, linksExtracted: 0 };
  }
}

module.exports = FetchCrawler;
