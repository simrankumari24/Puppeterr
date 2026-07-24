/**
 * Strider Integration for Puppeterr
 * 
 * Provides API endpoints and command handlers to integrate the Strider
 * autonomous web crawler into the main Puppeterr agent.
 * 
 * Endpoints:
 * - POST /api/strider/start - Start crawler with seed URLs
 * - POST /api/strider/stop - Stop crawler and save state
 * - GET /api/strider/stats - Get real-time statistics
 * - POST /api/strider/enqueue - Manually add URLs
 * - GET /api/strider/map - Export the discovered site graph
 */

const StriderAgent = require('./strider-agent');
const path = require('path');
const { loadSessionState, saveSessionState } = require('./sessionStore');

class StriderIntegration {
  constructor(options = {}) {
    this.strider = null;
    this.broadcast = options.broadcast || (() => {});
    this.page = null;
    this.sessionPath = options.sessionPath || path.join(__dirname, 'session.json');
  }

  async persistStriderState(status, patch = {}) {
    try {
      const now = new Date().toISOString();
      const state = await loadSessionState({ localPath: this.sessionPath }) || {};
      const previous = state.strider && typeof state.strider === 'object' ? state.strider : {};

      const next = {
        ...previous,
        ...patch,
        status,
        updatedAt: now,
      };

      if (status === 'running') {
        next.startedAt = previous.startedAt || now;
        next.stoppedAt = null;
      }

      if (status === 'stopped') {
        next.stoppedAt = now;
      }

      if (status === 'reset') {
        next.startedAt = null;
        next.stoppedAt = now;
      }

      state.strider = next;
      await saveSessionState({ localPath: this.sessionPath }, state);
    } catch (error) {
      console.warn(`⚠️  Failed to persist Strider state: ${error.message}`);
    }
  }

  /**
   * Set the Puppeterr browser page for Puppeteer fallback
   */
  setPage(page) {
    this.page = page;
    if (this.strider) {
      this.strider.setPuppeteerPage(page);
    }
  }

  /**
   * Handle /api/strider/start POST request
   */
  async handleStart(body) {
    if (this.strider && this.strider.isRunning) {
      return { error: 'Crawler already running', code: 409 };
    }

    const payload = body && typeof body === 'object' ? body : {};
    const seedUrls = Array.isArray(payload.seedUrls) ? payload.seedUrls : [];
    const workerCount = Math.max(1, Number(payload.workerCount) || 3);
    const randomWalk = Boolean(payload.randomWalk);
    const stealth = Boolean(payload.stealth) || ['balanced', 'evasive', 'strict'].includes(String(payload.antiBot || '').toLowerCase());
    const antiBot = String(payload.antiBot || (stealth ? 'evasive' : 'off')).toLowerCase();
    const challengeHandling = String(payload.challengeHandling || (stealth ? 'attempt' : 'observe')).toLowerCase();
    const runtimeOptions = {
      stealth,
      antiBot,
      challengeHandling,
      stallThresholdMs: Number(payload.stallThresholdMs) || undefined,
      staleInProgressMs: Number(payload.staleInProgressMs) || undefined,
    };
    const reconPlan = payload.reconPlan && typeof payload.reconPlan === 'object' ? payload.reconPlan : null;
    const snapshotMode = String(payload.snapshotMode || '').trim();
    const snapshotOptions = payload.snapshotOptions && typeof payload.snapshotOptions === 'object'
      ? payload.snapshotOptions
      : {};
    if (snapshotMode) {
      snapshotOptions.mode = snapshotMode;
    }

    try {
      this.strider = new StriderAgent({ workerCount, randomWalkMode: randomWalk, reconPlan, snapshotOptions, runtimeOptions });

      if (this.page) {
        this.strider.setPuppeteerPage(this.page);
      }

      // Start crawler (non-blocking)
      this.strider.start(seedUrls, reconPlan).catch(err => {
        console.error('Strider error:', err);
        this.broadcast('strider_error', { error: err.message });
      });

      // Initial broadcast
      this.broadcast('strider_started', {
        workerCount,
        seedUrls: seedUrls.length,
        randomWalk,
        reconPlan,
        runtimeOptions,
        snapshotOptions,
        timestamp: new Date().toISOString(),
      });

      await this.persistStriderState('running', {
        workerCount,
        seedUrls,
        randomWalk,
        runtimeOptions,
      });

      return {
        ok: true,
        workerCount,
        seedUrls: seedUrls.length,
        randomWalk,
        reconPlan,
        runtimeOptions,
        snapshotOptions,
      };
    } catch (error) {
      return { error: error.message, code: 500 };
    }
  }

  /**
   * Handle /api/strider/stop POST request
   */
  async handleStop() {
    if (!this.strider) {
      return { error: 'No active crawler', code: 404 };
    }

    if (!this.strider.isRunning) {
      return { error: 'Crawler not running', code: 400 };
    }

    try {
      await this.strider.stop();

      const finalStats = this.strider.getStats();

      this.broadcast('strider_stopped', {
        stats: finalStats,
        timestamp: new Date().toISOString(),
      });

      await this.persistStriderState('stopped', {
        finalStats,
      });

      return {
        ok: true,
        stats: finalStats,
      };
    } catch (error) {
      return { error: error.message, code: 500 };
    }
  }

  /**
   * Handle /api/strider/stats GET request
   */
  getStats() {
    if (!this.strider) {
      return { error: 'No active crawler', code: 404 };
    }

    return {
      ok: true,
      running: this.strider.isRunning,
      stats: this.strider.getStats(),
      timestamp: new Date().toISOString(),
    };
  }

  getHealth() {
    if (!this.strider) {
      return { error: 'No active crawler', code: 404 };
    }

    return {
      ok: true,
      running: this.strider.isRunning,
      health: typeof this.strider.getHealth === 'function' ? this.strider.getHealth() : null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Handle /api/strider/map GET request
   */
  getMap() {
    if (!this.strider) {
      return { error: 'No active crawler', code: 404 };
    }

    return {
      ok: true,
      running: this.strider.isRunning,
      map: this.strider.getSiteMap(),
      stats: this.strider.getStats(),
      timestamp: new Date().toISOString(),
    };
  }

  async handleRecon(body) {
    const payload = body && typeof body === 'object' ? body : {};
    const startResult = await this.handleStart(payload);
    if (!startResult?.ok) return startResult;

    const warmupReport = this.strider && typeof this.strider.waitForReconWarmup === 'function'
      ? await this.strider.waitForReconWarmup({
          timeoutMs: Number(payload.timeoutMs) || undefined,
          minRelevant: Number(payload.minRelevant) || undefined,
        })
      : null;

    return {
      ...startResult,
      report: warmupReport,
    };
  }

  async handleExtractElements(body) {
    const payload = body && typeof body === 'object' ? body : {};
    const profile = String(payload.profile || '').trim().toLowerCase();
    const profileDefaults = profile === 'full'
      ? {
          settleMs: 220,
          includeText: true,
          includeAttributes: true,
          includeHidden: true,
          includeOuterHTML: false,
          maxElements: 0,
          textLimit: 220,
        }
      : profile === 'fast'
        ? {
            settleMs: 120,
            includeText: false,
            includeAttributes: false,
            includeHidden: true,
            includeOuterHTML: false,
            maxElements: 8000,
            textLimit: 120,
          }
        : {};

    const options = {
      url: payload.url,
      settleMs: payload.settleMs ?? profileDefaults.settleMs,
      maxElements: payload.maxElements ?? profileDefaults.maxElements,
      includeText: payload.includeText ?? profileDefaults.includeText,
      includeAttributes: payload.includeAttributes ?? profileDefaults.includeAttributes,
      includeHidden: payload.includeHidden ?? profileDefaults.includeHidden,
      includeOuterHTML: payload.includeOuterHTML ?? profileDefaults.includeOuterHTML,
      textLimit: payload.textLimit ?? profileDefaults.textLimit,
    };

    if (!this.page) {
      return { error: 'No active browser page', code: 503 };
    }

    try {
      if (!this.strider) {
        this.strider = new StriderAgent({ workerCount: 1, randomWalkMode: false });
        this.strider.setPuppeteerPage(this.page);
      } else if (this.page) {
        this.strider.setPuppeteerPage(this.page);
      }

      const result = await this.strider.extractLiveElements(options);
      if (!result?.success) {
        return { error: result?.error || result?.reason || 'Element extraction failed', code: 500, details: result };
      }

      this.broadcast('strider_extract_elements', {
        url: result?.snapshot?.url || '',
        profile: profile || null,
        totalCaptured: Number(result?.snapshot?.totalCaptured || 0),
        timestamp: result?.extractedAt || new Date().toISOString(),
      });

      return {
        ok: true,
        ...result,
      };
    } catch (error) {
      return { error: error.message, code: 500 };
    }
  }

  getReconReport(options = {}) {
    if (!this.strider) {
      return { error: 'No active crawler', code: 404 };
    }

    return {
      ok: true,
      running: this.strider.isRunning,
      report: typeof this.strider.getReconReport === 'function'
        ? this.strider.getReconReport(options)
        : null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Handle /api/strider/enqueue POST request
   */
  async handleEnqueue(body) {
    if (!this.strider) {
      return { error: 'No active crawler', code: 404 };
    }

    const url = String(body.url || '').trim();
    const discoveredFrom = body.discoveredFrom || null;

    if (!url) {
      return { error: 'URL is required', code: 400 };
    }

    try {
      const success = this.strider.enqueue(url, discoveredFrom);
      return {
        ok: success,
        url,
        enqueued: success,
      };
    } catch (error) {
      return { error: error.message, code: 500 };
    }
  }

  /**
   * Handle /api/strider/mode POST request
   */
  async handleModeToggle(body) {
    if (!this.strider) {
      return { error: 'No active crawler', code: 404 };
    }

    const mode = String(body.mode || '').toLowerCase();
    if (!['fifo', 'random'].includes(mode)) {
      return { error: 'Invalid mode; use "fifo" or "random"', code: 400 };
    }

    try {
      const randomWalk = mode === 'random';
      this.strider.setRandomWalkMode(randomWalk);

      this.broadcast('strider_mode_changed', {
        mode,
        randomWalk,
        timestamp: new Date().toISOString(),
      });

      await this.persistStriderState(this.strider.isRunning ? 'running' : 'stopped', {
        mode,
        randomWalk,
      });

      return {
        ok: true,
        mode,
        randomWalk,
      };
    } catch (error) {
      return { error: error.message, code: 500 };
    }
  }

  /**
   * Handle /api/strider/reset POST request
   */
  async handleReset() {
    if (!this.strider) {
      return { error: 'No active crawler', code: 404 };
    }

    if (this.strider.isRunning) {
      return { error: 'Cannot reset while crawler is running', code: 400 };
    }

    try {
      this.strider.reset();

      this.broadcast('strider_reset', {
        timestamp: new Date().toISOString(),
      });

      await this.persistStriderState('reset', {
        resetAt: new Date().toISOString(),
      });

      return { ok: true };
    } catch (error) {
      return { error: error.message, code: 500 };
    }
  }

  /**
   * Check if crawler is active
   */
  isActive() {
    return this.strider && this.strider.isRunning;
  }

  /**
   * Check if a crawler exists
   */
  hasStrider() {
    return this.strider !== null;
  }
}

module.exports = StriderIntegration;
