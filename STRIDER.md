# Strider: Autonomous Web Crawler for Puppeterr

Strider is a frontier-based autonomous web crawler system that extends Puppeterr with persistent URL queue management, parallel fetch workers, Puppeteer fallback for dynamic content, and intelligent escape hatch mechanisms.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│               Strider Unified Agent Loop                    │
├─────────────────────────────────────────────────────────────┤
│  • N parallel Fetch Crawlers (fast, static HTML parsing)    │
│  • 1 Puppeteer Fallback Worker (for JS-heavy pages)        │
│  • Unified Frontier Queue (persistent, domain-aware)        │
│  • Escape Hatch Detection (bot traps, redirects, auth)      │
│  • Domain Filtering (blocklist, pattern matching)           │
│  • Random Walk Mode (exploration, not targeted crawl)       │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. **Frontier Core** (`strider-frontier.js`)
URL queue with persistent storage, domain filtering, and visited tracking.

**Key Methods:**
- `enqueue(url, discoveredFrom, depth)` - Add URL with depth tracking
- `dequeue()` - FIFO with in-progress marking
- `markVisited(url)` - Mark as successfully visited
- `markFailed(url, reason)` - Mark as failed (allows retry)
- `getRandomUrl()` - Random walk mode support
- `isDomainBlocked(url)` - Domain/pattern filtering

**Features:**
- Persistent storage (JSON file `.strider-frontier.json`)
- Max queue size: 50,000 URLs
- Max depth: 5 levels
- Blocked domain list (extensible)
- Blocked URL patterns: `/adult/`, `/porn/`, `/xxx/`, `.mil`, `.gov`

### 2. **Fetch Crawler** (`strider-fetch-crawler.js`)
Fast, lightweight HTML fetching and link extraction.

**Key Methods:**
- `fetch(url, discoveredFrom)` - Fetch and extract links
- `extractLinks(html, sourceUrl)` - Parse HTML with Cheerio
- `resolveUrl(href, sourceUrl)` - URL normalization

**Features:**
- 8-second timeout per request
- Cheerio for fast parsing
- Extracts from `<a href>`, `data-href`, `ng-href`
- Handles relative URLs
- Detects non-HTML responses

**Stats Tracked:**
- `fetched`: Successful requests
- `failed`: Failed requests
- `linksExtracted`: Total links parsed

### 3. **Puppeteer Fallback** (`strider-puppeteer-fallback.js`)
Handles JavaScript-heavy pages when fetch fails.

**Key Methods:**
- `extract(url, discoveredFrom)` - Puppeteer-based extraction
- `checkEscapeConditions(url)` - Detect bot traps
- `setPage(page)` - Share browser page from Puppeterr

**Escape Hatch Triggers:**
- Too many redirects (>5)
- Forced downloads (`content-disposition: attachment`)
- Infinite loop patterns
- Navigation timeouts
- Auth walls (401, 403)

**Features:**
- 12-second timeout for navigation
- Waits for `networkidle2`
- DOM-based link extraction
- Reuses Puppeterr's browser instance

### 4. **Unified Agent Loop** (`strider-agent.js`)
Coordinates fetch crawlers, Puppeteer fallback, and frontier management.

**Key Methods:**
- `start(seedUrls)` - Launch worker pool
- `stop()` - Graceful shutdown
- `enqueue(url)` - Manual enqueueing
- `setRandomWalkMode(enabled)` - Toggle exploration mode
- `getStats()` - Real-time stats

**Worker Pool:**
- Default: 3 fetch crawlers
- Configurable via `workerCount` option
- Each worker runs independent event loop
- 100ms delay between dequeue attempts
- Stats reported every 30 seconds

**Random Walk Mode:**
Instead of FIFO dequeuing, randomly picks URLs from frontier. Useful for:
- General exploration (no specific target)
- Discovering unexpected pages
- Testing domain diversity

## Usage

### Basic Crawl
```javascript
const StriderAgent = require('./strider-agent');

const strider = new StriderAgent({ workerCount: 3 });

// Start with seed URLs
strider.start([
  'https://example.com',
  'https://github.com',
]).catch(console.error);

// Let it run...
// Monitor via getStats()
console.log(strider.getStats());

// Stop when done
await strider.stop();
```

### Random Walk (Exploration)
```javascript
const strider = new StriderAgent({ randomWalkMode: true });
strider.start(['https://example.com']).catch(console.error);
// Randomly explores from seed URL
```

### Integration with Puppeterr
```javascript
// In agent.js, share the browser page
const strider = new StriderAgent();
strider.setPuppeteerPage(page); // page from Puppeterr
strider.start(seedUrls).catch(console.error);
```

### Enqueue URLs Dynamically
```javascript
// Add URLs while crawler is running
strider.enqueue('https://new-url.com');
strider.enqueue('https://another-url.com', 'https://source-url.com');
```

## Data Flow

```
┌─────────────┐
│ Seed URLs   │
└──────┬──────┘
       │
       ▼
┌──────────────────────┐
│   Frontier Queue     │
│  [URL, domain, ..] │
└──────┬─────────┬────┘
       │         │
       ▼         ▼
   ┌─────────────────────────┐
   │  Fetch Crawlers (N×)    │  ← Fast, static HTML
   │  vs. Puppeteer Fallback │  ← Dynamic JS pages
   └──────┬────────────┬────┘
          │            │
          └────┬───────┘
               ▼
      ┌─────────────────┐
      │ Link Extraction │
      │ + Normalization │
      └────────┬────────┘
               │
               ▼
      ┌─────────────────┐
      │ Domain Filters  │
      │ + Blocklists    │
      └────────┬────────┘
               │
               ▼
      ┌─────────────────┐
      │ Re-enqueue to   │
      │ Frontier (loop) │
      └─────────────────┘
```

## Configuration

### Frontier Options
```javascript
new Frontier()
// Configurable:
// - MAX_FRONTIER_SIZE: 50,000 (prevents memory bloat)
// - MAX_DEPTH: 5 (limit crawl depth)
// - Blocked domains/patterns (extensible)
```

### Agent Options
```javascript
new StriderAgent({
  workerCount: 3,           // Parallel fetch workers
  randomWalkMode: false,    // FIFO vs random dequeue
})
```

### Crawler Timeouts
- Fetch: 8 seconds
- Puppeteer navigation: 10 seconds
- Puppeteer extract: 12 seconds total

## Monitoring

### Real-Time Stats
```javascript
const stats = strider.getStats();
// {
//   frontier: { queueSize, visitedCount, inProgressCount, totalDiscovered },
//   fetch: { fetched, failed, linksExtracted },
//   puppeteer: { puppeteered, failed, linksExtracted, escapeHatches },
//   global: { running, elapsed, totalUrlsProcessed }
// }
```

### Log Output (every 30s)
```
📊 Strider Stats (125.4s)
  Frontier: 1245 queued, 3420 visited, 12 in progress
  Fetched: 3200 successful, 220 failed
  Puppeteered: 150 successful, 8 escapes
  Links extracted: 28450
```

## Integration Checklist

- [ ] Step 1: Frontier Core ✅ (created)
- [ ] Step 2: Fetch Crawler ✅ (created)
- [ ] Step 3: Domain Filtering ✅ (built into Frontier)
- [ ] Step 4: Puppeteer Fallback ✅ (created)
- [ ] Step 5: Escape Hatch ✅ (implemented)
- [ ] Step 6: Random Walk Mode ✅ (implemented)
- [ ] Step 7: Unified Loop ✅ (created)
- [ ] **Integration with agent.js** (pending)
  - [ ] Add `/strider` slash command
  - [ ] POST `/api/strider/start` endpoint
  - [ ] POST `/api/strider/stop` endpoint
  - [ ] GET `/api/strider/stats` endpoint
  - [ ] Share Puppeterr's page instance

## Performance Considerations

- **Frontier Size**: Grows with discovered links. Monitor `.strider-frontier.json` size.
- **Memory**: In-memory visited set; consider periodic cleanup for long-running crawls.
- **Network**: Respects timeout/retry logic; no exponential backoff (could be added).
- **CPU**: Cheerio parsing is single-threaded; fetch I/O is async.

## Future Enhancements

1. **Persistent Backend**: Replace JSON with SQLite/PostgreSQL for large crawls
2. **Rate Limiting**: Per-domain request throttling
3. **Robots.txt**: Respect crawl rules
4. **Caching**: Cache HTML/screenshots to avoid re-fetching
5. **ML Scoring**: Prioritize "interesting" URLs
6. **Duplicate Detection**: Content hashing to avoid near-duplicates
7. **Proxy Support**: Route through proxies for multi-region crawls

## Files

- `strider-frontier.js` - Frontier queue management
- `strider-fetch-crawler.js` - Static HTML fetching
- `strider-puppeteer-fallback.js` - Dynamic page handling
- `strider-agent.js` - Unified worker pool orchestration
- `strider-test.js` - Test/example scenarios
- `STRIDER.md` - This documentation

## License

Same as Puppeterr (see LICENSE file)
