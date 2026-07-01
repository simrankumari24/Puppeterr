module.exports = {
  HUMAN_BRIDGE_HTML: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Human Bridge</title>
  <style>
    :root {
      --bg: #0b1320;
      --panel: #0f1b2d;
      --panel-2: #12233b;
      --line: rgba(152, 190, 255, 0.25);
      --text: #eaf2ff;
      --muted: #9cb3cf;
      --ok: #67d57a;
      --warn: #ffc86a;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: radial-gradient(circle at 0% 0%, rgba(82, 153, 255, 0.2), transparent 38%), linear-gradient(130deg, #081221 0%, #0c1728 100%);
      color: var(--text);
      font-family: "Segoe UI", Tahoma, sans-serif;
      padding: 14px;
    }
    .wrap {
      max-width: 1400px;
      margin: 0 auto;
      display: grid;
      gap: 12px;
    }
    .card {
      border: 1px solid var(--line);
      border-radius: 14px;
      background: linear-gradient(180deg, rgba(17, 32, 52, 0.95), rgba(12, 25, 42, 0.92));
      padding: 12px;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }
    .tag {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 4px 10px;
      color: var(--muted);
      font-size: 12px;
    }
    .tag.ok { color: var(--ok); }
    .tag.warn { color: var(--warn); }
    .url {
      word-break: break-all;
      color: #b9d8ff;
      font-size: 13px;
    }
    .stage {
      position: relative;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid var(--line);
      background: #070d18;
      min-height: 420px;
      display: grid;
      place-items: center;
    }
    #bridgeShot {
      width: 100%;
      height: auto;
      display: block;
      user-select: none;
      cursor: crosshair;
    }
    .note {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
    }
    .toolbar {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .latency {
      color: var(--muted);
      font-size: 12px;
      margin-left: auto;
    }
    .click-dot {
      position: absolute;
      width: 14px;
      height: 14px;
      border-radius: 999px;
      border: 2px solid var(--ok);
      pointer-events: none;
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.4);
      z-index: 5;
    }
    .click-dot.show {
      animation: clickPulse 420ms ease-out forwards;
    }
    @keyframes clickPulse {
      0% { opacity: 0.95; transform: translate(-50%, -50%) scale(0.3); }
      100% { opacity: 0; transform: translate(-50%, -50%) scale(2.6); }
    }
    button {
      border: 1px solid var(--line);
      background: var(--panel-2);
      color: var(--text);
      border-radius: 10px;
      padding: 8px 12px;
      cursor: pointer;
    }
    button:hover { filter: brightness(1.08); }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="card">
      <div class="meta">
        <span id="bridgeActive" class="tag">Waiting</span>
        <span id="bridgeChecks" class="tag">checks: 0/0</span>
        <span id="bridgeClicks" class="tag">clicks: 0</span>
        <span id="bridgeStatus" class="tag">Ready</span>
      </div>
      <p id="bridgeUrl" class="url">about:blank</p>
      <p class="note">Click directly on the screenshot to relay that click into the live Playwright page. Keep this tab open while solving CAPTCHA.</p>
      <div class="toolbar">
        <button id="refreshBtn" type="button">Refresh Now</button>
        <span id="bridgeLatency" class="latency">refresh: --</span>
      </div>
    </section>
    <section class="card stage">
      <img id="bridgeShot" alt="Live browser screenshot" draggable="false" />
      <div id="clickDot" class="click-dot" aria-hidden="true"></div>
    </section>
  </div>

  <script>
    const shot = document.getElementById("bridgeShot");
    const statusTag = document.getElementById("bridgeStatus");
    const activeTag = document.getElementById("bridgeActive");
    const checksTag = document.getElementById("bridgeChecks");
    const clicksTag = document.getElementById("bridgeClicks");
    const urlEl = document.getElementById("bridgeUrl");
    const refreshBtn = document.getElementById("refreshBtn");
    const latencyEl = document.getElementById("bridgeLatency");
    const clickDot = document.getElementById("clickDot");

    let latestState = { active: false, checks: 0, limit: 0, url: "about:blank", clickCount: 0 };
    let busy = false;
    let tickTimer = null;
    let eventSource = null;

    function setStatus(text) {
      statusTag.textContent = text;
    }

    async function pullState() {
      const startedAt = Date.now();
      const response = await fetch("/api/human/state", { credentials: "same-origin" });
      if (response.status === 401) {
        window.location.href = "/";
        return;
      }
      if (!response.ok) throw new Error("Failed to fetch state");
      latestState = await response.json();
      if (latencyEl) {
        latencyEl.textContent = "refresh: " + Math.max(0, Date.now() - startedAt) + "ms";
      }
      activeTag.textContent = latestState.active ? "CAPTCHA active" : "Idle";
      activeTag.className = "tag " + (latestState.active ? "warn" : "ok");
      checksTag.textContent = "checks: " + (latestState.checks || 0) + "/" + (latestState.limit || 0);
      clicksTag.textContent = "clicks: " + (latestState.clickCount || 0);
      urlEl.textContent = latestState.url || "about:blank";
      if (!latestState.active) {
        const reason = latestState.closureReason || "Bridge idle";
        setStatus(reason + ". Waiting for next CAPTCHA event.");
      }
    }

    function refreshShot() {
      shot.src = "/screenshot?human=1&ts=" + Date.now();
    }

    function showClickFeedback(event) {
      if (!clickDot) return;
      const rect = shot.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      clickDot.style.left = x + "px";
      clickDot.style.top = y + "px";
      clickDot.classList.remove("show");
      void clickDot.offsetWidth;
      clickDot.classList.add("show");
    }

    function scheduleTick() {
      if (tickTimer) window.clearTimeout(tickTimer);
      const interval = latestState.active ? 900 : 2200;
      tickTimer = window.setTimeout(tick, interval);
    }

    function connectEvents() {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      eventSource = new EventSource("/events");
      eventSource.onmessage = function(event) {
        let payload = null;
        try { payload = JSON.parse(event.data); } catch { return; }
        if (!payload || !payload.type) return;
        if (payload.type === "screenshot" && payload.img) {
          shot.src = "data:image/jpeg;base64," + payload.img;
          return;
        }
        if (payload.type === "url" && payload.url) {
          urlEl.textContent = payload.url;
          return;
        }
        if (payload.type === "human_needed" || payload.type === "bridge_closed" || payload.type === "captcha_solved" || payload.type === "human_click") {
          pullState().catch(function(error) { setStatus(error.message); }).finally(scheduleTick);
        }
      };
      eventSource.onerror = function() {
        setStatus("Live stream reconnecting...");
      };
    }

    async function relayClick(event) {
      if (busy) return;
      const rect = shot.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      showClickFeedback(event);
      const xRatio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const yRatio = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
      busy = true;
      setStatus("Relaying click...");
      try {
        const response = await fetch("/api/human/click", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ xRatio, yRatio, button: "left" })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Relay failed");
        setStatus("Click relayed to Playwright");
        await pullState();
        window.setTimeout(refreshShot, 280);
      } catch (error) {
        setStatus(error.message);
      } finally {
        busy = false;
        scheduleTick();
      }
    }

    async function tick() {
      try {
        await pullState();
        refreshShot();
      } catch (error) {
        setStatus(error.message);
      } finally {
        scheduleTick();
      }
    }

    shot.addEventListener("click", relayClick);
    refreshBtn.addEventListener("click", tick);
    connectEvents();
    tick();
  </script>
</body>
</html>
`
};
