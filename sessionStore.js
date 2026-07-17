const fs = require("fs");
const path = require("path");

function normalizeSessionKey(localPath, explicitKey) {
  if (explicitKey) return String(explicitKey);
  return path.basename(String(localPath || "session.json"));
}

function getServiceUrl() {
  const raw = String(process.env.SESSION_SERVICE_URL || "").trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

function getAuthHeaders() {
  const token = String(process.env.SESSION_SERVICE_TOKEN || "").trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  if (dir && dir !== ".") fs.mkdirSync(dir, { recursive: true });
}

function readLocalSession(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeLocalSession(filePath, state) {
  if (!filePath) return false;
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
  return true;
}

async function remoteRequest(method, key, payload) {
  const serviceUrl = getServiceUrl();
  if (!serviceUrl) return null;

  const url = new URL(`${serviceUrl}/session/${encodeURIComponent(key)}`);
  const headers = Object.assign({ Accept: "application/json" }, getAuthHeaders());
  const init = { method, headers };
  if (payload !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(payload);
  }

  const response = await fetch(url, init);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Session service ${method} ${key} failed with ${response.status}`);
  }
  if (method === "GET") return await response.json();
  return true;
}

async function loadSessionState(options = {}) {
  const { localPath, key = normalizeSessionKey(localPath) } = options;
  try {
    const remoteState = await remoteRequest("GET", key);
    if (remoteState) {
      if (localPath) {
        try { writeLocalSession(localPath, remoteState); } catch {}
      }
      return remoteState;
    }
  } catch {}

  return readLocalSession(localPath);
}

async function saveSessionState(options = {}, state) {
  const { localPath, key = normalizeSessionKey(localPath) } = options;
  let localSaved = false;
  let remoteSaved = false;

  if (localPath) {
    writeLocalSession(localPath, state);
    localSaved = true;
  }

  try {
    const remoteResult = await remoteRequest("PUT", key, state);
    remoteSaved = !!remoteResult;
  } catch {}

  return { localSaved, remoteSaved };
}

async function deleteSessionState(options = {}) {
  const { localPath, key = normalizeSessionKey(localPath) } = options;
  if (localPath && fs.existsSync(localPath)) {
    try { fs.unlinkSync(localPath); } catch {}
  }

  try {
    await remoteRequest("DELETE", key);
  } catch {}
}

async function hasSessionState(options = {}) {
  return !!(await loadSessionState(options));
}

module.exports = {
  loadSessionState,
  saveSessionState,
  deleteSessionState,
  hasSessionState,
  normalizeSessionKey
};