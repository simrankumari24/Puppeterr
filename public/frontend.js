const FRONTEND_HTML = `
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
    <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
      :root {
        --bg:          #0a1018;
        --sidebar-bg:  #101823;
        --panel-bg:    #151f2d;
        --border:      rgba(255,255,255,0.08);
        --border-hover:rgba(255,255,255,0.16);
        --text:        #e8eff7;
        --muted:       #93a0af;
        --accent:      #85e89d;
        --accent-dim:  rgba(133,232,157,0.14);
        --accent-2:    #6db4ff;
        --danger:      #f85149;
        --warn:        #d29922;
        --radius:      10px;
        --font: "Geist", "Segoe UI", system-ui, sans-serif;
        --mono: "Geist Mono", "Fira Code", monospace;
      }

      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      html, body {
        height: 100%;
        overflow: hidden;
        background:
          radial-gradient(circle at 18% 0%, rgba(109,180,255,0.14), transparent 38%),
          radial-gradient(circle at 85% 14%, rgba(133,232,157,0.12), transparent 42%),
          linear-gradient(180deg, #0b121b 0%, #0a1018 52%, #090f16 100%);
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
        border-radius: 16px;
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
      .field label { font-size: 12px; font-weight: 500; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }

      .field input {
        width: 100%;
        background: rgba(0,0,0,0.3);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 10px 14px;
        outline: none;
        transition: border-color .15s;
      }
      .field input:focus { border-color: var(--accent-2); }

      .hint { color: var(--muted); font-size: 12px; margin-top: 12px; }
      #loginError { color: var(--danger); font-size: 13px; margin-top: 8px; }

      .primary-btn {
        display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        background: var(--accent); color: #0d1117;
        font-weight: 600; font-size: 13px;
        border-radius: var(--radius);
        padding: 10px 20px;
        transition: opacity .15s, transform .15s;
      }
      .primary-btn:hover { opacity: 0.88; transform: translateY(-1px); }
      .primary-btn:disabled { opacity: 0.5; pointer-events: none; }

      .eyebrow { display: none; }

      /* ── APP SHELL ─────────────────────────────────────── */
      .shell { height: 100dvh; overflow: hidden; }

      .shell::before {
        content: "";
        position: fixed;
        inset: -20% -10% auto;
        height: 380px;
        background: radial-gradient(circle at 30% 45%, rgba(109,180,255,0.08), transparent 45%);
        pointer-events: none;
        z-index: 0;
      }

      .app-layout {
        position: relative;
        z-index: 1;
        display: flex;
        height: 100dvh;
        overflow: hidden;
      }

      /* ── SIDEBAR ───────────────────────────────────────── */
      .sidebar {
        width: 256px;
        min-width: 256px;
        background: var(--sidebar-bg);
        border-right: 1px solid var(--border);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        flex-shrink: 0;
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
      .icon-btn:hover { background: var(--border); color: var(--text); }

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
      .chat-item.active { background: rgba(88,166,255,0.12); }
      .chat-item.active .chat-title { color: #d7e8ff; }

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
        width: 28px; height: 28px;
        border-radius: 50%;
        background: linear-gradient(135deg, var(--accent-2), var(--accent));
        display: grid; place-items: center;
        font-size: 12px; font-weight: 700; color: #0d1117;
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
        padding: 20px 0;
      }

      .timeline {
        display: flex; flex-direction: column; gap: 2px;
        max-width: 760px; margin: 0 auto;
        padding: 0 20px;
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
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #b9c4d0;
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
        color: #b8c2cf;
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
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.07);
        color: #d1d9e0;
        font-size: 12px;
      }
      .billing-toggle {
        display: inline-flex;
        gap: 4px;
        padding: 4px;
        border-radius: 999px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
      }
      .billing-toggle-btn {
        padding: 8px 14px;
        border-radius: 999px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 600;
        transition: background .12s, color .12s, transform .12s;
      }
      .billing-toggle-btn.active {
        background: linear-gradient(135deg, rgba(88,166,255,0.18), rgba(126,231,135,0.16));
        color: var(--text);
      }
      .billing-toggle-btn:hover { color: var(--text); }
      .save-badge {
        display: inline-flex;
        align-items: center;
        padding: 0 9px;
        border-radius: 999px;
        background: rgba(126,231,135,0.12);
        color: var(--accent);
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
        border-radius: 22px;
        background: linear-gradient(180deg, rgba(19,24,31,0.98), rgba(12,16,22,0.96));
        border: 1px solid rgba(255,255,255,0.08);
        box-shadow: 0 24px 60px rgba(0,0,0,0.18);
        transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
      }
      .plan-card:hover {
        transform: translateY(-3px);
        box-shadow: 0 30px 72px rgba(0,0,0,0.24);
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
      }
      .plan-price-unit {
        color: var(--muted);
        font-size: 14px;
      }
      .plan-trial {
        font-size: 12px;
        color: #d2d9e0;
      }
      .plan-desc {
        color: #bdc7d4;
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
        color: #d7dfe7;
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
      }
      .plan-cta:hover {
        transform: translateY(-1px);
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
        border-radius: 20px;
        background: linear-gradient(180deg, rgba(19,24,31,0.92), rgba(13,17,23,0.96));
        border: 1px solid rgba(255,255,255,0.07);
        padding: 20px 22px;
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
      }

      @keyframes heroFloat {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-4px); }
      }

      .message-card {
        display: flex; gap: 12px; padding: 10px 10px;
        border-radius: 14px;
        border: 1px solid transparent;
        transition: border-color .16s, background .16s;
      }
      .message-card:hover {
        border-color: rgba(255,255,255,0.06);
        background: rgba(255,255,255,0.02);
      }

      .msg-avatar {
        width: 28px; height: 28px; border-radius: 50%;
        display: grid; place-items: center;
        font-size: 13px; font-weight: 700;
        flex-shrink: 0; margin-top: 2px;
      }
      .msg-avatar.user { background: linear-gradient(135deg, var(--accent-2), #388bfd); color: #fff; }
      .msg-avatar.assistant {
        background: linear-gradient(135deg, var(--accent-dim), rgba(126,231,135,.22));
        border: 1px solid rgba(126,231,135,.22); color: var(--accent); font-size: 14px;
      }

      .msg-body { flex: 1; min-width: 0; }
      .msg-meta { display: flex; align-items: baseline; gap: 8px; margin-bottom: 5px; }
      .msg-role { font-size: 13px; font-weight: 600; }
      .msg-role.user { color: var(--accent-2); }
      .msg-role.assistant { color: var(--accent); }
      .message-meta { font-size: 11px; color: var(--muted); }

      .message-content {
        font-size: 14px; line-height: 1.7;
        color: var(--text);
        white-space: pre-wrap; word-break: break-word;
      }

      .message-content .katex-display { margin: 10px 0; overflow-x: auto; }

      .typing-caret {
        display: inline-block; width: 7px; height: 1em;
        margin-left: 2px; border-radius: 2px;
        background: var(--accent); vertical-align: text-bottom;
        animation: blinkCaret 1s steps(1) infinite;
      }
      @keyframes blinkCaret { 0%,45%{opacity:1} 46%,100%{opacity:0} }

      /* runtime dropdown */
      .runtime-dropdown {
        background: rgba(0,0,0,.3);
        border: 1px solid var(--border);
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
        border: 1px solid var(--border); color: var(--muted);
        transition: background .12s, color .12s;
      }
      .runtime-filter-btn:hover { background: rgba(255,255,255,.06); color: var(--text); }
      .runtime-filter-btn.off { opacity: .4; }
      .runtime-search {
        margin-left: auto; min-width: 140px;
        background: rgba(0,0,0,.3); border: 1px solid var(--border);
        border-radius: 7px; padding: 4px 8px; font-size: 12px; outline: none; color: var(--text);
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

      /* guidance panel */
      .guidance-inner { padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
      .guidance-question { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; color: #cdd9e5; line-height: 1.5; }
      .guidance-q-icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }
      .guidance-input-row { display: flex; gap: 8px; }
      .guidance-input { flex: 1; background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 8px 12px; color: #cdd9e5; font-size: 13px; outline: none; }
      .guidance-input:focus { border-color: #58a6ff; box-shadow: 0 0 0 2px #58a6ff22; }
      .guidance-send-btn { background: #1f6feb; border: none; border-radius: 6px; color: #fff; padding: 8px 14px; font-size: 13px; cursor: pointer; white-space: nowrap; }
      .guidance-send-btn:hover { background: #388bfd; }

      .runtime-head {
        display: flex; justify-content: space-between; align-items: center;
        gap: 8px; margin-bottom: 4px;
        font-size: 10px; letter-spacing: .07em; text-transform: uppercase; color: var(--muted);
      }
      .runtime-body { font-size: 12px; color: var(--text); white-space: pre-wrap; word-break: break-word; line-height: 1.55; }

      /* composer */
      .composer {
        border-top: 1px solid var(--border);
        padding: 14px 20px 16px;
        background: var(--bg);
        flex-shrink: 0;
      }

      .composer-wrap {
        max-width: 760px; margin: 0 auto;
      }

      .composer-box {
        background: var(--panel-bg);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 2px;
        transition: border-color .15s;
      }
      .composer-box:focus-within { border-color: rgba(255,255,255,.18); }

      .composer-textarea {
        display: block; width: 100%;
        background: transparent; border: none; outline: none;
        padding: 11px 14px 4px;
        font-size: 14px; line-height: 1.6;
        resize: none;
        min-height: 46px; max-height: 220px;
        overflow-y: auto; color: var(--text);
      }

      .composer-footer {
        display: flex; align-items: center; justify-content: space-between;
        padding: 6px 10px 6px 14px;
        gap: 10px;
      }

      .quick-actions {
        display: flex; gap: 6px; flex-wrap: nowrap; overflow-x: auto;
        padding-bottom: 2px; flex: 1; min-width: 0;
      }
      .quick-actions::-webkit-scrollbar { height: 0; }

      .quick-chip {
        white-space: nowrap; flex-shrink: 0;
        padding: 4px 11px; border-radius: 99px;
        background: rgba(255,255,255,.04); border: 1px solid var(--border);
        font-size: 12px; color: var(--muted);
        transition: background .12s, color .12s, border-color .12s;
      }
      .quick-chip:hover { background: rgba(255,255,255,.08); color: var(--text); border-color: var(--border-hover); }

      .composer-send {
        display: flex; align-items: center; justify-content: center;
        width: 34px; height: 34px; border-radius: 8px;
        background: var(--accent); color: #0d1117;
        font-size: 16px; flex-shrink: 0;
        transition: opacity .15s, transform .12s;
      }
      .composer-send:hover { opacity: .88; transform: scale(1.05); }
      .composer-send:disabled { opacity: .35; pointer-events: none; }

      /* ── BROWSER PANEL ────────────────────────────────── */
      .browser-aside {
        width: 360px; min-width: 320px;
        display: flex; flex-direction: column;
        border-left: 1px solid var(--border);
        background: var(--sidebar-bg);
        overflow: hidden;
        flex-shrink: 0;
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
      .model-card label {
        display: block; font-size: 11px; font-weight: 600; text-transform: uppercase;
        letter-spacing: .07em; color: var(--muted); margin-bottom: 6px;
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
      body.upgrade-route #guidancePanel {
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
          <div class="login-logo">🤖</div>
          <span class="login-brand-name">Puppeterr</span>
        </div>
        <h2>Welcome back</h2>
        <p class="login-copy" id="loginModeHint">Sign in to your operator workspace.</p>
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
        <nav class="sidebar">
          <div class="sidebar-header">
            <div class="sidebar-brand">
              <div class="sidebar-logo">🤖</div>
              Puppeterr
            </div>
            <div class="sidebar-actions">
              <button class="icon-btn" id="refreshAllBtn" title="Refresh">⟳</button>
            </div>
          </div>

          <button class="sidebar-new-chat" id="newChatBtn" type="button">
            <span class="sidebar-new-chat-icon">✎</span>
            New chat
          </button>

          <button class="sidebar-nav-link" id="upgradeViewBtn" type="button">
            <span class="sidebar-nav-icon"><span>⚡</span><span>Upgrade</span></span>
            <span class="sidebar-nav-badge">Plans</span>
          </button>

          <div class="sidebar-section-label">Recents</div>
          <div class="sidebar-scroll">
            <div class="chat-list" id="chatList"></div>
          </div>

          <div class="memory-section">
            <div class="memory-section-header">
              <span class="memory-section-title">Memory</span>
              <button class="icon-btn" id="refreshMemoryBtn" title="Refresh memory" style="width:24px;height:24px;font-size:13px;">⟳</button>
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
            <button class="icon-btn" id="logoutBtn" title="Sign out">⎋</button>
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
              <button class="ghost-btn" id="codingSectorBtn">⌨ Code</button>
            </div>
          </div>

          <div class="timeline-scroll" id="timelineScroll">
            <div class="timeline" id="timeline"></div>
          </div>

          <!-- NARRATION BANNER: Live agent commentary -->
          <div id="narrationBanner" style="display:none;opacity:0;transition:opacity 0.4s;margin:0 12px 6px;padding:10px 14px;background:linear-gradient(135deg,#1c2433,#1a2e1a);border:1px solid #2ea04380;border-radius:8px;font-size:13px;color:#7ee787;line-height:1.5;"></div>

          <!-- GUIDANCE PANEL: Agent asks / user guides while task runs -->
          <div id="guidancePanel" style="display:none;flex-direction:column;margin:0 12px 8px;border:1px solid #58a6ff60;border-radius:8px;background:#0d1117;overflow:hidden;"></div>
            <div class="composer-wrap" id="composerArea">
              <div class="composer-box">
                <textarea id="composerInput" class="composer-textarea" rows="1"
                  placeholder="Ask a question or assign a browsing task…"></textarea>
                <div id="imagePreviewWrap" style="display:none;margin-bottom:8px;border:1px solid var(--border);border-radius:6px;overflow:hidden;background:var(--panel-bg);">
                  <div style="padding:8px;position:relative;background:var(--panel-bg);">
                    <div style="display:flex;gap:8px;align-items:flex-start;">
                      <img id="previewImg" src="" style="max-width:160px;max-height:160px;border-radius:4px;object-fit:contain;" />
                      <div style="flex:1;min-width:0;">
                        <canvas id="detrCanvas" style="max-width:300px;max-height:200px;border:1px solid var(--border);border-radius:4px;display:block;"></canvas>
                        <div id="detrStatus" style="font-size:11px;color:var(--muted);margin-top:4px;line-height:1.4;"></div>
                      </div>
                    </div>
                    <div style="display:flex;gap:4px;margin-top:8px;justify-content:flex-end;">
                      <button class="ghost-btn" id="clearImageBtn" type="button" style="padding:4px 8px;font-size:11px;">Clear</button>
                    </div>
                  </div>
                </div>
                <input id="imageFileInput" type="file" accept="image/*" style="display:none;" />
                <div class="composer-footer">
                  <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;">
                    <button class="ghost-btn" id="uploadImageBtn" type="button" style="padding:4px 8px;font-size:11px;">🖼 Image</button>
                  </div>
                  <div class="quick-actions" id="quickActions">
                    <button class="quick-chip" type="button" data-quick-prompt="Open Wikipedia and search for potatoes. Summarize the first paragraph.">Wiki Summary</button>
                    <button class="quick-chip" type="button" data-quick-prompt="Visit Britannica and search for potato agriculture. Extract key points.">Britannica</button>
                    <button class="quick-chip" type="button" data-quick-prompt="Compare Wikipedia and Britannica articles on potatoes. List 3 similarities.">Compare</button>
                    <button class="quick-chip" type="button" data-quick-prompt="Find FAO global potato production statistics and report latest data.">FAO Stats</button>
                  </div>
                  <button class="composer-send" id="sendBtn" type="button">↑</button>
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
      const state = {
        session: null,
        account: null,
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
        humanBridge: null,
        bootstrapTimer: null,
        browserTimer: null,
        humanBridgeTimer: null,
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
          agent: true,
          narrate: true,
          supervisor: true
        },
        runtimeSearch: "",
        runtimeDropdownOpen: null,
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
      const messageCountTag = document.getElementById("messageCountTag");
      const composerInput = document.getElementById("composerInput");
      const sendBtn = document.getElementById("sendBtn");
      const browserUrl = document.getElementById("browserUrl");
      const screenshot = document.getElementById("screenshot");
      const browserFrame = document.querySelector(".browser-frame");
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
          if (parsed && parsed.runtimeFilters && typeof parsed.runtimeFilters === "object") {
            ["status", "think", "step", "error", "agent", "narrate", "supervisor"].forEach(function(key) {
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
        } catch {}
      }

      function saveUiPrefs() {
        try {
          localStorage.setItem(UI_PREFS_KEY, JSON.stringify({
            runtimeFilters: state.runtimeFilters,
            runtimeSearch: state.runtimeSearch,
            runtimeDropdownOpen: state.runtimeDropdownOpen
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
          return '<button class="chat-item ' + active + '" data-chat-id="' + escapeHtml(chat.id) + '">' +
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
        if (upgradeViewBtn) upgradeViewBtn.classList.toggle("active", state.currentView === "upgrade");
      }

      function renderUpgradeView() {
        const cycle = state.billingCycle === "monthly" ? "monthly" : "yearly";
        const plans = PLAN_CONFIG[cycle] || PLAN_CONFIG.yearly;
        const hasSubscription = !!(state.account && state.account.subscriptionPlan);
        const freeTierLabel = hasSubscription ? ("Active plan: " + String(state.account.subscriptionPlan)) : "Free tier active";
        const attachmentLabel = hasSubscription ? "Subscription attached" : "No subscription attached";
        const upgradeLabel = hasSubscription ? "Manage your current plan" : "Upgrade to Core or Ultimate";
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
            '<div class="upgrade-eyebrow">Puppeterr plans <span class="save-badge">Pinch checkout</span></div>' +
            '<h1 class="upgrade-title">Choose a plan that keeps your operator workflows moving.</h1>' +
            '<p class="upgrade-copy">Upgrade inside Puppeterr with direct checkout links for Core and Ultimate. Use monthly for flexibility or shift to yearly for the strongest savings angle.</p>' +
            '<div class="upgrade-meta-row">' +
              '<div class="billing-toggle">' +
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
          timeline.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🤖</div>Select a chat or start a new one.</div>';
          timelineTitle.textContent = "Puppeterr";
          timelineSubtitle.textContent = "";
          messageCountTag.style.display = "none";
          return;
        }
        timelineTitle.textContent = chat.title || "Conversation";
        timelineSubtitle.textContent = prettyTime(chat.updatedAt);
        messageCountTag.style.display = "";
        messageCountTag.textContent = String(chat.messages.length) + " messages";
        const messageCards = chat.messages.map(function(message, index) {
          const key = messageKey(chat.id, index, message);
          const fullContent = String(message.content || "");
          const isUser = message.role === "user";
          let renderedContent = fullContent;
          let typingCaret = "";
          let contentHtml = "";
          if (!isUser) {
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
          const avatarLabel = isUser ? "Y" : "✦";
          return '<article class="message-card">' +
            '<div class="msg-avatar ' + escapeHtml(message.role) + '">' + avatarLabel + '</div>' +
            '<div class="msg-body">' +
              '<div class="msg-meta"><span class="msg-role ' + escapeHtml(message.role) + '">' + escapeHtml(isUser ? "You" : "Puppeterr") + '</span><span class="message-meta">' + escapeHtml(prettyTime(message.ts)) + '</span></div>' +
              '<div class="message-content">' + contentHtml + typingCaret + '</div>' +
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
          ["status", "think", "step", "error", "agent", "narrate", "supervisor"].map(function(type) {
            const off = state.runtimeFilters[type] ? "" : " off";
            return '<button type="button" class="runtime-filter-btn' + off + '" data-runtime-filter="' + type + '">' + type + '</button>';
          }).join("") +
          '<input class="runtime-search" id="runtimeSearchInput" placeholder="Filter activity..." value="' + escapeHtml(state.runtimeSearch) + '" />' +
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
        timeline.innerHTML = messageCards.concat(runtimeCard).join("") || '<div class="empty-state"><div class="empty-state-icon">💬</div>This chat is empty. Send a message to start.</div>';

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
            if (chevron) chevron.textContent = runtimeDropdown.open ? "Hide" : "Show";
          };
          runtimeDropdown.addEventListener("toggle", function() {
            state.runtimeDropdownOpen = !!runtimeDropdown.open;
            saveUiPrefs();
            updateChevron();
          });
          updateChevron();
        }

        if (timelineScroll) timelineScroll.scrollTop = timelineScroll.scrollHeight;
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
          return '<div class="model-card"><label for="model-' + escapeHtml(role.key) + '">' + escapeHtml(role.label) + '</label><select class="toolbar-select" id="model-' + escapeHtml(role.key) + '" data-role="' + escapeHtml(role.key) + '">' + options + '</select><div class="model-id">' + escapeHtml(current[role.key] || "") + '</div></div>';
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

      function applyBootstrap(data) {
        state.account = data.account || state.account;
        state.chats = data.chats || [];
        state.currentChat = data.currentChat || null;
        state.selectedChatId = data.selectedChatId || (data.currentChat && data.currentChat.id) || null;
        state.memory = data.memory || [];
        state.models = data.models || state.models;
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

      async function sendMessage() {
        const text = composerInput.value.trim();
        if (!text || state.sending || !state.currentChat) return;
        state.sending = true;
        sendBtn.disabled = true;
        renderGuidancePanel();
        composerInput.value = "";
        composerInput.style.height = "auto";
        saveDraftForChat(state.currentChat.id, "");
        state.currentChat.messages.push({ role: "user", content: text, ts: new Date().toISOString() });
        renderTimeline();
        try {
          const body = { message: text, chatId: state.currentChat.id };
          if (state.pendingImage) {
            body.imageB64 = state.pendingImage.original;
            body.annotatedImageB64 = state.pendingImage.annotated || state.pendingImage.original;
            body.detrDetections = state.pendingImage.detections || [];
            body.detectedShapes = state.pendingImage.shapes || [];
            body.semanticAnalysis = state.pendingImage.semantic || {};
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
          // Poll for the reply in case SSE is not connected
          (function pollForReply(attempts) {
            window.setTimeout(function() {
              var prevCount = state.currentChat ? state.currentChat.messages.length : 0;
              loadBootstrap(false).then(function() {
                var newCount = state.currentChat ? state.currentChat.messages.length : 0;
                if (newCount > prevCount || !state.sending) {
                  state.sending = false;
                  sendBtn.disabled = false;
                } else if (attempts > 1) {
                  pollForReply(attempts - 1);
                } else {
                  state.sending = false;
                  sendBtn.disabled = false;
                }
              }).catch(function() {
                state.sending = false;
                sendBtn.disabled = false;
              });
            }, 2000);
          })(15);
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
              scheduleBootstrapRefresh(200);
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
            }
            if (payload.type === "task_done") {
              state.sending = false;
              sendBtn.disabled = false;
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
              renderGuidancePanel();
              addRuntimeEvent("status", payload.msg);
              return;
            }
            // TASK DONE: Clear active question
            if (payload.type === "task_done") {
              state.agentQuestion = null;
              renderGuidancePanel();
            }
            if (payload.msg) addRuntimeEvent(payload.type || "status", payload.msg);
            if (payload.answer) addRuntimeEvent(payload.completed ? "agent" : "error", payload.answer);
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
        const url = resolvedBaseBridgeUrl + (resolvedBaseBridgeUrl.includes("?") ? "&" : "?") + "ts=" + Date.now();
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
      function renderGuidancePanel() {
        var panel = document.getElementById("guidancePanel");
        if (!panel) return;
        if (!state.agentQuestion && !state.sending) {
          panel.style.display = "none";
          return;
        }
        var q = state.agentQuestion;
        panel.style.display = "flex";
        panel.innerHTML =
          '<div class="guidance-inner">' +
            (q ? '<div class="guidance-question"><span class="guidance-q-icon">\u2753</span><span>' + escapeHtml(q.question) + '</span></div>' : '<div class="guidance-question"><span class="guidance-q-icon">\uD83E\uDD16</span><span>Agent is working... You can send real-time guidance below.</span></div>') +
            '<div class="guidance-input-row">' +
              '<input id="guidanceInput" class="guidance-input" placeholder="Type guidance or answer... (e.g. \\\'try Google instead\\\')" />' +
              '<button id="guidanceSendBtn" class="guidance-send-btn">Send \u27A4</button>' +
            '</div>' +
          '</div>';
        var inp = document.getElementById("guidanceInput");
        var btn = document.getElementById("guidanceSendBtn");
        function sendGuidance() {
          var text = inp ? inp.value.trim() : "";
          if (!text) return;
          inp.value = "";
          request("/api/guidance", { method: "POST", body: { text: text } })
            .then(function() { addRuntimeEvent("status", "Guidance sent: \\\"" + text + "\\\""); })
            .catch(function(e) { addRuntimeEvent("error", "Guidance failed: " + e.message); });
        }
        if (btn) btn.addEventListener("click", sendGuidance);
        if (inp) inp.addEventListener("keydown", function(e) { if (e.key === "Enter") sendGuidance(); });
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
      document.getElementById("logoutBtn").addEventListener("click", performLogout);
      document.getElementById("codingSectorBtn").addEventListener("click", function() {
        window.open(withApiBase("/code-sector"), "_blank", "noopener,noreferrer");
      });
      document.getElementById("newChatBtn").addEventListener("click", createNewChat);
      if (upgradeViewBtn) {
        upgradeViewBtn.addEventListener("click", function() {
          const upgradeUrl = withApiBase("/upgrade");
          window.open(upgradeUrl, "_blank", "noopener,noreferrer");
        });
      }
      document.getElementById("refreshAllBtn").addEventListener("click", function() { loadBootstrap(false); refreshBrowser(); });
      document.getElementById("refreshModelsBtn").addEventListener("click", function() { loadBootstrap(true); });
      document.getElementById("refreshMemoryBtn").addEventListener("click", refreshMemory);
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
      if (quickActions) {
        const chips = quickActions.querySelectorAll("[data-quick-prompt]");
        Array.from(chips).forEach(function(btn) {
          btn.addEventListener("click", function() {
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
        ctx.drawImage(imgEl, 0, 0);
        ctx.font = "bold 12px sans-serif";
        for (const det of (detections || [])) {
          const box   = det.box || {};
          const label = String(det.label || "object");
          const score = Math.round((det.score || 0) * 100);
          const color = getDetrColor(label);
          const x = Number(box.xmin) || 0;
          const y = Number(box.ymin) || 0;
          const w = (Number(box.xmax) || 0) - x;
          const h = (Number(box.ymax) || 0) - y;
          ctx.strokeStyle = color; ctx.lineWidth = 2;
          ctx.strokeRect(x, y, w, h);
          const txt = label + " " + score + "%";
          const tw  = ctx.measureText(txt).width + 8;
          ctx.fillStyle = color; ctx.fillRect(x, Math.max(0, y - 18), tw, 18);
          ctx.fillStyle = "#0d1117"; ctx.fillText(txt, x + 4, Math.max(14, y - 4));
        }
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

        detrStatus.textContent = "Running analysis (DETR + Shapes + ViT)\u2026";
        imagePreviewWrap.style.display = "block";

        const img = new Image();
        await new Promise(function(resolve, reject) {
          img.onload  = resolve; img.onerror = reject;
          img.src = "data:image/jpeg;base64," + imageB64;
        });
        detrCanvas.width  = img.naturalWidth  || 640;
        detrCanvas.height = img.naturalHeight || 480;
        detrCanvas.getContext("2d").drawImage(img, 0, 0);

        try {
          // Run DETR object detection and shape/semantic analysis in parallel
          const [detrResult, shapeResult] = await Promise.all([
            request("/api/analyze-image", { method: "POST", body: { imageB64: imageB64 } }).catch(e => ({ detections: [], error: e.message })),
            request("/api/analyze-shapes", { method: "POST", body: { imageB64: imageB64 } }).catch(e => ({ analysis: { shapes: [], semantic: { error: e.message } } }))
          ]);

          const detections = Array.isArray(detrResult.detections) ? detrResult.detections : [];
          const shapes = shapeResult.analysis && Array.isArray(shapeResult.analysis.shapes) ? shapeResult.analysis.shapes : [];
          const semantic = shapeResult.analysis && shapeResult.analysis.semantic ? shapeResult.analysis.semantic : {};

          const annotatedDataUrl = drawDetrDetections(detrCanvas, img, detections);
          state.pendingImage = {
            original: imageB64,
            annotated: annotatedDataUrl.split(",")[1] || imageB64,
            detections: detections,
            shapes: shapes,
            semantic: semantic,
            filename: file.name || "image.jpg"
          };

          const detrCount = detections.length;
          const shapeCount = shapes.length;
          const topLabels = detections.slice(0, 3).map(function(d) { return d.label; }).join(", ");
          const semanticText = semantic.description ? " | Semantic: " + semantic.description : "";
          const shapesText = shapeCount > 0 ? " | " + shapeCount + " shape(s)" : "";

          detrStatus.textContent = detrCount > 0
            ? detrCount + " object" + (detrCount !== 1 ? "s" : "") + " detected: " + topLabels + (detections.length > 3 ? "\u2026" : "") + shapesText + semanticText
            : "No DETR objects." + shapesText + semanticText + " Image attached.";

          addRuntimeEvent("status", "Hybrid analysis: " + detrCount + " DETR, " + shapeCount + " shapes, semantic tag on \\"" + (file.name || "image") + "\\".");
        } catch (err) {
          state.pendingImage = { original: imageB64, annotated: imageB64, detections: [], shapes: [], semantic: {}, filename: file.name || "image.jpg" };
          detrStatus.textContent = "Analysis unavailable \u2014 image attached without annotations.";
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
        });
      }

      boot();
    </script>
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
