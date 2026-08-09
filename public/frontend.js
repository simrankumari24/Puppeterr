function iconMarkup(name) {
  const icons = {
    bot: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6a3 3 0 0 1 3 3v1h1a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1v1a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-1H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1V7a3 3 0 0 1 3-3Z"/><path d="M9 8v7"/><path d="M15 8v7"/><path d="M8 12h8"/><circle cx="9" cy="10.5" r="0.7"/><circle cx="15" cy="10.5" r="0.7"/></svg>',
    spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 1.4 5.4L18 9l-4.6 1.6L12 16l-1.4-5.4L6 9l4.6-1.6Z"/><path d="m18 16 1 3.5L22 21l-3-1-1.5-3Z"/><path d="m6 16-1 3.5L2 21l3-1 1.5-3Z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
    logout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4"/><path d="m13 15 3-3-3-3"/><path d="M16 12H5"/></svg>',
    code: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/><path d="m13 5-2 14"/></svg>',
    image: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="m4 16 4-4 3 3 4-5 5 6"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16"/><path d="m13 5 7 7-7 7"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6 6 18"/></svg>',
    collapse: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 8 4 4-4 4"/><path d="m14 8 4 4-4 4"/></svg>',
    expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 16 4-4 4 4"/><path d="m8 10 4 4 4-4"/></svg>',
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m4.93 19.07 1.41-1.41"/><path d="m17.66 6.34 1.41-1.41"/></svg>',
    moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/></svg>',
    chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-4 3V8a2 2 0 0 1 2-2Z"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>',
    alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 20h20L12 3Z"/><path d="M12 8v5"/><path d="M12 16h.01"/></svg>'
  };
  return '<span class="icon-inline">' + (icons[name] || "") + '</span>';
}

const FRONTEND_HTML = String.raw`
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Puppeterr.ai</title>
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/marked@11.1.1/marked.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/dompurify@3.0.6/dist/purify.min.js"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
      :root {
        --font: 'Orbitron', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        --mono: 'Geist Mono', ui-monospace, 'SFMono-Regular', monospace;
        --bg:          #0a1018a2;
        --sidebar-bg:  #0a1018ad;
        --sidebar-border: rgba(255,255,255,0.08);
        --panel-bg:    #0a1018ad;
        --panel-border: rgba(255,255,255,0.08);
        --panel-border-hover: rgba(255,255,255,0.16);
        --border:      rgba(255,255,255,0.08);
        --border-hover: rgba(255,255,255,0.16);
        --card-bg:     #161f2e;
        --card-border: rgba(255,255,255,0.06);
        --card-text:   #f5faf1e4;
        --text:        #f5faf1e4;
        --text-strong: #f5faf1e4;
        --text-muted:  #f5faf1e4;
        --text-faint:  #f2f7edc5;
        --muted:       #93a0afde;
        --accent:      #85e89d;
        --accent-dim:  rgba(133,232,157,0.14);
        --accent-2:    #6db4ff;
        --accent-strong: #70d9ff;
        --danger:      #f85149;
        --warn:        #d29922;
        --success:     #52e388;
        --info:        #60a5ff;
        --focus:       #6db4ff;
        --input-bg:    #111b27;
        --input-border: rgba(255,255,255,0.12);
        --input-text:  #ced5dd;
        --input-placeholder: rgba(24, 248, 8, 0.2);
        --button-bg:   #85e89d;
        --button-text: #0d1117;
        --button-border: rgba(133,232,157,0.24);
        --button-hover-bg: #6db4ff;
        --button-hover-text: #ffffff;
        --surface-elevated: rgba(255,255,255,0.04);
        --surface-subtle: rgba(0,0,0,0.18);
        --surface-strong: rgba(255,255,255,0.08);
        --surface-muted: rgba(255,255,255,0.06);
        --hero-glow: rgba(109,180,255,0.14);
        --radius: 40px;
      }

      [data-theme="light"] {
        --bg:             #f6efdcca;
        --sidebar-bg:     #f3e7cfca;
        --sidebar-border: #e9dfc9ca;
        --panel-bg:       #e7ddc6ca;
        --panel-border:   rgba(61,145,235,0.2);
        --panel-border-hover: rgba(31,121,232,0.14);
        --border:        rgba(30, 41, 59, 0.08);
        --border-hover:  rgba(30, 41, 59, 0.14);
        --card-bg:       #f8f0d7e8;
        --card-border:   rgba(30, 41, 59, 0.08);
        --card-text:     #1c2530;
        --text:          #1c2530;
        --text-strong:   #0f172a;
        --text-muted:    #6b7686;
        --text-faint:    rgba(28,37,48,0.55);
        --muted:         #6b768654;
        --accent:        #5fa8e8fb;
        --accent-dim:    rgba(24,142,238,0.25);
        --accent-2:      #53f78a6e;
        --accent-strong: #3b82f6;
        --danger:        #c2373a;
        --warn:          #a3660a;
        --success:       #22c55e;
        --info:          #38bdf8;
        --focus:         #3b82f6;
        --input-bg:      #f9f3e1;
        --input-border:  rgba(61,145,235,0.18);
        --input-text:    #1c2530;
        --input-placeholder: rgba(28,37,48,0.5);
        --button-bg:         #60abe8ce;
        --button-text:       #051436e7;
        --button-border:     rgba(24,142,238,0.16);
        --button-hover-bg:   #59f74aa8;
        --button-hover-text: #e6ffd4e5;
        --surface-elevated: rgba(30, 41, 59, 0.035);
        --surface-subtle:   rgba(30, 41, 59, 0.025);
        --surface-strong:   rgba(30, 41, 59, 0.08);
        --surface-muted:    rgba(30, 41, 59, 0.04);
        --hero-glow:        rgba(75,242,89,0.35);
      }

      [data-theme="light"] .sidebar,
      [data-theme="light"] .chat-header,
      [data-theme="light"] .sidebar-header,
      [data-theme="light"] .memory-section,
      [data-theme="light"] .sidebar-footer,
      [data-theme="light"] .message-content,
      [data-theme="light"] .memory-item,
      [data-theme="light"] .composer-box,
      [data-theme="light"] .plan-card,
      [data-theme="light"] .upgrade-panel,
      [data-theme="light"] .runtime-entry,
      [data-theme="light"] .login-card,
      [data-theme="light"] .supervisor-pill,
      [data-theme="light"] .ghost-btn,
      [data-theme="light"] .quick-chip,
      [data-theme="light"] .sidebar-new-chat,
      [data-theme="light"] .sidebar-nav-link,
      [data-theme="light"] .icon-btn,
      [data-theme="light"] .tag,
      [data-theme="light"] .model-pill,
      [data-theme="light"] .field input {
        box-shadow: 0 1px 0 # inset, 0 10px 26px rgba(30, 41, 59, 0.04);
      }

      [data-theme="light"] .sidebar {
        box-shadow: 10px 0 28px -22px rgba(30, 41, 59, 0.26);
      }

      [data-theme="light"] .chat-header,
      [data-theme="light"] .sidebar-header,
      [data-theme="light"] .memory-section,
      [data-theme="light"] .sidebar-footer {
        background: linear-gradient(180deg, rgba(255,255,255,0.48), rgba(255,255,255,0.22));
      }

      [data-theme="light"] .chat-header,
      [data-theme="light"] .sidebar-header,
      [data-theme="light"] .memory-section,
      [data-theme="light"] .sidebar-footer {
        border-color: rgba(30, 41, 59, 0.03);
        
      }

      [data-theme="light"] .message-content,
      [data-theme="light"] .composer-box,
      [data-theme="light"] .plan-card,
      [data-theme="light"] .upgrade-panel,
      [data-theme="light"] .runtime-entry,
      [data-theme="light"] .login-card,
      [data-theme="light"] .memory-item,
      [data-theme="light"] .ghost-btn,
      [data-theme="light"] .quick-chip,
      [data-theme="light"] .sidebar-new-chat,
      [data-theme="light"] .sidebar-nav-link,
      [data-theme="light"] .icon-btn,
      [data-theme="light"] .tag,
      [data-theme="light"] .model-pill,
      [data-theme="light"] .field input,
      [data-theme="light"] .supervisor-pill {
        border-color: rgba(30, 41, 59, 0.035);
      }

      [data-theme="light"] .chat-item-icon,
      [data-theme="light"] .composer-wrap,
      [data-theme="light"] .browser-aside,
      [data-theme="light"] .browser-frame,
      [data-theme="light"] .browser-header,
      [data-theme="light"] .browser-panel,
      [data-theme="light"] .browser-url,
      [data-theme="light"] .browser-viewport,
      [data-theme="light"] .guidance-panel,
      [data-theme="light"] .supervisor-bubble,
      [data-theme="light"] .supervisor-header,
      [data-theme="light"] .supervisor-close-btn {
        background: var(--surface-elevated);
      }

      [data-theme="light"] .composer-send {
        background: linear-gradient(180deg, #dbf48f 0%, #c1e85b 100%);
        color: #26320f;
        box-shadow: 0 8px 18px rgba(126, 168, 39, 0.18);
      }
      [data-theme="light"] .composer-send:hover {
        opacity: 1;
        transform: scale(1.04);
        box-shadow: 0 10px 22px rgba(126, 168, 39, 0.24);
      }

      [data-theme="light"] .quick-chip:hover,
      [data-theme="light"] .ghost-btn:hover,
      [data-theme="light"] .sidebar-new-chat:hover,
      [data-theme="light"] .sidebar-nav-link:hover,
      [data-theme="light"] .icon-btn:hover {
        background: rgba(75, 110, 242, 0.08);
        border-color: rgba(75, 110, 242, 0.12);
      }

      [data-theme="light"] .browser-panel,
      [data-theme="light"] .browser-frame,
      [data-theme="light"] .browser-aside,
      [data-theme="light"] .composer-box,
      [data-theme="light"] .message-content,
      [data-theme="light"] .upgrade-panel,
      [data-theme="light"] .plan-card,
      [data-theme="light"] .login-card,
      [data-theme="light"] .supervisor-bubble,
      [data-theme="light"] .runtime-entry,
      [data-theme="light"] .memory-item {
        box-shadow: 0 10px 24px rgba(30, 41, 59, 0.04), 0 1px 0 rgba(255,255,255,0.6) inset;
      }

      .chat-header-title { cursor: text; }
      .chat-title-edit-input {
        width: min(360px, 100%);
        min-width: 220px;
        border: 1px solid var(--input-border);
        border-radius: 30px;
        padding: 8px 10px;
        background: var(--card-bg);
        color: var(--text);
        font: inherit;
        font-weight: 600;
        outline: none;
        box-shadow: 0 10px 24px rgba(30, 41, 59, 0.08);
      }
      [data-theme="light"] .chat-title-edit-input {
        background: var(--input-bg);
        border-color: rgba(30, 41, 59, 0.08);
      }

      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      html, body {
        height: 100%;
        overflow: hidden;
        background:
          radial-gradient(circle at 18% 0%, var(--hero-glow), transparent 38%),
          radial-gradient(circle at 85% 14%, rgba(133,232,157,0.12), transparent 42%),
          linear-gradient(180deg, color-mix(in srgb, var(--bg) 92%, white 8%) 0%, var(--bg) 52%, color-mix(in srgb, var(--bg) 90%, black 10%) 100%);
        color: var(--text);
        font-family: var(--font);
        font-size: 14px;
        line-height: 1.6;
        -webkit-font-smoothing: antialiased;
      }

      button, input, textarea, select { font: inherit; color: inherit; }
      button { cursor: pointer; border: none; background: none; }
      .hidden { display: none !important; }

      :focus-visible { outline: 2px solid var(--accent-2); outline-offset: 2px; }

      .shell, .app-layout, .sidebar, .chat-main, .browser-aside, .composer, .timeline-scroll {
        animation: appSurfaceIn .45s ease both;
      }
      .sidebar, .chat-main, .browser-aside {
        animation-duration: .55s;
      }
      .sidebar-header, .sidebar-new-chat, .sidebar-nav-link, .chat-item, .memory-item, .message-content, .message-card, .bridge-card, .model-card, .runtime-entry, .login-card, .upgrade-panel, .plan-card {
        animation: cardRiseSoft .45s ease both;
      }
      .icon-btn, .sidebar-new-chat, .sidebar-nav-link, .chat-item, .quick-chip, .ghost-btn, .secondary-btn, .message-copy-btn, .primary-btn, .composer-send, .supervisor-pill, .tag, .model-pill, .model-card, .bridge-card, .runtime-entry, .mini-check {
        transition: transform .18s ease, box-shadow .18s ease, background .18s ease, border-color .18s ease, filter .18s ease, color .18s ease;
      }
      .icon-btn:hover, .sidebar-new-chat:hover, .sidebar-nav-link:hover, .chat-item:hover, .quick-chip:hover, .ghost-btn:hover, .secondary-btn:hover, .message-copy-btn:hover, .primary-btn:hover, .composer-send:hover, .supervisor-pill:hover, .tag:hover, .model-pill:hover, .model-card:hover, .bridge-card:hover, .runtime-entry:hover {
        transform: translateY(-1px) scale(1.01);
        filter: brightness(1.03);
      }
      .message-card:hover {
        transform: translateX(3px);
      }
      .composer-send:active, .primary-btn:active, .ghost-btn:active, .icon-btn:active, .sidebar-new-chat:active, .sidebar-nav-link:active {
        transform: translateY(0) scale(0.98);
      }

      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 99px; }
      ::-webkit-scrollbar-track { background: transparent; }

      /* ── LOGIN ─────────────────────────────────────────── */
      .login-shell {
        height: 100dvh;
        display: grid;
        place-items: center;
        background: var(--bg);
      }

      .login-card {
        width: min(420px, 94vw);
        background: var(--panel-bg);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 36px;
      }

      .login-brand {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 28px;
      }

      .login-logo {
        width: 38px; height: 38px;
        border-radius: 10px;
        background: linear-gradient(135deg, #58a6ff22, #7ee78722);
        border: 1px solid var(--border-hover);
        display: grid; place-items: center;
        font-size: 18px;
      }

      .login-brand-name { font-size: 20px; font-weight: 600; letter-spacing: -0.5px; }

      .login-card h2 { font-size: 22px; font-weight: 600; letter-spacing: -0.4px; margin-bottom: 6px; }
      .login-copy { color: var(--muted); font-size: 13px; margin-bottom: 24px; }

      .field { display: grid; gap: 6px; margin-bottom: 14px; }
      .field label { font-size: 12px; font-weight: 500; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; }

      .field input, .field textarea, .field select {
        width: 100%;
        background: var(--input-bg);
        border: 1px solid var(--input-border);
        border-radius: var(--radius);
        padding: 10px 14px;
        color: var(--input-text);
        outline: none;
        transition: border-color .15s, background .15s;
      }
      .field input::placeholder, .field textarea::placeholder { color: var(--input-placeholder); }
      .field input:focus, .field textarea:focus, .field select:focus { border-color: var(--focus); }

      .hint { color: var(--muted); font-size: 12px; margin-top: 12px; }
      #loginError { color: var(--danger); font-size: 13px; margin-top: 8px; }

      .primary-btn {
        display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        background: var(--button-bg); color: var(--button-text);
        border: 1px solid var(--button-border);
        font-weight: 600; font-size: 13px;
        border-radius: var(--radius);
        padding: 10px 20px;
        transition: opacity .15s, transform .15s, background .15s, color .15s;
      }
      .primary-btn:hover { opacity: 0.94; transform: translateY(-1px); background: var(--button-hover-bg); color: var(--button-hover-text); }
      .primary-btn:disabled { opacity: 0.5; pointer-events: none; }

      .eyebrow { display: none; }

      /* ── APP SHELL ─────────────────────────────────────── */
      .shell { height: 100dvh; overflow: hidden; }

      .shell::before {
        content: "";
        position: fixed;
        inset: -20% -10% auto;
        height: 380px;
        background: radial-gradient(circle at 30% 45%, #dbfcbd50);
        pointer-events: none;
        z-index: 0;
      }
      [data-theme="light"] .shell::before {
        background: radial-gradient(circle at 30% 45%, #dbfcbd50);
        opacity: 0.8;
      }

      .app-layout {
        position: relative;
        z-index: 1;
        display: flex;
        height: 100dvh;
        overflow: hidden;
      }

      .sidebar {
        width: 256px;
        min-width: 256px;
        background: var(--sidebar-bg);
        border-right: 1px solid var(--border);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        flex-shrink: 0;
        border-top-right-radius: var(--radius);
        border-bottom-right-radius: var(--radius);
        border-top-left-radius: 0;
        border-bottom-left-radius: 0;
      }
      .sidebar.collapsed {
        width: 78px;
        min-width: 78px;
      }

      .sidebar-header {
        padding: 16px 16px 12px;
        border-bottom: 1px solid var(--border);
        display: flex; align-items: center; justify-content: space-between;
      }

      .sidebar-brand {
        display: flex; align-items: center; gap: 10px;
        font-weight: 600; font-size: 15px; letter-spacing: -0.3px;
      }

      .sidebar-logo {
        width: 30px; height: 30px;
        border-radius: 8px;
        background: linear-gradient(135deg,rgba(88,166,255,.2),rgba(126,231,135,.2));
        border: 1px solid var(--border-hover);
        display: grid; place-items: center;
        font-size: 15px;
      }

      .sidebar-actions {
        display: flex; gap: 4px;
      }

      .icon-btn {
        width: 30px; height: 30px;
        border-radius: 7px;
        display: grid; place-items: center;
        color: var(--muted);
        transition: background .12s, color .12s;
        font-size: 16px;
      }
      .icon-inline {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1em;
        height: 1em;
        flex-shrink: 0;
      }
      .icon-inline svg {
        width: 1em;
        height: 1em;
        display: block;
        stroke: currentColor;
        fill: none;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .theme-toggle {
        background: var(--surface-elevated);
        border: 1px solid var(--border);
      }
      .icon-btn:hover { background: var(--border); color: var(--text); }
      .sidebar-toggle-btn {
        font-size: 14px;
      }

      .sidebar-new-chat {
        margin: 10px 10px 6px;
        width: calc(100% - 20px);
        background: var(--border);
        border: 1px solid transparent;
        border-radius: var(--radius);
        padding: 8px 14px;
        font-size: 13px;
        font-weight: 500;
        text-align: left;
        display: flex; align-items: center; gap: 8px;
        color: var(--text);
        transition: background .12s, border-color .12s;
      }
      .sidebar-new-chat:hover { background: var(--border-hover); }
      .sidebar-new-chat-icon { font-size: 15px; opacity: .7; }
      .sidebar-icon-label {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      .sidebar-label-text {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .sidebar-section-label {
        padding: 14px 14px 6px;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .sidebar-scroll {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 0 8px;
      }

      .chat-list { display: flex; flex-direction: column; gap: 2px; }

      .chat-item {
        width: 100%;
        padding: 8px 10px;
        border-radius: 8px;
        text-align: left;
        background: none;
        border: none;
        color: var(--text);
        cursor: pointer;
        transition: background .12s;
        min-height: auto;
      }
      .chat-item:hover { background: rgba(255,255,255,0.05); }
      .chat-item.active { background: rgba(75,110,242,0.12); box-shadow: inset 0 0 0 1px rgba(75,110,242,0.10); }
      .chat-item.active .chat-title { color: var(--text); }
      [data-theme="light"] .chat-item.active {
        background: linear-gradient(180deg, rgba(75,110,242,0.10), rgba(24,168,115,0.06));
        box-shadow: inset 0 0 0 1px rgba(75,110,242,0.10), 0 8px 18px rgba(30, 41, 59, 0.04);
      }
      [data-theme="light"] .chat-item.active .chat-title {
        color: #183049;
        font-weight: 600;
      }
      .chat-item-icon {
        display: none;
        width: 34px;
        height: 34px;
        border-radius: 11px;
        align-items: center;
        justify-content: center;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.07);
        color: #d9e6f5;
        font-size: 13px;
        font-weight: 700;
        text-transform: uppercase;
        margin: 0 auto;
      }

      .chat-title-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .chat-title { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
      .chat-time { font-size: 11px; color: var(--muted); white-space: nowrap; flex-shrink: 0; }

      .memory-section {
        border-top: 1px solid var(--border);
        padding: 10px 10px 6px;
      }

      .memory-section-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 0 4px 8px;
      }

      .memory-section-title {
        font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
        text-transform: uppercase; color: var(--muted);
      }

      .memory-list { display: flex; flex-direction: column; gap: 4px; max-height: 160px; overflow-y: auto; }

      .memory-item {
        padding: 7px 10px;
        border-radius: 7px;
        background: rgba(255,255,255,0.03);
        border: 1px solid var(--border);
        font-size: 12px;
      }

      .memory-item strong { display: block; color: var(--text); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .memory-item div { color: var(--muted); font-size: 11px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

      .sidebar-footer {
        border-top: 1px solid var(--border);
        padding: 10px 12px;
        display: flex; align-items: center; gap: 10px;
      }

      .sidebar-user {
        flex: 1; display: flex; align-items: center; gap: 9px; min-width: 0;
      }

      .user-avatar {
        width: 35px; height: 35px;
        border-radius: 50%;
        background: linear-gradient(135deg, var(--accent-2), var(--accent));
        display: grid; place-items: center;
        font-size: 16px; font-weight: 700; color: #020202c7;
        flex-shrink: 0;
      }

      .user-info { min-width: 0; }
      .user-name { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .user-status { font-size: 11px; color: var(--muted); display: flex; align-items: center; gap: 5px; }
      .status-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: var(--accent);
      }
      .status-dot.offline { background: var(--muted); }
      .sidebar.collapsed .sidebar-header {
        padding-left: 10px;
        padding-right: 10px;
      }

      .sidebar.collapsed .sidebar-brand {
        gap: 0;
        justify-content: center;
        width: 30px;
        overflow: hidden;
        color: transparent;
        font-size: 0;
      }

      .sidebar.collapsed .sidebar-actions {
        gap: 2px;
      }

      .sidebar.collapsed .sidebar-new-chat,
      .sidebar.collapsed .sidebar-nav-link,
      .sidebar.collapsed .chat-item,
      .sidebar.collapsed .memory-item,
      .sidebar.collapsed .sidebar-footer {
        justify-content: center;
      }

      .sidebar.collapsed .sidebar-new-chat,
      .sidebar.collapsed .sidebar-nav-link {
        width: calc(100% - 16px);
        margin-left: 8px;
        margin-right: 8px;
        padding-left: 0;
        padding-right: 0;
      }

      .sidebar.collapsed .sidebar-section-label,
      .sidebar.collapsed .sidebar-nav-badge,
      .sidebar.collapsed .sidebar-label-text,
      .sidebar.collapsed .chat-title-row,
      .sidebar.collapsed .memory-section-title,
      .sidebar.collapsed .memory-list,
      .sidebar.collapsed .user-info {
        display: none !important;
      }

      .sidebar.collapsed .sidebar-icon-label {
        gap: 0;
        justify-content: center;
        width: 100%;
      }

      .sidebar.collapsed .sidebar-scroll {
        padding-left: 6px;
        padding-right: 6px;
      }

      .sidebar.collapsed .chat-item {
        padding: 8px 0;
      }

      .sidebar.collapsed .chat-item-icon {
        display: inline-flex;
      }

      .sidebar.collapsed .memory-section {
        padding-left: 8px;
        padding-right: 8px;
      }

      .sidebar.collapsed .memory-section-header {
        justify-content: center;
        padding-bottom: 0;
      }

      .sidebar.collapsed #refreshMemoryBtn {
        width: 30px !important;
        height: 30px !important;
        font-size: 14px !important;
      }

      .sidebar.collapsed .sidebar-user {
        justify-content: center;
      }

      .sidebar.collapsed .sidebar-footer {
        flex-direction: column;
        padding-left: 8px;
        padding-right: 8px;
      }

      /* ── CHAT MAIN ─────────────────────────────────────── */
      .chat-main {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
        background: var(--bg);
        overflow: hidden;
      }

      .chat-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 20px;
        border-bottom: 1px solid var(--border);
        background: var(--bg);
        min-height: 54px;
        flex-shrink: 0;
        border-top-left-radius: 0;
        border-top-right-radius: 0;
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
      }

      .chat-header-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
      .chat-header-title { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .chat-header-sub { font-size: 12px; color: var(--muted); }
      .chat-header-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

      .supervisor-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: rgba(255,255,255,0.04);
        color: var(--muted);
        font-size: 11px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }
      .supervisor-pill.ok {
        color: var(--accent);
        border-color: rgba(133,232,157,0.35);
        background: rgba(133,232,157,0.09);
      }
      .supervisor-pill.warn {
        color: var(--warn);
        border-color: rgba(210,153,34,0.35);
        background: rgba(210,153,34,0.12);
      }
      .supervisor-pill.blocked {
        color: #ffb4ae;
        border-color: rgba(248,81,73,0.4);
        background: rgba(248,81,73,0.14);
      }

      /* ── RICH SUPERVISOR MESSAGE BUBBLE ────────────────────────── */
      .supervisor-msg-container {
        position: fixed;
        bottom: 20px;
        right: 20px;
        max-width: 420px;
        max-height: 60vh;
        z-index: 9999;
        animation: slideInUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      @keyframes slideInUp {
        from { transform: translateY(30px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }

      .supervisor-bubble {
        background: linear-gradient(135deg, #151f2d 0%, #1a2a3a 100%);
        border: 2px solid rgba(248,81,73,0.5);
        border-radius: 14px;
        padding: 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.6), 0 0 20px rgba(248,81,73,0.2);
        position: relative;
        overflow: hidden;
      }
      .supervisor-bubble::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        background: radial-gradient(circle at 100% 0%, rgba(248,81,73,0.1), transparent 70%);
        pointer-events: none;
      }

      .supervisor-bubble.ok {
        border-color: rgba(133,232,157,0.5);
        box-shadow: 0 8px 32px rgba(0,0,0,0.6), 0 0 20px rgba(133,232,157,0.2);
      }
      .supervisor-bubble.ok::before {
        background: radial-gradient(circle at 100% 0%, rgba(133,232,157,0.1), transparent 70%);
      }

      .supervisor-bubble.warn {
        border-color: rgba(210,153,34,0.5);
        box-shadow: 0 8px 32px rgba(0,0,0,0.6), 0 0 20px rgba(210,153,34,0.2);
      }
      .supervisor-bubble.warn::before {
        background: radial-gradient(circle at 100% 0%, rgba(210,153,34,0.1), transparent 70%);
      }

      .supervisor-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 12px;
        padding-bottom: 10px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        position: relative;
        z-index: 1;
      }

      .supervisor-avatar {
        font-size: 24px;
        width: 36px;
        height: 36px;
        display: grid;
        place-items: center;
        background: rgba(248,81,73,0.2);
        border-radius: 8px;
        border: 1px solid rgba(248,81,73,0.4);
      }
      .supervisor-bubble.ok .supervisor-avatar {
        background: rgba(133,232,157,0.2);
        border-color: rgba(133,232,157,0.4);
      }
      .supervisor-bubble.warn .supervisor-avatar {
        background: rgba(210,153,34,0.2);
        border-color: rgba(210,153,34,0.4);
      }

      .supervisor-title-wrap {
        flex: 1;
      }

      .supervisor-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--text);
        margin: 0;
      }

      .supervisor-score {
        font-size: 11px;
        color: var(--muted);
        margin: 2px 0 0 0;
      }

      .supervisor-msg-content {
        position: relative;
        z-index: 1;
        font-size: 14px;
        line-height: 1.6;
        color: var(--text);
        word-wrap: break-word;
        overflow-y: auto;
        max-height: 45vh;
      }

      .supervisor-msg-content strong {
        color: #ffb4ae;
        font-weight: 600;
      }
      .supervisor-bubble.ok .supervisor-msg-content strong {
        color: #7ee787;
      }
      .supervisor-bubble.warn .supervisor-msg-content strong {
        color: #ffd700;
      }

      .supervisor-msg-content em {
        color: #85c4ff;
        font-style: italic;
      }

      .supervisor-msg-content code {
        background: rgba(0,0,0,0.4);
        padding: 2px 6px;
        border-radius: 4px;
        font-family: var(--mono);
        font-size: 12px;
        color: #c9d7e6;
      }

      .supervisor-msg-content a {
        color: #58a6ff;
        text-decoration: none;
        border-bottom: 1px dotted rgba(88,166,255,0.5);
      }
      .supervisor-msg-content a:hover {
        border-bottom-color: #58a6ff;
      }

      .supervisor-close-btn {
        position: absolute;
        top: 12px;
        right: 12px;
        width: 24px;
        height: 24px;
        display: grid;
        place-items: center;
        background: rgba(255,255,255,0.08);
        border: none;
        border-radius: 6px;
        color: var(--muted);
        cursor: pointer;
        font-size: 14px;
        z-index: 2;
        transition: all 0.2s;
      }
      .supervisor-close-btn:hover {
        background: rgba(255,255,255,0.14);
        color: var(--text);
      }

      .tag {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 3px 9px;
        border-radius: 99px;
        background: rgba(255,255,255,0.05);
        border: 1px solid var(--border);
        font-size: 11px; color: var(--muted);
      }

      .ghost-btn {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 6px 12px;
        border-radius: 8px;
        border: 1px solid var(--border);
        color: var(--muted);
        font-size: 12px;
        transition: background .12s, color .12s, border-color .12s;
      }
      .ghost-btn:hover { background: rgba(255,255,255,0.05); color: var(--text); border-color: var(--border-hover); }

      .secondary-btn {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 6px 12px;
        border-radius: 8px;
        border: 1px solid rgba(88,166,255,0.25);
        background: rgba(88,166,255,0.08);
        color: var(--accent-2);
        font-size: 12px;
        transition: background .12s, border-color .12s;
      }
      .secondary-btn:hover { background: rgba(88,166,255,0.14); border-color: rgba(88,166,255,0.4); }

      .model-pill {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 4px 10px;
        border-radius: 99px;
        border: 1px solid var(--border);
        background: rgba(255,255,255,0.03);
        font-size: 12px; color: var(--muted);
      }
      .model-pill-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }

      .conn-badge {
        display: inline-flex; align-items: center; gap: 5px;
        font-size: 12px; color: var(--muted);
      }
      .conn-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); }
      .conn-dot.live { background: var(--accent); box-shadow: 0 0 0 3px rgba(126,231,135,.15); }

      /* messages area */
      .timeline-scroll {
        flex: 1; overflow-y: auto; overflow-x: hidden;
        padding: 48px 0 80px;
      }

      .timeline {
        display: flex; flex-direction: column; gap: 16px;
        max-width: 720px; margin: 0 auto;
        padding: 0 40px;
      }

      .empty-state {
        text-align: center;
        color: var(--muted);
        font-size: 13px;
        padding: 48px 20px;
      }
      .empty-state-icon { font-size: 32px; margin-bottom: 12px; opacity: .5; }

      .sidebar-nav-link {
        margin: 4px 10px 0;
        width: calc(100% - 20px);
        border-radius: var(--radius);
        padding: 9px 14px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: linear-gradient(135deg, rgba(88,166,255,0.08), rgba(126,231,135,0.05));
        border: 1px solid rgba(88,166,255,0.18);
        color: var(--text);
        font-size: 13px;
        font-weight: 500;
        transition: transform .12s, border-color .12s, background .12s;
      }
      .sidebar-nav-link:hover {
        transform: translateY(-1px);
        border-color: rgba(88,166,255,0.34);
        background: linear-gradient(135deg, rgba(88,166,255,0.12), rgba(126,231,135,0.08));
      }
      .sidebar-nav-link.active {
        border-color: rgba(126,231,135,0.38);
        box-shadow: 0 0 0 1px rgba(126,231,135,0.18) inset;
      }
      .sidebar-nav-icon {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .sidebar-nav-badge {
        padding: 2px 7px;
        border-radius: 999px;
        border: 1px solid rgba(126,231,135,0.22);
        background: rgba(126,231,135,0.08);
        color: var(--accent);
        font-size: 10px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .upgrade-shell {
        max-width: 1040px;
        margin: 0 auto;
        padding: 10px 0 34px;
        display: flex;
        flex-direction: column;
        gap: 18px;
        animation: shellFadeIn .45s ease both;
      }
      .upgrade-hero {
        position: relative;
        overflow: hidden;
        border-radius: 24px;
        padding: 28px;
        background:
          radial-gradient(circle at top right, rgba(88,166,255,0.24), transparent 38%),
          radial-gradient(circle at left bottom, rgba(126,231,135,0.16), transparent 34%),
          linear-gradient(135deg, #182131 0%, #101620 54%, #0f151c 100%);
        border: 1px solid rgba(255,255,255,0.08);
        animation: heroFloat 8s ease-in-out infinite;
        transform-origin: center;
      }
      [data-theme="light"] .upgrade-hero {
        background:
          radial-gradient(circle at top right, rgba(52, 87, 213, 0.10), transparent 42%),
          radial-gradient(circle at left bottom, rgba(14, 143, 95, 0.12), transparent 36%),
          linear-gradient(135deg, #fcfbf7 0%, #f5efe4 54%, #f0e7d8 100%);
        border-color: var(--border);
        color: #111827;
        box-shadow: 0 12px 30px rgba(30, 41, 59, 0.06);
      }
      [data-theme="light"] .upgrade-hero::after {
        background: rgba(75,242,89,0.18);
      }
      [data-theme="light"] .billing-toggle-btn {
        color: #111827;
        background: #f8efe0;
        border-color: rgba(30, 41, 59, 0.12);
      }
      [data-theme="light"] .billing-toggle-btn.active {
        background: linear-gradient(135deg, rgba(97, 179, 229, 0.2), rgba(96, 184, 149, 0.18));
        color: #0f172a;
      }
      [data-theme="light"] .plan-card {
        background: linear-gradient(180deg, #fffaf0, rgba(247,240,223,0.98));
        border-color: rgba(61, 145, 235, 0.16);
        box-shadow: 0 18px 44px rgba(30, 41, 59, 0.16);
        color: #111827;
      }
      [data-theme="light"] .plan-card:hover {
        background: linear-gradient(180deg, #fffdf8, rgba(252,248,238,0.99));
      }
      [data-theme="light"] .plan-card.popular {
        border-color: rgba(126, 231, 135, 0.28);
        box-shadow: 0 0 0 1px rgba(126, 231, 135, 0.2) inset, 0 30px 70px rgba(15, 24, 15, 0.16);
      }
      [data-theme="light"] .plan-card.popular::before {
        background: rgba(126, 231, 135, 0.12);
      }
      [data-theme="light"] .plan-cta.core {
        background: #f8efe0;
        border-color: rgba(30, 41, 59, 0.12);
        color: #111827;
      }
      [data-theme="light"] .plan-cta.ultimate {
        background: linear-gradient(135deg, rgba(126,231,135,0.3), rgba(88,140,255,0.22));
        color: #08120a;
        box-shadow: 0 12px 28px rgba(20, 62, 28, 0.14);
      }
      [data-theme="light"] .upgrade-panel {
        background: linear-gradient(180deg, #f8efe0, rgba(246,238,220,0.95));
        border-color: rgba(30, 41, 59, 0.08);
        color: #111827;
      }
      [data-theme="light"] .upgrade-panel h3 { color: #111827; }
      [data-theme="light"] .upgrade-panel p,
      [data-theme="light"] .mini-check {
        color: #263238;
      }
      [data-theme="light"] .mini-check {
        background: #fcf5e8;
        border-color: rgba(148, 163, 184, 0.18);
      }
      .upgrade-hero::after {
        content: "";
        position: absolute;
        inset: auto -8% -36% auto;
        width: 260px;
        height: 260px;
        border-radius: 999px;
        background: rgba(126,231,135,0.09);
        filter: blur(40px);
        pointer-events: none;
      }
      .upgrade-eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
        padding: 5px 10px;
        border-radius: 999px;
        background: rgba(255,255,255,0.55);
        border: 1px solid rgba(30,41,59,0.08);
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #475569;
      }
      .upgrade-title {
        max-width: 680px;
        font-size: clamp(30px, 5vw, 48px);
        line-height: 1;
        letter-spacing: -0.05em;
        font-weight: 700;
      }
      .upgrade-copy {
        max-width: 620px;
        margin-top: 12px;
        color: #334155;
        font-size: 15px;
        line-height: 1.7;
      }
      .upgrade-meta-row {
        margin-top: 18px;
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
      }
      .upgrade-stat {
        padding: 7px 10px;
        border-radius: 999px;
        background: rgba(255,255,255,0.6);
        border: 1px solid rgba(30,41,59,0.08);
        color: #334155;
        font-size: 12px;
      }
      .billing-toggle {
        position: relative;
        display: inline-flex;
        gap: 4px;
        padding: 4px;
        border-radius: 999px;
        background: #f3e7cf9e;
        border: 1px solid rgba(255,255,255,0.08);
        overflow: hidden;
      }
      .billing-toggle::before {
        content: "";
        position: absolute;
        top: 4px;
        bottom: 4px;
        left: 4px;
        width: calc(50% - 4px);
        border-radius: 999px;
        background: linear-gradient(135deg, rgba(88,166,255,0.2), rgba(126,231,135,0.18));
        box-shadow: 0 8px 18px rgba(88,166,255,0.14);
        transition: transform .24s cubic-bezier(.2,.8,.2,1);
        transform: translateX(0);
        z-index: 0;
      }
      .billing-toggle[data-active="yearly"]::before {
        transform: translateX(calc(100% + 4px));
      }
      .billing-toggle-btn {
        position: relative;
        z-index: 1;
        padding: 8px 14px;
        border-radius: 999px;
        color: #475569;
        font-size: 12px;
        font-weight: 600;
        transition: color .2s ease, transform .2s ease;
      }
      .billing-toggle-btn.active {
        color: #0f172a;
        transform: translateY(-1px);
      }
      .billing-toggle-btn:hover {
        color: #0f172a;
      }
      .save-badge {
        display: inline-flex;
        align-items: center;
        padding: 0 9px;
        border-radius: 999px;
        background: rgba(126,231,135,0.16);
        color: #14532d;
        font-size: 11px;
        font-weight: 600;
      }
      .plan-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 18px;
      }
      .plan-card {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 16px;
        min-height: 100%;
        padding: 24px;
        border-radius: var(--radius);
        background: linear-gradient(180deg, rgba(19,24,31,0.98), rgba(12,16,22,0.96));
        border: 1px solid rgba(255,255,255,0.08);
        box-shadow: 0 24px 60px rgba(0,0,0,0.18);
        transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease, filter .18s ease;
        animation: cardRise .5s ease both;
      }
      .plan-card:hover {
        transform: translateY(-4px) scale(1.01);
        box-shadow: 0 30px 72px rgba(0,0,0,0.24);
        filter: brightness(1.03);
      }
      .plan-card.popular {
        border-color: rgba(126,231,135,0.34);
        box-shadow: 0 0 0 1px rgba(126,231,135,0.14) inset, 0 30px 70px rgba(15,24,15,0.28);
      }
      .plan-card.popular::before {
        content: "";
        position: absolute;
        inset: -10% 12% auto;
        height: 120px;
        border-radius: 999px;
        background: rgba(126,231,135,0.14);
        filter: blur(44px);
        pointer-events: none;
      }
      .plan-topline {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
      }
      .plan-name {
        font-size: 24px;
        font-weight: 700;
        letter-spacing: -0.03em;
        color: inherit;
      }
      .plan-label {
        margin-top: 4px;
        color: var(--muted);
        font-size: 13px;
      }
      .plan-badge {
        padding: 5px 10px;
        border-radius: 999px;
        background: rgba(88,166,255,0.12);
        border: 1px solid rgba(88,166,255,0.24);
        color: #9bc7ff;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .plan-price-row {
        display: flex;
        align-items: baseline;
        gap: 8px;
      }
      .plan-price {
        font-size: clamp(36px, 6vw, 54px);
        font-weight: 700;
        line-height: 0.95;
        letter-spacing: -0.05em;
        color: inherit;
        text-shadow: 0 0 18px rgba(126,231,135,0.18);
      }
      .plan-price-unit {
        color: var(--muted);
        font-size: 14px;
        text-shadow: 0 0 10px rgba(88,166,255,0.12);
      }
      .plan-trial {
        font-size: 12px;
        color: #d2d9e0;
      }
      .plan-desc {
        color: #475569;
        font-size: 14px;
        line-height: 1.6;
      }
      .plan-features {
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .plan-feature {
        display: flex;
        gap: 10px;
        color: #334155;
        font-size: 13px;
        line-height: 1.5;
      }
      .plan-feature::before {
        content: "✓";
        color: var(--accent);
        font-weight: 700;
        flex-shrink: 0;
      }
      .plan-cta {
        margin-top: auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: 100%;
        min-height: 46px;
        border-radius: 14px;
        text-decoration: none;
        font-size: 14px;
        font-weight: 700;
        transition: transform .12s, opacity .12s, box-shadow .12s;
        animation: ctaPulse .9s ease both;
      }
      .plan-cta:hover {
        transform: translateY(-2px) scale(1.01);
        opacity: 0.95;
      }
      .plan-cta.core {
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.08);
        color: var(--text);
      }
      .plan-cta.ultimate {
        background: linear-gradient(135deg, #7ee787, #3fb950);
        color: #08120a;
        box-shadow: 0 14px 34px rgba(63,185,80,0.24);
      }
      .upgrade-footnote {
        display: grid;
        grid-template-columns: 1.2fr 0.8fr;
        gap: 18px;
      }
      .upgrade-panel {
        border-radius: var(--radius);
        background: linear-gradient(180deg, rgba(19,24,31,0.92), rgba(13,17,23,0.96));
        border: 1px solid rgba(255,255,255,0.07);
        padding: 20px 22px;
        animation: panelSlide .5s ease both;
      }
      .upgrade-panel h3 {
        font-size: 16px;
        font-weight: 600;
        margin-bottom: 10px;
        letter-spacing: -0.02em;
      }
      .upgrade-panel p {
        color: #b8c2cf;
        font-size: 13px;
        line-height: 1.7;
      }
      .mini-checks {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 14px;
      }
      .mini-check {
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.07);
        color: #d0d8e1;
        font-size: 12px;
        animation: chipPop .35s ease both;
      }

      @keyframes heroFloat {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-4px); }
      }
      @keyframes appSurfaceIn {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes cardRiseSoft {
        from { opacity: 0; transform: translateY(8px) scale(0.99); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes shellFadeIn {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes cardRise {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes panelSlide {
        from { opacity: 0; transform: translateX(6px); }
        to { opacity: 1; transform: translateX(0); }
      }
      @keyframes chipPop {
        from { opacity: 0; transform: scale(0.96); }
        to { opacity: 1; transform: scale(1); }
      }
      @keyframes ctaPulse {
        0% { opacity: 0; transform: translateY(4px) scale(0.98); }
        60% { opacity: 1; transform: translateY(0) scale(1.01); }
        100% { opacity: 1; transform: translateY(0) scale(1); }
      }

      .message-card {
        display: flex; gap: 16px; padding: 6px 0;
        border-radius: 20px;
        border: 1px solid transparent;
        transition: border-color .16s, background .16s;
      }
      .message-card:hover {
        border-color: rgba(255,255,255,0.06);
        background: rgba(255,255,255,0.02);
      }
      .message-card h1, .message-card h2, .message-card h3, .message-card h4, .message-card h5, .message-card h6,
      .runtime-entry h1, .runtime-entry h2, .runtime-entry h3, .runtime-entry h4, .runtime-entry h5, .runtime-entry h6 {
        font-weight: 700; line-height: 1.25; margin: 10px 0 6px; color: var(--text);
      }
      .message-card ul, .message-card ol,
      .runtime-entry ul, .runtime-entry ol {
        margin: 8px 0 8px 18px; padding-left: 0; display: flex; flex-direction: column; gap: 4px;
      }
      .message-card blockquote,
      .runtime-entry blockquote {
        margin: 8px 0; padding: 8px 12px; border-left: 3px solid var(--accent); border-radius: 8px;
        background: rgba(255,255,255,0.04); color: var(--muted);
      }
      .message-card code,
      .runtime-entry code {
        background: rgba(255,255,255,0.08); padding: 2px 5px; border-radius: 6px; font-family: var(--mono);
      }
      .message-card pre,
      .runtime-entry pre {
        background: rgba(255,255,255,0.06); padding: 10px; border-radius: 8px; overflow-x: auto; margin: 8px 0;
      }
      .message-card hr,
      .runtime-entry hr {
        border: 0; border-top: 1px solid var(--border); margin: 10px 0;
      }

      .msg-avatar {
        width: 28px; height: 28px; border-radius: 50%;
        display: grid; place-items: center;
        font-size: 13px; font-weight: 700;
        flex-shrink: 0; margin-top: 2px;
      }
      .msg-avatar.user { background: linear-gradient(135deg, var(--accent-2), #488ae77b); color: #fff; }
      .msg-avatar.assistant {
        background: linear-gradient(135deg, var(--accent-dim), rgba(126,231,135,.22));
        border: 1px solid rgba(126,231,135,.22); color: var(--accent); font-size: 14px;
      }

      .msg-body { flex: 1; min-width: 0; max-width: 680px; }
      .msg-meta { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; }
      .msg-role { font-size: 13px; font-weight: 600; }
      .msg-role.user { color: var(--accent-2); }
      .msg-role.assistant { color: var(--accent); }
      .message-meta { font-size: 11px; color: var(--muted); }

      .message-content {
        font-size: 14px; line-height: 1.7;
        color: var(--text);
        white-space: pre-wrap; word-break: break-word;
        padding: 20px 26px;
        border-radius: var(--radius);
        border: 1px solid rgba(255,255,255,0.07);
        background: rgba(255,255,255,0.03);
        max-width: min(680px, 100%);
        overflow-x: hidden;
        overflow-wrap: anywhere;
      }
      [data-theme="light"] .message-content {
        background: var(--surface-elevated);
        border-color: var(--border);
      }
      .message-actions {
        display: flex; justify-content: flex-end; margin-top: 8px;
      }
      .message-copy-btn {
        border: 1px solid var(--button-border);
        background: var(--surface-muted);
        color: var(--text-muted);
        padding: 6px 10px;
        border-radius: 999px;
        cursor: pointer;
        font-size: 12px;
        transition: background .16s, color .16s, border-color .16s;
      }
      .message-copy-btn:hover {
        background: var(--surface-strong);
        color: var(--text);
        border-color: var(--border);
      }

      .chat-break-line {
        display: block;
        margin: 8px 0;
        color: rgba(232,239,247,0.65);
        font-family: var(--mono);
        font-size: 12px;
        line-height: 1;
        white-space: nowrap;
        overflow: hidden;
      }

      .message-content .katex-display { margin: 10px 0; overflow-x: auto; }

      .typing-caret {
        display: inline-block; width: 9px; height: 9px;
        margin-left: 4px; border-radius: 50%;
        border: 2px solid var(--accent);
        border-top-color: transparent;
        vertical-align: middle;
        animation: spinCaret 0.45s linear infinite;
      }
      @keyframes spinCaret { to { transform: rotate(360deg); } }

      .typing-fade-in {
        color: rgba(255, 255, 255, 1);
        opacity: 0.2;
        animation: typingFadeIn 0.2s steps(100, end) forwards;
      }
      @keyframes typingFadeIn {
         from { opacity: 0.2; }
         to   { opacity: 1; }
      }

      /* runtime dropdown */
      .runtime-dropdown {
        background: var(--bg);
        border: 0px solid var(--input-border);
        border-radius: var(--radius);
        overflow: hidden; margin-top: 8px;
      }
      .runtime-dropdown summary {
        list-style: none; cursor: pointer;
        padding: 9px 14px;
        display: flex; align-items: center; justify-content: space-between;
        font-size: 12px; font-weight: 500; color: var(--muted);
      }
      .runtime-dropdown summary::-webkit-details-marker { display: none; }
      .runtime-chevron { font-size: 11px; color: var(--muted); }
      .runtime-log { max-height: 280px; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 4px; }

      .runtime-controls {
        display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
        padding: 8px; border-bottom: 1px solid var(--border);
      }
      .runtime-filter-btn {
        padding: 3px 9px; border-radius: 99px; font-size: 11px;
        border: 1px solid var(--button-border); color: var(--text-muted);
        transition: background .12s, color .12s;
      }
      .runtime-filter-btn:hover { background: var(--surface-muted); color: var(--text); }
      .runtime-filter-btn.off { opacity: .4; }
      .runtime-search {
        margin-left: auto; min-width: 140px;
        background: var(--input-bg); border: 1px solid var(--input-border);
        border-radius: 7px; padding: 4px 8px; font-size: 12px; outline: none; color: var(--input-text);
      }

      .runtime-entry {
        padding: 8px 11px; border-radius: 7px;
        border: 1px solid var(--border);
        border-left: 3px solid var(--border);
        background: rgba(255,255,255,.02);
      }
      .runtime-entry.status { border-left-color: var(--warn); }
      .runtime-entry.think  { border-left-color: #9ea8ff; }
      .runtime-entry.agent  { border-left-color: var(--accent); }
      .runtime-entry.error  { border-left-color: var(--danger); }
      .runtime-entry.step   { border-left-color: var(--accent-2); }
      .runtime-entry.narrate { border-left-color: #f0a050; background: rgba(240,160,80,.05); }
      .runtime-entry.supervisor { border-left-color: #8b949e; background: rgba(139,148,158,.08); }

      /* dead guidance-shell block removed — guidance is handled via .composer-assist */
      .guidance-shell-unused {
        position: relative;
        margin: 12px 20px 20px;
        border-radius: 16px;
        border: 1px solid rgba(109,180,255,0.22);
        background:
          linear-gradient(180deg, rgba(16,23,35,0.96), rgba(11,16,24,0.98)),
          radial-gradient(circle at top right, rgba(109,180,255,0.18), transparent 45%);
        box-shadow: 0 18px 44px rgba(3,8,15,0.34);
        overflow: hidden;
      }
      .guidance-shell::before {
        content: "";
        position: absolute;
        inset: 0 auto 0 0;
        width: 4px;
        background: linear-gradient(180deg, #6db4ff, #85e89d);
      }
      .guidance-shell.critical::before {
        background: linear-gradient(180deg, #ff7b72, #f85149);
      }
      .guidance-inner { padding: 22px 22px 20px; display: flex; flex-direction: column; gap: 18px; }
      .guidance-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
      .guidance-title-wrap { display: grid; gap: 8px; }
      .guidance-title { font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #dce9f8; }
      .guidance-subtitle { font-size: 14px; color: #9fb0c3; line-height: 1.65; max-width: 58ch; }
      .guidance-badge {
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid rgba(109,180,255,0.22);
        background: rgba(109,180,255,0.12);
        color: #b9d7ff;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        white-space: nowrap;
      }
      .guidance-badge.critical {
        border-color: rgba(248,81,73,0.35);
        background: rgba(248,81,73,0.16);
        color: #ffd1ce;
      }
      .guidance-question {
        display: flex;
        gap: 14px;
        align-items: flex-start;
        padding: 16px 17px;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.06);
        background: rgba(255,255,255,0.03);
        font-size: 14px;
        color: #d8e4f0;
        line-height: 1.7;
      }
      .guidance-q-icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }
      .guidance-context {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid rgba(255,255,255,0.06);
        color: #95a5b7;
        font-size: 12px;
      }
      .guidance-last {
        display: grid;
        gap: 8px;
        padding: 14px 15px;
        border-radius: 12px;
        background: rgba(133,232,157,0.08);
        border: 1px solid rgba(133,232,157,0.14);
      }
      .guidance-last.critical {
        background: rgba(248,81,73,0.1);
        border-color: rgba(248,81,73,0.24);
      }
      .guidance-last-label { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #99a9bb; }
      .guidance-last-text { font-size: 13px; color: #ebf3fb; line-height: 1.55; }
      .guidance-rules { display: flex; flex-wrap: wrap; gap: 10px; }
      .guidance-rule {
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.07);
        color: #b8c5d2;
        font-size: 12px;
      }
      .guidance-quick-row { display: flex; flex-wrap: wrap; gap: 10px; overflow-x: auto; padding-bottom: 4px; }
      .guidance-quick-row::-webkit-scrollbar { height: 0; }
      .guidance-quick-btn {
        flex-shrink: 0;
        padding: 8px 11px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.09);
        background: rgba(255,255,255,0.04);
        color: #d4dfeb;
        font-size: 12px;
        transition: background .12s, border-color .12s, transform .12s;
      }
      .guidance-quick-btn:hover {
        background: rgba(109,180,255,0.12);
        border-color: rgba(109,180,255,0.24);
        transform: translateY(-1px);
      }
      .guidance-input-row { display: flex; flex-direction: column; gap: 12px; align-items: stretch; }
      .guidance-input-wrap { flex: 1; display: grid; gap: 8px; }
      .guidance-input {
        width: 100%;
        min-height: 118px;
        resize: vertical;
        background: rgba(5,10,18,0.78);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 12px;
        padding: 14px 15px;
        color: #dce9f6;
        font-size: 14px;
        line-height: 1.65;
        outline: none;
      }
      .guidance-input:focus { border-color: rgba(109,180,255,0.56); box-shadow: 0 0 0 3px rgba(109,180,255,0.12); }
      .guidance-meta { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: #8ea0b2; font-size: 12px; }
      .guidance-send-btn {
        min-height: 52px;
        min-width: 180px;
        padding: 0 20px;
        border-radius: 14px;
        background: linear-gradient(135deg, #6db4ff, #85e89d);
        color: #071019;
        font-size: 13px;
        font-weight: 700;
        box-shadow: 0 12px 26px rgba(109,180,255,0.2);
        transition: transform .12s, opacity .12s, box-shadow .12s;
        align-self: flex-end;
      }
      .guidance-send-btn:hover { transform: translateY(-1px); opacity: 0.97; box-shadow: 0 16px 32px rgba(109,180,255,0.26); }
      .guidance-send-btn.critical {
        background: linear-gradient(135deg, #ff7b72, #f85149);
        color: #fff7f7;
      }

      .runtime-head {
        display: flex; justify-content: space-between; align-items: center;
        gap: 8px; margin-bottom: 4px;
        font-size: 10px; letter-spacing: .07em; text-transform: uppercase; color: var(--muted);
      }
      .runtime-body { font-size: 12px; color: var(--text); white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; overflow-x: hidden; line-height: 1.55; }

      /* composer */
      .composer {
        border-top: 1px solid var(--border);
        padding: 28px 32px 40px;
        background: var(--bg);
        flex-shrink: 0;
      }

      .composer-wrap {
        max-width: 720px; margin: 28px auto 0;
      }

      .composer-assist {
        margin-bottom: 18px;
        padding: 16px 18px;
        border-radius: 18px;
        border: 1px solid rgba(109,180,255,0.18);
        background: linear-gradient(180deg, rgba(18,27,40,0.92), rgba(11,17,25,0.96));
        display: grid;
        gap: 12px;
      }
      .composer-assist.hidden { display: none !important; }
      .composer-assist.critical {
        border-color: rgba(248,81,73,0.28);
        background: linear-gradient(180deg, rgba(38,18,23,0.94), rgba(20,12,15,0.98));
      }
      .composer-assist-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 14px;
      }
      .composer-assist-copy {
        display: grid;
        gap: 8px;
      }
      .composer-assist-title {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #dce9f8;
      }
      .composer-assist-text {
        font-size: 14px;
        line-height: 1.7;
        color: #dbe6f2;
      }
      .composer-assist-context {
        padding-top: 10px;
        border-top: 1px solid rgba(255,255,255,0.06);
        color: #93a5b8;
        font-size: 12px;
        line-height: 1.6;
      }
      .composer-assist-badge {
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid rgba(109,180,255,0.22);
        background: rgba(109,180,255,0.12);
        color: #b9d7ff;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        white-space: nowrap;
      }
      .composer-assist-badge.critical {
        border-color: rgba(248,81,73,0.35);
        background: rgba(248,81,73,0.16);
        color: #ffd1ce;
      }
      .composer-assist-last {
        padding: 12px 14px;
        border-radius: 14px;
        border: 1px solid rgba(133,232,157,0.14);
        background: rgba(133,232,157,0.08);
        color: #eaf3fb;
        font-size: 13px;
        line-height: 1.6;
      }
      .composer-assist-last.critical {
        border-color: rgba(248,81,73,0.24);
        background: rgba(248,81,73,0.1);
      }
      .composer-assist-last-label {
        display: block;
        margin-bottom: 6px;
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #99a9bb;
      }
      .composer-wrap.guidance-mode .composer-box {
        border-color: rgba(109,180,255,0.22);
        box-shadow: 0 20px 44px rgba(3,9,16,0.2);
      }
      .composer-wrap.guidance-mode .composer-textarea {
        min-height: 120px;
      }

      .composer-box {
        background: var(--panel-bg);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 2px;
        transition: border-color .15s;
      }
      .composer-box:focus-within { border-color: rgba(255,255,255,.18); }

      .composer-textarea {
        display: block; width: 100%;
        background: transparent; border: none; outline: none;
        padding: 18px 20px 8px;
        font-size: 15px; line-height: 1.65;
        resize: none;
        min-height: 64px; max-height: 220px;
        overflow-y: auto; color: var(--text);
      }

      .composer-footer {
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 16px 14px 18px;
        gap: 10px;
      }

      .quick-actions {
        display: flex; gap: 6px; flex-wrap: nowrap; overflow-x: auto;
        padding-bottom: 2px; flex: 1; min-width: 0;
      }
      .quick-actions::-webkit-scrollbar { height: 0; }

      .quick-chip {
        white-space: nowrap; flex-shrink: 0;
        padding: 8px 13px; border-radius: 99px;
        background: rgba(255,255,255,.04); border: 1px solid var(--border);
        font-size: 12px; color: var(--muted);
        transition: background .12s, color .12s, border-color .12s;
      }
      .quick-chip:hover { background: rgba(255,255,255,.08); color: var(--text); border-color: var(--border-hover); }

      .composer-send {
        display: flex; align-items: center; justify-content: center;
        min-width: 52px; height: 44px; border-radius: 12px;
        background: linear-gradient(180deg, #cde92d 0%, #a8d61d 100%);
        color: #26320f;
        font-size: 14px; font-weight: 700; flex-shrink: 0;
        padding: 0 16px;
        box-shadow: 0 8px 20px rgba(126, 168, 39, 0.18);
        transition: opacity .15s, transform .12s, box-shadow .12s;
      }
      .composer-send:hover { opacity: 1; transform: scale(1.04); box-shadow: 0 10px 24px rgba(126, 168, 39, 0.24); }
      .composer-send:disabled { opacity: .35; pointer-events: none; }
      .composer-send.is-thinking { transform: scale(1.01); box-shadow: 0 10px 24px rgba(126, 168, 39, 0.22); }
      .composer-send-spinner {
        display: inline-block;
        width: 16px;
        height: 16px;
        border-radius: 999px;
        border: 2px solid rgba(38, 50, 15, 0.28);
        border-top-color: currentColor;
        animation: composer-spin 0.75s linear infinite;
      }
      @keyframes composer-spin {
        to { transform: rotate(360deg); }
      }

      /* ── BROWSER PANEL ────────────────────────────────── */
      .browser-aside {
        width: 360px; min-width: 320px;
        display: flex; flex-direction: column;
        border-left: 1px solid var(--border);
        background: var(--sidebar-bg);
        overflow: hidden;
        flex-shrink: 0;
        border-top-left-radius: 0;
        border-bottom-left-radius: 0;
        border-top-right-radius: var(--radius);
        border-bottom-right-radius: var(--radius);
      }

      .browser-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 14px;
        border-bottom: 1px solid var(--border);
        flex-shrink: 0;
      }
      .browser-header-title { font-size: 13px; font-weight: 600; }

      .browser-scroll { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; }

      .browser-frame {
        position: relative; border-radius: var(--radius);
        overflow: hidden; background: #010409;
        border: 1px solid var(--border);
        box-shadow: 0 20px 48px rgba(0,0,0,0.25);
      }

      .browser-toolbar {
        padding: 8px 12px;
        border-bottom: 1px solid var(--border);
        display: flex; flex-direction: column; gap: 3px;
        background: rgba(0,0,0,.4);
        font-size: 11px; color: var(--muted);
      }
      .browser-url {
        font-family: var(--mono); font-size: 11px; color: var(--muted);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }

      #screenshot { display: block; width: 100%; height: auto; max-height: 420px; object-fit: contain; }

      .demo-cursor {
        position: absolute; width: 14px; height: 14px;
        border-radius: 50%;
        border: 2px solid rgba(88,166,255,.95);
        background: rgba(88,166,255,.15);
        box-shadow: 0 0 0 4px rgba(88,166,255,.08);
        transform: translate(0,0); pointer-events: none; z-index: 5;
      }
      .demo-click-pulse {
        position: absolute; width: 12px; height: 12px;
        border-radius: 99px; border: 2px solid var(--accent);
        pointer-events: none; z-index: 4; opacity: 0;
        transform: translate(-50%,-50%) scale(.2);
      }
      .demo-click-pulse.active { animation: clickPulse 360ms ease-out forwards; }
      @keyframes clickPulse {
        0%  { opacity:.9; transform:translate(-50%,-50%) scale(.2); }
        100%{ opacity:0;  transform:translate(-50%,-50%) scale(2.4); }
      }

      .models-section { display: flex; flex-direction: column; gap: 8px; }
      .models-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); }

      .bridge-card {
        background: rgba(0,0,0,.25);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .bridge-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .bridge-title {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: .07em;
        color: var(--muted);
      }
      .bridge-badge {
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 999px;
        border: 1px solid var(--border);
        color: var(--muted);
        background: rgba(255,255,255,.04);
      }
      .bridge-badge.active {
        color: var(--warn);
        border-color: rgba(210,153,34,.38);
        background: rgba(210,153,34,.12);
      }
      .bridge-badge.idle {
        color: var(--accent);
        border-color: rgba(126,231,135,.34);
        background: rgba(126,231,135,.08);
      }
      .bridge-summary {
        font-size: 12px;
        color: var(--text);
        line-height: 1.45;
      }
      .bridge-reason {
        font-size: 11px;
        color: var(--muted);
        min-height: 16px;
      }
      .bridge-actions {
        display: flex;
        gap: 6px;
      }

      .model-card {
        background: rgba(0,0,0,.25); border: 1px solid var(--border);
        border-radius: var(--radius); padding: 10px 12px;
      }
      .model-card-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 6px;
      }
      .model-card label {
        display: block; font-size: 11px; font-weight: 600; text-transform: uppercase;
        letter-spacing: .07em; color: var(--muted);
      }
      .model-search {
        width: 100%;
        background: rgba(0,0,0,.3);
        border: 1px solid var(--border);
        border-radius: 7px;
        padding: 6px 9px;
        font-size: 11px;
        color: var(--text);
        margin-bottom: 7px;
      }
      .model-search:focus { border-color: var(--accent-2); outline: none; }
      .model-count {
        font-size: 10px;
        color: var(--muted);
        border: 1px solid var(--border);
        border-radius: 999px;
        padding: 1px 7px;
        line-height: 1.6;
      }
      .toolbar-select {
        width: 100%; background: rgba(0,0,0,.3); border: 1px solid var(--border);
        border-radius: 7px; padding: 7px 10px; font-size: 12px; color: var(--text); outline: none;
        transition: border-color .14s;
      }
      .toolbar-select:focus { border-color: var(--accent-2); }
      .model-id { font-size: 10px; color: var(--muted); margin-top: 5px; font-family: var(--mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

      /* ── RESPONSIVE ───────────────────────────────────── */
      @media (max-width: 1140px) { .browser-aside { width: 320px; } }
      @media (max-width: 960px)  { .browser-aside { display: none; } }
      @media (max-width: 700px)  {
        .sidebar { width: 220px; min-width: 220px; }
        .sidebar.collapsed { width: 70px; min-width: 70px; }
        .chat-header-right { display: none; }
        .plan-grid, .upgrade-footnote { grid-template-columns: 1fr; }
        .upgrade-hero, .plan-card, .upgrade-panel { padding: 20px; }
      }
      @media (max-width: 540px)  { .sidebar { display: none; } }

      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
      }

      body.upgrade-route .sidebar,
      body.upgrade-route .browser-aside,
      body.upgrade-route .chat-header,
      body.upgrade-route .composer,
      body.upgrade-route #narrationBanner,
      body.upgrade-route #composerAssist {
        display: none !important;
      }

      body.upgrade-route .chat-main {
        width: 100%;
      }

      body.upgrade-route .timeline-scroll {
        padding: 30px 0 42px;
      }

      body.upgrade-route .timeline {
        max-width: 1120px;
      }
    </style>
  </head>
  <body>
    <!-- LOGIN -->
    <div class="login-shell" id="loginShell">
      <div class="login-card">
        <div class="login-brand">
          <div class="login-logo">${iconMarkup("spark")}</div>
          <span class="login-brand-name">Puppeterr</span>
        </div>
        <h2>Welcome back</h2>
        <p class="login-copy" id="loginModeHint">Sign in or Sign up!.</p>
        <form id="loginForm">
          <div class="field">
            <label for="loginUsername">Email</label>
            <input id="loginUsername" name="email" type="email" autocomplete="email" required />
          </div>
          <div class="field">
            <label for="loginPassword">Password</label>
            <input id="loginPassword" type="password" name="password" autocomplete="current-password" required />
          </div>
          <button class="primary-btn" type="submit" id="loginBtn" style="width:100%;justify-content:center">Sign in</button>
          <button class="ghost-btn" type="button" id="signupBtn" style="width:100%;justify-content:center;margin-top:8px">Create account</button>
          <div class="hint" id="loginHint"></div>
          <div id="loginError" class="hidden" style="color:var(--danger);font-size:13px;margin-top:8px;"></div>
        </form>
      </div>
    </div>

    <!-- APP -->
    <div class="shell hidden" id="appShell">
      <div class="app-layout">

        <!-- SIDEBAR -->
        <nav class="sidebar" id="sidebarNav">
          <div class="sidebar-header">
            <div class="sidebar-brand">
              <div class="sidebar-logo">${iconMarkup("spark")}</div>
              Puppeterr
            </div>
            <div class="sidebar-actions">
              <button class="icon-btn theme-toggle" id="themeToggleBtn" title="Toggle theme" aria-label="Toggle theme">${iconMarkup("moon")}</button>
              <button class="icon-btn sidebar-toggle-btn" id="sidebarToggleBtn" title="Collapse sidebar" aria-label="Collapse sidebar">${iconMarkup("collapse")}</button>
              <button class="icon-btn" id="refreshAllBtn" title="Refresh">${iconMarkup("refresh")}</button>
            </div>
          </div>

          <button class="sidebar-new-chat" id="newChatBtn" type="button">
            <span class="sidebar-icon-label"><span class="sidebar-new-chat-icon">${iconMarkup("plus")}</span><span class="sidebar-label-text">New chat</span></span>
          </button>

          <button class="sidebar-nav-link" id="upgradeViewBtn" type="button">
            <span class="sidebar-nav-icon sidebar-icon-label"><span>${iconMarkup("spark")}</span><span class="sidebar-label-text">Upgrade</span></span>
            <span class="sidebar-nav-badge">Plans</span>
          </button>

          <div class="sidebar-section-label">Recents</div>
          <div class="sidebar-scroll">
            <div class="chat-list" id="chatList"></div>
          </div>

          <div class="memory-section">
            <div class="memory-section-header">
              <span class="memory-section-title">Memory</span>
              <button class="icon-btn" id="refreshMemoryBtn" title="Refresh memory" style="width:24px;height:24px;font-size:13px;">${iconMarkup("refresh")}</button>
            </div>
            <div class="memory-list" id="memoryList"></div>
          </div>

          <div class="sidebar-footer">
            <div class="sidebar-user">
              <div class="user-avatar" id="userAvatar">A</div>
              <div class="user-info">
                <div class="user-name" id="currentUser">-</div>
                <div class="user-status">
                  <span class="status-dot" id="statusDot"></span>
                  <span id="connectionStatus">Connecting</span>
                </div>
              </div>
            </div>
            <button class="icon-btn" id="logoutBtn" title="Sign out">${iconMarkup("logout")}</button>
          </div>
        </nav>

        <!-- CHAT MAIN -->
        <main class="chat-main">
          <div class="chat-header">
            <div class="chat-header-left">
              <div>
                <div class="chat-header-title" id="timelineTitle">Select a chat</div>
                <div class="chat-header-sub" id="timelineSubtitle"></div>
              </div>
              <span class="tag" id="messageCountTag" style="display:none"></span>
            </div>
            <div class="chat-header-right">
              <div class="supervisor-pill" id="supervisorPill">Supervisor: idle</div>
              <div class="conn-badge">
                <span class="conn-dot" id="connDot"></span>
                <span id="connLabel">Connecting</span>
              </div>
              <div class="model-pill">
                <span class="model-pill-dot"></span>
                <span id="modelModeStatus">default</span>
              </div>
            </div>
          </div>

          <div class="timeline-scroll" id="timelineScroll">
            <div class="timeline" id="timeline"></div>
          </div>

          <!-- NARRATION BANNER: Live agent commentary -->
          <div id="narrationBanner" style="display:none;opacity:0;transition:opacity 0.4s;margin:0 12px 6px;padding:10px 14px;background:linear-gradient(135deg,#1c2433,#1a2e1a);border:1px solid #2ea04380;border-radius:8px;font-size:13px;color:#7ee787;line-height:1.5;"></div>

            <div class="composer-wrap" id="composerArea">
              <div id="composerAssist" class="composer-assist hidden"></div>
              <div class="composer-box">
                <textarea id="composerInput" class="composer-textarea" rows="1"
                  placeholder="Ask a question or assign a browsing task…"></textarea>
                <div id="imagePreviewWrap" style="display:none;margin-bottom:8px;border:1px solid var(--border);border-radius:6px;overflow:hidden;background:var(--panel-bg);">
                  <div style="padding:8px;position:relative;background:var(--panel-bg);">
                    <div style="display:flex;gap:8px;align-items:flex-start;">
                      <img id="previewImg" src="" style="max-width:128px;max-height:128px;border-radius:8px;object-fit:cover;border:1px solid var(--border);background:var(--surface-elevated);" />
                      <div style="flex:1;min-width:0;">
                        <canvas id="detrCanvas" style="max-width:300px;max-height:200px;border:1px solid var(--border);border-radius:4px;display:block;"></canvas>
                        <div id="detrStatus" style="font-size:11px;color:var(--muted);margin-top:4px;line-height:1.4;"></div>
                        <div id="layoutAnalysisWrap" style="display:none;margin-top:8px;padding-top:8px;border-top:1px solid var(--border);">
                          <div id="layoutStatus" style="font-size:11px;color:var(--muted);line-height:1.4;margin-bottom:8px;"></div>
                          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:8px;">
                            <div style="min-width:0;">
                              <div style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted);margin-bottom:4px;">ASCII Map</div>
                              <pre id="layoutAscii" style="margin:0;max-height:220px;overflow:auto;padding:8px;border:1px solid var(--border);border-radius:6px;background:#0b1118;color:#c9d7e6;font:11px/1.35 var(--mono);white-space:pre;"></pre>
                            </div>
                            <div style="min-width:0;">
                              <div style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted);margin-bottom:4px;">Structured Key</div>
                              <pre id="layoutKey" style="margin:0;max-height:220px;overflow:auto;padding:8px;border:1px solid var(--border);border-radius:6px;background:#0b1118;color:#c9d7e6;font:11px/1.35 var(--mono);white-space:pre;"></pre>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div style="display:flex;gap:4px;margin-top:8px;justify-content:flex-end;">
                      <button class="ghost-btn" id="clearImageBtn" type="button" style="padding:4px 8px;font-size:11px;">${iconMarkup("close")} Clear</button>
                    </div>
                  </div>
                </div>
                <input id="imageFileInput" type="file" accept="image/*" style="display:none;" />
                <div class="composer-footer">
                  <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;">
                    <button class="ghost-btn" id="uploadImageBtn" type="button" style="padding:4px 8px;font-size:11px;">${iconMarkup("image")} Image</button>
                  </div>
                  <div class="quick-actions" id="quickActions">
                    <button class="quick-chip" type="button" data-quick-prompt="Open Wikipedia and search for potatoes. Summarize the first paragraph.">Wiki Summary</button>
                    <button class="quick-chip" type="button" data-quick-prompt="Visit Britannica and search for potato agriculture. Extract key points.">Britannica</button>
                    <button class="quick-chip" type="button" data-quick-prompt="Compare Wikipedia and Britannica articles on potatoes. List 3 similarities.">Compare</button>
                    <button class="quick-chip" type="button" data-quick-prompt="Find FAO global potato production statistics and report latest data.">FAO Stats</button>
                  </div>
                  <button class="composer-send" id="sendBtn" type="button">${iconMarkup("send")}</button>
                </div>
              </div>
            </div>
          </div>
        </main>

        <!-- BROWSER PANEL -->
        <aside class="browser-aside">
          <div class="browser-header">
            <span class="browser-header-title">Live Browser</span>
            <button class="ghost-btn" id="refreshModelsBtn" style="padding:4px 9px;font-size:11px;">Refresh models</button>
          </div>
          <div class="browser-scroll">
            <div class="browser-frame">
              <div class="browser-toolbar">
                <span style="font-size:11px;font-weight:500;color:var(--muted)">Live Snapshot</span>
                <span class="browser-url" id="browserUrl">about:blank</span>
              </div>
              <img id="screenshot" src="" alt="Browser screenshot" />
              <div class="demo-cursor" id="demoCursor" aria-hidden="true"></div>
              <div class="demo-click-pulse" id="demoClickPulse" aria-hidden="true"></div>
            </div>
            <div class="bridge-card">
              <div class="bridge-head">
                <span class="bridge-title">Vision UI Analysis</span>
                <button class="ghost-btn" id="analyzeCurrentUiBtn" style="padding:4px 9px;font-size:11px;">Analyze UI</button>
              </div>
              <div id="browserVisionStatus" class="bridge-summary">Vision can analyze the current live browser UI on demand.</div>
              <div id="browserVisionWrap" style="display:none;margin-top:8px;">
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:8px;">
                  <div style="min-width:0;">
                    <div style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted);margin-bottom:4px;">ASCII Map</div>
                    <pre id="browserVisionAscii" style="margin:0;max-height:220px;overflow:auto;padding:8px;border:1px solid var(--border);border-radius:6px;background:#0b1118;color:#c9d7e6;font:11px/1.35 var(--mono);white-space:pre;"></pre>
                  </div>
                  <div style="min-width:0;">
                    <div style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted);margin-bottom:4px;">Structured Key</div>
                    <pre id="browserVisionKey" style="margin:0;max-height:220px;overflow:auto;padding:8px;border:1px solid var(--border);border-radius:6px;background:#0b1118;color:#c9d7e6;font:11px/1.35 var(--mono);white-space:pre;"></pre>
                  </div>
                </div>
              </div>
            </div>
            <div class="bridge-card">
              <div class="bridge-head">
                <span class="bridge-title">Human Bridge</span>
                <span id="humanBridgeBadge" class="bridge-badge">loading</span>
              </div>
              <div id="humanBridgeSummary" class="bridge-summary">Checking bridge status...</div>
              <div id="humanBridgeReason" class="bridge-reason"></div>
              <div class="bridge-actions">
                <button class="ghost-btn" id="openHumanBridgeBtn" style="padding:4px 9px;font-size:11px;">Open bridge</button>
                <button class="ghost-btn" id="refreshHumanBridgeBtn" style="padding:4px 9px;font-size:11px;">Refresh</button>
              </div>
            </div>
            <div class="models-section">
              <div class="models-title">Model Stack</div>
              <div id="modelGrid"></div>
            </div>
          </div>
        </aside>

      </div>
    </div>

    <script>
      function iconMarkup(name) {
        const icons = {
          bot: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6a3 3 0 0 1 3 3v1h1a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1v1a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-1H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1V7a3 3 0 0 1 3-3Z"/><path d="M9 8v7"/><path d="M15 8v7"/><path d="M8 12h8"/><circle cx="9" cy="10.5" r="0.7"/><circle cx="15" cy="10.5" r="0.7"/></svg>',
          spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 1.4 5.4L18 9l-4.6 1.6L12 16l-1.4-5.4L6 9l4.6-1.6Z"/><path d="m18 16 1 3.5L22 21l-3-1-1.5-3Z"/><path d="m6 16-1 3.5L2 21l3-1 1.5-3Z"/></svg>',
          plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
          refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
          logout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4"/><path d="m13 15 3-3-3-3"/><path d="M16 12H5"/></svg>',
          code: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/><path d="m13 5-2 14"/></svg>',
          image: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="m4 16 4-4 3 3 4-5 5 6"/></svg>',
          send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16"/><path d="m13 5 7 7-7 7"/></svg>',
          close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6 6 18"/></svg>',
          collapse: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 8 4 4-4 4"/><path d="m14 8 4 4-4 4"/></svg>',
          expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 16 4-4 4 4"/><path d="m8 10 4 4 4-4"/></svg>',
          sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m4.93 19.07 1.41-1.41"/><path d="m17.66 6.34 1.41-1.41"/></svg>',
          moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/></svg>',
          chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-4 3V8a2 2 0 0 1 2-2Z"/></svg>',
          check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>',
          alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 20h20L12 3Z"/><path d="M12 8v5"/><path d="M12 16h.01"/></svg>'
        };
        const markup = '<span class="icon-inline">' + (icons[name] || "") + '</span>';
        window.iconMarkup = iconMarkup;
        return markup;
      }

      const state = {
        session: null,
        account: null,
        chats: [],
        currentChat: null,
        selectedChatId: null,
        memory: [],
        models: { catalog: [], current: {}, defaults: {} },
        modelParams: { temperature: 0.3 },
        modelSearch: {},
        runtime: {},
        sending: false,
        eventSource: null,
        sidebarCollapsed: false,
        humanBridgeWindow: null,
        humanBridgeAutoOpened: false,
        browserUrl: "about:blank",
        humanBridge: null,
        bootstrapTimer: null,
        browserTimer: null,
        humanBridgeTimer: null,
        typingFx: {
          lengths: {},
          timers: {},
          revealedAt: {}
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
          agent: true,
          narrate: true,
          supervisor: true,
          peer_alignment: true
        },
        runtimeSearch: "",
        runtimeDropdownOpen: null,
        latestGuidance: null,
        initialView: "chat",
        supervisor: {
          decision: "idle",
          score: null,
          reason: "No active task supervision yet",
          ts: null
        },
        pendingImage: null,
        currentView: "chat",
        billingCycle: "yearly",
        agentQuestion: null,   // Active question from agent
        narrateLog: [],        // Live narration stream
        signupWarning: null
      };

      const PLAN_CONFIG = {
        monthly: [
          {
            key: "core",
            name: "Core",
            price: "$10",
            unit: "/month",
            trial: "30-day free trial, then $10 monthly.",
            label: "For solo builders and light automation",
            description: "Keep simple automation moving with essential runs, memory, and browser tasks.",
            cta: "Start Core",
            href: "https://app.getpinch.com.au/Plans/Plan/IdFIXeXErt",
            features: ["Autonomous browsing workflows", "Persistent task memory", "Image upload + DETR analysis", "Pinch-connected ticket actions"]
          },
          {
            key: "ultimate",
            name: "Ultimate",
            price: "$25",
            unit: "/month",
            trial: "1 month free, then $25 monthly.",
            label: "For higher-volume operators and teams",
            description: "Unlock the best value for always-on workflows, deeper memory, and heavier agent usage.",
            cta: "Upgrade to Ultimate",
            href: "https://app.getpinch.com.au/Plans/Plan/zmTKB1p32Q",
            badge: "Most Popular",
            popular: true,
            features: ["Priority access to complex runs", "Longer memory context windows", "Faster ticket and webhook workflows", "Best fit for multi-session usage"]
          }
        ],
        yearly: [
          {
            key: "core",
            name: "Core",
            price: "$30",
            unit: "/year",
            trial: "1 month free, then $30 yearly.",
            label: "Lower annual cost for steady usage",
            description: "A lean annual plan for creators who want dependable automation without monthly churn.",
            cta: "Start Core Yearly",
            href: "https://app.getpinch.com.au/Plans/Plan/z7iuQl5pKA",
            features: ["Autonomous browsing workflows", "Persistent task memory", "Image upload + DETR analysis", "Pinch-connected ticket actions"]
          },
          {
            key: "ultimate",
            name: "Ultimate",
            price: "$60",
            unit: "/year",
            trial: "1 month free, then $60 yearly.",
            label: "Maximum savings for committed teams",
            description: "Your strongest annual offer for customers ready to stay in the workflow and scale output.",
            cta: "Claim Ultimate Yearly",
            href: "https://app.getpinch.com.au/Plans/Plan/igI0bOqPL0",
            badge: "Max Savings",
            popular: true,
            features: ["Priority access to complex runs", "Longer memory context windows", "Faster ticket and webhook workflows", "Best fit for multi-session usage"]
          }
        ]
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
      const timelineScroll = document.getElementById("timelineScroll");
      const timelineTitle = document.getElementById("timelineTitle");
      const timelineSubtitle = document.getElementById("timelineSubtitle");
      const sidebarNav = document.getElementById("sidebarNav");
      const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");
      const themeToggleBtn = document.getElementById("themeToggleBtn");
      const messageCountTag = document.getElementById("messageCountTag");
      const composerInput = document.getElementById("composerInput");
      const composerAssist = document.getElementById("composerAssist");
      const sendBtn = document.getElementById("sendBtn");
      const browserUrl = document.getElementById("browserUrl");
      const screenshot = document.getElementById("screenshot");
      const browserFrame = document.querySelector(".browser-frame");
      const analyzeCurrentUiBtn = document.getElementById("analyzeCurrentUiBtn");
      const browserVisionStatus = document.getElementById("browserVisionStatus");
      const browserVisionWrap = document.getElementById("browserVisionWrap");
      const browserVisionAscii = document.getElementById("browserVisionAscii");
      const browserVisionKey = document.getElementById("browserVisionKey");
      const humanBridgeBadge = document.getElementById("humanBridgeBadge");
      const humanBridgeSummary = document.getElementById("humanBridgeSummary");
      const humanBridgeReason = document.getElementById("humanBridgeReason");
      const openHumanBridgeBtn = document.getElementById("openHumanBridgeBtn");
      const refreshHumanBridgeBtn = document.getElementById("refreshHumanBridgeBtn");
      const demoCursor = document.getElementById("demoCursor");
      const demoClickPulse = document.getElementById("demoClickPulse");
      const modelGrid = document.getElementById("modelGrid");
      const memoryList = document.getElementById("memoryList");
      const loginModeHint = document.getElementById("loginModeHint");
      const quickActions = document.getElementById("quickActions");
      const composerArea = document.getElementById("composerArea");
      const connDot = document.getElementById("connDot");
      const connLabel = document.getElementById("connLabel");
      const supervisorPill = document.getElementById("supervisorPill");
      const statusDot = document.getElementById("statusDot");
      const userAvatar = document.getElementById("userAvatar");
      const upgradeViewBtn = document.getElementById("upgradeViewBtn");
      const uploadImageBtn = document.getElementById("uploadImageBtn");
      const imageFileInput = document.getElementById("imageFileInput");
      const imagePreviewWrap = document.getElementById("imagePreviewWrap");
      const detrCanvas = document.getElementById("detrCanvas");
      const detrStatus = document.getElementById("detrStatus");
      const layoutAnalysisWrap = document.getElementById("layoutAnalysisWrap");
      const layoutStatus = document.getElementById("layoutStatus");
      const layoutAscii = document.getElementById("layoutAscii");
      const layoutKey = document.getElementById("layoutKey");

      const DEFAULT_QUICK_PROMPTS = [
        { label: "Wiki Summary", prompt: "Open Wikipedia and search for potatoes. Summarize the first paragraph." },
        { label: "Britannica", prompt: "Visit Britannica and search for potato agriculture. Extract key points." },
        { label: "Compare", prompt: "Compare Wikipedia and Britannica articles on potatoes. List 3 similarities." },
        { label: "FAO Stats", prompt: "Find FAO global potato production statistics and report latest data." }
      ];

      const GUIDANCE_QUICK_PROMPTS = [
        { label: "Stop task", prompt: "stop" },
        { label: "Follow exactly", prompt: "Follow my last guidance exactly. Do not improvise." },
        { label: "Different path", prompt: "Try a different route. Do not repeat the last failing action." },
        { label: "Explain next", prompt: "Explain your next move before taking it." }
      ];

      function resolveInitialViewFromUrl() {
        try {
          const path = String(window.location.pathname || "").toLowerCase();
          if (path === "/upgrade") return "upgrade";
          const params = new URLSearchParams(window.location.search || "");
          const view = String(params.get("view") || "").toLowerCase();
          return view === "upgrade" ? "upgrade" : "chat";
        } catch {
          return "chat";
        }
      }

      function applyRouteLayout() {
        const isUpgradeRoute = state.initialView === "upgrade";
        document.body.classList.toggle("upgrade-route", isUpgradeRoute);
      }

      function loadUiPrefs() {
        try {
          const raw = localStorage.getItem(UI_PREFS_KEY);
          if (!raw) return;
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.theme === "string") {
            state.theme = parsed.theme === "light" ? "light" : "dark";
          }
          if (parsed && parsed.runtimeFilters && typeof parsed.runtimeFilters === "object") {
            ["status", "think", "step", "error", "agent", "narrate", "supervisor", "peer_alignment"].forEach(function(key) {
              if (Object.prototype.hasOwnProperty.call(parsed.runtimeFilters, key)) {
                state.runtimeFilters[key] = !!parsed.runtimeFilters[key];
              }
            });
          }
          if (parsed && typeof parsed.runtimeSearch === "string") {
            state.runtimeSearch = parsed.runtimeSearch.slice(0, 80);
          }
          if (parsed && typeof parsed.runtimeDropdownOpen === "boolean") {
            state.runtimeDropdownOpen = parsed.runtimeDropdownOpen;
          }
          if (parsed && typeof parsed.sidebarCollapsed === "boolean") {
            state.sidebarCollapsed = parsed.sidebarCollapsed;
          }
        } catch {}
      }

      function saveUiPrefs() {
        try {
          localStorage.setItem(UI_PREFS_KEY, JSON.stringify({
            runtimeFilters: state.runtimeFilters,
            runtimeSearch: state.runtimeSearch,
            runtimeDropdownOpen: state.runtimeDropdownOpen,
            sidebarCollapsed: state.sidebarCollapsed,
            theme: state.theme
          }));
        } catch {}
      }

      function applyTheme(themeName) {
        const nextTheme = themeName === "light" ? "light" : "dark";
        state.theme = nextTheme;
        document.documentElement.setAttribute("data-theme", nextTheme);
        if (themeToggleBtn) {
          themeToggleBtn.innerHTML = iconMarkup(nextTheme === "light" ? "moon" : "sun");
          themeToggleBtn.title = nextTheme === "light" ? "Switch to dark mode" : "Switch to light mode";
          themeToggleBtn.setAttribute("aria-label", nextTheme === "light" ? "Switch to dark mode" : "Switch to light mode");
        }
        saveUiPrefs();
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
        if (browserFrame) {
          const r = browserFrame.getBoundingClientRect();
          return { width: Math.max(120, r.width), height: Math.max(120, r.height) };
        }
        return { width: 640, height: 420 };
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
        state.typingFx.revealedAt = {};
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

      var TYPING_FX_MAX_AGE_MS = 30 * 1000;
      var TYPING_FX_CHAR_DELAY_MS = 20;
      var TYPING_FX_FADE_MS = 1000;

      function getTypingChunkSize() {
        return 120;
      }
      // CRAPPY AF TYPING ANIMATION

      function renderTypingWithFade(key, renderedContent) {
        const revealMap = state.typingFx.revealedAt[key] || {};
        const now = Date.now();
        let fadeCount = 0;
        for (let index = renderedContent.length - 1; index >= 0; index -= 1) {
          const revealedAt = revealMap[index];
          if (!revealedAt || (now - revealedAt) > TYPING_FX_FADE_MS) break;
          fadeCount += 1;
        }
        if (fadeCount <= 0) {
          return escapeHtml(applyEmojiShortcodes(renderedContent));
        }
        const stablePart = renderedContent.slice(0, renderedContent.length - fadeCount);
        const fadingPart = renderedContent.slice(renderedContent.length - fadeCount);
        return escapeHtml(applyEmojiShortcodes(stablePart)) +
          '<span class="typing-fade-in">' + escapeHtml(applyEmojiShortcodes(fadingPart)) + '</span>';
      }

      function startTypingAnimation(key, fullText) {
        if (state.typingFx.timers[key]) return;
        const current = state.typingFx.lengths[key] || 0;
        if (current >= fullText.length) return;
        if (!state.typingFx.revealedAt[key]) {
          state.typingFx.revealedAt[key] = {};
        }
        const tick = function() {
          const lengthNow = state.typingFx.lengths[key] || 0;
          if (lengthNow >= fullText.length) {
            delete state.typingFx.timers[key];
            return;
          }
          const nextLength = Math.min(fullText.length, lengthNow + getTypingChunkSize());
          const revealedAt = Date.now();
          for (let index = lengthNow; index < nextLength; index += 1) {
            state.typingFx.revealedAt[key][index] = revealedAt;
          }
          state.typingFx.lengths[key] = nextLength;
          renderTimeline();
          if (nextLength >= fullText.length) {
            delete state.typingFx.timers[key];
            return;
          }
          state.typingFx.timers[key] = window.setTimeout(tick, TYPING_FX_CHAR_DELAY_MS);
        };
        state.typingFx.timers[key] = window.setTimeout(tick, TYPING_FX_CHAR_DELAY_MS);
      }

      function escapeHtml(value) {
        return String(value || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      async function copyTextToClipboard(text) {
        const value = String(text || "");
        if (!value) return false;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(value);
            return true;
          }
        } catch {
          // fall through to fallback
        }
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "-9999px";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        try {
          document.execCommand("copy");
          return true;
        } catch {
          return false;
        } finally {
          document.body.removeChild(textarea);
        }
      }

      function applyEmojiShortcodes(text) {
        const map = {
          ":rocket:": iconMarkup("spark"),
          ":brain:": iconMarkup("bot"),
          ":sparkles:": iconMarkup("spark"),
          ":fire:": iconMarkup("spark"),
          ":check:": iconMarkup("check"),
          ":x:": iconMarkup("close"),
          ":warning:": iconMarkup("alert"),
          ":robot:": iconMarkup("bot"),
          ":smile:": iconMarkup("spark"),
          ":party:": iconMarkup("spark"),
          ":idea:": iconMarkup("spark")
        };
        return String(text || "").replace(/:[a-z_]+:/g, function(token) {
          return Object.prototype.hasOwnProperty.call(map, token) ? map[token] : token;
        });
      }

      function renderInlineMarkdownSafe(value) {
        const dividerMarker = "\uE000";
        const raw = String(value || "")
          .replace(/<br\s*\/?\s*>/gi, dividerMarker)
          .replace(/\[\[CHAT[^\]]*DIVIDE[^\]]*\]\]/gi, dividerMarker);
        let safe = escapeHtml(raw);
        safe = safe
          .replace(/^######\s+(.+)$/gm, "<h6>$1</h6>")
          .replace(/^#####\s+(.+)$/gm, "<h5>$1</h5>")
          .replace(/^####\s+(.+)$/gm, "<h4>$1</h4>")
          .replace(/^###\s+(.+)$/gm, "<h3>$1</h3>")
          .replace(/^##\s+(.+)$/gm, "<h2>$1</h2>")
          .replace(/^#\s+(.+)$/gm, "<h1>$1</h1>")
          .replace(/\`([^\`\n]+)\`/g, "<code>$1</code>")
          .replace(/\*\*_(.+?)_\*\*/g, "<strong><em>$1</em></strong>")
          .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
          .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>")
          .replace(new RegExp(dividerMarker, "g"), "<span class='chat-break-line' aria-hidden='true'>____________________________________________________________________________________________________</span>")
          .replace(/\n/g, "<br>");
        return safe;
      }

      function renderMarkdownBlock(value) {
        const dividerMarker = "\uE000";
        const raw = String(value || "")
          .replace(/<br\s*\/\?\s*>/gi, dividerMarker)
          .replace(/\[\[CHAT[^\]]*DIVIDE[^\]]*\]\]/gi, dividerMarker);

        let html = "";
        const parser = (typeof window !== "undefined" && window.marked && typeof window.marked.parse === "function")
          ? window.marked
          : (typeof marked !== "undefined" && typeof marked.parse === "function" ? marked : null);

        if (parser) {
          try {
            html = parser.parse(raw, { gfm: true, breaks: true, headerIds: false, mangle: false });
          } catch {
            html = "";
          }
        }

        if (!html) {
          const lines = raw.replace(/\r\n/g, "\n").split("\n");
          const blocks = [];
          let currentList = null;
          let currentQuote = null;
          let currentParagraph = [];

          const flushParagraph = function() {
            if (!currentParagraph.length) return;
            blocks.push("<p>" + renderInlineMarkdownSafe(currentParagraph.join("\n")) + "</p>");
            currentParagraph = [];
          };

          const flushList = function() {
            if (!currentList) return;
            const tag = currentList.ordered ? "ol" : "ul";
            const items = currentList.items.map(function(item) {
              return "<li>" + renderInlineMarkdownSafe(item) + "</li>";
            });
            blocks.push("<" + tag + ">" + items.join("") + "</" + tag + ">");
            currentList = null;
          };

          const flushQuote = function() {
            if (!currentQuote) return;
            blocks.push("<blockquote>" + currentQuote.map(function(line) {
              return renderInlineMarkdownSafe(line);
            }).join("<br>") + "</blockquote>");
            currentQuote = null;
          };

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            if (!trimmed) {
              flushParagraph();
              flushList();
              flushQuote();
              continue;
            }

            const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
            if (headingMatch) {
              flushParagraph();
              flushList();
              flushQuote();
              const level = headingMatch[1].length;
              blocks.push("<h" + level + ">" + renderInlineMarkdownSafe(headingMatch[2]) + "</h" + level + ">");
              continue;
            }

            if (/^>\s?/.test(trimmed)) {
              flushParagraph();
              flushList();
              const quoteLine = trimmed.replace(/^>\s?/, "").trim();
              if (!currentQuote) currentQuote = [];
              currentQuote.push(quoteLine);
              continue;
            }

            const listMatch = trimmed.match(/^([*-]\s+)(.+)$/);
            const orderedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
            if (listMatch || orderedMatch) {
              flushParagraph();
              flushQuote();
              const itemText = listMatch ? listMatch[2] : orderedMatch[2];
              const ordered = !!orderedMatch;
              if (!currentList || currentList.ordered !== ordered) {
                flushList();
                currentList = { ordered: ordered, items: [] };
              }
              currentList.items.push(itemText);
              continue;
            }

            if (trimmed.indexOf(String.fromCharCode(96, 96, 96)) === 0) {
              flushParagraph();
              flushList();
              flushQuote();
              const codeLines = [];
              i++;
              while (i < lines.length && lines[i].trim().indexOf(String.fromCharCode(96, 96, 96)) !== 0) {
                codeLines.push(lines[i]);
                i++;
              }
              blocks.push("<pre><code>" + escapeHtml(codeLines.join("\n")) + "</code></pre>");
              continue;
            }

            flushQuote();
            flushList();
            currentParagraph.push(trimmed);
          }

          flushParagraph();
          flushList();
          flushQuote();
          html = blocks.join("");
        }

        if (typeof DOMPurify !== "undefined") {
          html = DOMPurify.sanitize(html, {
            ALLOWED_TAGS: ["h1", "h2", "h3", "h4", "h5", "h6", "p", "ul", "ol", "li", "blockquote", "code", "pre", "strong", "em", "br", "hr", "span", "a"],
            ALLOWED_ATTR: ["class", "href", "target", "rel", "title"]
          });
        }

        return html.replace(new RegExp(dividerMarker, "g"), "<span class='chat-break-line' aria-hidden='true'>____________________________________________________________________________________________________</span>");
      }

      function renderRichText(value) {
        const source = applyEmojiShortcodes(String(value || ""));
        const mathRegex = new RegExp("\\$\\$([\\\\s\\\\S]+?)\\$\\$|\\$([^\\n$]+?)\\$", "g");
        let html = "";
        let lastIndex = 0;
        let match;

        while ((match = mathRegex.exec(source)) !== null) {
          html += renderMarkdownBlock(source.slice(lastIndex, match.index));
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

        html += renderMarkdownBlock(source.slice(lastIndex));
        return html;
      }

      function withApiBase(path) {
        if (!path || typeof path !== "string") return path;
        if (!path.startsWith("/")) return path;
        return path;
      }

      async function request(path, options) {
        const requestOptions = {
          method: options && options.method ? options.method : "GET",
          headers: Object.assign({ "Content-Type": "application/json" }, options && options.headers ? options.headers : {}),
          body: options && options.body ? JSON.stringify(options.body) : undefined,
          credentials: "include"
        };

        const response = await fetch(withApiBase(path), requestOptions);
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
        // No cap — show full history
        nudgeCursorByEvent(type);
        if (state.currentView !== "upgrade") {
          renderTimeline();
        }
      }

      function scheduleBootstrapRefresh(delay) {
        window.clearTimeout(state.bootstrapTimer);
        state.bootstrapTimer = window.setTimeout(function() { loadBootstrap(false); }, delay || 350);
      }

      function renderChats() {
        if (!state.chats.length) {
          chatList.innerHTML = '<div style="padding:10px 6px;font-size:12px;color:var(--muted)">No chats yet.</div>';
          return;
        }
        chatList.innerHTML = state.chats.map(function(chat) {
          const active = chat.id === state.selectedChatId ? "active" : "";
          const iconText = escapeHtml(String(chat.title || "Chat").trim().charAt(0) || "•");
          return '<button class="chat-item ' + active + '" data-chat-id="' + escapeHtml(chat.id) + '">' +
            '<div class="chat-item-icon" aria-hidden="true">' + iconText + '</div>' +
            '<div class="chat-title-row"><div class="chat-title">' + escapeHtml(chat.title) + '</div><div class="chat-time">' + escapeHtml(prettyTime(chat.updatedAt)) + '</div></div>' +
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

      function renderSidebarViewState() {
        if (sidebarNav) sidebarNav.classList.toggle("collapsed", !!state.sidebarCollapsed);
        if (sidebarToggleBtn) {
          sidebarToggleBtn.innerHTML = iconMarkup(state.sidebarCollapsed ? "expand" : "collapse");
          sidebarToggleBtn.title = state.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar";
          sidebarToggleBtn.setAttribute("aria-label", state.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar");
        }
        if (upgradeViewBtn) upgradeViewBtn.classList.toggle("active", state.currentView === "upgrade");
      }

      function normalizeChatTitleInput(value) {
        return String(value || "").replace(/\s+/g, " ").trim().slice(0, 60);
      }

      function openChatTitleEditor() {
        if (!state.currentChat || state.currentView === "upgrade" || !timelineTitle) return;
        if (timelineTitle.querySelector("input")) return;
        const originalTitle = normalizeChatTitleInput(state.currentChat.title || "Conversation");
        const input = document.createElement("input");
        input.className = "chat-title-edit-input";
        input.type = "text";
        input.maxLength = 60;
        input.value = /^new chat$/i.test(originalTitle) || /^welcome chat$/i.test(originalTitle) ? "" : originalTitle;
        input.placeholder = "Rename chat";
        let cancelled = false;

        const restore = function() {
          timelineTitle.textContent = originalTitle;
        };

        const commit = async function() {
          if (cancelled) {
            restore();
            return;
          }
          const nextTitle = normalizeChatTitleInput(input.value);
          if (!nextTitle || nextTitle === originalTitle) {
            restore();
            return;
          }
          try {
            await request("/api/chats/" + encodeURIComponent(state.currentChat.id), {
              method: "PATCH",
              body: { title: nextTitle }
            });
            await loadBootstrap(false);
          } catch (error) {
            addRuntimeEvent("error", "Rename failed: " + error.message);
            restore();
          }
        };

        input.addEventListener("keydown", function(event) {
          if (event.key === "Escape") {
            event.preventDefault();
            cancelled = true;
            input.blur();
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            input.blur();
          }
        });

        input.addEventListener("blur", commit, { once: true });
        timelineTitle.textContent = "";
        timelineTitle.appendChild(input);
        input.focus();
        input.select();
      }

      function isGuidanceModeActive() {
        // Guidance is active while the agent is running or when it explicitly
        // asks the operator a question.
        return !!(state.sending || state.agentQuestion);
      }

      function getVisibleMessageContent(message) {
        const raw = String(message && message.content ? message.content : "");
        if (!raw) return "";
        const visible = raw
          .replace(/\n?\[(Attached image analysis|Image vision summary|Current browser UI layout|Attached media analysis)\][\s\S]*$/gi, "")
          .replace(/\n?\[(Attached image analysis|Image vision summary|Current browser UI layout|Attached media analysis)\][\s\S]*?(?=(?:\n\n\[|$))/gi, "")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
        return visible || "Image attached and analyzed.";
      }

      function bindQuickActionButtons() {
        if (!quickActions) return;
        const chips = quickActions.querySelectorAll("[data-quick-prompt]");
        Array.from(chips).forEach(function(btn) {
          btn.onclick = function() {
            const prompt = btn.getAttribute("data-quick-prompt");
            if (!prompt) return;
            const current = composerInput.value.trim();
            composerInput.value = current ? (current + "\\n" + prompt) : prompt;
            composerInput.focus();
            const len = composerInput.value.length;
            composerInput.selectionStart = len;
            composerInput.selectionEnd = len;
            saveDraftForChat(state.selectedChatId, composerInput.value);
            composerInput.dispatchEvent(new Event("input"));
          };
        });
      }

      function renderQuickActions(items) {
        if (!quickActions) return;
        const source = Array.isArray(items) ? items : DEFAULT_QUICK_PROMPTS;
        quickActions.innerHTML = source.map(function(item) {
          return '<button class="quick-chip" type="button" data-quick-prompt="' + escapeHtml(item.prompt) + '">' + escapeHtml(item.label) + '</button>';
        }).join("");
        bindQuickActionButtons();
      }

      async function sendGuidanceFromComposer() {
        const text = composerInput ? composerInput.value.trim() : "";
        if (!text) return;
        if (sendBtn) sendBtn.disabled = true;
        try {
          await request("/api/guidance", { method: "POST", body: { text: text } });
          state.latestGuidance = {
            text: text,
            priority: /^stop$/i.test(text) ? "critical" : "high",
            stopRequested: /^(stop|end task|abort|cancel task)$/i.test(text),
            ts: new Date().toISOString()
          };
          composerInput.value = "";
          composerInput.style.height = "auto";
          saveDraftForChat(state.selectedChatId, "");
          renderGuidancePanel();
          addRuntimeEvent("status", 'Guidance sent: "' + text + '"');
        } catch (e) {
          addRuntimeEvent("error", "Guidance failed: " + e.message);
        } finally {
          if (sendBtn) sendBtn.disabled = false;
        }
      }

      function renderUpgradeView() {
        const cycle = state.billingCycle === "monthly" ? "monthly" : "yearly";
        const plans = PLAN_CONFIG[cycle] || PLAN_CONFIG.yearly;
        const hasSubscription = !!(state.account && state.account.subscriptionPlan);
        const freeTierLabel = hasSubscription ? ("Active plan: " + String(state.account.subscriptionPlan)) : "Free tier active";
        const attachmentLabel = hasSubscription ? "Subscription attached" : "No subscription attached.";
        const upgradeLabel = hasSubscription ? "Manage your current plan" : "Upgrade to Core or Ultimate!";
        const cardsHtml = plans.map(function(plan) {
          const badge = plan.badge ? '<span class="plan-badge">' + escapeHtml(plan.badge) + '</span>' : "";
          const features = (plan.features || []).map(function(feature) {
            return '<li class="plan-feature">' + escapeHtml(feature) + '</li>';
          }).join("");
          const ctaClass = plan.key === "ultimate" ? "ultimate" : "core";
          return '<article class="plan-card ' + (plan.popular ? "popular" : "") + '">' +
            '<div class="plan-topline"><div><div class="plan-name">' + escapeHtml(plan.name) + '</div><div class="plan-label">' + escapeHtml(plan.label) + '</div></div>' + badge + '</div>' +
            '<div class="plan-price-row"><div class="plan-price">' + escapeHtml(plan.price) + '</div><div class="plan-price-unit">' + escapeHtml(plan.unit) + '</div></div>' +
            '<div class="plan-trial">' + escapeHtml(plan.trial) + '</div>' +
            '<div class="plan-desc">' + escapeHtml(plan.description) + '</div>' +
            '<ul class="plan-features">' + features + '</ul>' +
            '<a class="plan-cta ' + ctaClass + '" href="' + escapeHtml(plan.href) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(plan.cta) + ' <span>↗</span></a>' +
          '</article>';
        }).join("");

        return '<section class="upgrade-shell">' +
          '<section class="upgrade-hero">' +
            '<div class="upgrade-eyebrow">Puppeterr plans <span class="save-badge">Massive Savings</span></div>' +
            '<h1 class="upgrade-title">Choose a plan that keeps your operator workflows moving.</h1>' +
            '<p class="upgrade-copy">Upgrade inside Puppeterr with direct checkout links for Core and Ultimate. Use monthly for flexibility or shift to yearly for the strongest savings angle.</p>' +
            '<div class="upgrade-meta-row">' +
              '<div class="billing-toggle" data-active="' + escapeHtml(cycle) + '">' +
                '<button class="billing-toggle-btn ' + (cycle === "monthly" ? 'active' : '') + '" type="button" data-billing-cycle="monthly">Monthly</button>' +
                '<button class="billing-toggle-btn ' + (cycle === "yearly" ? 'active' : '') + '" type="button" data-billing-cycle="yearly">Yearly</button>' +
              '</div>' +
              '<span class="upgrade-stat">' + escapeHtml(freeTierLabel) + '</span>' +
              '<span class="upgrade-stat">' + escapeHtml(attachmentLabel) + '</span>' +
              '<span class="upgrade-stat">' + escapeHtml(upgradeLabel) + '</span>' +
            '</div>' +
          '</section>' +
          '<section class="plan-grid">' + cardsHtml + '</section>' +
          '<section class="upgrade-footnote">' +
            '<div class="upgrade-panel"><h3>What changes after upgrade</h3><p>Use this screen as the main conversion point for users who have already seen the product work. The links open Pinch-hosted checkout pages directly, so there is no custom billing flow to maintain in Puppeterr right now.</p><div class="mini-checks"><span class="mini-check">Direct hosted checkout</span><span class="mini-check">No extra backend route required</span><span class="mini-check">Works with current Pinch plans</span></div></div>' +
            '<div class="upgrade-panel"><h3>Current offers wired in</h3><p>Visible plans are Core and Ultimate in both monthly and yearly variants. Legacy $5/month and $25/year links are intentionally excluded from the UI so this screen stays focused.</p><div class="mini-checks"><span class="mini-check">Core monthly</span><span class="mini-check">Core yearly</span><span class="mini-check">Ultimate monthly</span><span class="mini-check">Ultimate yearly</span></div></div>' +
          '</section>' +
        '</section>';
      }

      function setCurrentView(viewName) {
        state.currentView = viewName === "upgrade" ? "upgrade" : "chat";
        renderSidebarViewState();
        renderTimeline();
      }

      function renderTimeline() {
        renderSidebarViewState();
        if (composerArea) composerArea.style.display = state.currentView === "upgrade" ? "none" : "";
        if (state.currentView === "upgrade") {
          const previousScrollTop = timelineScroll ? timelineScroll.scrollTop : 0;
          timelineTitle.textContent = "Upgrade Puppeterr";
          timelineSubtitle.textContent = "Direct Pinch-hosted checkout";
          messageCountTag.style.display = "none";
          timeline.innerHTML = renderUpgradeView();
          Array.from(timeline.querySelectorAll("[data-billing-cycle]")).forEach(function(btn) {
            btn.addEventListener("click", function() {
              state.billingCycle = btn.getAttribute("data-billing-cycle") === "monthly" ? "monthly" : "yearly";
              renderTimeline();
            });
          });
          if (timelineScroll) timelineScroll.scrollTop = previousScrollTop;
          return;
        }
        const chat = state.currentChat;
        if (!chat) {
          timeline.innerHTML = '<div class="empty-state"><div class="empty-state-icon">' + iconMarkup("bot") + '</div>Select a chat or start a new one.</div>';
          timelineTitle.textContent = "Puppeterr";
          timelineSubtitle.textContent = "";
          messageCountTag.style.display = "none";
          return;
        }
        const shouldAutoScroll = (function() {
          if (!timelineScroll) return false;
          const distanceFromBottom = timelineScroll.scrollHeight - timelineScroll.scrollTop - timelineScroll.clientHeight;
          return distanceFromBottom <= 80;
        })();
        timelineTitle.textContent = chat.title || "Conversation";
        timelineSubtitle.textContent = prettyTime(chat.updatedAt);
        messageCountTag.style.display = "";
        messageCountTag.textContent = String(chat.messages.length) + " messages";
        const messageCards = chat.messages.map(function(message, index) {
          const key = messageKey(chat.id, index, message);
          const fullContent = String(message.content || "");
          const isUser = message.role === "user";
          const visibleContent = getVisibleMessageContent(message);
          const parsedMessageTs = message && message.ts ? new Date(message.ts).getTime() : Number.NaN;
          const messageAgeMs = Number.isFinite(parsedMessageTs) ? (Date.now() - parsedMessageTs) : Number.POSITIVE_INFINITY;
          const shouldAnimateTyping = !isUser && messageAgeMs <= TYPING_FX_MAX_AGE_MS;
          const generatedImage = message && message.generatedImage ? message.generatedImage : null;
          let renderedContent = visibleContent;
          let typingCaret = "";
          let contentHtml = "";
          if (!isUser) {
            if (typeof state.typingFx.lengths[key] !== "number") {
              state.typingFx.lengths[key] = shouldAnimateTyping ? 0 : visibleContent.length;
            }
            if (!shouldAnimateTyping && state.typingFx.timers[key]) {
              window.clearTimeout(state.typingFx.timers[key]);
              delete state.typingFx.timers[key];
            }
            if (!shouldAnimateTyping && state.typingFx.revealedAt[key]) {
              delete state.typingFx.revealedAt[key];
            }
            const visibleLength = state.typingFx.lengths[key];
            renderedContent = visibleContent.slice(0, visibleLength);
            if (shouldAnimateTyping && visibleLength < visibleContent.length) {
              const caretPhaseSeconds = ((Date.now() % 450) / 1000).toFixed(3);
              typingCaret = '<span class="typing-caret" style="animation-delay:-' + caretPhaseSeconds + 's" aria-hidden="true"></span>';
              startTypingAnimation(key, visibleContent);
              contentHtml = renderTypingWithFade(key, renderedContent);
            } else {
              if (visibleLength < visibleContent.length) {
                state.typingFx.lengths[key] = visibleContent.length;
                renderedContent = visibleContent;
              }
              if (state.typingFx.revealedAt[key]) {
                delete state.typingFx.revealedAt[key];
              }
              contentHtml = renderRichText(renderedContent);
            }
          } else {
            contentHtml = renderRichText(renderedContent);
          }
          var imgSrc = generatedImage
            ? (generatedImage.b64
                ? 'data:' + (generatedImage.mimeType || 'image/png') + ';base64,' + generatedImage.b64
                : (generatedImage.url || ''))
            : '';
          var imgId = generatedImage ? 'gen-img-' + message.ts.replace(/\W/g,'') : '';
          var imageHtml = generatedImage
            ? '<div class="message-attachment">' +
                (imgSrc
                  ? '<img id="' + escapeHtml(imgId) + '" alt="Generated image" style="margin-top:10px;max-width:100%;border-radius:12px;border:1px solid rgba(255,255,255,.08);cursor:pointer;" src="' + escapeHtml(imgSrc) + '">'
                  : '') +
                '<div style="display:flex;align-items:center;gap:8px;margin-top:8px;">' +
                  '<span class="message-meta">' + escapeHtml((generatedImage.model || '').split('/').pop() || generatedImage.model || '') + '</span>' +
                  (imgSrc ? '<button data-img-id="' + escapeHtml(imgId) + '" class="puppeterr-img-download" style="background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);color:#e8eff7;padding:3px 10px;border-radius:6px;cursor:pointer;font-size:12px;" title="Download image">&#8595; Download</button>' : '') +
                  (generatedImage.b64 ? '<button data-img-id="' + escapeHtml(imgId) + '" class="puppeterr-img-copy" style="background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);color:#e8eff7;padding:3px 10px;border-radius:6px;cursor:pointer;font-size:12px;" title="Copy image to clipboard">&#10696; Copy</button>' : '') +
                '</div>' +
              '</div>'
            : '';
          const avatarLabel = isUser ? "Y" : iconMarkup("spark");
          return '<article class="message-card" data-message-index="' + escapeHtml(index) + '">' +
            '<div class="msg-avatar ' + escapeHtml(message.role) + '">' + avatarLabel + '</div>' +
            '<div class="msg-body">' +
              '<div class="msg-meta"><span class="msg-role ' + escapeHtml(message.role) + '">' + escapeHtml(isUser ? "You" : "Puppeterr") + '</span><span class="message-meta">' + escapeHtml(prettyTime(message.ts)) + '</span></div>' +
              '<div class="message-content">' + contentHtml + typingCaret + imageHtml + '</div>' +
              '<div class="message-actions"><button type="button" class="message-copy-btn" data-message-index="' + escapeHtml(index) + '" aria-label="Copy message">Copy</button></div>' +
            '</div>' +
          '</article>';
        });
        const runtimeEvents = currentRuntime();
        // Sort newest-first so latest activity appears at top
        const sortedRuntimeEvents = runtimeEvents.slice().sort(function(a, b) {
          return (b.ts || "") < (a.ts || "") ? -1 : (b.ts || "") > (a.ts || "") ? 1 : 0;
        });
        const filteredRuntimeEvents = sortedRuntimeEvents.filter(function(event) {
          const typeAllowed = Object.prototype.hasOwnProperty.call(state.runtimeFilters, event.type)
            ? state.runtimeFilters[event.type]
            : true;
          if (!typeAllowed) return false;
          if (!state.runtimeSearch) return true;
          return String(event.message || "").toLowerCase().includes(state.runtimeSearch.toLowerCase())
            || String(event.type || "").toLowerCase().includes(state.runtimeSearch.toLowerCase());
        });
        const runtimeControls = '<div class="runtime-controls">' +
          ["status", "think", "step", "error", "agent", "narrate", "supervisor", "peer_alignment"].map(function(type) {
            const off = state.runtimeFilters[type] ? "" : " off";
            return '<button type="button" class="runtime-filter-btn' + off + '" data-runtime-filter="' + type + '">' + type + '</button>';
          }).join("") +
        '</div>';
        const runtimeDropdownOpen = typeof state.runtimeDropdownOpen === "boolean" ? state.runtimeDropdownOpen : !!state.sending;
        const runtimeCard = runtimeEvents.length
          ? '<details class="runtime-dropdown" ' + (runtimeDropdownOpen ? "open" : "") + '><summary><strong>Agent activity</strong><span class="tag">' + escapeHtml(String(runtimeEvents.length)) + ' events</span><span class="runtime-chevron">' + (runtimeDropdownOpen ? "Hide" : "Show") + '</span></summary><div class="runtime-log">' +
              runtimeControls +
              filteredRuntimeEvents.map(function(event) {
                return '<article class="runtime-entry ' + escapeHtml(event.type) + '"><div class="runtime-head"><span>' + escapeHtml(event.type || "status") + '</span><span>' + escapeHtml(prettyTime(event.ts)) + '</span></div><div class="runtime-body">' + renderRichText(event.message) + '</div></article>';
              }).join("") +
              (filteredRuntimeEvents.length ? "" : '<div class="empty-state">No activity matches current filters.</div>') +
            '</div></details>'
          : "";
        timeline.innerHTML = messageCards.concat(runtimeCard).join("") || '<div class="empty-state"><div class="empty-state-icon">' + iconMarkup("chat") + '</div>This chat is empty. Send a message to start.</div>';

        // Add event listeners for image download and copy buttons
        Array.from(timeline.querySelectorAll(".message-copy-btn")).forEach(function(btn) {
          btn.addEventListener("click", async function() {
            const chat = state.currentChat;
            const index = Number(btn.getAttribute("data-message-index"));
            const message = chat && chat.messages && chat.messages[index];
            const copied = await copyTextToClipboard(message ? getVisibleMessageContent(message) : "");
            if (!copied) {
              alert("Copy failed — your browser blocked clipboard access.");
            }
          });
        });
        Array.from(timeline.querySelectorAll(".puppeterr-img-download")).forEach(function(btn) {
          btn.addEventListener("click", function() {
            var imgId = btn.getAttribute("data-img-id");
            var img = document.getElementById(imgId);
            if (!img) return;
            var a = document.createElement("a");
            a.href = img.src;
            a.download = "Puppet-err.png";
            a.click();
          });
        });
        Array.from(timeline.querySelectorAll(".puppeterr-img-copy")).forEach(function(btn) {
          btn.addEventListener("click", function() {
            var imgId = btn.getAttribute("data-img-id");
            var img = document.getElementById(imgId);
            if (!img) return;
            try {
              var canvas = document.createElement("canvas");
              canvas.width = img.naturalWidth;
              canvas.height = img.naturalHeight;
              var ctx = canvas.getContext("2d");
              ctx.drawImage(img, 0, 0);
              canvas.toBlob(function(blob) {
                navigator.clipboard.write([new ClipboardItem({"image/png": blob})]).catch(function() {
                  alert("Awww Snap! Copy failed — your browser blocked clipboard access! Try again later. (To do this we require http permission)");
                });
              });
            } catch (e) {
              alert("Awww Snap! Copy failed: " + e.message);
            }
          });
        });

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
        const runtimeDropdown = timeline.querySelector(".runtime-dropdown");
        if (runtimeDropdown) {
          const updateChevron = function() {
            const chevron = runtimeDropdown.querySelector(".runtime-chevron");
            if (chevron) chevron.textContent = runtimeDropdown.open ? "↟" : "↡";
          };
          runtimeDropdown.addEventListener("toggle", function() {
            state.runtimeDropdownOpen = !!runtimeDropdown.open;
            saveUiPrefs();
            updateChevron();
          });
          updateChevron();
        }

        if (timelineScroll && shouldAutoScroll) timelineScroll.scrollTop = timelineScroll.scrollHeight;
      }

      function selectOptionsForCurrent(value) {
        const values = (state.models.catalog || []).slice();
        if (value && !values.some(function(item) { return item.id === value; })) {
          values.unshift({ id: value, name: value });
        }
        return values;
      }

      function modelProvider(item) {
        const id = String((item && item.id) || "");
        if (!id.startsWith("@")) return "custom";
        const parts = id.slice(1).split("/");
        return parts[0] || "custom";
      }

      function modelOptionLabel(item) {
        const base = String((item && (item.name || item.id)) || "");
        const provider = modelProvider(item);
        return provider === "custom" ? base : (base + " · " + provider);
      }

      function filterModelsByQuery(items, query) {
        const needle = String(query || "").trim().toLowerCase();
        if (!needle) return items;
        return items.filter(function(item) {
          const haystack = [item && item.id, item && item.name, modelProvider(item)]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(needle);
        });
      }

      function renderModels() {
        const current = state.models.current || {};
        const modelParams = state.modelParams || { temperature: 0.3 };
        const currentTemperature = Number.isFinite(Number(modelParams.temperature)) ? Number(modelParams.temperature) : 0.3;
        const roles = [
          { key: "router", label: "Router" },
          { key: "planner", label: "Planner" },
          { key: "reasoner", label: "Reasoner" },
          { key: "vision", label: "Vision" }
        ];
        modelGrid.innerHTML = roles.map(function(role) {
          const roleQuery = String((state.modelSearch && state.modelSearch[role.key]) || "");
          const allOptions = selectOptionsForCurrent(current[role.key]);
          const filteredOptions = filterModelsByQuery(allOptions, roleQuery);
          const visibleOptions = filteredOptions.length ? filteredOptions : allOptions;
          const options = visibleOptions.map(function(item) {
            const selected = item.id === current[role.key] ? "selected" : "";
            return '<option value="' + escapeHtml(item.id) + '" ' + selected + '>' + escapeHtml(modelOptionLabel(item)) + '</option>';
          }).join("");
          return '<div class="model-card"><div class="model-card-head"><label for="model-' + escapeHtml(role.key) + '">' + escapeHtml(role.label) + '</label><span class="model-count">' + escapeHtml(String(visibleOptions.length)) + '</span></div><input class="model-search" type="text" data-role-search="' + escapeHtml(role.key) + '" value="' + escapeHtml(roleQuery) + '" placeholder="Search by name, id, or provider"><select class="toolbar-select" id="model-' + escapeHtml(role.key) + '" data-role="' + escapeHtml(role.key) + '">' + options + '</select><div class="model-id">' + escapeHtml(current[role.key] || "") + '</div></div>';
        }).join("") + '<div class="model-card"><label for="model-temperature">Temperature</label><input class="toolbar-range" id="model-temperature" type="range" min="0" max="2" step="0.05" value="' + escapeHtml(currentTemperature.toFixed(2)) + '"><div class="model-id" id="model-temperature-value">' + escapeHtml(currentTemperature.toFixed(2)) + '</div></div>';
        Array.from(modelGrid.querySelectorAll("[data-role-search]")).forEach(function(input) {
          input.addEventListener("input", function() {
            var role = input.getAttribute("data-role-search");
            if (!state.modelSearch || typeof state.modelSearch !== "object") {
              state.modelSearch = {};
            }
            state.modelSearch[role] = String(input.value || "").slice(0, 80);
            renderModels();
          });
        });
        Array.from(modelGrid.querySelectorAll("[data-role]")).forEach(function(select) {
          select.addEventListener("change", async function() {
            if (!state.currentChat) return;
            const nextModels = Object.assign({}, state.models.current || {});
            nextModels[select.getAttribute("data-role")] = select.value;
            try {
              const payload = await request("/api/chats/" + encodeURIComponent(state.currentChat.id) + "/models", {
                method: "POST",
                body: { models: nextModels, params: state.modelParams || { temperature: 0.3 } }
              });
              state.models.current = payload.current;
              state.modelParams = payload.modelParams || state.modelParams;
              state.currentChat = payload.chat;
              renderModels();
              renderTimeline();
              addRuntimeEvent("status: ", "Updated " + select.getAttribute("data-role") + " model to " + select.value + ".");
            } catch (error) {
              addRuntimeEvent("error", error.message);
            }
          });
        });
        var temperatureInput = document.getElementById("model-temperature");
        var temperatureValue = document.getElementById("model-temperature-value");
        if (temperatureInput && temperatureValue) {
          var syncTemperatureLabel = function() {
            temperatureValue.textContent = Number(temperatureInput.value || 0.3).toFixed(2);
          };
          temperatureInput.addEventListener("input", syncTemperatureLabel);
          temperatureInput.addEventListener("change", async function() {
            if (!state.currentChat) return;
            var nextParams = Object.assign({}, state.modelParams || {});
            nextParams.temperature = Number(temperatureInput.value || 0.3);
            try {
              const payload = await request("/api/chats/" + encodeURIComponent(state.currentChat.id) + "/models", {
                method: "POST",
                body: { models: state.models.current || {}, params: nextParams }
              });
              state.models.current = payload.current;
              state.modelParams = payload.modelParams || nextParams;
              state.currentChat = payload.chat;
              syncTemperatureLabel();
              addRuntimeEvent("status", "Updated model temperature to " + Number((state.modelParams || {}).temperature || nextParams.temperature || 0.3).toFixed(2) + ".");
            } catch (error) {
              addRuntimeEvent("error", error.message);
            }
          });
          syncTemperatureLabel();
        }
      }

      function syncConnectionUI(connected) {
        const live = connected === true;
        if (connDot) connDot.classList.toggle("live", live);
        if (connLabel) connLabel.textContent = live ? "Live" : (connected === false ? "Reconnecting" : "Connecting");
        if (connectionStatus) connectionStatus.textContent = live ? "Live" : (connected === false ? "Reconnecting" : "Connecting");
        if (statusDot) statusDot.classList.toggle("offline", !live);
      }

      function renderSupervisorPill() {
        if (!supervisorPill) return;
        const decision = String(state.supervisor && state.supervisor.decision || "idle").toLowerCase();
        const score = Number(state.supervisor && state.supervisor.score);
        const normalized = (decision === "blocked" || decision === "warn" || decision === "ok") ? decision : "idle";
        supervisorPill.className = "supervisor-pill" + (normalized === "idle" ? "" : " " + normalized);
        if (normalized === "idle") {
          supervisorPill.textContent = "Supervisor: idle";
          return;
        }
        const scoreText = Number.isFinite(score) ? " " + score.toFixed(2) : "";
        supervisorPill.textContent = "Supervisor: " + normalized + scoreText;
      }

      function renderSupervisorMessage() {
        const container = document.getElementById("supervisorMsgContainer");
        if (!container) return;
        container.style.display = "none";
        return;
        const supervisor = state.supervisor || {};
        const decision = String(supervisor.decision || "idle").toLowerCase();
        
        if (decision === "idle") {
          container.style.display = "none";
          return;
        }

        const msg = String(supervisor.reason || supervisor.msg || "");
        const score = Number(supervisor.score);
        const normalized = (decision === "blocked" || decision === "warn" || decision === "ok") ? decision : "idle";

        let htmlContent = msg;
        try {
          // Try marked library if available
          if (typeof marked !== "undefined") {
            if (typeof marked.parse === "function") {
              htmlContent = marked.parse(msg, { breaks: true });
            } else if (typeof marked.marked === "function") {
              htmlContent = marked.marked(msg, { breaks: true });
            } else if (typeof marked === "function") {
              htmlContent = marked(msg, { breaks: true });
            } else {
              // Fallback: basic markdown to HTML conversion
              htmlContent = msg
                .replace(/\*\*_(.+?)_\*\*/g, "<strong><em>$1</em></strong>")
                .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
                .replace(/_(.+?)_/g, "<em>$1</em>")
                .replace(/\*(.+?)\*/g, "<em>$1</em>")
                .replace(/\`(.+?)\`/g, "<code>$1</code>");
            }
          } else {
            // Fallback: basic markdown to HTML conversion
            htmlContent = msg
              .replace(/\*\*_(.+?)_\*\*/g, "<strong><em>$1</em></strong>")
              .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
              .replace(/_(.+?)_/g, "<em>$1</em>")
              .replace(/\*(.+?)\*/g, "<em>$1</em>")
              .replace(/\`(.+?)\`/g, "<code>$1</code>");
          }
        } catch (e) {
          // Safe fallback without escaping (for display)
          htmlContent = msg
            .replace(/\*\*_(.+?)_\*\*/g, "<strong><em>$1</em></strong>")
            .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
            .replace(/_(.+?)_/g, "<em>$1</em>")
            .replace(/\*(.+?)\*/g, "<em>$1</em>")
            .replace(/\`(.+?)\`/g, "<code>$1</code>");
        }

        // Sanitize but allow basic formatting tags
        if (typeof DOMPurify !== "undefined") {
          htmlContent = DOMPurify.sanitize(htmlContent, { 
            ALLOWED_TAGS: ["strong", "em", "code", "br", "span"],
            ALLOWED_ATTR: ["class"]
          });
        }

        const avatar = normalized === "blocked" ? iconMarkup("close") : normalized === "warn" ? iconMarkup("alert") : iconMarkup("check");
        const title = normalized === "blocked" ? "SUPERVISOR ALERT" : normalized === "warn" ? "SUPERVISOR WARNING" : "SUPERVISOR OK";
        const scoreStr = Number.isFinite(score) ? "<span class='supervisor-score'>" + score.toFixed(2) + "</span>" : "";

        container.innerHTML = "<div class='supervisor-bubble " + normalized + "'>" +
          "<button class='supervisor-close-btn' id='supervisorCloseBtn'>×</button>" +
          "<div class='supervisor-header'>" +
          "<div class='supervisor-avatar'>" + avatar + "</div>" +
          "<div class='supervisor-title-wrap'>" +
          "<h4 class='supervisor-title'>" + title + "</h4>" +
          scoreStr +
          "</div>" +
          "</div>" +
          "<div class='supervisor-msg-content'>" + htmlContent + "</div>" +
          "</div>";
        
        var closeBtn = container.querySelector("#supervisorCloseBtn");
        if (closeBtn) {
          closeBtn.addEventListener("click", function() {
            container.style.display = "none";
          });
        }
        container.style.display = "block";
      }

      function applyBootstrap(data) {
        state.account = data.account || state.account;
        state.chats = data.chats || [];
        state.currentChat = data.currentChat || null;
        state.selectedChatId = data.selectedChatId || (data.currentChat && data.currentChat.id) || null;
        state.memory = data.memory || [];
        state.models = data.models || state.models;
        state.modelParams = data.modelParams || state.modelParams;
        state.browserUrl = data.browser && data.browser.url ? data.browser.url : state.browserUrl;
        const username = data.username || (state.session && state.session.username) || "-";
        currentUser.textContent = username;
        if (userAvatar) userAvatar.textContent = username.charAt(0).toUpperCase() || "A";
        const overrideModel = state.currentChat && state.currentChat.runtimeModelOverride;
        modelModeStatus.textContent = overrideModel ? overrideModel.split("/").pop() : "default";
        browserUrl.textContent = state.browserUrl;
        renderChats();
        renderMemory();
        renderModels();
        renderSupervisorPill();
        renderTimeline();
        restoreDraftForCurrentChat();
      }

      function renderHumanBridgeCard() {
        const bridge = state.humanBridge;
        if (!humanBridgeBadge || !humanBridgeSummary || !humanBridgeReason) return;
        if (!bridge) {
          humanBridgeBadge.textContent = "loading";
          humanBridgeBadge.className = "bridge-badge";
          humanBridgeSummary.textContent = "Checking bridge status...";
          humanBridgeReason.textContent = "";
          return;
        }
        const active = !!bridge.active;
        humanBridgeBadge.textContent = active ? "active" : "idle";
        humanBridgeBadge.className = "bridge-badge " + (active ? "active" : "idle");
        humanBridgeSummary.textContent = "checks " + Number(bridge.checks || 0) + "/" + Number(bridge.limit || 0) + " | clicks " + Number(bridge.clickCount || 0);
        const reason = active
          ? (bridge.reason || "Waiting for manual CAPTCHA help")
          : (bridge.closureReason || "Bridge ready");
        humanBridgeReason.textContent = reason;
      }

      async function refreshHumanBridgeState() {
        if (appShell.classList.contains("hidden")) return;
        try {
          const payload = await request("/api/human/state");
          state.humanBridge = payload;
          renderHumanBridgeCard();
        } catch (error) {
          if (error && error.status === 401) return;
          if (humanBridgeReason) humanBridgeReason.textContent = error.message || "Bridge state unavailable";
        }
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
          state.currentView = "chat";
          applyBootstrap(data);
        } catch (error) {
          addRuntimeEvent("error", error.message);
        }
      }

      async function createNewChat() {
        try {
          state.currentView = "chat";
          await request("/api/chats", { method: "POST", body: { title: "New Chat" } });
          await loadBootstrap(false);
        } catch (error) {
          addRuntimeEvent("error", error.message);
        }
      }

      function normalizeBrowserFlagBundleMessage(text) {
        var raw = String(text || "").trim();
        if (!raw || raw.charAt(0) === "/") return raw;
        var lines = raw.split(/\r?\n/).map(function(line) { return line.trim(); }).filter(Boolean);
        if (!lines.length) return raw;
        var allFlags = lines.every(function(line) { return line.indexOf("--") === 0; });
        if (!allFlags) return raw;
        return "/browser run stress scenario " + lines.join(" ");
      }

      async function sendMessage() {
        // Route to guidance API when a browser task is actively running
        // OR when the agent has explicitly asked the user a question.
        if (state.sending || state.agentQuestion) {
          await sendGuidanceFromComposer();
          return;
        }
        const text = composerInput.value.trim();
        if ((!text && !state.pendingImage) || state.sending || !state.currentChat) return;
        const outboundText = normalizeBrowserFlagBundleMessage(text);
        state.sending = true;
        sendBtn.disabled = false;
        renderGuidancePanel();
        composerInput.value = "";
        composerInput.style.height = "auto";
        saveDraftForChat(state.currentChat.id, "");
        state.currentChat.messages.push({
          role: "user",
          content: text || (state.pendingImage ? "Image attached" : ""),
          ts: new Date().toISOString()
        });
        renderTimeline();
        try {
          const body = { message: outboundText, chatId: state.currentChat.id };
          if (outboundText !== text) {
            addRuntimeEvent("status", "Detected flag bundle and routed as /browser command.");
          }
          if (state.pendingImage) {
            body.imageB64 = state.pendingImage.original;
            body.imageMimeType = state.pendingImage.mimeType || "image/png";
            body.imageFileName = state.pendingImage.filename || "image.png";
          }
          try {
            await request("/chat", { method: "POST", body });
          } catch (chatError) {
            if (chatError && chatError.status === 404) {
              await request("/api/chat", { method: "POST", body });
            } else {
              throw chatError;
            }
          }
          addRuntimeEvent("status", "Message sent. Waiting for router decision.");
          if (state.pendingImage) {
            state.pendingImage = null;
            if (imagePreviewWrap) imagePreviewWrap.style.display = "none";
          }
          loadBootstrap(false).catch(function() {});
          // Poll for the reply in case SSE is not connected, but always refresh the active chat state after each attempt.
          (function pollForReply(attempts) {
            window.setTimeout(function() {
              var prevCount = state.currentChat ? state.currentChat.messages.length : 0;
              loadBootstrap(false).then(function() {
                var newCount = state.currentChat ? state.currentChat.messages.length : 0;
                if (newCount > prevCount || !state.sending) {
                  state.sending = false;
                  sendBtn.disabled = false;
                  renderGuidancePanel();
                } else if (attempts > 1) {
                  pollForReply(attempts - 1);
                } else {
                  state.sending = false;
                  sendBtn.disabled = false;
                  renderGuidancePanel();
                }
              }).catch(function() {
                state.sending = false;
                sendBtn.disabled = false;
                renderGuidancePanel();
              });
            }, 2000);
          })(15);
        } catch (error) {
          state.sending = false;
          sendBtn.disabled = false;
          renderGuidancePanel();
          addRuntimeEvent("error", error.message);
          await loadBootstrap(false);
        }
      }

      async function performLogin(event) {
        event.preventDefault();
        loginBtn.disabled = true;
        const signupBtn = document.getElementById("signupBtn");
        if (signupBtn) signupBtn.disabled = true;
        loginError.classList.add("hidden");
        loginHint.textContent = "Signing in...";
        const email = document.getElementById("loginUsername").value.trim();
        const password = document.getElementById("loginPassword").value;
        try {
          await request("/auth/login", { method: "POST", body: { email: email, password: password } });
          await initializeApp();
        } catch (error) {
          if (error && error.status === 401) {
            loginError.textContent = "Invalid email or password.";
          } else {
            loginError.textContent = error.message;
          }
          loginError.classList.remove("hidden");
          loginHint.textContent = "Sign in failed. Check your credentials and try again.";
        } finally {
          loginBtn.disabled = false;
          if (signupBtn) signupBtn.disabled = false;
        }
      }

      function isValidSignupEmail(value) {
        const email = String(value || "").trim().toLowerCase();
        return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);
      }

      async function performSignup() {
        loginBtn.disabled = true;
        const signupBtn = document.getElementById("signupBtn");
        if (signupBtn) signupBtn.disabled = true;
        loginError.classList.add("hidden");
        loginHint.textContent = "Creating account...";
        const email = document.getElementById("loginUsername").value.trim();
        const password = document.getElementById("loginPassword").value;

        if (!isValidSignupEmail(email)) {
          loginError.textContent = "Enter a valid email address to create an account.";
          loginError.classList.remove("hidden");
          loginHint.textContent = "Use a real email like you@example.com.";
          loginBtn.disabled = false;
          if (signupBtn) signupBtn.disabled = false;
          return;
        }

        if (state.session && state.session.usingDefaultCredentials && email === "admin" && password === "puppeterr") {
          loginError.textContent = "Those are local admin login defaults. Use your real email and a new password to sign up.";
          loginError.classList.remove("hidden");
          loginHint.textContent = "Admin defaults are for login only, not signup.";
          loginBtn.disabled = false;
          if (signupBtn) signupBtn.disabled = false;
          return;
        }

        if (String(password || "").length < 8) {
          loginError.textContent = "Password must be at least 8 characters.";
          loginError.classList.remove("hidden");
          loginHint.textContent = "Choose a password with 8+ characters.";
          loginBtn.disabled = false;
          if (signupBtn) signupBtn.disabled = false;
          return;
        }

        try {
          const signupPayload = await request("/auth/signup", { method: "POST", body: { email: email, password: password } });
          state.signupWarning = signupPayload && signupPayload.pinch_warning ? String(signupPayload.pinch_warning) : null;
          if (signupPayload && signupPayload.requires_verification) {
            // Email verification required — show inbox prompt, don't auto-login
            loginError.classList.add("hidden");
            loginHint.textContent = "📬 Check your inbox! We sent a verification link to " + email + ". Click it to activate your account.";
          } else {
            loginHint.textContent = "Account created. Signing you in...";
            await initializeApp();
          }
        } catch (error) {
          if (error && error.status === 409) {
            loginError.textContent = "That email is already registered. Sign in instead.";
            loginHint.textContent = "Account already exists for this email.";
          } else if (error && error.status === 400) {
            loginError.textContent = error.message || "Invalid signup details.";
            loginHint.textContent = "Check your email format and password length.";
          } else {
            loginError.textContent = error.message;
            loginHint.textContent = "Could not create account. See error above.";
          }
          loginError.classList.remove("hidden");
        } finally {
          loginBtn.disabled = false;
          if (signupBtn) signupBtn.disabled = false;
        }
      }

      async function performLogout() {
        try { await request("/auth/logout", { method: "POST" }); } catch {}
        disconnectEvents();
        stopUiFx();
        state.cursorFx.ready = false;
        window.clearInterval(state.browserTimer);
        state.browserTimer = null;
        window.clearInterval(state.humanBridgeTimer);
        state.humanBridgeTimer = null;
        setAuthenticated(false);
        syncConnectionUI(null);
        modelModeStatus.textContent = "default";
      }

      function connectEvents() {
        disconnectEvents();
        state.eventSource = new EventSource(withApiBase("/events"), { withCredentials: true });
        state.eventSource.onopen = function() { syncConnectionUI(true); };
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
              loadBootstrap(false).catch(function() {});
              return;
            }
            if (payload.type === "task_start") {
              state.supervisor = {
                decision: "ok",
                score: null,
                reason: "Monitoring active task",
                ts: new Date().toISOString()
              };
              renderSupervisorPill();
            }
            if (payload.type === "supervisor") {
              state.supervisor = {
                decision: payload.decision || "ok",
                score: Number.isFinite(Number(payload.score)) ? Number(payload.score) : null,
                reason: payload.reason || payload.msg || "",
                ts: new Date().toISOString()
              };
              renderSupervisorPill();
              renderSupervisorMessage();
            }
            if (payload.type === "task_done") {
              state.sending = false;
              sendBtn.disabled = false;
              state.agentQuestion = null;
              state.latestGuidance = null;
              renderGuidancePanel();
              state.supervisor = {
                decision: "idle",
                score: null,
                reason: "No active task supervision yet",
                ts: new Date().toISOString()
              };
              renderSupervisorPill();
              scheduleBootstrapRefresh(200);
            }
            if (payload.type === "human_needed") {
              openHumanBridgeTab(payload.bridgeUrl);
              refreshHumanBridgeState();
            }
            if (payload.type === "bridge_closed") {
              state.humanBridgeWindow = null;
              refreshHumanBridgeState();
            }
            if (payload.type === "human_click" || payload.type === "captcha_detected" || payload.type === "captcha_solved") {
              refreshHumanBridgeState();
            }
            // LIVE NARRATION: Agent describing what it's doing
            if (payload.type === "narrate") {
              addRuntimeEvent("narrate", payload.msg);
              showNarrationBanner(payload.msg);
              return;
            }
            // AGENT QUESTION: Agent asking user for guidance
            if (payload.type === "agent_question") {
              state.agentQuestion = { question: payload.question, context: payload.context, ts: payload.ts };
              addRuntimeEvent("narrate", "\u2753 " + payload.question);
              renderGuidancePanel();
              return;
            }
            // GUIDANCE RECEIVED: Confirm user guidance was consumed
            if (payload.type === "guidance_received") {
              state.agentQuestion = null;
              state.latestGuidance = {
                text: payload.text || "",
                priority: payload.priority || "normal",
                stopRequested: !!payload.stopRequested,
                ts: payload.ts || new Date().toISOString()
              };
              renderGuidancePanel();
              addRuntimeEvent("status", payload.msg);
              return;
            }
            // TASK DONE: already handled in first task_done block above
            if (payload.msg) addRuntimeEvent(payload.type || "status", payload.msg);
            if (payload.answer) addRuntimeEvent(payload.aborted ? "status" : (payload.completed ? "agent" : "error"), payload.answer);
          } catch (error) {
            addRuntimeEvent("error", error.message);
          }
        };
        state.eventSource.onerror = function() { syncConnectionUI(false); };
      }

      function disconnectEvents() {
        if (state.eventSource) {
          state.eventSource.close();
          state.eventSource = null;
        }
      }

      function openHumanBridgeTab(bridgeUrl) {
        const baseBridgeUrl = bridgeUrl || "/human-bridge";
        const resolvedBaseBridgeUrl = withApiBase(baseBridgeUrl);
        const url = resolvedBaseBridgeUrl + (resolvedBaseBridgeUrl.includes("?") ? "&" : "?") + "ts=" + Date.now() + (state.theme === "light" ? "&theme=light" : "");
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

      // ─── NARRATION BANNER ────────────────────────────────────────────────────
      var narrationBannerTimer = null;
      function showNarrationBanner(msg) {
        var banner = document.getElementById("narrationBanner");
        if (!banner) return;
        banner.textContent = "\uD83D\uDDE3\uFE0F  " + msg;
        banner.style.display = "block";
        banner.style.opacity = "1";
        clearTimeout(narrationBannerTimer);
        narrationBannerTimer = setTimeout(function() {
          banner.style.opacity = "0";
          setTimeout(function() { banner.style.display = "none"; }, 400);
        }, 6000);
      }

      // ─── GUIDANCE PANEL ──────────────────────────────────────────────────────
      function renderComposerSendButton() {
        if (!sendBtn) return;
        const isThinking = !!state.sending;
        sendBtn.classList.toggle("is-thinking", isThinking);
        if (isThinking) {
          sendBtn.innerHTML = '<span class="composer-send-spinner" aria-hidden="true"></span>';
          sendBtn.title = "Working…";
          sendBtn.setAttribute("aria-label", "Working…");
        } else {
          sendBtn.innerHTML = iconMarkup("send");
          sendBtn.title = "Send message";
          sendBtn.setAttribute("aria-label", "Send message");
        }
      }

      function renderGuidancePanel() {
        if (!composerArea || !composerInput || !sendBtn || !quickActions || !composerAssist) return;
        const isActive = isGuidanceModeActive();
        const q = state.agentQuestion;
        const latest = state.latestGuidance;
        const isCritical = !!(latest && latest.stopRequested);

        composerArea.classList.toggle("guidance-mode", false);

        composerAssist.className = "composer-assist hidden";
        composerAssist.innerHTML = "";
        composerInput.placeholder = "Ask a question or assign a browsing task…";
        renderComposerSendButton();
        renderQuickActions(DEFAULT_QUICK_PROMPTS);
      }

      async function refreshBrowser() {
        if (appShell.classList.contains("hidden")) return;
        screenshot.src = withApiBase("/screenshot") + "?ts=" + Date.now();
        browserUrl.textContent = state.browserUrl || "about:blank";
        try {
          const text = await fetch(withApiBase("/url"), { credentials: "include" }).then(function(res) { return res.text(); });
          state.browserUrl = text;
          browserUrl.textContent = text;
        } catch {}
      }

      async function analyzeCurrentUi() {
        if (!analyzeCurrentUiBtn || !browserVisionStatus) return;
        analyzeCurrentUiBtn.disabled = true;
        browserVisionStatus.textContent = "Vision is analyzing the current UI…";
        if (browserVisionWrap) browserVisionWrap.style.display = "none";
        if (browserVisionAscii) browserVisionAscii.textContent = "";
        if (browserVisionKey) browserVisionKey.textContent = "";
        try {
          const payload = await request("/api/analyze-current-ui", {
            method: "POST",
            body: {
              prompt: "Analyze the current browser UI and produce an ASCII page map plus structured key."
            }
          });
          const analysis = payload && payload.analysis ? payload.analysis : null;
          if (!analysis || !analysis.key) throw new Error("No layout analysis returned");
          if (browserVisionWrap) browserVisionWrap.style.display = "block";
          if (browserVisionStatus) {
            const count = analysis.key && Array.isArray(analysis.key.elements) ? analysis.key.elements.length : 0;
            browserVisionStatus.textContent = "Vision analyzed the live UI: " + count + " element" + (count === 1 ? "" : "s") + " detected.";
          }
          if (browserVisionAscii) browserVisionAscii.textContent = String(analysis.asciiMap || "");
          if (browserVisionKey) browserVisionKey.textContent = JSON.stringify(analysis.key || {}, null, 2);
        } catch (error) {
          browserVisionStatus.textContent = "UI analysis failed: " + error.message;
          if (browserVisionWrap) browserVisionWrap.style.display = "none";
        } finally {
          analyzeCurrentUiBtn.disabled = false;
        }
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
        setCurrentView(state.initialView);
        await refreshBrowser();
        await refreshHumanBridgeState();
        window.clearInterval(state.browserTimer);
        state.browserTimer = window.setInterval(refreshBrowser, 2800);
        window.clearInterval(state.humanBridgeTimer);
        state.humanBridgeTimer = window.setInterval(refreshHumanBridgeState, 1400);
        if (state.signupWarning) {
          addRuntimeEvent("error", "Account created, but Pinch customer setup is pending: " + state.signupWarning);
          state.signupWarning = null;
        }
      }

      async function boot() {
        loginModeHint.textContent = "single-operator workspace";
        state.initialView = resolveInitialViewFromUrl();
        applyRouteLayout();
        try {
          const session = await request("/auth/session");
          state.session = session;
          if (session.usingDefaultCredentials) {
            loginHint.textContent = "Default local credentials are enabled. Email/Username: admin • Password: puppeterr";
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
      const signupBtn = document.getElementById("signupBtn");
      if (signupBtn) signupBtn.addEventListener("click", performSignup);
      const logoutBtn = document.getElementById("logoutBtn");
      if (logoutBtn) logoutBtn.addEventListener("click", performLogout);
      const codingSectorBtn = document.getElementById("codingSectorBtn");
      if (codingSectorBtn) {
        codingSectorBtn.addEventListener("click", function() {
          window.open(withApiBase("/code-sector"), "_blank", "noopener,noreferrer");
        });
      }
      document.getElementById("newChatBtn").addEventListener("click", createNewChat);
      if (timelineTitle) {
        timelineTitle.addEventListener("click", openChatTitleEditor);
      }
      if (upgradeViewBtn) {
        upgradeViewBtn.addEventListener("click", function() {
          const upgradeUrl = withApiBase("/upgrade");
          window.open(upgradeUrl, "_blank", "noopener,noreferrer");
        });
      }
      document.getElementById("refreshAllBtn").addEventListener("click", function() { loadBootstrap(false); refreshBrowser(); });
      if (themeToggleBtn) {
        themeToggleBtn.addEventListener("click", function() {
          applyTheme(state.theme === "dark" ? "light" : "dark");
        });
      }
      document.getElementById("refreshModelsBtn").addEventListener("click", function() { loadBootstrap(true); });
      document.getElementById("refreshMemoryBtn").addEventListener("click", refreshMemory);
      if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener("click", function() {
          state.sidebarCollapsed = !state.sidebarCollapsed;
          saveUiPrefs();
          renderSidebarViewState();
        });
      }
      if (openHumanBridgeBtn) {
        openHumanBridgeBtn.addEventListener("click", function() {
          openHumanBridgeTab("/human-bridge");
        });
      }
      if (refreshHumanBridgeBtn) {
        refreshHumanBridgeBtn.addEventListener("click", refreshHumanBridgeState);
      }
      sendBtn.addEventListener("click", sendMessage);
      composerInput.addEventListener("input", function() {
        const chatIdNow = state.selectedChatId;
        saveDraftForChat(chatIdNow, composerInput.value);
        composerInput.style.height = "auto";
        composerInput.style.height = Math.min(composerInput.scrollHeight, 220) + "px";
      });
      renderQuickActions(DEFAULT_QUICK_PROMPTS);
      composerInput.addEventListener("keydown", function(event) {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          sendMessage();
        }
      });

      // ── Paste-image support: Ctrl+V / right-click paste into the composer ────
      composerInput.addEventListener("paste", function(event) {
        const items = event.clipboardData && event.clipboardData.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
          if (items[i].kind === "file" && items[i].type.startsWith("image/")) {
            event.preventDefault();
            const file = items[i].getAsFile();
            if (file) {
              analyzeUploadedImage(file);
              addRuntimeEvent("status", "Image pasted — running DETR analysis…");
            }
            return;
          }
        }
      });

      loadUiPrefs();
      applyTheme(state.theme);
      bindGlobalShortcuts();

      // ── DETR image upload ───────────────────────────────────────────────────────

      function getDetrColor(label) {
        const palette = ["#58a6ff","#7ee787","#f78166","#ffa657","#d2a8ff","#79c0ff","#56d364","#e3b341","#ff7b72","#3dc9b0"];
        let h = 0;
        for (let i = 0; i < (label || "").length; i++) h = (h * 31 + label.charCodeAt(i)) & 0xffff;
        return palette[h % palette.length];
      }

      function drawDetrDetections(canvas, imgEl, detections) {
        canvas.width  = imgEl.naturalWidth  || imgEl.width  || 640;
        canvas.height = imgEl.naturalHeight || imgEl.height || 480;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "rgba(0,0,0,0.05)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#999";
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Vision-only analysis mode", canvas.width / 2, canvas.height / 2 - 10);
        ctx.font = "12px sans-serif";
        ctx.fillText("Structured box drawing is disabled for this model.", canvas.width / 2, canvas.height / 2 + 12);
        return canvas.toDataURL("image/jpeg", 0.85);
      }

      async function analyzeUploadedImage(file) {
        if (!file || !imagePreviewWrap || !detrCanvas || !detrStatus) return;
        const reader = new FileReader();
        const imageB64 = await new Promise(function(resolve, reject) {
          reader.onload  = function(e) { resolve(String(e.target.result || "").split(",")[1] || ""); };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        if (!imageB64) return;

        detrStatus.textContent = "Image attached. Analysis will run when you send it.";
        imagePreviewWrap.style.display = "block";
        const img = new Image();
        await new Promise(function(resolve, reject) {
          img.onload  = resolve; img.onerror = reject;
          img.src = "data:image/jpeg;base64," + imageB64;
        });
        const previewImg = document.getElementById("previewImg");
        if (previewImg) previewImg.src = "data:" + (file.type || "image/jpeg") + ";base64," + imageB64;
        if (detrCanvas) {
          detrCanvas.style.display = "none";
        }
        const analysisText = document.getElementById("visionAnalysisText");
        if (analysisText) {
          analysisText.textContent = "Vision analysis will appear here after the assistant processes the image.";
          analysisText.style.display = "block";
        }

        try {
          state.pendingImage = {
            original: imageB64,
            mimeType: file.type || "image/jpeg",
            filename: file.name || "image.jpg"
          };
          addRuntimeEvent("status", "Image attached for send-time analysis: " + JSON.stringify(file.name || "image") + ".");
        } catch (err) {
          state.pendingImage = { original: imageB64, mimeType: file.type || "image/jpeg", filename: file.name || "image.jpg" };
          detrStatus.textContent = "Image attached. Analysis will run when you send it.";
        }
      }

      if (uploadImageBtn) {
        uploadImageBtn.addEventListener("click", function() { if (imageFileInput) imageFileInput.click(); });
      }
      if (imageFileInput) {
        imageFileInput.addEventListener("change", function() {
          const file = imageFileInput.files && imageFileInput.files[0];
          if (file) analyzeUploadedImage(file);
          imageFileInput.value = "";
        });
      }
      const clearImageBtn = document.getElementById("clearImageBtn");
      if (clearImageBtn) {
        clearImageBtn.addEventListener("click", function() {
          state.pendingImage = null;
          if (imagePreviewWrap) imagePreviewWrap.style.display = "none";
          if (detrCanvas) detrCanvas.style.display = "block";
          if (layoutAnalysisWrap) layoutAnalysisWrap.style.display = "none";
          if (layoutStatus) layoutStatus.textContent = "";
          if (layoutAscii) layoutAscii.textContent = "";
          if (layoutKey) layoutKey.textContent = "";
        });
      }
      if (analyzeCurrentUiBtn) {
        analyzeCurrentUiBtn.addEventListener("click", analyzeCurrentUi);
      }

      boot();
    </script>

    <!-- SUPERVISOR MESSAGE BUBBLE -->
    <div id="supervisorMsgContainer" class="supervisor-msg-container" style="display:none;"></div>

  </body>
  </html>
`;

if (typeof module !== "undefined" && module.exports) {
  module.exports = { FRONTEND_HTML };
} else if (typeof window !== "undefined") {
  window.FRONTEND_HTML = FRONTEND_HTML;
  if (typeof document !== "undefined") {
    document.open();
    document.write(FRONTEND_HTML);
    document.close();
  }
}
