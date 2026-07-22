# Strider Integration Guide for agent.js

This guide shows how to integrate Strider into the main Puppeterr agent.

## Quick Start (5 steps)

### 1. Import Strider Integration at top of agent.js
```javascript
const StriderIntegration = require('./strider-integration');
```

### 2. Create Strider instance (after server creation)
```javascript
// Inside agent.js, after 'const server = http.createServer((req, res) => {..}'
const striderIntegration = new StriderIntegration({
  broadcast, // Pass the broadcast function
});
```

### 3. Share browser page with Strider (in runTask function)
```javascript
// At the start of runTask() function, after page is created:
if (typeof striderIntegration !== 'undefined') {
  striderIntegration.setPage(page);
}
```

### 4. Add API endpoints (in handleRequest function)

Insert these before the existing `/api/chat` handler:

```javascript
// ── Strider Crawler API ───────────────────────────────────────────────────────
if (pathname === "/api/strider/start" && req.method === "POST") {
  try {
    const body = await readJsonBody(req);
    const result = await striderIntegration.handleStart(body);
    if (result.error) {
      sendJson(res, result.code || 400, result);
    } else {
      sendJson(res, 200, result);
    }
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
  return;
}

if (pathname === "/api/strider/stop" && req.method === "POST") {
  try {
    const result = await striderIntegration.handleStop();
    if (result.error) {
      sendJson(res, result.code || 400, result);
    } else {
      sendJson(res, 200, result);
    }
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
  return;
}

if (pathname === "/api/strider/stats" && req.method === "GET") {
  const result = striderIntegration.getStats();
  if (result.error) {
    sendJson(res, result.code || 400, result);
  } else {
    sendJson(res, 200, result);
  }
  return;
}

if (pathname === "/api/strider/enqueue" && req.method === "POST") {
  try {
    const body = await readJsonBody(req);
    const result = await striderIntegration.handleEnqueue(body);
    if (result.error) {
      sendJson(res, result.code || 400, result);
    } else {
      sendJson(res, 200, result);
    }
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
  return;
}

if (pathname === "/api/strider/mode" && req.method === "POST") {
  try {
    const body = await readJsonBody(req);
    const result = await striderIntegration.handleModeToggle(body);
    if (result.error) {
      sendJson(res, result.code || 400, result);
    } else {
      sendJson(res, 200, result);
    }
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
  return;
}

if (pathname === "/api/strider/reset" && req.method === "POST") {
  try {
    const result = await striderIntegration.handleReset();
    if (result.error) {
      sendJson(res, result.code || 400, result);
    } else {
      sendJson(res, 200, result);
    }
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
  return;
}
```

### 5. Add Strider SSE events to broadcast function

In the broadcast function, add:

```javascript
if (eventType === 'strider_started' || 
    eventType === 'strider_stopped' || 
    eventType === 'strider_error' || 
    eventType === 'strider_mode_changed' || 
    eventType === 'strider_reset') {
  // Broadcast to all connected clients
  for (const client of clients) {
    client.write(`data: ${JSON.stringify({ type: eventType, data: payload })}\n\n`);
  }
}
```

## API Endpoints

### Start Crawler
```
POST /api/strider/start
Content-Type: application/json

{
  "seedUrls": ["https://example.com", "https://github.com"],
  "workerCount": 3,
  "randomWalk": false,
  "snapshotMode": "all_elements_fast",
  "snapshotOptions": {
    "includeScreenshot": false,
    "maxElements": 8000,
    "settleMs": 120
  }
}

Response:
{
  "ok": true,
  "workerCount": 3,
  "seedUrls": 2,
  "randomWalk": false,
  "snapshotOptions": {
    "mode": "all_elements_fast",
    "includeScreenshot": false,
    "maxElements": 8000,
    "settleMs": 120
  }
}
```

`snapshotMode` values:
- `id_only`: legacy lightweight snapshot (`[id]` elements only)
- `all_elements_fast`: dynamic full DOM walk with lean fields (best speed)
- `all_elements_full`: dynamic full DOM walk with richer text/attributes (heavier)

### Stop Crawler
```
POST /api/strider/stop
Content-Type: application/json

{}

Response:
{
  "ok": true,
  "stats": {
    "frontier": { "queueSize": 245, "visitedCount": 1200, ... },
    "fetch": { "fetched": 1100, "failed": 50, ... },
    ...
  }
}
```

### Get Stats
```
GET /api/strider/stats

Response:
{
  "ok": true,
  "running": true,
  "stats": {
    "snapshotOptions": {
      "mode": "all_elements_fast",
      "includeScreenshot": false
    }
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### One-shot Dynamic Element Extraction
```
POST /api/strider/extract-elements
Content-Type: application/json

{
  "url": "https://example.com",
  "profile": "fast"
}
```

`profile` values:
- `fast`: high-throughput full-DOM extraction for crawling pipelines
- `full`: richer text/attribute extraction for deeper reasoning/debugging

You can still override any individual option (`maxElements`, `includeText`, etc.) in the same payload.

### Enqueue URL
```
POST /api/strider/enqueue
Content-Type: application/json

{
  "url": "https://new-domain.com",
  "discoveredFrom": "https://source.com"
}

Response:
{
  "ok": true,
  "url": "https://new-domain.com",
  "enqueued": true
}
```

### Toggle Mode (FIFO vs Random)
```
POST /api/strider/mode
Content-Type: application/json

{
  "mode": "random"  // or "fifo"
}

Response:
{
  "ok": true,
  "mode": "random",
  "randomWalk": true
}
```

### Reset Crawler
```
POST /api/strider/reset
Content-Type: application/json

{}

Response:
{
  "ok": true
}
```

## Frontend Integration

### Start Crawler from Chat
Add button to UI:
```javascript
async function startStriderCrawler() {
  const response = await fetch('/api/strider/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      seedUrls: ['https://example.com'],
      workerCount: 3,
      randomWalk: false,
    }),
  });
  
  const result = await response.json();
  console.log('Strider started:', result);
}
```

### Monitor Stats
```javascript
async function getStats() {
  const response = await fetch('/api/strider/stats');
  const stats = await response.json();
  
  if (stats.ok && stats.running) {
    console.log('Frontier:', stats.stats.frontier);
    console.log('Fetched:', stats.stats.fetch);
  }
}

// Poll every 5 seconds
setInterval(getStats, 5000);
```

### Listen to SSE Events
```javascript
const eventSource = new EventSource('/events');

eventSource.addEventListener('strider_started', (e) => {
  const { data } = JSON.parse(e.data);
  console.log('Crawler started with', data.workerCount, 'workers');
});

eventSource.addEventListener('strider_stopped', (e) => {
  const { data } = JSON.parse(e.data);
  console.log('Crawler stopped. Final stats:', data.stats);
});

eventSource.addEventListener('strider_error', (e) => {
  const { data } = JSON.parse(e.data);
  console.error('Crawler error:', data.error);
});
```

## Testing

### Test with curl
```bash
# Start
curl -X POST http://localhost:3000/api/strider/start \
  -H 'Content-Type: application/json' \
  -d '{"seedUrls":["https://example.com"],"workerCount":2}'

# Get stats
curl http://localhost:3000/api/strider/stats

# Stop
curl -X POST http://localhost:3000/api/strider/stop \
  -H 'Content-Type: application/json' \
  -d '{}'
```

### Test with Node
```javascript
const StriderIntegration = require('./strider-integration');

const integration = new StriderIntegration({
  broadcast: (type, data) => console.log(`📡 ${type}:`, data),
});

// Start
await integration.handleStart({
  seedUrls: ['https://example.com'],
  workerCount: 2,
});

// Let it run for 30 seconds
await new Promise(resolve => setTimeout(resolve, 30000));

// Stop
const result = await integration.handleStop();
console.log('Final stats:', result.stats);
```

## Debugging

### Enable logging
Add to strider modules:
```javascript
// In strider-frontier.js, strider-fetch-crawler.js, etc.
const DEBUG = process.env.STRIDER_DEBUG === '1';

if (DEBUG) {
  console.log('[DEBUG]', message);
}
```

Run with:
```bash
STRIDER_DEBUG=1 npm start
```

### Monitor frontier file
```bash
# Watch the frontier JSON
watch -n 1 'cat .strider-frontier.json | jq ".queue | length"'
```

## Common Issues

### "Cheerio not found"
Install: `npm install cheerio`

### Crawler not using Puppeteer fallback
- Make sure page is shared: `striderIntegration.setPage(page);`
- Check logs for "Puppeteer failed" messages

### Frontier growing unbounded
- Set max size in `strider-frontier.js`: `const MAX_FRONTIER_SIZE = 50000;`
- Or periodically reset: `POST /api/strider/reset`

### Domain filtering not working
- Check blocklist in `strider-frontier.js`: `this.blockedDomains`
- Add domains to blocklist: `this.blockedDomains.add('example.com');`

## Files Modified
- `agent.js` - Added imports and endpoints
- `package.json` - Added cheerio dependency (already done)
- Created: `strider-*.js`, `STRIDER.md`, this guide

## Next: Add Slash Command

Optional: Add `/crawl` slash command to chat:
```javascript
// In agent.js, in slash command handler:
if (command.command === '/crawl') {
  const urls = command.args.split(',').map(s => s.trim());
  await striderIntegration.handleStart({
    seedUrls: urls,
    workerCount: 3,
  });
  
  appendChatMessage(chatId, 'assistant', 
    `🕷️ Strider crawler started with ${urls.length} seed URL(s)`, 
    { completed: true }
  );
  return;
}
```

Then users can type: `/crawl https://example.com https://github.com`
