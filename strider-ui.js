/**
 * Strider UI Component
 * 
 * Frontend component for controlling the Strider web crawler.
 * Can be embedded in the Puppeterr UI or used as a standalone control panel.
 */

// Create Strider UI panel HTML
function createStriderPanel() {
  return `
    <div id="striderPanel" style="
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border-left: 4px solid #00d4ff;
      border-radius: 8px;
      padding: 20px;
      margin: 16px 0;
      font-family: 'Monaco', monospace;
      color: #e0e0e0;
      box-shadow: 0 2px 8px rgba(0, 212, 255, 0.1);
    ">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h3 style="margin: 0; color: #00d4ff; font-size: 16px;">
          🕷️ Strider Crawler Control
        </h3>
        <span id="striderStatus" style="
          display: inline-block;
          background: #333;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 12px;
          color: #aaa;
        ">Not Running</span>
      </div>

      <!-- Seed URLs Input -->
      <div style="margin-bottom: 12px;">
        <label style="display: block; margin-bottom: 6px; color: #00d4ff; font-size: 12px;">
          Seed URLs (comma-separated):
        </label>
        <input 
          id="striderSeedUrls" 
          type="text" 
          placeholder="https://example.com, https://github.com"
          style="
            width: 100%;
            padding: 8px;
            background: #0f1419;
            border: 1px solid #333;
            border-radius: 4px;
            color: #e0e0e0;
            font-size: 12px;
            font-family: monospace;
            box-sizing: border-box;
          "
        />
      </div>

      <!-- Worker Count -->
      <div style="margin-bottom: 12px;">
        <label style="display: block; margin-bottom: 6px; color: #00d4ff; font-size: 12px;">
          Worker Threads: <span id="workerCountDisplay">3</span>
        </label>
        <input 
          id="striderWorkerCount" 
          type="range" 
          min="1" 
          max="8" 
          value="3"
          style="width: 100%;"
        />
      </div>

      <!-- Mode Toggle -->
      <div style="margin-bottom: 16px;">
        <label style="display: flex; align-items: center; gap: 8px; color: #aaa; cursor: pointer; font-size: 12px;">
          <input 
            id="striderRandomWalk" 
            type="checkbox"
          />
          <span>🚶 Random Walk Mode (exploration)</span>
        </label>
      </div>

      <!-- Runtime Controls -->
      <div style="margin-bottom: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
        <label style="display: flex; align-items: center; gap: 8px; color: #aaa; cursor: pointer; font-size: 12px;">
          <input id="striderStealth" type="checkbox" />
          <span>🕶 Stealth</span>
        </label>
        <label style="display: flex; flex-direction: column; gap: 4px; color: #aaa; font-size: 12px;">
          <span>Anti-bot profile</span>
          <select id="striderAntiBot" style="background: #0f1419; color: #ddd; border: 1px solid #333; border-radius: 4px; padding: 5px;">
            <option value="off">off</option>
            <option value="balanced">balanced</option>
            <option value="evasive" selected>evasive</option>
            <option value="strict">strict</option>
          </select>
        </label>
      </div>
      <div style="margin-bottom: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
        <label style="display: flex; flex-direction: column; gap: 4px; color: #aaa; font-size: 12px;">
          <span>Stall threshold (ms)</span>
          <input id="striderStallThreshold" type="number" min="5000" step="1000" value="30000" style="background: #0f1419; color: #ddd; border: 1px solid #333; border-radius: 4px; padding: 5px;" />
        </label>
        <label style="display: flex; flex-direction: column; gap: 4px; color: #aaa; font-size: 12px;">
          <span>Stale in-progress (ms)</span>
          <input id="striderStaleInProgress" type="number" min="5000" step="1000" value="25000" style="background: #0f1419; color: #ddd; border: 1px solid #333; border-radius: 4px; padding: 5px;" />
        </label>
      </div>

      <!-- Control Buttons -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px;">
        <button 
          id="striderStartBtn" 
          style="
            padding: 10px;
            background: linear-gradient(135deg, #00d4ff 0%, #0099cc 100%);
            color: #000;
            border: none;
            border-radius: 4px;
            font-weight: bold;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
          "
          onmouseover="this.style.transform='scale(1.05)'"
          onmouseout="this.style.transform='scale(1)'"
        >
          ▶ Start
        </button>
        <button 
          id="striderStopBtn" 
          style="
            padding: 10px;
            background: #444;
            color: #e0e0e0;
            border: none;
            border-radius: 4px;
            font-weight: bold;
            cursor: pointer;
            font-size: 12px;
            opacity: 0.5;
            cursor: not-allowed;
          "
          disabled
        >
          ⏹ Stop
        </button>
      </div>

      <!-- Stats Display -->
      <div id="striderStats" style="
        background: #0f1419;
        border-radius: 4px;
        padding: 12px;
        font-size: 11px;
        line-height: 1.8;
        color: #888;
        font-family: monospace;
        display: none;
      ">
        <div style="color: #00d4ff;">📊 Stats:</div>
        <div>Queued: <span id="statQueued">0</span></div>
        <div>Visited: <span id="statVisited">0</span></div>
        <div>In Progress: <span id="statInProgress">0</span></div>
        <div style="margin-top: 8px; border-top: 1px solid #333; padding-top: 8px;">
          <div>Fetched: <span id="statFetched">0</span></div>
          <div>Failed: <span id="statFailed">0</span></div>
          <div>Links: <span id="statLinks">0</span></div>
        </div>
        <div style="margin-top: 8px; border-top: 1px solid #333; padding-top: 8px;">
          <div>Puppeteered: <span id="statPuppeteered">0</span></div>
          <div>Escapes: <span id="statEscapes">0</span></div>
          <div>Challenges: <span id="statChallenges">0</span></div>
          <div>Solved: <span id="statChallengesSolved">0</span></div>
        </div>
        <div style="margin-top: 8px; border-top: 1px solid #333; padding-top: 8px;">
          <div>No Progress: <span id="statNoProgress">0</span>s</div>
          <div>Stall Events: <span id="statStalls">0</span></div>
          <div>Recoveries: <span id="statRecoveries">0</span></div>
        </div>
      </div>
    </div>
  `;
}

// Initialize Strider UI
function initStriderUI() {
  const startBtn = document.getElementById('striderStartBtn');
  const stopBtn = document.getElementById('striderStopBtn');
  const seedUrlsInput = document.getElementById('striderSeedUrls');
  const workerCountInput = document.getElementById('striderWorkerCount');
  const workerCountDisplay = document.getElementById('workerCountDisplay');
  const randomWalkCheckbox = document.getElementById('striderRandomWalk');
  const stealthCheckbox = document.getElementById('striderStealth');
  const antiBotSelect = document.getElementById('striderAntiBot');
  const stallThresholdInput = document.getElementById('striderStallThreshold');
  const staleInProgressInput = document.getElementById('striderStaleInProgress');

  let isRunning = false;
  let statsInterval = null;

  // Update worker count display
  workerCountInput.addEventListener('change', (e) => {
    workerCountDisplay.textContent = e.target.value;
  });

  // Start crawler
  startBtn.addEventListener('click', async () => {
    const seedUrls = seedUrlsInput.value
      .split(',')
      .map(u => u.trim())
      .filter(u => u.length > 0);

    if (seedUrls.length === 0) {
      alert('Please enter at least one seed URL');
      return;
    }

    const workerCount = parseInt(workerCountInput.value);
    const randomWalk = randomWalkCheckbox.checked;
    const stealth = stealthCheckbox.checked;
    const antiBot = String(antiBotSelect.value || 'off');
    const stallThresholdMs = parseInt(stallThresholdInput.value, 10) || 30000;
    const staleInProgressMs = parseInt(staleInProgressInput.value, 10) || 25000;

    try {
      const response = await fetch('/api/strider/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seedUrls,
          workerCount,
          randomWalk,
          stealth,
          antiBot,
          challengeHandling: stealth ? 'attempt' : 'observe',
          stallThresholdMs,
          staleInProgressMs,
        }),
      });

      const result = await response.json();

      if (result.ok) {
        isRunning = true;
        updateUI();
        document.getElementById('striderStats').style.display = 'block';

        // Start polling stats
        statsInterval = setInterval(pollStats, 2000);
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      alert(`Network error: ${error.message}`);
    }
  });

  // Stop crawler
  stopBtn.addEventListener('click', async () => {
    try {
      const response = await fetch('/api/strider/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const result = await response.json();

      if (result.ok) {
        isRunning = false;
        updateUI();
        clearInterval(statsInterval);

        console.log('Final stats:', result.stats);
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      alert(`Network error: ${error.message}`);
    }
  });

  // Poll stats
  async function pollStats() {
    try {
      const response = await fetch('/api/strider/stats');
      const result = await response.json();

      if (result.ok && result.running) {
        const { frontier, fetch: fetchStats, puppeteer, global, health } = result.stats;

        document.getElementById('statQueued').textContent = frontier.queueSize;
        document.getElementById('statVisited').textContent = frontier.visitedCount;
        document.getElementById('statInProgress').textContent = frontier.inProgressCount;
        document.getElementById('statFetched').textContent = fetchStats.fetched;
        document.getElementById('statFailed').textContent = fetchStats.failed;
        document.getElementById('statLinks').textContent = fetchStats.linksExtracted;
        document.getElementById('statPuppeteered').textContent = puppeteer.puppeteered;
        document.getElementById('statEscapes').textContent = puppeteer.escapeHatches;
        document.getElementById('statChallenges').textContent = puppeteer.challengeDetected || 0;
        document.getElementById('statChallengesSolved').textContent = puppeteer.challengeSolved || 0;
        document.getElementById('statNoProgress').textContent = Math.round((health?.noProgressMs || 0) / 1000);
        document.getElementById('statStalls').textContent = global?.stallEvents || 0;
        document.getElementById('statRecoveries').textContent = global?.recoveries || 0;
      } else {
        // Crawler stopped
        isRunning = false;
        updateUI();
        clearInterval(statsInterval);
      }
    } catch (error) {
      console.warn('Stats fetch error:', error);
    }
  }

  // Update UI based on running state
  function updateUI() {
    const status = document.getElementById('striderStatus');
    
    if (isRunning) {
      startBtn.style.opacity = '0.5';
      startBtn.style.cursor = 'not-allowed';
      startBtn.disabled = true;

      stopBtn.style.opacity = '1';
      stopBtn.style.cursor = 'pointer';
      stopBtn.disabled = false;

      status.textContent = '🟢 Running';
      status.style.color = '#00d4ff';
      status.style.background = 'rgba(0, 212, 255, 0.1)';
    } else {
      startBtn.style.opacity = '1';
      startBtn.style.cursor = 'pointer';
      startBtn.disabled = false;

      stopBtn.style.opacity = '0.5';
      stopBtn.style.cursor = 'not-allowed';
      stopBtn.disabled = true;

      status.textContent = '🔴 Idle';
      status.style.color = '#888';
      status.style.background = '#333';
    }
  }

  // Initial UI state
  updateUI();
}

// Export for frontend integration
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createStriderPanel, initStriderUI };
} else {
  // In browser environment, auto-initialize if element exists
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('striderPanel')) {
      initStriderUI();
    }
  });
}
