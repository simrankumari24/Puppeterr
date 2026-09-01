const MAX_MODEL_INPUT_CHARS = 30000;
const CAPTCHA_TEXT_SCAN_LIMIT = 6000;

function normalizeTextForModelInput(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function chunkTextForSummary(rawText, chunkSize = 12000) {
  const text = normalizeTextForModelInput(rawText);
  if (!text) return [];
  if (text.length <= chunkSize) return [text];

  const chunks = [];
  let cursor = 0;
  while (cursor < text.length) {
    let end = Math.min(text.length, cursor + chunkSize);
    if (end < text.length) {
      const breakIndexes = [text.lastIndexOf(".", end), text.lastIndexOf("!", end), text.lastIndexOf("?", end), text.lastIndexOf("\n", end), text.lastIndexOf(" ", end)];
      const candidate = breakIndexes.filter(index => index > cursor + Math.max(2000, chunkSize * 0.6)).sort((a, b) => b - a)[0];
      if (typeof candidate === "number" && candidate > cursor) {
        end = candidate + 1;
      }
    }
    const chunk = text.slice(cursor, end).trim();
    if (chunk) chunks.push(chunk);
    cursor = end;
    if (cursor >= text.length) break;
  }

  return chunks.filter(Boolean);
}

function sanitizeTextForCaptchaScan(rawText, maxChars = CAPTCHA_TEXT_SCAN_LIMIT) {
  const text = normalizeTextForModelInput(rawText);
  if (!text) return "";
  if (text.length <= maxChars) return text;

  const head = text.slice(0, Math.floor(maxChars * 0.45));
  const tail = text.slice(-Math.floor(maxChars * 0.45));
  return `${head} … ${tail}`.trim();
}

function chunkTextStructurally(text, maxChunkChars = 8000) {
  const str = String(text || "");
  if (str.length <= maxChunkChars) return str.length ? [str] : [];

  const chunks = [];
  let start = 0;

  while (start < str.length) {
    const hardEnd = Math.min(start + maxChunkChars, str.length);
    if (hardEnd >= str.length) {
      chunks.push(str.slice(start));
      break;
    }

    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    let inLineComment = false;
    let inBlockComment = false;
    let lastSafeBoundary = -1;
    let lastNewline = -1;

    for (let i = start; i < hardEnd; i++) {
      const c = str[i];
      const prev = str[i - 1];

      if (inLineComment) {
        if (c === "\n") inLineComment = false;
        continue;
      }
      if (inBlockComment) {
        if (c === "/" && prev === "*") inBlockComment = false;
        continue;
      }
      if (inSingle) {
        if (c === "'" && prev !== "\\") inSingle = false;
        continue;
      }
      if (inDouble) {
        if (c === '"' && prev !== "\\") inDouble = false;
        continue;
      }
      if (inTemplate) {
        if (c === "`" && prev !== "\\") inTemplate = false;
        continue;
      }

      if (c === "/" && str[i + 1] === "/") {
        inLineComment = true;
        continue;
      }
      if (c === "/" && str[i + 1] === "*") {
        inBlockComment = true;
        continue;
      }
      if (c === "'") {
        inSingle = true;
        continue;
      }
      if (c === '"') {
        inDouble = true;
        continue;
      }
      if (c === "`") {
        inTemplate = true;
        continue;
      }

      if (c === "{" || c === "(" || c === "[") depth += 1;
      else if (c === "}" || c === ")" || c === "]") depth = Math.max(0, depth - 1);

      if (c === "\n") {
        lastNewline = i;
        if (depth === 0) lastSafeBoundary = i;
      }
    }

    let cutAt;
    if (lastSafeBoundary > start) cutAt = lastSafeBoundary + 1;
    else if (lastNewline > start) cutAt = lastNewline + 1;
    else cutAt = hardEnd;

    chunks.push(str.slice(start, cutAt));
    start = cutAt;
  }

  return chunks.filter(Boolean);
}

async function summarizeChunksInParallel(chunks, summarizeFn, concurrency = 4) {
  const results = new Array(chunks.length);
  let cursor = 0;

  async function worker() {
    while (cursor < chunks.length) {
      const i = cursor++;
      try {
        results[i] = await summarizeFn(chunks[i], i, chunks.length);
      } catch (err) {
        results[i] = { error: true, message: err?.message || String(err) };
      }
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, chunks.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function hierarchicalReduce(summaries, mergeFn, { batchSize = 5, concurrency = 4 } = {}) {
  let level = 0;
  let current = summaries.slice();

  while (current.length > 1) {
    level += 1;
    const batches = [];
    for (let i = 0; i < current.length; i += batchSize) {
      batches.push(current.slice(i, i + batchSize));
    }
    current = await summarizeChunksInParallel(
      batches,
      (batch) => mergeFn(batch, level),
      concurrency
    );
    current = current.map((entry) => (entry && entry.error) ? `[merge error: ${entry.message}]` : entry);
  }

  return { finalSummary: current[0] || "", reduceLevels: level };
}

async function summarizeLargeDocument(text, options = {}) {
  const {
    chunkSummarizer,
    mergeSummarizer,
    maxChunkChars = 8000,
    mapConcurrency = 4,
    reduceBatchSize = 5,
    reduceConcurrency = 4
  } = options;

  if (typeof chunkSummarizer !== "function" || typeof mergeSummarizer !== "function") {
    throw new Error("summarizeLargeDocument requires chunkSummarizer and mergeSummarizer functions");
  }

  const chunks = chunkTextStructurally(text, maxChunkChars);
  if (chunks.length === 0) return { finalSummary: "", chunkCount: 0, reduceLevels: 0, chunkErrors: 0 };
  if (chunks.length === 1) {
    const only = await chunkSummarizer(chunks[0], 0, 1);
    return { finalSummary: only, chunkCount: 1, reduceLevels: 0, chunkErrors: 0 };
  }

  const chunkSummaries = await summarizeChunksInParallel(chunks, chunkSummarizer, mapConcurrency);
  const chunkErrors = chunkSummaries.filter((summary) => summary && summary.error).length;
  const cleanSummaries = chunkSummaries.map((summary) => (summary && summary.error) ? `[chunk summarization failed: ${summary.message}]` : summary);

  const { finalSummary, reduceLevels } = await hierarchicalReduce(
    cleanSummaries,
    mergeSummarizer,
    { batchSize: reduceBatchSize, concurrency: reduceConcurrency }
  );

  return { finalSummary, chunkCount: chunks.length, reduceLevels, chunkErrors };
}

module.exports = {
  MAX_MODEL_INPUT_CHARS,
  CAPTCHA_TEXT_SCAN_LIMIT,
  normalizeTextForModelInput,
  chunkTextForSummary,
  sanitizeTextForCaptchaScan,
  chunkTextStructurally,
  summarizeChunksInParallel,
  hierarchicalReduce,
  summarizeLargeDocument
};
