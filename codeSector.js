module.exports = {
  CODE_SECTOR_HTML: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Puppeterr Coding Sector</title>
  <style>
    :root {
      --line: rgba(130, 160, 190, 0.25);
      --text: #e9f3ff;
      --muted: #9db4cf;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      height: 100%;
      overflow: hidden;
      color: var(--text);
      background: linear-gradient(130deg, #08111f, #0b1830);
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
    }
    .layout {
      height: 100%;
      display: grid;
      grid-template-rows: auto 1fr;
      gap: 10px;
      padding: 10px;
    }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: rgba(15, 29, 49, 0.92);
    }
    .title {
      font-size: 18px;
      font-weight: 700;
    }
    .muted {
      color: var(--muted);
      font-size: 12px;
    }
    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    button {
      border: 1px solid var(--line);
      background: #1a2e4d;
      color: var(--text);
      border-radius: 10px;
      padding: 8px 12px;
      cursor: pointer;
    }
    .frame-wrap {
      min-height: 0;
      border: 1px solid var(--line);
      border-radius: 14px;
      overflow: hidden;
      background: #0a1528;
      position: relative;
    }
    iframe {
      border: 0;
      width: 100%;
      height: 100%;
      background: #0a1528;
    }
    .overlay {
      position: absolute;
      inset: auto 12px 12px 12px;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid var(--line);
      background: rgba(7, 15, 28, 0.86);
      color: var(--muted);
      font-size: 12px;
      pointer-events: none;
      opacity: 0.95;
    }
  </style>
</head>
<body>
  <div class="layout">
    <div class="topbar">
      <div>
        <div class="title">Coding Sector</div>
        <div class="muted">Embedded vscode.dev workspace for Puppeterr</div>
      </div>
      <div class="actions">
        <button id="homeBtn">Back to Command Center</button>
        <button id="openVsCodeBtn">Open vscode.dev in new tab</button>
      </div>
    </div>

    <div class="frame-wrap">
      <iframe id="vscodeFrame" src="https://vscode.dev/github/simrankumari24/Puppeterr"></iframe>
      <div class="overlay">Sign in on vscode.dev to grant repository access. If embedding is blocked by browser policy, use "Open vscode.dev in new tab".</div>
    </div>
  </div>

  <script>
    async function ensureAuth() {
      const response = await fetch("/auth/session", { credentials: "same-origin" });
      const session = await response.json();
      if (!session.authenticated) {
        document.body.innerHTML = '<div style="padding:24px;color:#fff;font-family:sans-serif;">Not authenticated. Open the main app and sign in first.</div>';
        throw new Error("Unauthenticated");
      }
    }

    document.getElementById("homeBtn").addEventListener("click", function() {
      window.location.href = "/";
    });

    document.getElementById("openVsCodeBtn").addEventListener("click", function() {
      window.open("https://vscode.dev/github/simrankumari24/Puppeterr", "_blank", "noopener,noreferrer");
    });

    ensureAuth().catch(() => {});
  </script>
</body>
</html>
`
};
