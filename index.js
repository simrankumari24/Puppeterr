#!/usr/bin/env node
/**
 * PuppetAI v4 - AI-powered browser automation via Ollama (phi3:mini)
 * Requires: puppeteer + Ollama running locally (ollama run phi3:mini)
 *
 * Changes from v3:
 *  - Switched default model to phi3:mini (smaller, faster, runs on much less RAM)
 *  - LLM planner/interpreter are now actually wired up (were dead code before)
 *  - phi3:mini is much less reliable at strict JSON output than llama3, so the
 *    planner now: keeps prompts short, lowers max_tokens, validates+repairs
 *    output, and does one corrective re-prompt before falling back to the
 *    heuristic parser
 *  - Fixed page.$x() — removed from modern Puppeteer; replaced with the
 *    `::-p-xpath()` selector form
 *  - Added timeouts on every Ollama call (a hung Ollama no longer hangs forever)
 *  - Added optional streaming for Q&A/interpretation calls
 *  - Fixed evaluate-action semantics (was passing a string-returning function
 *    into page.evaluate, not actually running the expression in-page)
 *  - Screenshot/session dirs now resolve relative to the script, not cwd
 *  - Added package.json so the puppeteer version (and thus the Puppeteer API
 *    surface) is pinned instead of "whatever npm install grabs today"
 *
 * Features:
 *  - phi3:mini plans automation steps from natural language (via Ollama REST API)
 *  - phi3:mini interprets extracted page data to answer questions / summarize
 *  - Falls back to built-in heuristic parser if Ollama is unreachable or
 *    returns unparseable output (after one repair attempt)
 *  - TF-IDF extractive summarization (offline fallback, also used if the LLM
 *    answer call fails)
 *  - Retry with exponential backoff
 *  - XPath clicking via modern Puppeteer selector syntax (no broken :contains())
 *  - Session persistence (cookies + localStorage)
 *  - Parallel multi-tab execution
 *  - Plugin architecture
 *  - 15 action types
 *  - Full programmatic API + rich CLI
 */

'use strict';

const puppeteer    = require('puppeteer');
const fs           = require('fs');
const path         = require('path');
const { execSync } = require('child_process');

// ─── Config ───────────────────────────────────────────────────────────────────

const DEFAULT_URL     = 'https://example.com';
const DEFAULT_RETRIES = 3;
const DEFAULT_TIMEOUT = 30_000;

// Resolve data dirs relative to THIS file, not the caller's cwd, so running
// `node /some/other/dir/index.js` doesn't scatter folders wherever you happen
// to be standing.
const SCREENSHOT_DIR  = path.join(__dirname, 'screenshots');
const SESSION_DIR     = path.join(__dirname, 'sessions');

const OLLAMA_URL      = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL    = process.env.OLLAMA_MODEL || 'phi3:mini';

// phi3:mini is a small model — keep prompts lean and ask for less output.
// These are intentionally smaller than you'd use for a bigger model like llama3.
const OLLAMA_PLAN_MAX_TOKENS   = 700;
const OLLAMA_ANSWER_MAX_TOKENS = 350;
const OLLAMA_TIMEOUT_MS        = parseInt(process.env.OLLAMA_TIMEOUT_MS, 10) || 20_000;

// ─── Utilities ────────────────────────────────────────────────────────────────

function normalizeText(text) {
  return text.replace(/\s+/g, ' ').replace(/\u00A0/g, ' ').trim();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getChromeExecutablePath() {
  const env = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_EXECUTABLE || process.env.CHROME_BIN;
  if (env) return env;
  for (const name of ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser']) {
    try {
      const p = execSync(`command -v ${name}`, { encoding: 'utf8' }).trim();
      if (p) return p;
    } catch { /* not found */ }
  }
  return null;
}

async function withRetry(fn, attempts = DEFAULT_RETRIES, label = 'op') {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try { return await fn(); } catch (err) {
      lastErr = err;
      const wait = 300 * 2 ** (i - 1);
      console.warn(`  [retry] ${label} attempt ${i}/${attempts}: ${err.message} — waiting ${wait}ms`);
      await sleep(wait);
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${lastErr?.message}`);
}

function makeLaunchOptions(opts = {}) {
  const executablePath = getChromeExecutablePath();
  const o = {
    headless: opts.headless !== false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', ...(opts.args || [])],
  };
  if (executablePath) o.executablePath = executablePath;
  return o;
}

// ─── Text Analysis ────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'the','and','for','that','this','with','from','have','has','was','were','are',
  'not','but','you','your','they','their','will','can','would','should','there',
  'what','when','which','where','how','all','any','one','about','been','also',
  'more','its','into','than','them','these','those','such','most','just','each',
  'over','after','before','between','through','during','without','within','along',
  'http','https','www','com','org','net','html','css','php',
]);

function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(
    (w) => w.length > 2 && !STOPWORDS.has(w)
  );
}

function splitSentences(text) {
  return (
    text.match(/[^.!?\n]+[.!?\n]+(?:\s|$)|[^.!?\n]+$/g)
      ?.map((s) => s.trim())
      .filter((s) => s.length > 20) || []
  );
}

/**
 * TF-IDF extractive summarizer.
 * Scores sentences by how many high-value (rare-but-present) words they contain,
 * with a positional bias toward earlier sentences.
 */
function summarize(text, maxSentences = 5) {
  const cleaned   = normalizeText(text);
  if (!cleaned)   return 'No text found.';

  const sentences = splitSentences(cleaned);
  if (sentences.length <= maxSentences) return cleaned;

  // Term frequency across full doc
  const allWords = tokenize(cleaned);
  const tf = allWords.reduce((m, w) => { m[w] = (m[w] || 0) + 1; return m; }, {});

  // Inverse sentence frequency (IDF-like: words in fewer sentences score higher)
  const sf = {};
  sentences.forEach((s) => {
    new Set(tokenize(s)).forEach((w) => { sf[w] = (sf[w] || 0) + 1; });
  });

  const score = (sentence, idx) => {
    const words  = tokenize(sentence);
    const tfidf  = words.reduce((sum, w) => sum + (tf[w] || 0) / (sf[w] || 1), 0);
    const norm   = tfidf / (words.length || 1);
    const posBias = idx === 0 ? 1.4 : idx < 3 ? 1.1 : 1.0; // first sentences usually matter most
    return norm * posBias;
  };

  const scored = sentences
    .map((s, i) => ({ s, score: score(s, i), i }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.i - b.i); // restore original order

  return scored.map((x) => x.s).join(' ');
}

/**
 * Extract key terms from text (top N by TF-IDF score).
 */
function extractKeyTerms(text, n = 10) {
  const words  = tokenize(normalizeText(text));
  const tf     = words.reduce((m, w) => { m[w] = (m[w] || 0) + 1; return m; }, {});
  return Object.entries(tf)
    .filter(([w]) => w.length > 3)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([word, count]) => ({ word, count }));
}

/**
 * Extract links from extracted data.
 */
function extractLinksFromText(text) {
  const matches = text.match(/https?:\/\/[^\s"'<>]+/g) || [];
  return [...new Set(matches)];
}

/** AbortSignal.timeout polyfill-safe wrapper (works on Node 17.3+, which is our floor anyway). */
function timeoutSignal(ms) {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

// ─── Ollama Client ────────────────────────────────────────────────────────────
//
// phi3:mini is small and fast, which is great, but it's noticeably less
// disciplined than llama3 about following "JSON only, no commentary"
// instructions — it'll often add a stray sentence before or after the JSON,
// or wrap it in markdown fences anyway. Everything here is built around that
// reality: short prompts, low max_tokens, tolerant extraction, and exactly
// one corrective re-prompt before giving up and falling back to the
// heuristic parser.

/**
 * Call Ollama's /api/chat endpoint with a system + user message.
 * Always has a hard timeout — a hung/overloaded Ollama instance will no
 * longer hang the entire program.
 *
 * @param {boolean} stream - if true, calls onToken(chunk) as text arrives
 *   and resolves with the full concatenated text at the end. If false,
 *   resolves with the full text in one shot (default, simplest path).
 */
async function ollamaChat(system, user, {
  temperature = 0.1,
  maxTokens   = 512,
  timeoutMs   = OLLAMA_TIMEOUT_MS,
  stream      = false,
  onToken     = null,
} = {}) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    signal:  timeoutSignal(timeoutMs),
    body: JSON.stringify({
      model:  OLLAMA_MODEL,
      stream,
      options: { temperature, num_predict: maxTokens },
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: user   },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Ollama HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  if (!stream) {
    const data = await res.json();
    return data.message?.content?.trim() ?? '';
  }

  // Streaming mode: Ollama sends newline-delimited JSON objects, one per token chunk.
  let full = '';
  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop(); // last line may be incomplete
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const chunk = JSON.parse(line);
        const piece = chunk.message?.content ?? '';
        if (piece) {
          full += piece;
          if (onToken) onToken(piece);
        }
      } catch { /* ignore malformed partial line */ }
    }
  }
  return full.trim();
}

/**
 * Check whether Ollama is running and the configured model is available.
 * Tag-aware: "phi3:mini" matches a tag list entry of "phi3:mini" exactly,
 * and also matches "phi3" if the user only configured the base name.
 */
async function ollamaAvailable() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: timeoutSignal(2500) });
    if (!res.ok) return false;
    const { models = [] } = await res.json();
    const wanted = OLLAMA_MODEL.toLowerCase();
    const wantedBase = wanted.split(':')[0];
    return models.some((m) => {
      const name = (m.name || m.model || '').toLowerCase();
      return name === wanted || name.split(':')[0] === wantedBase;
    });
  } catch {
    return false;
  }
}

/**
 * Pull the first balanced top-level JSON array out of a string, tolerating
 * markdown fences, leading/trailing commentary, and trailing commas — all
 * things phi3:mini does fairly often despite being told not to.
 */
function extractJsonArray(raw) {
  if (!raw) return null;
  let text = raw.trim();

  // Strip markdown fences if present, anywhere in the string.
  text = text.replace(/```(?:json)?/gi, '');

  const start = text.indexOf('[');
  if (start === -1) return null;

  // Walk forward tracking bracket depth (respecting strings) to find the
  // matching close bracket, rather than relying on a greedy regex that can
  // overshoot past trailing prose containing other brackets.
  let depth = 0, inStr = false, strChar = '', end = -1;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === strChar) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") { inStr = true; strChar = c; continue; }
    if (c === '[') depth++;
    if (c === ']') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) return null;

  let candidate = text.slice(start, end + 1);
  // Trailing-comma cleanup: phi3:mini sometimes leaves `, ]` or `, }`.
  candidate = candidate.replace(/,(\s*[\]}])/g, '$1');

  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

/**
 * Ask the model to convert a natural language prompt into a JSON step array.
 * Tries once, and if parsing fails, sends ONE corrective re-prompt showing
 * the model its own broken output and asking it to fix just the JSON.
 * Returns parsed array, or null if both attempts fail (caller falls back to
 * the heuristic parser).
 */
async function planStepsWithLlama(prompt, context = {}) {
  const system = `You convert browser automation instructions into a JSON array of steps.
Output ONLY the JSON array. No explanation. No markdown fences. No extra text before or after.

Step shapes (use exactly these):
{"action":"navigate","url":"..."}
{"action":"click","selector":"..."}
{"action":"xpathClick","expression":"..."}
{"action":"type","selector":"...","text":"...","clear":true}
{"action":"select","selector":"...","value":"..."}
{"action":"pressKey","key":"Enter"}
{"action":"hover","selector":"..."}
{"action":"scroll","selector":"window"}
{"action":"waitForSelector","selector":"...","timeout":5000}
{"action":"waitForNavigation"}
{"action":"wait","ms":1000}
{"action":"extract","selector":"...","as":"key","multiple":true}
{"action":"extractText","as":"key"}
{"action":"screenshot","filename":"name.png","fullPage":true}

Rules:
- Never use :contains() in CSS. Use xpathClick with an XPath expression for text-based clicks.
- Always waitForSelector before clicking or typing.
- Google search: navigate to https://www.google.com, waitForSelector textarea[name=q], type the query, pressKey Enter, waitForNavigation, then extract results.
- Mark optional steps with "required": false.
Context: ${JSON.stringify(context).slice(0, 300)}`;

  // phi3:mini does better with a short, blunt nudge than a long system prompt
  // restated every time, so keep the user turn itself minimal.
  const attempt = async (userMsg) => {
    const raw = await ollamaChat(system, userMsg, {
      temperature: 0.05,
      maxTokens: OLLAMA_PLAN_MAX_TOKENS,
    });
    return { raw, parsed: extractJsonArray(raw) };
  };

  try {
    const first = await attempt(prompt);
    if (Array.isArray(first.parsed)) return first.parsed;

    console.warn('  [ollama] first plan response was not valid JSON — sending one corrective re-prompt');
    const repairUser =
      `Your previous output could not be parsed as JSON. Output ONLY a valid JSON array, nothing else.\n` +
      `Instruction: ${prompt}\n` +
      `Your previous (broken) output was:\n${first.raw.slice(0, 500)}`;
    const second = await attempt(repairUser);
    if (Array.isArray(second.parsed)) return second.parsed;

    console.warn('  [ollama] corrective re-prompt also failed — falling back to heuristic parser');
    return null;
  } catch (err) {
    console.warn(`  [ollama] planSteps failed: ${err.message} — falling back to heuristic parser`);
    return null;
  }
}

/**
 * Ask the model to interpret extracted page data and answer a question.
 * Returns null on failure — caller falls back to TF-IDF keyword matching.
 * Supports streaming via onToken for interactive CLI use.
 */
async function interpretWithLlama(question, data, { stream = false, onToken = null } = {}) {
  // phi3:mini has a much smaller effective context than llama3 — trim harder.
  const trimmed = JSON.stringify(data).slice(0, 3000);
  const system  = 'Answer the question using only the page data given. Be concise (2-4 sentences). If the answer is not in the data, say so plainly.';
  const user    = `Page data:\n${trimmed}\n\nQuestion: ${question}`;
  try {
    return await ollamaChat(system, user, {
      temperature: 0.2,
      maxTokens: OLLAMA_ANSWER_MAX_TOKENS,
      stream,
      onToken,
    });
  } catch (err) {
    console.warn(`  [ollama] interpret failed: ${err.message} — falling back to keyword match`);
    return null;
  }
}

// ─── Natural Language → Steps Parser (heuristic, offline fallback) ──────────
//
// Parses freeform instructions into a structured step list without any LLM.
// This is the safety net used when Ollama is unreachable, the model returns
// unparseable output twice in a row, or the caller explicitly asks for
// offline-only planning (`useLlm: false`).

const INTENT_PATTERNS = [
  // Navigation
  { intent: 'navigate',   re: /(?:go to|open|visit|navigate to|load)\s+(\S+)/i },
  { intent: 'navigate',   re: /^(https?:\/\/\S+)/i },

  // Search
  { intent: 'search',     re: /search(?:\s+(?:for|about|on\s+\S+\s+(?:for|about)?))?\s+"?([^"]+?)"?\s*$/i },
  { intent: 'search',     re: /(?:look up|find|google|search)\s+"?([^"]+?)"?\s*(?:on\s+\S+)?$/i },

  // Login
  { intent: 'login',      re: /(?:log\s?in|sign\s?in)(?:\s+(?:to|with))?\s*(\S+)?/i },

  // Click
  { intent: 'click',      re: /click(?:\s+on)?\s+(?:the\s+)?"?([^"]+?)"?(?:\s+(?:button|link|tab))?$/i },

  // Type
  { intent: 'type',       re: /type\s+"([^"]+)"\s+(?:in(?:to)?|at)\s+([^\s,]+)/i },
  { intent: 'type',       re: /(?:enter|fill(?:\s+in)?)\s+"([^"]+)"\s+(?:in(?:to)?|at)\s+([^\s,]+)/i },

  // Extract
  { intent: 'extract',    re: /(?:get|grab|extract|read|scrape|fetch)\s+(?:the\s+)?(?:all\s+)?([a-z\s,]+?)(?:\s+from\s+\S+)?$/i },

  // Screenshot
  { intent: 'screenshot', re: /(?:take\s+(?:a\s+)?)?screenshot|capture\s+(?:the\s+)?(?:page|screen)/i },

  // Summarize
  { intent: 'summarize',  re: /summarize|summary|overview|tldr/i },

  // Scroll
  { intent: 'scroll',     re: /scroll\s+(?:down|to\s+(?:the\s+)?bottom|up)/i },

  // Wait
  { intent: 'wait',       re: /wait\s+(?:for\s+)?(\d+)\s*(?:seconds?|ms|milliseconds?)/i },
];

function inferUrl(text) {
  const explicit = text.match(/https?:\/\/[^\s]+/i);
  if (explicit) return explicit[0];

  // "search on google for X" → google
  const engineMatch = text.match(/(?:search|look up|find|google)\s+on\s+([a-z0-9.-]+)/i)
    || text.match(/on\s+(google|bing|duckduckgo|yahoo|reddit|github|youtube|amazon|twitter|x\.com)\b/i);
  if (engineMatch) {
    const engines = {
      google: 'https://www.google.com',
      bing: 'https://www.bing.com',
      duckduckgo: 'https://www.duckduckgo.com',
      yahoo: 'https://www.yahoo.com',
      reddit: 'https://www.reddit.com',
      github: 'https://github.com',
      youtube: 'https://www.youtube.com',
      amazon: 'https://www.amazon.com',
      twitter: 'https://www.twitter.com',
      'x.com': 'https://www.x.com',
    };
    const name = engineMatch[1].toLowerCase();
    if (engines[name]) return engines[name];
    return `https://www.${name}.com`;
  }

  // bare domain
  const domain = text.match(/\b([a-z0-9-]+\.(com|org|net|io|co|dev|ai))\b/i);
  if (domain) return `https://${domain[1]}`;

  return null;
}

function extractSearchQuery(text) {
  const patterns = [
    /search(?:\s+(?:on\s+\S+\s+)?(?:for|about))?\s+"([^"]+)"/i,
    /search(?:\s+(?:on\s+\S+\s+)?(?:for|about))?\s+(.+?)(?:\s+on\s+\S+)?$/i,
    /(?:look up|google|find)\s+"?([^"]+?)"?\s*(?:on\s+\S+)?$/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1].trim().replace(/['"]/g, '');
  }
  return null;
}

function extractSelectorTarget(text) {
  const headings = /h[1-6]s?|headings?|titles?/i.test(text);
  const links    = /links?|anchors?|hrefs?/i.test(text);
  const images   = /images?|imgs?|photos?/i.test(text);
  const prices   = /prices?|costs?|amounts?/i.test(text);
  const list     = /lists?|items?|results?/i.test(text);
  const para     = /paragraphs?|text|content|body/i.test(text);

  if (headings) return { selector: 'h1, h2, h3', multiple: true };
  if (prices)   return { selector: '[class*="price"], [id*="price"], .price, #price', multiple: true };
  if (links)    return { selector: 'a[href]', multiple: true };
  if (images)   return { selector: 'img[src]', multiple: true };
  if (list)     return { selector: 'li, [class*="item"], [class*="result"]', multiple: true };
  if (para)     return { selector: 'p', multiple: true };
  return null;
}

function parsePromptToSteps(prompt) {
  const steps = [];
  const lower = prompt.toLowerCase();
  const url   = inferUrl(prompt);

  if (url) {
    steps.push({ action: 'navigate', url });
  }

  const searchQuery = extractSearchQuery(prompt);
  if (searchQuery) {
    const engineUrl = url || 'https://www.google.com';
    if (!url) steps.unshift({ action: 'navigate', url: engineUrl });

    const isGoogle  = /google/.test(engineUrl);
    const isDDG     = /duckduckgo/.test(engineUrl);
    const isBing    = /bing/.test(engineUrl);
    const isYoutube = /youtube/.test(engineUrl);

    const inputSel  = isYoutube ? 'input#search' : isDDG ? 'input[name=q]' : 'input[name=q], input[type=search], textarea[name=q]';

    steps.push({ action: 'waitForSelector', selector: inputSel.split(',')[0].trim(), timeout: 8000 });
    steps.push({ action: 'click', selector: inputSel.split(',')[0].trim() });
    steps.push({ action: 'type', selector: inputSel.split(',')[0].trim(), text: searchQuery, clear: true });
    steps.push({ action: 'pressKey', key: 'Enter' });
    steps.push({ action: 'waitForNavigation', timeout: 10000 });
    steps.push({ action: 'extractText', as: 'searchResults' });
    steps.push({ action: 'extract', selector: 'h3, [class*="result"] h2, [class*="result"] h3', as: 'resultTitles', multiple: true });
  }

  if (/log\s?in|sign\s?in/.test(lower)) {
    const emailMatch = prompt.match(/(?:email|user(?:name)?)\s+(\S+@\S+|\S+)/i);
    const passMatch  = prompt.match(/(?:password|pass)\s+(\S+)/i);
    steps.push({ action: 'waitForSelector', selector: 'input[type=email], input[name=email], input[name=username], #email, #username', timeout: 5000 });
    steps.push({ action: 'type', selector: 'input[type=email], input[name=email], #email', text: emailMatch?.[1] || 'YOUR_EMAIL', clear: true });
    steps.push({ action: 'type', selector: 'input[type=password], #password', text: passMatch?.[1] || 'YOUR_PASSWORD', clear: true });
    steps.push({ action: 'click', selector: 'button[type=submit], input[type=submit]' });
    steps.push({ action: 'waitForNavigation', timeout: 10000 });
  }

  if (/\bclick\b/.test(lower) && !searchQuery && !/log\s?in|sign\s?in/.test(lower)) {
    const clickMatch = prompt.match(/click(?:\s+on)?\s+(?:the\s+)?"?([^"]+?)"?(?:\s+(?:button|link|tab))?$/i);
    if (clickMatch) {
      const target = clickMatch[1].trim();
      steps.push({
        action:     'xpathClick',
        expression: `//*[self::a or self::button or self::input][ contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'), '${target.toLowerCase()}') ]`,
        description: `click "${target}"`,
        required:   false,
      });
    }
  }

  if (/\b(?:get|grab|extract|scrape|read|fetch|list)\b/.test(lower) && !searchQuery) {
    const target = extractSelectorTarget(prompt);
    if (target) {
      steps.push({ action: 'extract', selector: target.selector, as: 'extracted', multiple: target.multiple });
    } else {
      steps.push({ action: 'extractText', as: 'pageText' });
    }
  }

  if (/\b(?:summarize|summary|overview|tldr)\b/.test(lower)) {
    steps.push({ action: 'extractText', as: 'pageText' });
  }

  if (/screenshot|capture/.test(lower)) {
    steps.push({ action: 'screenshot', filename: `capture-${Date.now()}.png`, fullPage: true });
  }

  if (/scroll\s+down|scroll\s+to\s+bottom/.test(lower)) {
    steps.push({ action: 'scroll', selector: 'window' });
  }

  const waitMatch   = prompt.match(/wait\s+(?:for\s+)?(\d+)\s*(?:seconds?|s\b)/i);
  const waitMsMatch = prompt.match(/wait\s+(?:for\s+)?(\d+)\s*(?:ms|milliseconds?)/i);
  if (waitMatch)   steps.push({ action: 'wait', ms: parseInt(waitMatch[1], 10) * 1000 });
  if (waitMsMatch) steps.push({ action: 'wait', ms: parseInt(waitMsMatch[1], 10) });

  const hasDataStep = steps.some((s) => ['extract', 'extractText', 'screenshot'].includes(s.action));
  if (url && !hasDataStep) {
    steps.push({ action: 'extractText', as: 'pageText' });
  }

  if (steps.length === 0) {
    steps.push({ action: 'navigate', url: DEFAULT_URL });
    steps.push({ action: 'extractText', as: 'pageText' });
  }

  return steps;
}

/**
 * Decide how to plan steps for a prompt: try the LLM first (unless disabled
 * or Ollama is unreachable), fall back to the heuristic parser otherwise.
 * This is the piece that was completely unused in the original script —
 * planStepsWithLlama existed but nothing ever called it.
 */
async function planSteps(prompt, { useLlm = true, context = {} } = {}) {
  if (useLlm && (await ollamaAvailable())) {
    const llmSteps = await planStepsWithLlama(prompt, context);
    if (llmSteps && llmSteps.length) return { steps: llmSteps, source: 'llm' };
    console.warn('  [plan] LLM planning unavailable/failed — using heuristic parser');
  }
  return { steps: parsePromptToSteps(prompt), source: 'heuristic' };
}

// ─── Session Manager ──────────────────────────────────────────────────────────

class SessionManager {
  constructor(sessionId) {
    this.id   = sessionId || null;
    this.file = sessionId ? path.join(SESSION_DIR, `${sessionId}.json`) : null;
  }

  async load(page) {
    if (!this.file || !fs.existsSync(this.file)) return;
    try {
      const { cookies = [], localStorage: ls = {} } = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (cookies.length) await page.setCookie(...cookies);
      if (Object.keys(ls).length) {
        await page.evaluate((store) => {
          for (const [k, v] of Object.entries(store)) localStorage.setItem(k, v);
        }, ls);
      }
      console.log(`  [session] Loaded: ${this.id}`);
    } catch (err) {
      console.warn(`  [session] Load failed: ${err.message}`);
    }
  }

  async save(page) {
    if (!this.file) return;
    try {
      ensureDir(SESSION_DIR);
      const cookies = await page.cookies();
      let localStorage = {};
      try {
        localStorage = await page.evaluate(() => {
          const s = {};
          for (let i = 0; i < window.localStorage.length; i++) {
            const k = window.localStorage.key(i);
            s[k] = window.localStorage.getItem(k);
          }
          return s;
        });
      } catch { /* some pages block this */ }
      fs.writeFileSync(this.file, JSON.stringify({ cookies, localStorage }, null, 2));
      console.log(`  [session] Saved: ${this.id}`);
    } catch (err) {
      console.warn(`  [session] Save failed: ${err.message}`);
    }
  }
}

// ─── Plugin Registry ──────────────────────────────────────────────────────────

const _plugins = {};

function registerPlugin(name, handler) {
  _plugins[name] = handler;
}

// ─── Step Executor ────────────────────────────────────────────────────────────

async function executeSteps(steps, options = {}) {
  const {
    headless  = true,
    sessionId = null,
    retries   = DEFAULT_RETRIES,
    timeout   = DEFAULT_TIMEOUT,
    viewport  = { width: 1280, height: 800 },
  } = options;

  ensureDir(SCREENSHOT_DIR);

  const browser = await puppeteer.launch(makeLaunchOptions({ headless }));
  const page    = await browser.newPage();
  await page.setViewport(viewport);
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  );

  const session       = new SessionManager(sessionId);
  const results       = [];
  const extractedData = {};

  page.on('pageerror', (err) => console.warn('  [page error]', err.message));

  try {
    for (let i = 0; i < steps.length; i++) {
      const step       = steps[i];
      const { action } = step;
      const loc         = step.selector || step.url || step.expression || step.text || '';
      const label       = `step[${i}] ${action}`;

      console.log(`[exec] ${label}${loc ? ' → ' + loc : ''}`);

      try {
        if (action === 'navigate') {
          await withRetry(() => page.goto(step.url, { waitUntil: 'domcontentloaded', timeout }), retries, label);
          await session.load(page);
          results.push({ step: i, action, url: step.url, status: 'ok' });

        } else if (action === 'click') {
          const selectors = step.selector.split(',').map((s) => s.trim());
          let clicked = false;
          for (const sel of selectors) {
            try {
              await page.waitForSelector(sel, { timeout: 3000 });
              await page.click(sel);
              clicked = true;
              break;
            } catch { /* try next */ }
          }
          if (!clicked) throw new Error(`None of these selectors found: ${step.selector}`);
          results.push({ step: i, action, selector: step.selector, status: 'ok' });

        } else if (action === 'xpathClick') {
          // page.$x() was removed in modern Puppeteer (v22+). The supported
          // replacement is the `::-p-xpath()` pseudo-selector, used through
          // the normal $$ / waitForSelector API.
          await withRetry(async () => {
            const xpathSelector = `::-p-xpath(${step.expression})`;
            const el = await page.waitForSelector(xpathSelector, { timeout: step.timeout || 5000 });
            if (!el) throw new Error(`XPath not found: ${step.expression}`);
            await el.click();
          }, retries, label);
          results.push({ step: i, action, expression: step.expression, status: 'ok' });

        } else if (action === 'type') {
          const selectors = step.selector.split(',').map((s) => s.trim());
          let typed = false;
          for (const sel of selectors) {
            try {
              await page.waitForSelector(sel, { timeout: 3000 });
              if (step.clear !== false) {
                await page.click(sel, { clickCount: 3 });
                await page.keyboard.press('Backspace');
              }
              await page.type(sel, step.text || '', { delay: 20 });
              typed = true;
              break;
            } catch { /* try next */ }
          }
          if (!typed) throw new Error(`Could not type into: ${step.selector}`);
          results.push({ step: i, action, selector: step.selector, text: step.text, status: 'ok' });

        } else if (action === 'select') {
          await page.waitForSelector(step.selector, { timeout: 5000 });
          await page.select(step.selector, step.value);
          results.push({ step: i, action, selector: step.selector, value: step.value, status: 'ok' });

        } else if (action === 'pressKey') {
          await page.keyboard.press(step.key);
          results.push({ step: i, action, key: step.key, status: 'ok' });

        } else if (action === 'hover') {
          await page.waitForSelector(step.selector, { timeout: 5000 });
          await page.hover(step.selector);
          results.push({ step: i, action, selector: step.selector, status: 'ok' });

        } else if (action === 'focus') {
          await page.waitForSelector(step.selector, { timeout: 5000 });
          await page.focus(step.selector);
          results.push({ step: i, action, selector: step.selector, status: 'ok' });

        } else if (action === 'scroll') {
          if (step.selector && step.selector !== 'window') {
            await page.$eval(step.selector, (el) => el.scrollIntoView());
          } else {
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          }
          results.push({ step: i, action, status: 'ok' });

        } else if (action === 'waitForSelector') {
          const selectors = step.selector.split(',').map((s) => s.trim());
          let found = false;
          for (const sel of selectors) {
            try {
              await page.waitForSelector(sel, { timeout: step.timeout || 5000 });
              found = true;
              break;
            } catch { /* try next */ }
          }
          if (!found) throw new Error(`None found: ${step.selector}`);
          results.push({ step: i, action, selector: step.selector, status: 'ok' });

        } else if (action === 'waitForText') {
          await page.waitForFunction(
            (t) => document.body.innerText.includes(t),
            { timeout: step.timeout || timeout },
            step.text
          );
          results.push({ step: i, action, text: step.text, status: 'ok' });

        } else if (action === 'waitForNavigation') {
          await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: step.timeout || timeout })
            .catch(() => { /* navigation may have already finished */ });
          results.push({ step: i, action, status: 'ok' });

        } else if (action === 'wait') {
          await sleep(step.ms || 1000);
          results.push({ step: i, action, ms: step.ms, status: 'ok' });

        } else if (action === 'extract') {
          const key = step.as || `extract_${i}`;
          let value;
          if (step.multiple) {
            value = await page.$$eval(
              step.selector,
              (els) => els.map((e) => e.innerText?.trim() || e.getAttribute?.('href') || e.getAttribute?.('src')).filter(Boolean)
            );
          } else {
            value = await page.$eval(step.selector, (e) => e.innerText?.trim()).catch(() => null);
          }
          extractedData[key] = value;
          results.push({ step: i, action, selector: step.selector, as: key, value, status: 'ok' });

        } else if (action === 'extractText') {
          const key   = step.as || `text_${i}`;
          const value = await page.evaluate(() => {
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
              acceptNode(node) {
                const tag  = node.parentElement?.tagName;
                const text = node.nodeValue?.trim();
                if (!text) return NodeFilter.FILTER_REJECT;
                if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'NAV', 'FORM'].includes(tag))
                  return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
              },
            });
            let out = '';
            while (walker.nextNode()) out += walker.currentNode.nodeValue.trim() + ' ';
            return out.replace(/\s+/g, ' ').trim();
          });
          extractedData[key] = normalizeText(value);
          results.push({ step: i, action, as: key, chars: value.length, status: 'ok' });

        } else if (action === 'evaluate') {
          // Original code built `new Function('return (' + script + ')')`
          // and passed that FUNCTION REFERENCE into page.evaluate(fn). That
          // mostly worked by accident for plain expressions, but
          // page.evaluate serializes the function and runs it in-page —
          // wrapping arbitrary script text in `return (...)` does not
          // reliably round-trip for multi-statement scripts. Using
          // page.evaluate with a *string* argument tells Puppeteer to eval
          // it directly in the page context, which is what's actually
          // wanted here, and is unambiguous about scope.
          const value = await page.evaluate(step.script);
          const key   = step.as || `eval_${i}`;
          extractedData[key] = value;
          results.push({ step: i, action, as: key, value, status: 'ok' });

        } else if (action === 'screenshot') {
          const filename = step.filename || `screenshot-${Date.now()}.png`;
          const filepath = path.join(SCREENSHOT_DIR, filename);
          await page.screenshot({ path: filepath, fullPage: step.fullPage !== false });
          results.push({ step: i, action, path: filepath, status: 'ok' });

        } else if (action === 'saveSession') {
          await new SessionManager(step.sessionId).save(page);
          results.push({ step: i, action, sessionId: step.sessionId, status: 'ok' });

        } else if (_plugins[action]) {
          const pluginResult = await _plugins[action](page, step, extractedData);
          results.push({ step: i, action, ...pluginResult, status: 'ok' });

        } else {
          results.push({ step: i, action, status: 'unknown_action' });
        }

      } catch (err) {
        console.error(`  [error] ${label}: ${err.message}`);
        results.push({ step: i, action, status: 'error', error: err.message });
        if (step.required !== false) break;
      }
    }
  } finally {
    await browser.close();
  }

  return { results, extractedData };
}

// ─── Parallel Execution ───────────────────────────────────────────────────────

async function executeParallel(taskList, options = {}) {
  const settled = await Promise.allSettled(
    taskList.map((task) => executeSteps(task.steps, { ...options, ...task.options }))
  );
  return settled.map((r, i) => ({
    task:   i,
    status: r.status,
    value:  r.value,
    error:  r.reason?.message,
  }));
}

// ─── PuppetAI High-Level API ──────────────────────────────────────────────────

class PuppetAI {
  /**
   * Run a natural-language instruction end to end.
   * Tries the LLM planner (phi3:mini) first, falls back to the heuristic
   * parser automatically. Pass { useLlm: false } to skip the LLM entirely.
   */
  async run(prompt, options = {}) {
    console.log(`\n[PuppetAI] Parsing: "${prompt}"`);
    const { steps, source } = await planSteps(prompt, {
      useLlm:  options.useLlm !== false,
      context: options.context || {},
    });
    console.log(`[PuppetAI] ${steps.length} steps planned (source: ${source}).\n`);
    const { results, extractedData } = await executeSteps(steps, options);
    return {
      prompt, steps, source, results, extractedData,
      success: results.every((r) => r.status !== 'error'),
    };
  }

  async summarize(url, options = {}) {
    const steps = [
      { action: 'navigate', url },
      { action: 'extractText', as: 'pageText' },
    ];
    const { results, extractedData } = await executeSteps(steps, options);
    const raw = extractedData.pageText || '';

    // Prefer the LLM summary when available; TF-IDF is the offline fallback.
    let summary = null;
    let viaLlm  = false;
    if (options.useLlm !== false) {
      summary = await interpretWithLlama('Summarize this page in 2-4 sentences.', { pageText: raw });
      viaLlm  = !!summary;
    }
    if (!summary) summary = summarize(raw, options.maxSentences || 5);

    const terms = extractKeyTerms(raw, 8);
    return { url, summary, viaLlm, keyTerms: terms, charCount: raw.length, results };
  }

  async ask(url, question, options = {}) {
    const steps = [
      { action: 'navigate', url },
      { action: 'extractText', as: 'pageText' },
    ];
    const { results, extractedData } = await executeSteps(steps, options);
    const text = extractedData.pageText || '';

    // Prefer the LLM's actual reading comprehension; fall back to naive
    // keyword-overlap sentence matching if Ollama isn't available.
    let answer = null;
    let viaLlm = false;
    if (options.useLlm !== false) {
      answer = await interpretWithLlama(question, { pageText: text }, {
        stream:  !!options.stream,
        onToken: options.onToken,
      });
      viaLlm = !!answer;
    }

    if (!answer) {
      const qWords    = tokenize(question);
      const sentences = splitSentences(text);
      const scored    = sentences.map((s) => ({
        s,
        score: qWords.filter((w) => s.toLowerCase().includes(w)).length,
      })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);

      answer = scored.length
        ? scored.slice(0, 3).map((x) => x.s).join(' ')
        : summarize(text, 3);
    }

    return { url, question, answer, viaLlm, results };
  }

  async extract(url, schema, options = {}) {
    const steps = [
      { action: 'navigate', url },
      { action: 'extractText', as: 'pageText' },
      { action: 'extract', selector: 'h1, h2', as: 'headings', multiple: true },
      { action: 'extract', selector: 'a[href]', as: 'links', multiple: true },
      { action: 'evaluate', script: 'document.title', as: 'title' },
      { action: 'evaluate', script: 'document.querySelector("meta[name=description]")?.content || ""', as: 'description' },
    ];
    const { results, extractedData } = await executeSteps(steps, options);
    return { url, schema, data: extractedData, results };
  }

  async parallel(tasks, options = {}) {
    const planned = await Promise.all(tasks.map(async (task) => {
      const prompt = typeof task === 'string' ? task : task.prompt;
      const opts   = typeof task === 'object' ? task.options || {} : {};
      const { steps } = await planSteps(prompt, { useLlm: opts.useLlm !== false });
      return { steps, options: opts };
    }));
    return executeParallel(planned, options);
  }

  use(name, handler) {
    registerPlugin(name, handler);
    return this;
  }
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    console.log(`
PuppetAI v4 — Browser automation, planned by phi3:mini via Ollama,
with an offline heuristic parser as automatic fallback.

Commands:
  run       "<prompt>"           Execute from natural language
  plan      "<prompt>"           Show planned steps without running
  summarize <url>                Summarize a page (LLM, falls back to TF-IDF)
  ask       <url> "<question>"   Answer a question about a page
  extract   <url> "<schema>"     Extract structured data

Options:
  --session <id>    Persist cookies/localStorage
  --headed          Show browser window
  --timeout <ms>    Per-step timeout (default: 30000)
  --output  <file>  Write JSON results to file
  --no-llm          Skip Ollama entirely, use the offline heuristic parser
  --stream          Stream LLM answer tokens to stdout as they arrive (ask only)

Environment:
  OLLAMA_URL         Ollama base URL (default: http://localhost:11434)
  OLLAMA_MODEL       Model name (default: phi3:mini)
  OLLAMA_TIMEOUT_MS  Per-call timeout in ms (default: 20000)

Examples:
  node index.js run "search on google for cats and dogs"
  node index.js run "go to github.com and get all the headings"
  node index.js summarize https://en.wikipedia.org/wiki/Node.js
  node index.js ask https://example.com "What is this page about?" --stream
  node index.js extract https://example.com "title, links, description"
  node index.js plan "click the login button on github.com"
  node index.js run "click signup" --no-llm
`);
    return;
  }

  const options    = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if      (argv[i] === '--session') options.sessionId = argv[++i];
    else if (argv[i] === '--headed')  options.headless  = false;
    else if (argv[i] === '--timeout') options.timeout   = parseInt(argv[++i], 10);
    else if (argv[i] === '--output')  options._out      = argv[++i];
    else if (argv[i] === '--no-llm')  options.useLlm    = false;
    else if (argv[i] === '--stream') {
      options.stream  = true;
      options.onToken = (chunk) => process.stdout.write(chunk);
    }
    else positional.push(argv[i]);
  }

  const [command, ...rest] = positional;
  const ai = new PuppetAI();
  let result;

  if (command === 'plan') {
    const { steps, source } = await planSteps(rest.join(' '), { useLlm: options.useLlm !== false });
    result = { steps, source };
  } else if (command === 'run') {
    result = await ai.run(rest.join(' '), options);
  } else if (command === 'summarize') {
    result = await ai.summarize(rest[0] || DEFAULT_URL, options);
  } else if (command === 'ask') {
    const [url, ...qParts] = rest;
    result = await ai.ask(url, qParts.join(' '), options);
    if (options.stream) process.stdout.write('\n'); // tidy up after streamed tokens
  } else if (command === 'extract') {
    const [url, ...sParts] = rest;
    result = await ai.extract(url, sParts.join(' '), options);
  } else {
    result = await ai.run([command, ...rest].join(' '), options);
  }

  const output = JSON.stringify(result, null, 2);
  if (options._out) {
    fs.writeFileSync(options._out, output);
    console.log(`\n[PuppetAI] Results written to ${options._out}`);
  } else {
    console.log('\n=== PuppetAI Results ===\n');
    console.log(output);
  }
}

// Only run the CLI when this file is executed directly (`node index.js ...`).
// Without this guard, `require('./index.js')` from another script — using
// the "Full programmatic API" the header advertises — would immediately
// launch the CLI's main(), parse process.argv, and likely error out or do
// something unintended. This was a real bug in the original script.
if (require.main === module) {
  main().catch((err) => {
    console.error('\n[PuppetAI] Fatal:', err.message || err);
    process.exit(1);
  });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  PuppetAI,
  parsePromptToSteps,
  planSteps,
  planStepsWithLlama,
  interpretWithLlama,
  ollamaAvailable,
  extractJsonArray,
  executeSteps,
  executeParallel,
  registerPlugin,
  summarize,
  extractKeyTerms,
  extractLinksFromText,
};