/**
 * Strider Unified Agent Loop
 * 
 * Merges fetch crawlers with Puppeteer fallback into a single autonomous web-walking entity.
 * Manages parallel crawlers, escape hatch handling, and random walk exploration.
 */

const Frontier = require('./strider-frontier');
const FetchCrawler = require('./strider-fetch-crawler');
const PuppeteerFallback = require('./strider-puppeteer-fallback');

const DEFAULT_WORKER_COUNT = 3;
const LOOP_INTERVAL = 100; // ms between dequeue attempts
const STATS_INTERVAL = 30000; // ms between stat reports
const SAVE_INTERVAL = 5000; // ms between frontier autosaves
const STALL_CHECK_INTERVAL = 3000;
const DEFAULT_STALL_THRESHOLD_MS = 30000;
const DEFAULT_STALE_INPROGRESS_MS = 25000;
const SNAPSHOT_HISTORY_LIMIT = 25;
const DEFAULT_RECON_LIMIT = 500;
const DEFAULT_RECON_DISCOVERY_LIMIT = 750;
const DEFAULT_RECON_RUNTIME_MS = 30000;
const DEFAULT_RECON_WARMUP_MS = 2500;
const DEFAULT_RECON_MIN_RELEVANT = 8;

class StriderAgent {
  constructor(options = {}) {
    this.frontier = new Frontier();
    this.runtimeOptions = this.normalizeRuntimeOptions(options.runtimeOptions || options);
    this.fetchCrawler = new FetchCrawler(this.frontier, this.runtimeOptions);
    this.puppeteerFallback = new PuppeteerFallback(this.frontier, null, this.runtimeOptions);
    this.puppeteerFallback.setSnapshotOptions(options.snapshotOptions || {});

    this.workerCount = options.workerCount || DEFAULT_WORKER_COUNT;
    this.workers = [];
    this.isRunning = false;
    this.randomWalkMode = options.randomWalkMode || false;
    this.sharedPageMode = false;
    this.saveInterval = null;
    this.stallInterval = null;
    this.latestSnapshots = [];
    this.reconPlan = this.normalizeReconPlan(options.reconPlan || null);

    this.globalStats = {
      startTime: null,
      totalUrls: 0,
      totalAttempts: 0,
      totalTime: 0,
      lastProgressAt: null,
      lastAttemptAt: null,
      stallEvents: 0,
      recoveries: 0,
      lastStallAt: null,
      lastStallReason: null,
      workers: {},
    };
  }

  normalizeRuntimeOptions(raw = {}) {
    const stealthEnabled = Boolean(raw.stealth) || ['evasive', 'strict'].includes(String(raw.antiBot || '').toLowerCase());
    const antiBot = String(raw.antiBot || (stealthEnabled ? 'evasive' : 'off')).toLowerCase();
    return {
      stealth: stealthEnabled,
      antiBot: ['off', 'balanced', 'evasive', 'strict'].includes(antiBot) ? antiBot : 'off',
      challengeHandling: String(raw.challengeHandling || (stealthEnabled ? 'attempt' : 'observe')).toLowerCase() === 'disabled'
        ? 'disabled'
        : (String(raw.challengeHandling || (stealthEnabled ? 'attempt' : 'observe')).toLowerCase() === 'attempt' ? 'attempt' : 'observe'),
      stallThresholdMs: Math.max(5000, Number(raw.stallThresholdMs) || DEFAULT_STALL_THRESHOLD_MS),
      staleInProgressMs: Math.max(5000, Number(raw.staleInProgressMs) || DEFAULT_STALE_INPROGRESS_MS),
    };
  }

  /**
   * Set the Puppeteer page for fallback extraction
   */
  setPuppeteerPage(page) {
    this.sharedPageMode = !!page;
    this.puppeteerFallback.setPage(page);
  }

  setRuntimeOptions(options = {}) {
    this.runtimeOptions = this.normalizeRuntimeOptions(options);
    if (typeof this.fetchCrawler.setRuntimeOptions === 'function') {
      this.fetchCrawler.setRuntimeOptions(this.runtimeOptions);
    }
    if (typeof this.puppeteerFallback.setRuntimeOptions === 'function') {
      this.puppeteerFallback.setRuntimeOptions(this.runtimeOptions);
    }
  }

  setSnapshotOptions(options = {}) {
    this.puppeteerFallback.setSnapshotOptions(options || {});
  }

  /**
   * One-shot extraction of all live DOM elements from the shared page.
   */
  async extractLiveElements(options = {}) {
    return this.puppeteerFallback.extractAllElements(options);
  }

  normalizeReconPlan(rawPlan) {
    if (!rawPlan || typeof rawPlan !== 'object') return null;

    const toArray = (value) => Array.isArray(value)
      ? value.map(item => String(item || '').trim()).filter(Boolean)
      : [];

    return {
      goalText: String(rawPlan.goalText || rawPlan.goal || '').trim(),
      allowedDomains: toArray(rawPlan.allowedDomains),
      keywords: toArray(rawPlan.keywords),
      urlPatterns: toArray(rawPlan.urlPatterns),
      avoidPatterns: toArray(rawPlan.avoidPatterns),
      maxRelevantUrls: Math.max(1, Number(rawPlan.maxRelevantUrls) || DEFAULT_RECON_LIMIT),
      maxDiscoveredUrls: Math.max(1, Number(rawPlan.maxDiscoveredUrls) || DEFAULT_RECON_DISCOVERY_LIMIT),
      maxDepth: Math.max(1, Number(rawPlan.maxDepth) || 3),
      maxRuntimeMs: Math.max(1000, Number(rawPlan.maxRuntimeMs) || DEFAULT_RECON_RUNTIME_MS),
      startedAt: null,
    };
  }

  applyReconPlan(seedUrls = []) {
    if (!this.reconPlan) return;

    if (!this.reconPlan.allowedDomains.length) {
      const derivedDomains = seedUrls.map((url) => {
        try {
          return new URL(String(url)).hostname.toLowerCase();
        } catch {
          return '';
        }
      }).filter(Boolean);
      this.reconPlan.allowedDomains = Array.from(new Set(derivedDomains));
    }

    this.reconPlan.startedAt = Date.now();

    if (typeof this.frontier.configure === 'function') {
      this.frontier.configure({
        allowedDomains: this.reconPlan.allowedDomains,
        maxDepth: this.reconPlan.maxDepth,
      });
    }
  }

  /**
   * Start the unified agent loop
   */
  async start(seedUrls = [], reconPlan = null) {
    if (this.isRunning) {
      console.warn('⚠️  Strider agent already running');
      return;
    }

    if (reconPlan) {
      this.reconPlan = this.normalizeReconPlan(reconPlan);
    }

    this.isRunning = true;
    this.globalStats.startTime = Date.now();
    this.globalStats.lastProgressAt = Date.now();
    this.globalStats.lastAttemptAt = Date.now();
    this.applyReconPlan(seedUrls);

    // Enqueue seed URLs
    if (seedUrls.length > 0) {
      console.log(`🌱 Enqueueing ${seedUrls.length} seed URLs...`);
      for (const url of seedUrls) {
        this.frontier.enqueue(url, 'seed', 0);
      }
    }

    const effectiveWorkerCount = this.sharedPageMode
      ? Math.min(1, this.workerCount)
      : this.workerCount;

    if (this.sharedPageMode && this.workerCount > 1) {
      console.log('⚠️  Shared-page mode active; forcing Strider workerCount to 1 for safe navigation.');
    }

    // Start worker pool
    console.log(`🚀 Starting Strider with ${effectiveWorkerCount} crawlers...`);
    this.workers = [];
    for (let i = 0; i < effectiveWorkerCount; i++) {
      const worker = this.runWorker(i);
      this.workers.push(worker);
    }

    // Start stats reporter
    this.statsInterval = setInterval(() => this.reportStats(), STATS_INTERVAL);

    // Periodically persist frontier so crash/kill events lose less crawl state.
    this.saveInterval = setInterval(() => {
      this.frontier.save();
    }, SAVE_INTERVAL);

    // Watchdog: recover stale in-progress URLs and surface stalls.
    this.stallInterval = setInterval(() => {
      this.checkForStallAndRecover();
    }, STALL_CHECK_INTERVAL);

    // Wait for workers (they run indefinitely)
    await Promise.all(this.workers);
  }

  /**
   * Run a single crawler worker
   */
  async runWorker(workerId) {
    console.log(`👷 Worker ${workerId} started`);
    this.globalStats.workers[workerId] = {
      startedAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      lastUrl: '',
      lastResult: 'idle',
      processed: 0,
      errors: 0,
    };

    while (this.isRunning) {
      try {
        if (this.shouldStopRecon()) {
          this.isRunning = false;
          break;
        }

        // Get next URL
        const item = this.randomWalkMode
          ? this.frontier.getRandomUrl()
          : this.frontier.dequeue();

        if (!item) {
          this.updateWorkerHeartbeat(workerId, { lastResult: 'idle' });
          // Queue is empty, wait a bit then try again
          await this.sleep(LOOP_INTERVAL);
          continue;
        }

        this.globalStats.totalAttempts++;
        this.globalStats.lastAttemptAt = Date.now();
        this.updateWorkerHeartbeat(workerId, {
          lastUrl: item.url,
          lastResult: 'processing',
        });
        const shouldLogBatch = this.globalStats.totalAttempts % 500 === 0;

        if (shouldLogBatch) {
          console.log(`🔍 [Worker ${workerId}] Fetching batch checkpoint #${this.globalStats.totalAttempts}: ${item.url}`);
        }

        // Try dynamic browser extraction first for JS-heavy sites.
        let result = await this.puppeteerFallback.extract(item.url, item.discoveredFrom, item.depth);

        if (result.escape) {
          if (shouldLogBatch) {
            console.log(`  🛟 Escape hatch triggered, pulling safe URL from frontier`);
          }
          continue;
        }

        // If browser extraction fails, fall back to static fetch.
        if (!result.success && result.reason !== 'auth_wall') {
          if (shouldLogBatch) {
            console.log(`  → Browser extraction failed (${result.reason}), trying fetch fallback...`);
          }
          result = await this.fetchCrawler.fetch(item.url, item.discoveredFrom, item.depth);
        }

        if (result.success) {
          if (result.snapshot) {
            this.recordSnapshot(result.snapshot);
            this.captureNodeIntelligence(item.url, result.snapshot);
          }

          if (shouldLogBatch) {
            const snapshot = result.snapshot || {};
            const textLength = String(snapshot.text || '').length;
            const elementCount = Array.isArray(snapshot.elements) ? snapshot.elements.length : 0;
            const screenshotState = snapshot.screenshot ? 'yes' : 'no';
            console.log(`  ✅ Success: ${result.linksFound} links (${result.linksEnqueued} enqueued), text ${textLength} chars, elements ${elementCount}, screenshot ${screenshotState}`);
          }
          this.globalStats.totalUrls++;
          this.markProgress(workerId, 'success');
        } else {
          this.markProgress(workerId, result.reason || 'failed');
          if (shouldLogBatch) {
            console.log(`  ❌ Failed: ${result.reason}`);
          }
        }

        // Brief pause to avoid hammering
        await this.sleep(LOOP_INTERVAL);
      } catch (error) {
        this.updateWorkerHeartbeat(workerId, { lastResult: 'error' });
        if (this.globalStats.workers[workerId]) {
          this.globalStats.workers[workerId].errors = Number(this.globalStats.workers[workerId].errors || 0) + 1;
        }
        console.error(`  ⚠️  Worker ${workerId} error: ${error.message}`);
        await this.sleep(LOOP_INTERVAL);
      }
    }

    this.updateWorkerHeartbeat(workerId, { lastResult: 'stopped' });
    console.log(`👷 Worker ${workerId} stopped`);
  }

  updateWorkerHeartbeat(workerId, patch = {}) {
    const existing = this.globalStats.workers[workerId] || {
      startedAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      lastUrl: '',
      lastResult: 'idle',
      processed: 0,
      errors: 0,
    };

    this.globalStats.workers[workerId] = {
      ...existing,
      ...patch,
      lastHeartbeatAt: new Date().toISOString(),
    };
  }

  markProgress(workerId, result = 'unknown') {
    this.globalStats.lastProgressAt = Date.now();
    const worker = this.globalStats.workers[workerId];
    if (!worker) return;
    worker.processed = Number(worker.processed || 0) + 1;
    worker.lastResult = String(result || 'unknown');
    worker.lastHeartbeatAt = new Date().toISOString();
  }

  checkForStallAndRecover() {
    if (!this.isRunning) return;

    const now = Date.now();
    const noProgressMs = now - Number(this.globalStats.lastProgressAt || this.globalStats.startTime || now);
    const frontierStats = this.frontier.getStats();
    const stalled = typeof this.frontier.getStalledInProgress === 'function'
      ? this.frontier.getStalledInProgress(this.runtimeOptions.staleInProgressMs)
      : [];

    const shouldRecoverInProgress = stalled.length > 0;
    const shouldFlagNoProgress = frontierStats.queueSize > 0 && noProgressMs >= this.runtimeOptions.stallThresholdMs;

    if (!shouldRecoverInProgress && !shouldFlagNoProgress) {
      return;
    }

    this.globalStats.stallEvents += 1;
    this.globalStats.lastStallAt = new Date().toISOString();

    if (shouldRecoverInProgress && typeof this.frontier.recoverStaleInProgress === 'function') {
      const recovery = this.frontier.recoverStaleInProgress(this.runtimeOptions.staleInProgressMs);
      if (recovery.recovered > 0) {
        this.globalStats.recoveries += recovery.recovered;
        this.globalStats.lastStallReason = `Recovered ${recovery.recovered} stale in-progress URLs`;
        console.warn(`🧯 Stall recovery: requeued ${recovery.recovered}/${recovery.staleCount} stale URLs`);
        return;
      }
    }

    if (shouldFlagNoProgress) {
      this.globalStats.lastStallReason = `No progress for ${Math.round(noProgressMs / 1000)}s with ${frontierStats.queueSize} queued`;
      console.warn(`⚠️  Stall watchdog: ${this.globalStats.lastStallReason}`);
    }
  }

  /**
   * Stop the agent
   */
  async stop() {
    console.log('⏹️  Stopping Strider agent...');
    this.isRunning = false;

    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }

    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }

    if (this.stallInterval) {
      clearInterval(this.stallInterval);
      this.stallInterval = null;
    }

    if (this.workers.length) {
      await Promise.allSettled(this.workers);
      this.workers = [];
    }

    // Save frontier state
    this.frontier.save();
    console.log('💾 Frontier saved');
  }

  /**
   * Report stats
   */
  reportStats() {
    const frontierStats = this.frontier.getStats();
    const crawlerStats = this.fetchCrawler.getStats();
    const fallbackStats = this.puppeteerFallback.getStats();
    const elapsed = ((Date.now() - this.globalStats.startTime) / 1000).toFixed(1);
    const noProgressSeconds = Math.round((Date.now() - Number(this.globalStats.lastProgressAt || this.globalStats.startTime || Date.now())) / 1000);

    console.log(
      `\n📊 Strider Stats (${elapsed}s)\n` +
      `  Frontier: ${frontierStats.queueSize} queued, ` +
      `${frontierStats.visitedCount} visited, ` +
      `${frontierStats.inProgressCount} in progress\n` +
      `  Fetched: ${crawlerStats.fetched} successful, ` +
      `${crawlerStats.failed} failed\n` +
      `  Puppeteered: ${fallbackStats.puppeteered} successful, ` +
      `${fallbackStats.escapeHatches} escapes\n` +
      `  Snapshots: ${this.latestSnapshots.length} recent (latest metadata in stats)\n` +
      `  Recon: ${this.reconPlan ? `${this.getRelevantNodeCount()} relevant / ${frontierStats.totalDiscovered} discovered` : 'disabled'}\n` +
      `  Links extracted: ${crawlerStats.linksExtracted + fallbackStats.linksExtracted}\n` +
      `  Watchdog: ${this.globalStats.stallEvents} stalls, ${this.globalStats.recoveries} recoveries, ${noProgressSeconds}s since progress\n`
    );
  }

  getHealth() {
    const now = Date.now();
    const startedAt = Number(this.globalStats.startTime || now);
    const lastProgressAtMs = Number(this.globalStats.lastProgressAt || startedAt);
    const lastAttemptAtMs = Number(this.globalStats.lastAttemptAt || startedAt);
    const stalled = typeof this.frontier.getStalledInProgress === 'function'
      ? this.frontier.getStalledInProgress(this.runtimeOptions.staleInProgressMs)
      : [];

    const workers = Object.entries(this.globalStats.workers || {}).map(([id, state]) => {
      const heartbeatMs = state?.lastHeartbeatAt ? Date.parse(state.lastHeartbeatAt) : startedAt;
      const heartbeatAgeMs = Number.isFinite(heartbeatMs) ? (now - heartbeatMs) : null;
      return {
        workerId: Number(id),
        ...state,
        heartbeatAgeMs,
      };
    }).sort((a, b) => a.workerId - b.workerId);

    return {
      running: this.isRunning,
      runtime: this.runtimeOptions,
      elapsedMs: Math.max(0, now - startedAt),
      lastProgressAt: new Date(lastProgressAtMs).toISOString(),
      lastAttemptAt: new Date(lastAttemptAtMs).toISOString(),
      noProgressMs: Math.max(0, now - lastProgressAtMs),
      stallEvents: Number(this.globalStats.stallEvents || 0),
      recoveries: Number(this.globalStats.recoveries || 0),
      lastStallAt: this.globalStats.lastStallAt,
      lastStallReason: this.globalStats.lastStallReason,
      staleInProgress: stalled,
      workers,
      frontier: this.frontier.getStats(),
    };
  }

  computeRelevance(url, metadata = {}) {
    if (!this.reconPlan) {
      return { score: 0, matched: [], penalties: [] };
    }

    const urlValue = String(url || '').toLowerCase();
    const title = String(metadata.title || '').toLowerCase();
    const textPreview = String(metadata.textPreview || '').toLowerCase();
    const haystack = `${urlValue}\n${title}\n${textPreview}`;
    const matched = [];
    const penalties = [];
    let score = 0;

    for (const keyword of this.reconPlan.keywords) {
      const lowered = keyword.toLowerCase();
      if (lowered && haystack.includes(lowered)) {
        matched.push(`keyword:${keyword}`);
        score += urlValue.includes(lowered) ? 14 : 8;
      }
    }

    for (const pattern of this.reconPlan.urlPatterns) {
      const lowered = pattern.toLowerCase();
      if (lowered && urlValue.includes(lowered)) {
        matched.push(`url:${pattern}`);
        score += 16;
      }
    }

    for (const pattern of this.reconPlan.avoidPatterns) {
      const lowered = pattern.toLowerCase();
      if (lowered && haystack.includes(lowered)) {
        penalties.push(`avoid:${pattern}`);
        score -= 18;
      }
    }

    if (metadata.textLength > 200) score += 6;
    if (metadata.elementCount > 0) score += 3;
    if (metadata.screenshotAvailable) score += 2;
    score += Math.max(0, 6 - (Number(metadata.depth || 0) * 2));

    return {
      score: Math.max(0, Math.min(100, score)),
      matched,
      penalties,
    };
  }

  captureNodeIntelligence(url, snapshot) {
    const metadata = {
      title: String(snapshot?.title || ''),
      textPreview: String(snapshot?.text || '').slice(0, 500),
      textLength: String(snapshot?.text || '').length,
      elementCount: Array.isArray(snapshot?.elements) ? snapshot.elements.length : 0,
      screenshotAvailable: Boolean(snapshot?.screenshot?.base64),
    };
    const relevance = this.computeRelevance(url, metadata);

    if (typeof this.frontier.updateNodeMetadata === 'function') {
      this.frontier.updateNodeMetadata(url, {
        ...metadata,
        relevanceScore: relevance.score,
        relevanceMatched: relevance.matched,
        relevancePenalties: relevance.penalties,
      });
    }
  }

  getRelevantNodeCount() {
    const map = this.getSiteMap();
    const nodes = Array.isArray(map?.nodes) ? map.nodes : [];
    return nodes.filter(node => Number(node?.relevanceScore || 0) > 0).length;
  }

  shouldStopRecon() {
    if (!this.reconPlan) return false;
    const startedAt = Number(this.reconPlan.startedAt || this.globalStats.startTime || Date.now());
    const elapsedMs = Date.now() - startedAt;
    const frontierStats = this.frontier.getStats();
    if (elapsedMs >= this.reconPlan.maxRuntimeMs) return true;
    if (Number(frontierStats.totalDiscovered || 0) >= this.reconPlan.maxDiscoveredUrls) return true;
    if (this.getRelevantNodeCount() >= this.reconPlan.maxRelevantUrls) return true;
    return false;
  }

  async waitForReconWarmup(options = {}) {
    const timeoutMs = Math.max(200, Number(options.timeoutMs) || DEFAULT_RECON_WARMUP_MS);
    const minRelevant = Math.max(1, Number(options.minRelevant) || DEFAULT_RECON_MIN_RELEVANT);
    const startedAt = Date.now();

    while ((Date.now() - startedAt) < timeoutMs) {
      const report = this.getReconReport({ limit: minRelevant });
      if (Number(report?.relevantCount || 0) >= minRelevant) {
        return report;
      }
      if (!this.isRunning) {
        return report;
      }
      await this.sleep(200);
    }

    return this.getReconReport({ limit: minRelevant });
  }

  getReconReport(options = {}) {
    const limit = Math.max(1, Number(options.limit) || 20);
    const map = this.getSiteMap();
    const nodes = Array.isArray(map?.nodes) ? map.nodes : [];
    const ranked = nodes.map((node) => {
      const existingScore = Number(node?.relevanceScore || 0);
      const relevance = existingScore > 0
        ? { score: existingScore, matched: Array.isArray(node?.relevanceMatched) ? node.relevanceMatched : [], penalties: Array.isArray(node?.relevancePenalties) ? node.relevancePenalties : [] }
        : this.computeRelevance(node?.url, node || {});

      return {
        url: String(node?.url || ''),
        domain: String(node?.domain || ''),
        depth: Number(node?.depth || 0),
        title: String(node?.title || ''),
        textPreview: String(node?.textPreview || ''),
        textLength: Number(node?.textLength || 0),
        elementCount: Number(node?.elementCount || 0),
        screenshotAvailable: Boolean(node?.screenshotAvailable),
        discoveredFrom: node?.discoveredFrom || null,
        status: String(node?.status || ''),
        relevanceScore: relevance.score,
        relevanceMatched: relevance.matched,
        relevancePenalties: relevance.penalties,
      };
    }).sort((a, b) => {
      const scoreDelta = b.relevanceScore - a.relevanceScore;
      if (scoreDelta !== 0) return scoreDelta;
      const depthDelta = a.depth - b.depth;
      if (depthDelta !== 0) return depthDelta;
      return a.url.localeCompare(b.url);
    });

    return {
      goalText: this.reconPlan?.goalText || '',
      allowedDomains: this.reconPlan?.allowedDomains || [],
      relevantCount: ranked.filter(item => item.relevanceScore > 0).length,
      totalNodes: ranked.length,
      topMatches: ranked.slice(0, limit),
      domains: Array.isArray(map?.domains) ? map.domains.slice(0, 12) : [],
    };
  }

  /**
   * Keep a bounded buffer of lightweight snapshot metadata for integration consumers.
   */
  recordSnapshot(snapshot) {
    const text = String(snapshot?.text || '');
    const elements = Array.isArray(snapshot?.elements) ? snapshot.elements : [];
    const normalized = {
      capturedAt: new Date().toISOString(),
      url: String(snapshot?.url || ''),
      title: String(snapshot?.title || ''),
      textLength: text.length,
      textPreview: text.slice(0, 500),
      elementCount: elements.length,
      elements: elements.slice(0, 200),
      screenshotAvailable: Boolean(snapshot?.screenshot?.base64),
      screenshot: snapshot?.screenshot
        ? {
            mimeType: snapshot.screenshot.mimeType,
            base64: snapshot.screenshot.base64,
          }
        : null,
    };

    this.latestSnapshots.unshift(normalized);
    if (this.latestSnapshots.length > SNAPSHOT_HISTORY_LIMIT) {
      this.latestSnapshots.length = SNAPSHOT_HISTORY_LIMIT;
    }
  }

  /**
   * Simple sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Enable random walk mode (exploration)
   */
  setRandomWalkMode(enabled) {
    this.randomWalkMode = enabled;
    console.log(`${enabled ? '🚶' : '📋'} Random walk mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get current frontier stats
   */
  getStats() {
    const latestSnapshot = this.latestSnapshots[0] || null;
    return {
      frontier: this.frontier.getStats(),
      fetch: this.fetchCrawler.getStats(),
      puppeteer: this.puppeteerFallback.getStats(),
      snapshotOptions: typeof this.puppeteerFallback.getSnapshotOptions === 'function'
        ? this.puppeteerFallback.getSnapshotOptions()
        : null,
      recon: this.reconPlan
        ? {
            goalText: this.reconPlan.goalText,
            allowedDomains: this.reconPlan.allowedDomains,
            maxRelevantUrls: this.reconPlan.maxRelevantUrls,
            maxDiscoveredUrls: this.reconPlan.maxDiscoveredUrls,
            maxDepth: this.reconPlan.maxDepth,
            maxRuntimeMs: this.reconPlan.maxRuntimeMs,
            relevantCount: this.getRelevantNodeCount(),
          }
        : null,
      latestSnapshot,
      recentSnapshots: this.latestSnapshots.slice(0, 5),
      runtime: this.runtimeOptions,
      health: this.getHealth(),
      global: {
        running: this.isRunning,
        elapsed: this.globalStats.startTime
          ? (Date.now() - this.globalStats.startTime) / 1000
          : 0,
        totalUrlsProcessed: this.globalStats.totalUrls,
        stallEvents: Number(this.globalStats.stallEvents || 0),
        recoveries: Number(this.globalStats.recoveries || 0),
      },
    };
  }

  /**
   * Export the discovered site graph for downstream browsing.
   */
  getSiteMap() {
    return this.frontier.getSiteMap();
  }

  /**
   * Enqueue a URL manually
   */
  enqueue(url, discoveredFrom = null) {
    return this.frontier.enqueue(url, discoveredFrom);
  }

  /**
   * Reset everything
   */
  reset() {
    this.frontier.reset();
    this.fetchCrawler.resetStats();
    this.puppeteerFallback.resetStats();
    this.latestSnapshots = [];
    this.reconPlan = null;
    console.log('🔄 Strider agent reset');
  }
}

module.exports = StriderAgent;
