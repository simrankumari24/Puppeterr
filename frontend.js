module.exports = {
  FRONTEND_HTML: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Puppeterr AI</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Space+Grotesk:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --line: rgba(127, 156, 189, 0.16);
      --line-strong: rgba(127, 156, 189, 0.32);
      --text: #edf4ff;
      --muted: #8ea7c6;
      --accent: #8de26a;
      --accent-2: #53c8ff;
      --danger: #ff7d7d;
      --warn: #ffca63;
      --shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
    }

    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      min-height: 100dvh;
      background:
        radial-gradient(circle at top left, rgba(83, 200, 255, 0.18), transparent 28%),
        radial-gradient(circle at top right, rgba(141, 226, 106, 0.14), transparent 24%),
        linear-gradient(135deg, #06101d 0%, #081523 42%, #0b1623 100%);
      color: var(--text);
      font-family: "Space Grotesk", "Segoe UI", sans-serif;
    }

    body::before {
      content: "";
      position: fixed;
      inset: 0;
      background-image:
        linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
      background-size: 28px 28px;
      pointer-events: none;
      mask-image: radial-gradient(circle at center, black 35%, transparent 85%);
    }

    button, input, textarea, select { font: inherit; }
    button { cursor: pointer; }
    .hidden { display: none !important; }

    :focus-visible {
      outline: 2px solid rgba(131, 212, 255, 0.9);
      outline-offset: 2px;
    }

    .login-shell, .shell {
      min-height: 100dvh;
      height: auto;
      padding: clamp(10px, 1.8vw, 24px);
      position: relative;
    }

    .shell {
      overflow: auto;
    }

    .login-shell {
      display: grid;
      place-items: center;
    }

    .login-card, .panel, .topbar {
      border: 1px solid var(--line-strong);
      background: linear-gradient(180deg, rgba(8, 20, 35, 0.94) 0%, rgba(10, 24, 41, 0.82) 100%);
      box-shadow: var(--shadow);
      backdrop-filter: blur(14px);
    }

    .login-card {
      width: min(480px, 100%);
      border-radius: 28px;
      padding: 34px;
    }

    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(141, 226, 106, 0.12);
      border: 1px solid rgba(141, 226, 106, 0.25);
      color: #d8ffcb;
      font-size: 12px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    h1, h2, h3, p { margin: 0; }

    .login-card h1 {
      margin-top: 18px;
      font-size: clamp(34px, 7vw, 52px);
      line-height: 0.95;
      letter-spacing: -0.04em;
    }

    .login-copy, .meta, .hint, .panel-subtitle, .footer-note, .message-meta, .chat-time {
      color: var(--muted);
      line-height: 1.55;
      font-size: 13px;
    }

    .login-copy { margin: 16px 0 26px; }

    .field {
      display: grid;
      gap: 8px;
      margin-bottom: 14px;
    }

    .field label {
      color: #c9d9f2;
      font-size: 13px;
      font-weight: 500;
    }

    .field input,
    .composer textarea,
    .toolbar-select {
      width: 100%;
      color: var(--text);
      background: rgba(3, 10, 19, 0.72);
      border: 1px solid rgba(127, 156, 189, 0.22);
      border-radius: 14px;
      padding: 14px 16px;
      outline: none;
      transition: border-color 0.18s ease, box-shadow 0.18s ease;
    }

    .field input:focus,
    .composer textarea:focus,
    .toolbar-select:focus {
      border-color: rgba(83, 200, 255, 0.6);
      box-shadow: 0 0 0 4px rgba(83, 200, 255, 0.12);
    }

    .button-row, .header-actions, .panel-actions, .composer-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .primary-btn, .secondary-btn, .ghost-btn, .chat-action {
      border-radius: 14px;
      padding: 12px 16px;
      border: 1px solid transparent;
      transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
    }

    .primary-btn:hover, .secondary-btn:hover, .ghost-btn:hover, .chat-action:hover { transform: translateY(-1px); }

    .primary-btn {
      background: linear-gradient(135deg, #a7ff7d 0%, #61d95e 100%);
      color: #0b1d09;
      font-weight: 700;
      box-shadow: 0 12px 28px rgba(97, 217, 94, 0.22);
    }

    .secondary-btn {
      background: rgba(83, 200, 255, 0.14);
      color: #def6ff;
      border-color: rgba(83, 200, 255, 0.22);
    }

    .ghost-btn, .chat-action {
      background: rgba(255, 255, 255, 0.03);
      color: var(--text);
      border-color: rgba(127, 156, 189, 0.16);
    }

    .app-shell {
      display: grid;
      gap: clamp(10px, 1.2vw, 16px);
      min-height: calc(100dvh - clamp(20px, 3.6vw, 48px));
      grid-template-rows: auto 1fr;
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 22px;
      border-radius: 24px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .brand-mark {
      width: 48px;
      height: 48px;
      border-radius: 16px;
      display: grid;
      place-items: center;
      background: linear-gradient(135deg, rgba(83, 200, 255, 0.22), rgba(141, 226, 106, 0.18));
      border: 1px solid rgba(127, 156, 189, 0.2);
      font-size: 24px;
    }

    .app-title {
      font-size: clamp(24px, 3vw, 34px);
      letter-spacing: -0.04em;
    }

    .status-cluster {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border-radius: 999px;
      border: 1px solid rgba(127, 156, 189, 0.18);
      background: rgba(255, 255, 255, 0.03);
      color: #d9e8fc;
      font-size: 13px;
    }

    .status-dot {
      width: 9px;
      height: 9px;
      border-radius: 999px;
      background: var(--accent);
      box-shadow: 0 0 0 6px rgba(141, 226, 106, 0.12);
    }

    .workspace {
      display: grid;
      grid-template-columns: minmax(260px, 1.1fr) minmax(420px, 1.9fr) minmax(300px, 1.1fr);
      gap: clamp(10px, 1.2vw, 16px);
      min-height: 0;
      flex: 1;
    }

    .panel {
      min-height: clamp(420px, 68dvh, 900px);
      display: flex;
      flex-direction: column;
      border-radius: 24px;
      overflow: hidden;
    }

    .panel-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
      padding: 18px 18px 14px;
      border-bottom: 1px solid var(--line);
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0%, transparent 100%);
    }

    .panel-title {
      font-size: 18px;
      letter-spacing: -0.03em;
    }

    .scroll-area {
      min-height: 0;
      overflow: auto;
      padding: 16px;
    }

    .chat-list, .memory-list, .timeline, .toolbar-grid, .browser-stack {
      display: grid;
      gap: 12px;
    }

    .timeline {
      min-height: 0;
      align-content: start;
    }

    .chat-item {
      padding: 14px;
      min-height: clamp(112px, 16dvh, 180px);
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.025);
      border: 1px solid rgba(127, 156, 189, 0.12);
      transition: border-color 0.18s ease, transform 0.18s ease, background 0.18s ease;
      text-align: left;
    }

    .chat-item:hover { transform: translateY(-1px); border-color: rgba(83, 200, 255, 0.32); }

    .chat-item.active {
      background: linear-gradient(180deg, rgba(83, 200, 255, 0.12) 0%, rgba(83, 200, 255, 0.05) 100%);
      border-color: rgba(83, 200, 255, 0.34);
    }

    .chat-title-row, .timeline-topline, .browser-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .chat-title {
      font-size: 15px;
      font-weight: 700;
    }

    .tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(127, 156, 189, 0.16);
      font-size: 12px;
      color: var(--muted);
    }

    .timeline-shell {
      display: grid;
      grid-template-rows: auto 1fr auto;
      min-height: 0;
    }

    .message-card, .event-card, .browser-frame, .model-card, .memory-card {
      border-radius: 20px;
      border: 1px solid rgba(127, 156, 189, 0.14);
      background: rgba(255, 255, 255, 0.03);
    }

    .message-card, .event-card, .memory-card, .model-card {
      padding: 14px 16px;
    }

    .message-card.user {
      background: linear-gradient(180deg, rgba(83, 200, 255, 0.13) 0%, rgba(83, 200, 255, 0.04) 100%);
      border-color: rgba(83, 200, 255, 0.28);
    }

    .message-card.assistant {
      background: linear-gradient(180deg, rgba(141, 226, 106, 0.12) 0%, rgba(141, 226, 106, 0.03) 100%);
      border-color: rgba(141, 226, 106, 0.22);
    }

    .event-card.status { border-left: 3px solid var(--warn); }
    .event-card.think { border-left: 3px solid #9ea8ff; }
    .event-card.agent { border-left: 3px solid var(--accent); }
    .event-card.error { border-left: 3px solid var(--danger); }
    .event-card.step { border-left: 3px solid var(--accent-2); }

    .runtime-dropdown {
      border-radius: 20px;
      border: 1px solid rgba(127, 156, 189, 0.18);
      background: rgba(6, 16, 29, 0.6);
      overflow: hidden;
    }

    .runtime-dropdown summary {
      list-style: none;
      cursor: pointer;
      padding: 14px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font-size: 13px;
      color: #d5e6ff;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.015) 100%);
      border-bottom: 1px solid rgba(127, 156, 189, 0.16);
    }

    .runtime-dropdown summary::-webkit-details-marker {
      display: none;
    }

    .runtime-chevron {
      color: var(--muted);
      font-size: 12px;
      min-width: 18px;
      text-align: right;
    }

    .runtime-log {
      max-height: clamp(180px, 32dvh, 360px);
      overflow: auto;
      padding: 10px;
      display: grid;
      gap: 8px;
    }

    .runtime-entry {
      border-radius: 14px;
      border: 1px solid rgba(127, 156, 189, 0.14);
      background: rgba(255, 255, 255, 0.025);
      padding: 10px 12px;
      border-left: 3px solid rgba(127, 156, 189, 0.24);
    }

    .runtime-entry.status { border-left-color: var(--warn); }
    .runtime-entry.think { border-left-color: #9ea8ff; }
    .runtime-entry.agent { border-left-color: var(--accent); }
    .runtime-entry.error { border-left-color: var(--danger); }
    .runtime-entry.step { border-left-color: var(--accent-2); }

    .runtime-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 6px;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #cde2ff;
    }

    .runtime-body {
      white-space: pre-wrap;
      line-height: 1.55;
      word-break: break-word;
      font-size: 13px;
      color: #e3efff;
    }

    .typing-caret {
      display: inline-block;
      width: 8px;
      height: 1.05em;
      margin-left: 2px;
      border-radius: 2px;
      background: rgba(141, 226, 106, 0.9);
      vertical-align: text-bottom;
      animation: blinkCaret 1s steps(1, end) infinite;
    }

    @keyframes blinkCaret {
      0%, 45% { opacity: 1; }
      46%, 100% { opacity: 0; }
    }

    .message-role, .event-role {
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #cde2ff;
      margin-bottom: 10px;
    }

    .message-content, .event-content {
      white-space: pre-wrap;
      line-height: 1.65;
      word-break: break-word;
    }

    .message-content .katex-display,
    .runtime-body .katex-display {
      margin: 10px 0;
      overflow-x: auto;
      overflow-y: hidden;
    }

    .composer {
      padding: 16px;
      border-top: 1px solid var(--line);
      background: linear-gradient(180deg, rgba(9, 21, 35, 0.8) 0%, rgba(7, 15, 25, 0.95) 100%);
      position: sticky;
      bottom: 0;
      z-index: 2;
      backdrop-filter: blur(6px);
    }

    .composer textarea {
      min-height: clamp(120px, 20dvh, 220px);
      max-height: clamp(220px, 36dvh, 420px);
      resize: vertical;
    }

    .quick-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }

    .quick-chip {
      border: 1px solid rgba(127, 156, 189, 0.22);
      border-radius: 999px;
      padding: 6px 10px;
      background: rgba(255, 255, 255, 0.03);
      color: #d7e9ff;
      font-size: 12px;
      cursor: pointer;
      transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
    }

    .quick-chip:hover {
      border-color: rgba(83, 200, 255, 0.45);
      background: rgba(83, 200, 255, 0.12);
      transform: translateY(-1px);
    }

    .runtime-controls {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      padding: 8px 10px;
      border-bottom: 1px solid rgba(127, 156, 189, 0.16);
      background: rgba(255, 255, 255, 0.015);
    }

    .runtime-filter-btn {
      border: 1px solid rgba(127, 156, 189, 0.2);
      background: rgba(255, 255, 255, 0.03);
      color: #d3e5ff;
      border-radius: 999px;
      padding: 4px 9px;
      font-size: 11px;
      cursor: pointer;
    }

    .runtime-filter-btn.off {
      opacity: 0.5;
      background: rgba(255, 255, 255, 0.01);
    }

    .runtime-search {
      margin-left: auto;
      min-width: 170px;
      max-width: 220px;
      border: 1px solid rgba(127, 156, 189, 0.2);
      background: rgba(3, 10, 19, 0.6);
      color: var(--text);
      border-radius: 8px;
      padding: 5px 8px;
      font-size: 12px;
      outline: none;
    }

    .composer-actions {
      justify-content: space-between;
      margin-top: 12px;
    }

    .browser-frame {
      display: grid;
      grid-template-rows: auto 1fr;
      height: 100%;
      min-height: clamp(300px, 48dvh, 760px);
      position: relative;
      overflow: hidden;
      background: rgba(3, 10, 19, 0.92);
    }

    .demo-cursor {
      position: absolute;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 2px solid rgba(131, 212, 255, 0.96);
      background: radial-gradient(circle at 35% 35%, rgba(131, 212, 255, 0.35), rgba(131, 212, 255, 0.04));
      box-shadow: 0 0 0 6px rgba(131, 212, 255, 0.1), 0 5px 18px rgba(0, 0, 0, 0.42);
      transform: translate(0, 0);
      pointer-events: none;
      z-index: 5;
      transition: opacity 0.25s ease;
      opacity: 0.92;
    }

    .demo-click-pulse {
      position: absolute;
      width: 14px;
      height: 14px;
      border-radius: 999px;
      border: 2px solid rgba(141, 226, 106, 0.95);
      pointer-events: none;
      z-index: 4;
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.2);
    }

    .demo-click-pulse.active {
      animation: clickPulse 380ms ease-out forwards;
    }

    @keyframes clickPulse {
      0% {
        opacity: 0.92;
        transform: translate(-50%, -50%) scale(0.25);
      }
      100% {
        opacity: 0;
        transform: translate(-50%, -50%) scale(2.6);
      }
    }

    .browser-toolbar {
      padding: 12px 14px;
      border-bottom: 1px solid var(--line);
      font-size: 12px;
      color: #d2e6ff;
    }

    .browser-url {
      display: block;
      margin-top: 8px;
      color: var(--muted);
      font-family: "IBM Plex Mono", monospace;
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    #screenshot {
      display: block;
      width: 100%;
      height: auto;
      max-height: 100%;
      object-fit: contain;
      background: #02070d;
    }

    .toolbar-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .model-card label {
      display: block;
      font-size: 12px;
      color: #c7d9f4;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .empty-state {
      padding: 20px;
      text-align: center;
      border: 1px dashed rgba(127, 156, 189, 0.18);
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.02);
      color: var(--muted);
    }

    ::-webkit-scrollbar { width: 10px; height: 10px; }
    ::-webkit-scrollbar-thumb { background: rgba(127, 156, 189, 0.26); border-radius: 999px; }
    ::-webkit-scrollbar-track { background: transparent; }

    @media (max-width: 1360px) {
      .workspace { grid-template-columns: minmax(220px, 0.95fr) minmax(380px, 1.35fr) minmax(260px, 0.95fr); }
    }

    @media (max-width: 1240px) {
      .workspace { grid-template-columns: minmax(230px, 0.9fr) minmax(0, 1.2fr); }
      .browser-panel { grid-column: 1 / -1; }
    }

    @media (max-width: 860px) {
      .login-shell, .shell { padding: 12px; }
      .topbar { flex-direction: column; align-items: flex-start; }
      .workspace { grid-template-columns: 1fr; }
      .panel { min-height: clamp(340px, 58dvh, 620px); }
      .composer textarea { min-height: 120px; }
      .quick-actions {
        flex-wrap: nowrap;
        overflow-x: auto;
        padding-bottom: 4px;
      }
      .quick-chip {
        white-space: nowrap;
        flex: 0 0 auto;
      }
      .toolbar-grid { grid-template-columns: 1fr; }
    }

    @media (max-width: 560px) {
      .topbar { border-radius: 16px; padding: 12px; }
      .panel { border-radius: 16px; }
      .panel-header { padding: 12px 12px 10px; }
      .scroll-area, .composer { padding: 12px; }
      .status-cluster { width: 100%; justify-content: flex-start; }
      .pill { width: 100%; justify-content: center; }
      .header-actions { width: 100%; }
      .header-actions button { flex: 1; }
    }

    @media (prefers-reduced-motion: reduce) {
      * {
        animation: none !important;
        transition: none !important;
        scroll-behavior: auto !important;
      }
    }
  </style>
</head>
<body>
  <div class="login-shell" id="loginShell">
    <div class="login-card">
      <div class="eyebrow"><span>Secure entry</span><span id="loginModeHint">single-operator workspace</span></div>
      <h1>Puppeterr<br>Command Center</h1>
      <p class="login-copy">Sign in to review browser runs, resume chat threads, and steer the planner, router, reasoner, and vision stack from one workspace.</p>
      <form id="loginForm">
        <div class="field">
          <label for="loginUsername">Username</label>
          <input id="loginUsername" name="username" autocomplete="username" required />
        </div>
        <div class="field">
          <label for="loginPassword">Password</label>
          <input id="loginPassword" type="password" name="password" autocomplete="current-password" required />
        </div>
        <div class="button-row">
          <button class="primary-btn" type="submit" id="loginBtn">Enter Command Center</button>
        </div>
        <div class="hint" id="loginHint">Authentication is handled by the local Node server.</div>
        <div class="hint hidden" id="loginError"></div>
      </form>
    </div>
  </div>

  <div class="shell hidden" id="appShell">
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark">AI</div>
          <div>
            <div class="eyebrow">live orchestration cockpit</div>
            <h1 class="app-title">Puppeterr Command Center</h1>
            <div class="meta">A friendlier operator view with login, chat history, browser telemetry, and model routing controls.</div>
          </div>
        </div>
        <div class="status-cluster">
          <div class="pill"><span class="status-dot"></span><span id="connectionStatus">Connecting</span></div>
          <div class="pill">Signed in as <strong id="currentUser">-</strong></div>
          <div class="pill" id="modelModeStatus">Model: default</div>
          <div class="header-actions">
            <button class="secondary-btn" id="codingSectorBtn" type="button">Coding sector</button>
            <button class="secondary-btn" id="refreshAllBtn" type="button">Refresh</button>
            <button class="ghost-btn" id="logoutBtn" type="button">Log out</button>
          </div>
        </div>
      </header>

      <div class="workspace">
        <aside class="panel">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">Chat History</h2>
              <div class="panel-subtitle">Resume old runs or start a new conversation.</div>
            </div>
            <div class="panel-actions">
              <button class="chat-action" id="newChatBtn" type="button">New chat</button>
            </div>
          </div>
          <div class="scroll-area">
            <div class="chat-list" id="chatList"></div>
            <div class="memory-card" style="margin-top:16px;">
              <div class="timeline-topline">
                <strong>Memory</strong>
                <button class="ghost-btn" id="refreshMemoryBtn" type="button">Refresh</button>
              </div>
              <div class="memory-list" id="memoryList" style="margin-top:14px;"></div>
            </div>
          </div>
        </aside>

        <main class="panel timeline-shell">
          <div class="panel-header">
            <div>
              <div class="timeline-topline">
                <h2 class="panel-title" id="timelineTitle">Conversation</h2>
                <span class="tag" id="messageCountTag">0 messages</span>
              </div>
              <div class="panel-subtitle" id="timelineSubtitle">Select a thread to inspect its conversation and live execution feed.</div>
            </div>
          </div>
          <div class="scroll-area">
            <div class="timeline" id="timeline"></div>
          </div>
          <div class="composer">
            <div class="field">
              <label for="composerInput">Task or message</label>
              <textarea id="composerInput" placeholder="Ask a question, describe a browsing task, or tell the agent what to do next."></textarea>
              <div class="quick-actions" id="quickActions">
                <button class="quick-chip" type="button" data-quick-prompt="Open Wikipedia and summarize the first paragraph about potatoes.">Wiki summary</button>
                <button class="quick-chip" type="button" data-quick-prompt="Go to Britannica and extract the first two paragraphs about potato agriculture.">Britannica extract</button>
                <button class="quick-chip" type="button" data-quick-prompt="Compare Wikipedia and Britannica on potatoes with 3 similarities and 3 differences.">Cross-source compare</button>
                <button class="quick-chip" type="button" data-quick-prompt="Go to FAO and find latest global potato production statistics.">FAO stats</button>
              </div>
            </div>
            <div class="composer-actions">
              <div class="footer-note">Enter sends. Shift+Enter makes a new line. Runtime logs stream in automatically while a task is running.</div>
              <button class="primary-btn" id="sendBtn" type="button">Send to agent</button>
            </div>
          </div>
        </main>

        <section class="panel browser-panel">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">Browser + Model Stack</h2>
              <div class="panel-subtitle">Watch the live page and choose which Cloudflare models drive each stage.</div>
            </div>
            <div class="panel-actions">
              <button class="ghost-btn" id="refreshModelsBtn" type="button">Refresh models</button>
            </div>
          </div>
          <div class="scroll-area">
            <div class="browser-stack">
              <div class="browser-frame">
                <div class="browser-toolbar">
                  <div>Live Browser Snapshot</div>
                  <span class="browser-url" id="browserUrl">about:blank</span>
                </div>
                <img id="screenshot" src="" alt="Browser screenshot" />
                <div class="demo-cursor" id="demoCursor" aria-hidden="true"></div>
                <div class="demo-click-pulse" id="demoClickPulse" aria-hidden="true"></div>
              </div>
              <div class="toolbar-grid" id="modelGrid"></div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>

  <script>
    const state = {
      session: null,
      chats: [],
      currentChat: null,
      selectedChatId: null,
      memory: [],
      models: { catalog: [], current: {}, defaults: {} },
      runtime: {},
      sending: false,
      eventSource: null,
      humanBridgeWindow: null,
      humanBridgeAutoOpened: false,
      browserUrl: "about:blank",
      bootstrapTimer: null,
      browserTimer: null,
      typingFx: {
        lengths: {},
        timers: {}
      },
      cursorFx: {
        x: 42,
        y: 42,
        queue: [],
        rafId: null,
        idleTimer: null,
        ready: false,
        realMouseUntil: 0
      },
      runtimeFilters: {
        status: true,
        think: true,
        step: true,
        error: true,
        agent: true
      },
      runtimeSearch: ""
    };

    const UI_PREFS_KEY = "puppeterr_ui_prefs_v1";
    const CHAT_DRAFTS_KEY = "puppeterr_chat_drafts_v1";

    const loginShell = document.getElementById("loginShell");
    const appShell = document.getElementById("appShell");
    const loginForm = document.getElementById("loginForm");
    const loginBtn = document.getElementById("loginBtn");
    const loginHint = document.getElementById("loginHint");
    const loginError = document.getElementById("loginError");
    const currentUser = document.getElementById("currentUser");
    const modelModeStatus = document.getElementById("modelModeStatus");
    const connectionStatus = document.getElementById("connectionStatus");
    const chatList = document.getElementById("chatList");
    const timeline = document.getElementById("timeline");
    const timelineTitle = document.getElementById("timelineTitle");
    const timelineSubtitle = document.getElementById("timelineSubtitle");
    const messageCountTag = document.getElementById("messageCountTag");
    const composerInput = document.getElementById("composerInput");
    const sendBtn = document.getElementById("sendBtn");
    const browserUrl = document.getElementById("browserUrl");
    const screenshot = document.getElementById("screenshot");
    const browserFrame = document.querySelector(".browser-frame");
    const demoCursor = document.getElementById("demoCursor");
    const demoClickPulse = document.getElementById("demoClickPulse");
    const modelGrid = document.getElementById("modelGrid");
    const memoryList = document.getElementById("memoryList");
    const loginModeHint = document.getElementById("loginModeHint");
    const quickActions = document.getElementById("quickActions");

    function loadUiPrefs() {
      try {
        const raw = localStorage.getItem(UI_PREFS_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && parsed.runtimeFilters && typeof parsed.runtimeFilters === "object") {
          ["status", "think", "step", "error", "agent"].forEach(function(key) {
            if (Object.prototype.hasOwnProperty.call(parsed.runtimeFilters, key)) {
              state.runtimeFilters[key] = !!parsed.runtimeFilters[key];
            }
          });
        }
        if (parsed && typeof parsed.runtimeSearch === "string") {
          state.runtimeSearch = parsed.runtimeSearch.slice(0, 80);
        }
      } catch {}
    }

    function saveUiPrefs() {
      try {
        localStorage.setItem(UI_PREFS_KEY, JSON.stringify({
          runtimeFilters: state.runtimeFilters,
          runtimeSearch: state.runtimeSearch
        }));
      } catch {}
    }

    function loadAllDrafts() {
      try {
        const raw = localStorage.getItem(CHAT_DRAFTS_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch {
        return {};
      }
    }

    function saveDraftForChat(chatId, text) {
      if (!chatId) return;
      const drafts = loadAllDrafts();
      const next = String(text || "");
      if (!next.trim()) {
        delete drafts[chatId];
      } else {
        drafts[chatId] = next.slice(0, 4000);
      }
      try { localStorage.setItem(CHAT_DRAFTS_KEY, JSON.stringify(drafts)); } catch {}
    }

    function restoreDraftForCurrentChat() {
      if (!composerInput || !state.selectedChatId) return;
      const drafts = loadAllDrafts();
      composerInput.value = drafts[state.selectedChatId] || "";
    }

    function bindGlobalShortcuts() {
      document.addEventListener("keydown", function(event) {
        const targetTag = String(event.target && event.target.tagName || "").toLowerCase();
        const isTextField = targetTag === "input" || targetTag === "textarea" || targetTag === "select";

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();
          composerInput.focus();
          return;
        }

        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault();
          sendMessage();
          return;
        }

        if (!isTextField && event.key === "/") {
          event.preventDefault();
          composerInput.focus();
        }
      });
    }

    function randomBetween(min, max) {
      return min + Math.random() * (max - min);
    }

    function getFrameBounds() {
      const width = browserFrame ? Math.max(120, browserFrame.clientWidth) : 640;
      const height = browserFrame ? Math.max(120, browserFrame.clientHeight) : 420;
      return { width: width, height: height };
    }

    function mapViewportToCursorCoords(x, y, viewportWidth, viewportHeight) {
      if (!browserFrame || !screenshot) return null;
      const frameRect = browserFrame.getBoundingClientRect();
      const shotRect = screenshot.getBoundingClientRect();
      const vw = Math.max(1, Number(viewportWidth) || 1);
      const vh = Math.max(1, Number(viewportHeight) || 1);
      const nx = Math.max(0, Math.min(1, Number(x) / vw));
      const ny = Math.max(0, Math.min(1, Number(y) / vh));

      const naturalW = Math.max(1, screenshot.naturalWidth || vw);
      const naturalH = Math.max(1, screenshot.naturalHeight || vh);
      const boxW = Math.max(1, shotRect.width);
      const boxH = Math.max(1, shotRect.height);
      const imgAspect = naturalW / naturalH;
      const boxAspect = boxW / boxH;

      let renderW;
      let renderH;
      if (imgAspect >= boxAspect) {
        renderW = boxW;
        renderH = boxW / imgAspect;
      } else {
        renderH = boxH;
        renderW = boxH * imgAspect;
      }

      const padX = (boxW - renderW) / 2;
      const padY = (boxH - renderH) / 2;
      const localInShotX = padX + (nx * renderW);
      const localInShotY = padY + (ny * renderH);

      const localX = (shotRect.left - frameRect.left) + localInShotX;
      const localY = (shotRect.top - frameRect.top) + localInShotY;
      return { x: localX, y: localY };
    }

    function followRealMouse(payload, isClick) {
      const mapped = mapViewportToCursorCoords(payload.x, payload.y, payload.viewportWidth, payload.viewportHeight);
      if (!mapped) return;
      state.cursorFx.realMouseUntil = Date.now() + 1600;
      queueCursorMove(mapped.x, mapped.y, false);
      if (isClick) {
        window.setTimeout(function() { pulseCursor(); }, 30);
      }
    }

    function queueCursorMove(x, y, withOvershoot) {
      const bounds = getFrameBounds();
      const clampedX = Math.max(8, Math.min(bounds.width - 10, x));
      const clampedY = Math.max(8, Math.min(bounds.height - 10, y));
      if (withOvershoot) {
        const dx = clampedX - state.cursorFx.x;
        const dy = clampedY - state.cursorFx.y;
        const mag = Math.max(1, Math.hypot(dx, dy));
        const extra = randomBetween(8, 20);
        const overX = clampedX + (dx / mag) * extra;
        const overY = clampedY + (dy / mag) * extra;
        state.cursorFx.queue.push({
          x: Math.max(8, Math.min(bounds.width - 10, overX)),
          y: Math.max(8, Math.min(bounds.height - 10, overY))
        });
      }
      state.cursorFx.queue.push({ x: clampedX, y: clampedY });
    }

    function pulseCursor() {
      if (!demoClickPulse) return;
      demoClickPulse.classList.remove("active");
      demoClickPulse.style.left = state.cursorFx.x + "px";
      demoClickPulse.style.top = state.cursorFx.y + "px";
      void demoClickPulse.offsetWidth;
      demoClickPulse.classList.add("active");
    }

    function cursorFrameLoop() {
      const target = state.cursorFx.queue[0];
      if (target) {
        const speed = state.sending ? 0.24 : 0.14;
        const dx = target.x - state.cursorFx.x;
        const dy = target.y - state.cursorFx.y;
        state.cursorFx.x += dx * speed;
        state.cursorFx.y += dy * speed;
        if (Math.abs(dx) + Math.abs(dy) < 1.5) {
          state.cursorFx.x = target.x;
          state.cursorFx.y = target.y;
          state.cursorFx.queue.shift();
          if (Math.random() < 0.25) pulseCursor();
        }
      }
      if (demoCursor) {
        demoCursor.style.transform = "translate(" + state.cursorFx.x + "px," + state.cursorFx.y + "px)";
      }
      state.cursorFx.rafId = window.requestAnimationFrame(cursorFrameLoop);
    }

    function scheduleCursorWander() {
      window.clearTimeout(state.cursorFx.idleTimer);
      const delay = state.sending ? randomBetween(420, 1300) : randomBetween(1400, 3200);
      state.cursorFx.idleTimer = window.setTimeout(function() {
        if (Date.now() < (state.cursorFx.realMouseUntil || 0)) {
          scheduleCursorWander();
          return;
        }
        const bounds = getFrameBounds();
        queueCursorMove(randomBetween(bounds.width * 0.12, bounds.width * 0.88), randomBetween(bounds.height * 0.2, bounds.height * 0.9), true);
        scheduleCursorWander();
      }, delay);
    }

    function nudgeCursorByEvent(type) {
      const bounds = getFrameBounds();
      if (type === "error") {
        queueCursorMove(randomBetween(bounds.width * 0.25, bounds.width * 0.75), randomBetween(bounds.height * 0.15, bounds.height * 0.35), true);
        return;
      }
      if (type === "step" || type === "status") {
        queueCursorMove(randomBetween(bounds.width * 0.2, bounds.width * 0.85), randomBetween(bounds.height * 0.3, bounds.height * 0.85), Math.random() > 0.45);
      }
    }

    function stopUiFx() {
      window.clearTimeout(state.cursorFx.idleTimer);
      state.cursorFx.idleTimer = null;
      if (state.cursorFx.rafId) {
        window.cancelAnimationFrame(state.cursorFx.rafId);
        state.cursorFx.rafId = null;
      }
      Object.keys(state.typingFx.timers).forEach(function(key) {
        window.clearTimeout(state.typingFx.timers[key]);
        delete state.typingFx.timers[key];
      });
    }

    function ensureUiFx() {
      if (state.cursorFx.ready) return;
      state.cursorFx.ready = true;
      const bounds = getFrameBounds();
      state.cursorFx.x = bounds.width * 0.34;
      state.cursorFx.y = bounds.height * 0.36;
      queueCursorMove(bounds.width * 0.58, bounds.height * 0.42, true);
      cursorFrameLoop();
      scheduleCursorWander();
    }

    function messageKey(chatId, index, message) {
      return String(chatId || "chat") + ":" + String(index) + ":" + String(message && message.ts ? message.ts : "na");
    }

    function typingDelayForChar(charValue) {
      const base = randomBetween(24, 88);
      if (/[,.;:!?]/.test(charValue || "")) return base + randomBetween(75, 200);
      if (/\s/.test(charValue || "")) return base + randomBetween(25, 110);
      return base;
    }

    function startTypingAnimation(key, fullText) {
      if (state.typingFx.timers[key]) return;
      const current = state.typingFx.lengths[key] || 0;
      if (current >= fullText.length) return;
      const tick = function() {
        const lengthNow = state.typingFx.lengths[key] || 0;
        if (lengthNow >= fullText.length) {
          delete state.typingFx.timers[key];
          return;
        }
        const step = Math.max(1, Math.floor(randomBetween(1, 4)));
        const nextLength = Math.min(fullText.length, lengthNow + step);
        state.typingFx.lengths[key] = nextLength;
        renderTimeline();
        if (nextLength >= fullText.length) {
          delete state.typingFx.timers[key];
          return;
        }
        const nextChar = fullText.charAt(nextLength - 1);
        state.typingFx.timers[key] = window.setTimeout(tick, typingDelayForChar(nextChar));
      };
      state.typingFx.timers[key] = window.setTimeout(tick, randomBetween(45, 130));
    }

    function escapeHtml(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function applyEmojiShortcodes(text) {
      const map = {
        ":rocket:": "🚀",
        ":brain:": "🧠",
        ":sparkles:": "✨",
        ":fire:": "🔥",
        ":check:": "✅",
        ":x:": "❌",
        ":warning:": "⚠️",
        ":robot:": "🤖",
        ":smile:": "🙂",
        ":party:": "🎉",
        ":idea:": "💡"
      };
      return String(text || "").replace(/:[a-z_]+:/g, function(token) {
        return Object.prototype.hasOwnProperty.call(map, token) ? map[token] : token;
      });
    }

    function renderRichText(value) {
      const source = applyEmojiShortcodes(String(value || ""));
      const mathRegex = new RegExp("\\$\\$([\\\\s\\\\S]+?)\\$\\$|\\$([^\\n$]+?)\\$", "g");
      let html = "";
      let lastIndex = 0;
      let match;

      while ((match = mathRegex.exec(source)) !== null) {
        html += escapeHtml(source.slice(lastIndex, match.index));
        const expression = match[1] || match[2] || "";
        const isDisplay = !!match[1];
        if (window.katex && expression.trim()) {
          try {
            html += window.katex.renderToString(expression, {
              throwOnError: false,
              displayMode: isDisplay,
              strict: "ignore"
            });
          } catch {
            html += escapeHtml(match[0]);
          }
        } else {
          html += escapeHtml(match[0]);
        }
        lastIndex = mathRegex.lastIndex;
      }

      html += escapeHtml(source.slice(lastIndex));
      return html;
    }

    async function request(path, options) {
      const response = await fetch(path, {
        method: options && options.method ? options.method : "GET",
        headers: Object.assign({ "Content-Type": "application/json" }, options && options.headers ? options.headers : {}),
        body: options && options.body ? JSON.stringify(options.body) : undefined,
        credentials: "same-origin"
      });
      const contentType = response.headers.get("content-type") || "";
      const payload = contentType.includes("application/json") ? await response.json() : await response.text();
      if (!response.ok) {
        const message = typeof payload === "string" ? payload : payload.error || "Request failed";
        const error = new Error(message);
        error.status = response.status;
        throw error;
      }
      return payload;
    }

    function setAuthenticated(authenticated) {
      loginShell.classList.toggle("hidden", authenticated);
      appShell.classList.toggle("hidden", !authenticated);
    }

    function prettyTime(value) {
      if (!value) return "just now";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "just now";
      return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    }

    function currentRuntime() {
      if (!state.selectedChatId) return [];
      if (!state.runtime[state.selectedChatId]) state.runtime[state.selectedChatId] = [];
      return state.runtime[state.selectedChatId];
    }

    function addRuntimeEvent(type, message) {
      const bucket = currentRuntime();
      bucket.push({ type: type, message: message, ts: new Date().toISOString() });
      if (bucket.length > 40) bucket.splice(0, bucket.length - 40);
      nudgeCursorByEvent(type);
      renderTimeline();
    }

    function scheduleBootstrapRefresh(delay) {
      window.clearTimeout(state.bootstrapTimer);
      state.bootstrapTimer = window.setTimeout(function() { loadBootstrap(false); }, delay || 350);
    }

    function renderChats() {
      if (!state.chats.length) {
        chatList.innerHTML = '<div class="empty-state">No saved chats yet. Start a new one to build a history.</div>';
        return;
      }
      chatList.innerHTML = state.chats.map(function(chat) {
        const active = chat.id === state.selectedChatId ? "active" : "";
        return '<button class="chat-item ' + active + '" data-chat-id="' + escapeHtml(chat.id) + '">' +
          '<div class="chat-title-row"><div class="chat-title">' + escapeHtml(chat.title) + '</div><div class="chat-time">' + escapeHtml(prettyTime(chat.updatedAt)) + '</div></div>' +
          '<div class="meta" style="margin-top:8px;">' + escapeHtml(chat.preview || "No messages yet") + '</div>' +
          '<div class="meta" style="margin-top:10px;">' + escapeHtml(String(chat.messageCount)) + ' messages</div>' +
        '</button>';
      }).join("");
      Array.from(chatList.querySelectorAll("[data-chat-id]")).forEach(function(button) {
        button.addEventListener("click", function() { selectChat(button.getAttribute("data-chat-id")); });
      });
    }

    function renderMemory() {
      if (!state.memory.length) {
        memoryList.innerHTML = '<div class="empty-state">No long-term memory saved yet.</div>';
        return;
      }
      memoryList.innerHTML = state.memory.slice(-4).reverse().map(function(item) {
        return '<div class="memory-item"><strong>' + escapeHtml(item.goal || "Past task") + '</strong><div>' + escapeHtml(item.result || "") + '</div></div>';
      }).join("");
    }

    function renderTimeline() {
      const chat = state.currentChat;
      if (!chat) {
        timeline.innerHTML = '<div class="empty-state">Select a chat to view its conversation.</div>';
        timelineTitle.textContent = "Conversation";
        timelineSubtitle.textContent = "Select a thread to inspect its conversation and live execution feed.";
        messageCountTag.textContent = "0 messages";
        return;
      }
      timelineTitle.textContent = chat.title || "Conversation";
      timelineSubtitle.textContent = "Updated " + prettyTime(chat.updatedAt) + " • Chat messages are persisted and live run logs stay attached to the active thread.";
      messageCountTag.textContent = String(chat.messages.length) + " messages";
      const messageCards = chat.messages.map(function(message, index) {
        const key = messageKey(chat.id, index, message);
        const fullContent = String(message.content || "");
        let renderedContent = fullContent;
        let typingCaret = "";
        let contentHtml = "";
        if (message.role === "assistant") {
          if (typeof state.typingFx.lengths[key] !== "number") {
            state.typingFx.lengths[key] = 0;
          }
          const visibleLength = state.typingFx.lengths[key];
          renderedContent = fullContent.slice(0, visibleLength);
          if (visibleLength < fullContent.length) {
            typingCaret = '<span class="typing-caret" aria-hidden="true"></span>';
            startTypingAnimation(key, fullContent);
            contentHtml = escapeHtml(applyEmojiShortcodes(renderedContent));
          } else {
            contentHtml = renderRichText(renderedContent);
          }
        } else {
          contentHtml = renderRichText(renderedContent);
        }
        return '<article class="message-card ' + escapeHtml(message.role) + '"><div class="message-role">' + escapeHtml(message.role === "user" ? "Operator" : "Agent") + '</div><div class="message-content">' + contentHtml + typingCaret + '</div><div class="message-meta" style="margin-top:12px;">' + escapeHtml(prettyTime(message.ts)) + '</div></article>';
      });
      const runtimeEvents = currentRuntime();
      const filteredRuntimeEvents = runtimeEvents.filter(function(event) {
        const typeAllowed = Object.prototype.hasOwnProperty.call(state.runtimeFilters, event.type)
          ? state.runtimeFilters[event.type]
          : true;
        if (!typeAllowed) return false;
        if (!state.runtimeSearch) return true;
        return String(event.message || "").toLowerCase().includes(state.runtimeSearch.toLowerCase())
          || String(event.type || "").toLowerCase().includes(state.runtimeSearch.toLowerCase());
      });
      const runtimeControls = '<div class="runtime-controls">' +
        ["status", "think", "step", "error", "agent"].map(function(type) {
          const off = state.runtimeFilters[type] ? "" : " off";
          return '<button type="button" class="runtime-filter-btn' + off + '" data-runtime-filter="' + type + '">' + type + '</button>';
        }).join("") +
        '<input class="runtime-search" id="runtimeSearchInput" placeholder="Filter activity..." value="' + escapeHtml(state.runtimeSearch) + '" />' +
      '</div>';
      const runtimeCard = runtimeEvents.length
        ? '<details class="runtime-dropdown" ' + (state.sending ? "open" : "") + '><summary><strong>Agent activity</strong><span class="tag">' + escapeHtml(String(runtimeEvents.length)) + ' updates</span><span class="runtime-chevron">' + (state.sending ? "Hide" : "Show") + '</span></summary><div class="runtime-log">' +
            runtimeControls +
            filteredRuntimeEvents.map(function(event) {
              return '<article class="runtime-entry ' + escapeHtml(event.type) + '"><div class="runtime-head"><span>' + escapeHtml(event.type || "status") + '</span><span>' + escapeHtml(prettyTime(event.ts)) + '</span></div><div class="runtime-body">' + renderRichText(event.message) + '</div></article>';
            }).join("") +
            (filteredRuntimeEvents.length ? "" : '<div class="empty-state">No activity matches current filters.</div>') +
          '</div></details>'
        : "";
      timeline.innerHTML = messageCards.concat(runtimeCard).join("") || '<div class="empty-state">This chat is empty. Ask a question or assign a browsing task.</div>';

      Array.from(timeline.querySelectorAll("[data-runtime-filter]")).forEach(function(btn) {
        btn.addEventListener("click", function() {
          const type = btn.getAttribute("data-runtime-filter");
          state.runtimeFilters[type] = !state.runtimeFilters[type];
          saveUiPrefs();
          renderTimeline();
        });
      });
      const runtimeSearchInput = document.getElementById("runtimeSearchInput");
      if (runtimeSearchInput) {
        runtimeSearchInput.addEventListener("input", function() {
          state.runtimeSearch = runtimeSearchInput.value;
          saveUiPrefs();
          renderTimeline();
        });
      }

      timeline.scrollTop = timeline.scrollHeight;
    }

    function selectOptionsForCurrent(value) {
      const values = (state.models.catalog || []).slice();
      if (value && !values.some(function(item) { return item.id === value; })) {
        values.unshift({ id: value, name: value });
      }
      return values;
    }

    function renderModels() {
      const current = state.models.current || {};
      const roles = [
        { key: "router", label: "Router" },
        { key: "planner", label: "Planner" },
        { key: "reasoner", label: "Reasoner" },
        { key: "vision", label: "Vision" }
      ];
      modelGrid.innerHTML = roles.map(function(role) {
        const options = selectOptionsForCurrent(current[role.key]).map(function(item) {
          const selected = item.id === current[role.key] ? "selected" : "";
          return '<option value="' + escapeHtml(item.id) + '" ' + selected + '>' + escapeHtml(item.name || item.id) + '</option>';
        }).join("");
        return '<div class="model-card"><label for="model-' + escapeHtml(role.key) + '">' + escapeHtml(role.label) + '</label><select class="toolbar-select" id="model-' + escapeHtml(role.key) + '" data-role="' + escapeHtml(role.key) + '">' + options + '</select><div class="meta" style="margin-top:8px;">' + escapeHtml(current[role.key] || "") + '</div></div>';
      }).join("");
      Array.from(modelGrid.querySelectorAll("[data-role]")).forEach(function(select) {
        select.addEventListener("change", async function() {
          if (!state.currentChat) return;
          const nextModels = Object.assign({}, state.models.current || {});
          nextModels[select.getAttribute("data-role")] = select.value;
          try {
            const payload = await request("/api/chats/" + encodeURIComponent(state.currentChat.id) + "/models", {
              method: "POST",
              body: { models: nextModels }
            });
            state.models.current = payload.current;
            state.currentChat = payload.chat;
            renderModels();
            renderTimeline();
            addRuntimeEvent("status", "Updated " + select.getAttribute("data-role") + " model to " + select.value + ".");
          } catch (error) {
            addRuntimeEvent("error", error.message);
          }
        });
      });
    }

    function applyBootstrap(data) {
      state.chats = data.chats || [];
      state.currentChat = data.currentChat || null;
      state.selectedChatId = data.selectedChatId || (data.currentChat && data.currentChat.id) || null;
      state.memory = data.memory || [];
      state.models = data.models || state.models;
      state.browserUrl = data.browser && data.browser.url ? data.browser.url : state.browserUrl;
      currentUser.textContent = data.username || (state.session && state.session.username) || "-";
      const overrideModel = state.currentChat && state.currentChat.runtimeModelOverride;
      modelModeStatus.textContent = overrideModel ? ("Model: " + overrideModel) : "Model: default";
      browserUrl.textContent = state.browserUrl;
      renderChats();
      renderMemory();
      renderModels();
      renderTimeline();
      restoreDraftForCurrentChat();
    }

    async function loadBootstrap(forceModels) {
      try {
        const data = await request("/api/bootstrap" + (forceModels ? "?force=1" : ""));
        applyBootstrap(data);
      } catch (error) {
        if (error.status === 401) {
          disconnectEvents();
          setAuthenticated(false);
          return;
        }
        addRuntimeEvent("error", error.message);
      }
    }

    async function refreshMemory() {
      try {
        const data = await request("/memory");
        state.memory = Array.isArray(data) ? data : [];
        renderMemory();
      } catch (error) {
        addRuntimeEvent("error", error.message);
      }
    }

    async function selectChat(chatId) {
      try {
        const data = await request("/api/chats/" + encodeURIComponent(chatId) + "/select", { method: "POST" });
        applyBootstrap(data);
      } catch (error) {
        addRuntimeEvent("error", error.message);
      }
    }

    async function createNewChat() {
      try {
        await request("/api/chats", { method: "POST", body: { title: "New Chat" } });
        await loadBootstrap(false);
      } catch (error) {
        addRuntimeEvent("error", error.message);
      }
    }

    async function sendMessage() {
      const text = composerInput.value.trim();
      if (!text || state.sending || !state.currentChat) return;
      state.sending = true;
      sendBtn.disabled = true;
      composerInput.value = "";
      saveDraftForChat(state.currentChat.id, "");
      state.currentChat.messages.push({ role: "user", content: text, ts: new Date().toISOString() });
      renderTimeline();
      try {
        await request("/chat", { method: "POST", body: { message: text, chatId: state.currentChat.id } });
        addRuntimeEvent("status", "Message sent. Waiting for router decision.");
      } catch (error) {
        state.sending = false;
        sendBtn.disabled = false;
        addRuntimeEvent("error", error.message);
        await loadBootstrap(false);
      }
    }

    async function performLogin(event) {
      event.preventDefault();
      loginBtn.disabled = true;
      loginError.classList.add("hidden");
      const username = document.getElementById("loginUsername").value.trim();
      const password = document.getElementById("loginPassword").value;
      try {
        await request("/auth/login", { method: "POST", body: { username: username, password: password } });
        await initializeApp();
      } catch (error) {
        loginError.textContent = error.message;
        loginError.classList.remove("hidden");
      } finally {
        loginBtn.disabled = false;
      }
    }

    async function performLogout() {
      try { await request("/auth/logout", { method: "POST" }); } catch {}
      disconnectEvents();
      stopUiFx();
      state.cursorFx.ready = false;
      window.clearInterval(state.browserTimer);
      state.browserTimer = null;
      setAuthenticated(false);
      connectionStatus.textContent = "Signed out";
      modelModeStatus.textContent = "Model: default";
    }

    function connectEvents() {
      disconnectEvents();
      state.eventSource = new EventSource("/events");
      state.eventSource.onopen = function() { connectionStatus.textContent = "Live"; };
      state.eventSource.onmessage = function(event) {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "url" && payload.url) {
            state.browserUrl = payload.url;
            browserUrl.textContent = payload.url;
            return;
          }
          if (payload.type === "screenshot" && payload.img) {
            screenshot.src = "data:image/jpeg;base64," + payload.img;
            return;
          }
          if (payload.type === "mouse_move" && Number.isFinite(payload.x) && Number.isFinite(payload.y)) {
            followRealMouse(payload, false);
            return;
          }
          if ((payload.type === "mouse_click" || payload.type === "human_click") && Number.isFinite(payload.x) && Number.isFinite(payload.y)) {
            followRealMouse(payload, true);
            return;
          }
          if (payload.type === "chat_sync") {
            state.sending = false;
            sendBtn.disabled = false;
            scheduleBootstrapRefresh(200);
            return;
          }
          if (payload.type === "task_done") {
            state.sending = false;
            sendBtn.disabled = false;
            scheduleBootstrapRefresh(200);
          }
          if (payload.type === "human_needed") {
            openHumanBridgeTab(payload.bridgeUrl);
          }
          if (payload.type === "bridge_closed") {
            state.humanBridgeWindow = null;
          }
          if (payload.msg) addRuntimeEvent(payload.type || "status", payload.msg);
          if (payload.answer) addRuntimeEvent(payload.completed ? "agent" : "error", payload.answer);
        } catch (error) {
          addRuntimeEvent("error", error.message);
        }
      };
      state.eventSource.onerror = function() { connectionStatus.textContent = "Reconnecting"; };
    }

    function disconnectEvents() {
      if (state.eventSource) {
        state.eventSource.close();
        state.eventSource = null;
      }
    }

    function openHumanBridgeTab(bridgeUrl) {
      const url = (bridgeUrl || "/human-bridge") + ((bridgeUrl || "/human-bridge").includes("?") ? "&" : "?") + "ts=" + Date.now();
      if (state.humanBridgeWindow && !state.humanBridgeWindow.closed) {
        state.humanBridgeWindow.focus();
        return true;
      }
      const opened = window.open(url, "puppeterr-human-bridge");
      if (opened) {
        state.humanBridgeWindow = opened;
        state.humanBridgeAutoOpened = true;
        addRuntimeEvent("status", "Opened Human Bridge tab for manual CAPTCHA click relay.");
        return true;
      }
      addRuntimeEvent("error", "Popup blocked: open /human-bridge manually to relay CAPTCHA clicks.");
      return false;
    }

    async function refreshBrowser() {
      if (appShell.classList.contains("hidden")) return;
      screenshot.src = "/screenshot?ts=" + Date.now();
      browserUrl.textContent = state.browserUrl || "about:blank";
      try {
        const text = await fetch("/url", { credentials: "same-origin" }).then(function(res) { return res.text(); });
        state.browserUrl = text;
        browserUrl.textContent = text;
      } catch {}
    }

    async function initializeApp() {
      state.session = await request("/auth/session");
      if (!state.session.authenticated) {
        setAuthenticated(false);
        return;
      }
      setAuthenticated(true);
      ensureUiFx();
      currentUser.textContent = state.session.username || "-";
      connectEvents();
      await loadBootstrap(false);
      await refreshBrowser();
      window.clearInterval(state.browserTimer);
      state.browserTimer = window.setInterval(refreshBrowser, 2800);
    }

    async function boot() {
      loginModeHint.textContent = "single-operator workspace";
      try {
        const session = await request("/auth/session");
        state.session = session;
        if (session.usingDefaultCredentials) {
          loginHint.textContent = "Default local credentials are enabled. Username: admin • Password: puppeterr";
          loginModeHint.textContent = "default local credentials active";
          document.getElementById("loginUsername").value = "admin";
          document.getElementById("loginPassword").value = "puppeterr";
        }
        if (session.authenticated) {
          await initializeApp();
        } else {
          setAuthenticated(false);
        }
      } catch (error) {
        loginError.textContent = error.message;
        loginError.classList.remove("hidden");
      }
    }

    loginForm.addEventListener("submit", performLogin);
    document.getElementById("logoutBtn").addEventListener("click", performLogout);
    document.getElementById("codingSectorBtn").addEventListener("click", function() {
      window.open("/code-sector", "_blank", "noopener,noreferrer");
    });
    document.getElementById("newChatBtn").addEventListener("click", createNewChat);
    document.getElementById("refreshAllBtn").addEventListener("click", function() { loadBootstrap(false); refreshBrowser(); });
    document.getElementById("refreshModelsBtn").addEventListener("click", function() { loadBootstrap(true); });
    document.getElementById("refreshMemoryBtn").addEventListener("click", refreshMemory);
    sendBtn.addEventListener("click", sendMessage);
    composerInput.addEventListener("input", function() {
      saveDraftForChat(state.selectedChatId, composerInput.value);
    });
    if (quickActions) {
      Array.from(quickActions.querySelectorAll("[data-quick-prompt]")).forEach(function(button) {
        button.addEventListener("click", function() {
          const prompt = button.getAttribute("data-quick-prompt") || "";
          if (!prompt) return;
          const existing = composerInput.value.trim();
          composerInput.value = existing ? (existing + "\\n" + prompt) : prompt;
          composerInput.focus();
          composerInput.selectionStart = composerInput.value.length;
          composerInput.selectionEnd = composerInput.value.length;
          saveDraftForChat(state.selectedChatId, composerInput.value);
        });
      });
    }
    composerInput.addEventListener("keydown", function(event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });

    loadUiPrefs();
    bindGlobalShortcuts();

    boot();
  </script>
</body>
</html>
`
};
