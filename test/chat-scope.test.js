const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveChatWriteUserId, resolveChatIdForWrite } = require('../chat-scope');
const {
  chunkTextForSummary,
  sanitizeTextForCaptchaScan,
  chunkTextStructurally,
  summarizeLargeDocument
} = require('../modelTextUtils');

test('resolveChatWriteUserId prefers the explicit user id', () => {
  assert.equal(resolveChatWriteUserId('user-2', 'user-1'), 'user-2');
});

test('resolveChatWriteUserId falls back to the active task scope', () => {
  assert.equal(resolveChatWriteUserId(null, 'user-1'), 'user-1');
  assert.equal(resolveChatWriteUserId(undefined, 'user-1'), 'user-1');
});

test('resolveChatWriteUserId returns null when no user scope exists', () => {
  assert.equal(resolveChatWriteUserId(null, null), null);
});

test('resolveChatIdForWrite falls back to the active chat when the requested id is missing', () => {
  const store = {
    selectedChatId: 'chat-b',
    chats: [{ id: 'chat-a' }, { id: 'chat-b' }]
  };
  assert.equal(resolveChatIdForWrite('missing-chat', store), 'chat-b');
});

test('resolveChatIdForWrite returns the first chat when the store has no selection', () => {
  const store = { chats: [{ id: 'chat-a' }] };
  assert.equal(resolveChatIdForWrite(null, store), 'chat-a');
});

test('oversized text is chunked for model-safe summary input', () => {
  const huge = 'A '.repeat(60000);
  const chunks = chunkTextForSummary(huge, 12000);
  assert.ok(Array.isArray(chunks));
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(chunk => chunk.length <= 12000 + 1000));
});

test('large page text is sanitized before CAPTCHA heuristic scans', () => {
  const hugeText = 'the quick brown fox '.repeat(9000) + 'verify you are a human';
  const scanned = sanitizeTextForCaptchaScan(hugeText, 6000);
  assert.ok(scanned.length <= 6000 + 200);
  assert.ok(!scanned.includes('verify you are a human') || scanned.includes('verify'));
});

test('structural chunking avoids splitting inside a code block', () => {
  const text = 'const x = {\n hello: "world"\n};\n\nfunction demo() {\n  return 42;\n}\n';
  const chunks = chunkTextStructurally(text, 40);
  assert.ok(chunks.length >= 2);
  assert.ok(chunks.every(chunk => chunk.length > 0));
  assert.ok(chunks.join('').includes('function demo'));
});

test('large document summarization reduces multi-chunk input down to a final summary', async () => {
  const text = Array.from({ length: 50 }, (_, idx) => `Section ${idx + 1}: the agent reviews the page and compiles a research summary.`).join('\n\n');
  const result = await summarizeLargeDocument(text, {
    chunkSummarizer: async (chunk) => chunk.slice(0, 120),
    mergeSummarizer: async (batch) => batch.join(' | '),
    maxChunkChars: 220,
    mapConcurrency: 2,
    reduceBatchSize: 2,
    reduceConcurrency: 2
  });

  assert.ok(result.finalSummary.length > 0);
  assert.ok(result.chunkCount >= 2);
  assert.ok(result.reduceLevels >= 0);
});
