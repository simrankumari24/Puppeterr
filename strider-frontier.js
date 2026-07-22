/**
 * Strider Frontier Core
 * 
 * Persistent queue of URLs for both fetch crawlers and Puppeteer to explore.
 * Manages URL enqueueing, dequeuing, domain filtering, and visited tracking.
 */

const fs = require('fs');
const path = require('path');

const FRONTIER_FILE = path.join(__dirname, '.strider-frontier.json');
const MAX_FRONTIER_SIZE = 50000;  // Prevent unbounded growth
const DEFAULT_DEPTH = 0;
const MAX_DEPTH = 5;
const MAX_RETRY_FAILURES = 3;
const PERMANENT_FAILURE_REASONS = new Set([
  'http_403',
  'http_404',
  'not_html',
  'auth_wall',
]);

class Frontier {
  constructor() {
    this.queue = [];        // [{ url, domain, depth, status, lastVisited, discoveredFrom }]
    this.visited = new Set();
    this.inProgress = new Set();
    this.graph = new Map();  // url -> { url, domain, depth, discoveredFrom, status, lastVisited, failedReason }
    this.blockedDomains = new Set([
      // Malware/dangerous domains (common patterns)
    ]);
    this.blockedPatterns = [
      /\/adult\//i,
      /\/porn\//i,
      /\/xxx\//i,
      /\.mil$/,
      /\.gov$/,
    ];
    this.allowedDomains = null;
    this.maxDepthOverride = null;
    this.load();
  }

  configure(options = {}) {
    const domains = Array.isArray(options.allowedDomains)
      ? options.allowedDomains.map(item => String(item || '').trim().toLowerCase()).filter(Boolean)
      : [];
    this.allowedDomains = domains.length ? new Set(domains) : null;
    this.maxDepthOverride = Number.isFinite(Number(options.maxDepth))
      ? Math.max(1, Number(options.maxDepth))
      : null;
  }

  /**
   * Load frontier from persistent storage
   */
  load() {
    try {
      if (fs.existsSync(FRONTIER_FILE)) {
        const data = JSON.parse(fs.readFileSync(FRONTIER_FILE, 'utf-8'));
        this.queue = data.queue || [];
        this.visited = new Set(data.visited || []);
        this.inProgress = new Set();
        this.graph = new Map(Array.isArray(data.graph) ? data.graph : []);
        console.log(`🔄 Frontier loaded: ${this.queue.length} queued, ${this.visited.size} visited`);
      }
    } catch (error) {
      console.warn(`⚠️  Frontier load error: ${error.message}`);
      this.queue = [];
      this.visited = new Set();
      this.graph = new Map();
    }
  }

  /**
   * Save frontier to persistent storage
   */
  save() {
    try {
      const data = {
        queue: this.queue,
        visited: Array.from(this.visited),
        graph: Array.from(this.graph.entries()),
      };
      fs.writeFileSync(FRONTIER_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.warn(`⚠️  Frontier save error: ${error.message}`);
    }
  }

  /**
   * Check if a domain is blocked
   */
  isDomainBlocked(url) {
    try {
      const { hostname } = new URL(url);
      if (this.allowedDomains && this.allowedDomains.size > 0) {
        const normalizedHost = String(hostname || '').toLowerCase();
        const isAllowed = Array.from(this.allowedDomains).some((domain) => normalizedHost === domain || normalizedHost.endsWith(`.${domain}`));
        if (!isAllowed) return true;
      }
      if (this.blockedDomains.has(hostname)) return true;
      for (const pattern of this.blockedPatterns) {
        if (pattern.test(url)) return true;
      }
      return false;
    } catch {
      return true; // Malformed URL is blocked
    }
  }

  /**
   * Normalize URL for consistent comparison
   */
  normalizeUrl(url) {
    try {
      const u = new URL(url);
      // Remove fragment, sort query params
      u.hash = '';
      return u.toString();
    } catch {
      return null;
    }
  }

  /**
   * Extract domain from URL
   */
  getDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }

  /**
   * Enqueue a URL
   */
  enqueue(url, discoveredFrom = null, depth = DEFAULT_DEPTH) {
    if (!url) return false;

    const normalized = this.normalizeUrl(url);
    if (!normalized) return false;

    if (this.isDomainBlocked(url)) {
      return false; // Silently skip blocked domains
    }

    if (this.visited.has(normalized) || this.inProgress.has(normalized)) {
      return false; // Already visited or in progress
    }

    const existing = this.graph.get(normalized);
    if (existing) {
      if (['queued', 'in_progress', 'visited', 'puppeteered'].includes(String(existing.status || ''))) {
        return false;
      }
      const failureCount = Number(existing.failureCount || 0);
      if (failureCount >= MAX_RETRY_FAILURES) {
        return false;
      }
      if (existing.failedReason && PERMANENT_FAILURE_REASONS.has(String(existing.failedReason))) {
        return false;
      }
    }

    if (this.queue.length >= MAX_FRONTIER_SIZE) {
      // Queue is full, but we can still process what's there
      return false;
    }

    const parentUrl = discoveredFrom ? this.normalizeUrl(discoveredFrom) : null;
    const parentNode = parentUrl ? this.graph.get(parentUrl) : null;
    const nextDepth = parentNode
      ? Number(parentNode.depth || 0) + 1
      : Number(depth || DEFAULT_DEPTH);
    const maxDepth = this.maxDepthOverride || MAX_DEPTH;
    if (nextDepth > maxDepth) return false;

    const domain = this.getDomain(url);
    this.queue.push({
      url: normalized,
      domain,
      depth: nextDepth,
      status: 'pending',
      lastVisited: null,
      discoveredFrom,
    });

    this.graph.set(normalized, {
      url: normalized,
      domain,
      depth: nextDepth,
      discoveredFrom,
      status: 'queued',
      lastVisited: null,
      failedReason: null,
      failureCount: Number(existing?.failureCount || 0),
    });

    return true;
  }

  /**
   * Dequeue a URL (FIFO with domain diversity)
   */
  dequeue() {
    if (this.queue.length === 0) return null;

    // Simple FIFO for now; can be optimized later for domain diversity
    const item = this.queue.shift();
    if (item) {
      this.inProgress.add(item.url);
      const node = this.graph.get(item.url);
      if (node) {
        node.status = 'in_progress';
      }
    }
    return item;
  }

  /**
   * Mark a URL as successfully visited
   */
  markVisited(url, status = 'visited') {
    const normalized = this.normalizeUrl(url);
    if (normalized) {
      this.visited.add(normalized);
      this.inProgress.delete(normalized);
      const node = this.graph.get(normalized);
      if (node) {
        node.status = status;
        node.lastVisited = new Date().toISOString();
        node.failedReason = null;
        node.failureCount = 0;
      }
    }
  }

  /**
   * Mark a URL as failed
   */
  markFailed(url, reason = 'unknown') {
    const normalized = this.normalizeUrl(url);
    if (normalized) {
      this.inProgress.delete(normalized);
      // Don't mark as visited so it can be retried later
      console.warn(`⚠️  URL failed (${reason}): ${normalized}`);
      const node = this.graph.get(normalized);
      if (node) {
        node.status = 'failed';
        node.failedReason = reason;
        node.lastVisited = new Date().toISOString();
        node.failureCount = Number(node.failureCount || 0) + 1;
      }
    }
  }

  updateNodeMetadata(url, patch = {}) {
    const normalized = this.normalizeUrl(url);
    if (!normalized) return;
    const node = this.graph.get(normalized);
    if (!node) return;

    Object.assign(node, patch || {});
  }

  /**
   * Get frontier stats
   */
  getStats() {
    return {
      queueSize: this.queue.length,
      visitedCount: this.visited.size,
      inProgressCount: this.inProgress.size,
      graphCount: this.graph.size,
      totalDiscovered: this.graph.size,
    };
  }

  /**
   * Get a random URL from the frontier (for random walk mode)
   */
  getRandomUrl() {
    if (this.queue.length === 0) return null;
    const idx = Math.floor(Math.random() * this.queue.length);
    const item = this.queue.splice(idx, 1)[0];
    if (item) {
      this.inProgress.add(item.url);
      const node = this.graph.get(item.url);
      if (node) {
        node.status = 'in_progress';
      }
    }
    return item;
  }

  /**
   * Add multiple URLs at once (batch enqueue)
   */
  enqueueMany(urls, discoveredFrom = null, depth = DEFAULT_DEPTH) {
    let added = 0;
    for (const url of urls) {
      if (this.enqueue(url, discoveredFrom, depth)) {
        added++;
      }
    }
    return added;
  }

  /**
   * Clear and reset
   */
  reset() {
    this.queue = [];
    this.visited.clear();
    this.inProgress.clear();
    this.graph.clear();
    this.save();
  }

  /**
   * Export the crawl graph for downstream consumers.
   */
  getSiteMap() {
    const nodes = Array.from(this.graph.values()).sort((a, b) => {
      const depthDelta = (a.depth || 0) - (b.depth || 0);
      if (depthDelta !== 0) return depthDelta;
      return String(a.url).localeCompare(String(b.url));
    });

    const edges = nodes
      .filter(node => node.discoveredFrom)
      .map(node => ({
        from: node.discoveredFrom,
        to: node.url,
      }));

    const byDomain = new Map();
    for (const node of nodes) {
      const domain = node.domain || 'unknown';
      const current = byDomain.get(domain) || { domain, count: 0 };
      current.count += 1;
      byDomain.set(domain, current);
    }

    return {
      nodes,
      edges,
      domains: Array.from(byDomain.values()).sort((a, b) => b.count - a.count),
    };
  }
}

module.exports = Frontier;
