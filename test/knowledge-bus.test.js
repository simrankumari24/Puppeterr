const test = require('node:test');
const assert = require('node:assert/strict');

const { createKnowledgeBus } = require('../knowledgeBus');
const { createKnowledgeModules } = require('../knowledgeModules');

test('knowledge bus exposes bounded tools for every registered module', async () => {
  const bus = createKnowledgeBus({
    modules: createKnowledgeModules({
      striderReport: async () => ({
        topMatches: [{ url: 'https://example.com/openai', title: 'OpenAI founders', relevanceScore: 88 }],
        relevantCount: 1,
        totalNodes: 1
      }),
      pageState: async () => ({ url: 'https://example.com', title: 'Example', text: 'page text', links: [], inputs: [], buttons: [] }),
      visionSnapshot: async () => ({ summary: 'ready', signal: { state: 'ready', next_focus: 'content' }, latestUrl: 'https://example.com' }),
      memorySearch: async () => [{ task: 'prior task', result: 'success', url: 'https://example.com' }],
      learningContext: async () => 'known action pattern',
      modelCatalog: async () => [{ id: 'model-a', name: 'Model A', type: 'text', capabilities: ['chat'] }],
      supervisorState: async () => ({ decision: 'ok', score: 0.9, reason: 'stable' })
    })
  });

  const tools = bus.describeTools();
  assert.deepEqual(new Set(tools.map(item => item.target)), new Set([
    'STRIDER', 'PAGE', 'VISION', 'MEMORY', 'LEARNING', 'MODELS', 'SUPERVISOR'
  ]));

  const result = await bus.request({ target: 'PAGE', request: 'state: current page', limit: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.source, 'PAGE');
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].url, 'https://example.com');
});

test('knowledge bus rejects unknown modules and bounds result requests', async () => {
  const bus = createKnowledgeBus({ modules: { TEST: { search: async ({ query, limit }) => ({ confidence: 1, results: [{ query, limit }] }) } } });
  const missing = await bus.request({ target: 'UNKNOWN', request: 'search: secrets' });
  assert.equal(missing.ok, false);

  const bounded = await bus.request({ target: 'TEST', request: 'search: ' + 'x'.repeat(500), limit: 999 });
  assert.equal(bounded.ok, true);
  assert.equal(bounded.results[0].limit, 20);
  assert.equal(bounded.results[0].query.length, 240);
});

test('knowledge adapters tolerate unavailable reports and non-array providers', async () => {
  const bus = createKnowledgeBus({
    modules: createKnowledgeModules({
      striderReport: async () => null,
      memorySearch: async () => null,
      modelCatalog: async () => null
    })
  });

  const strider = await bus.request({ target: 'STRIDER', request: 'search: repository' });
  const memory = await bus.request({ target: 'MEMORY', request: 'search: repository' });
  const models = await bus.request({ target: 'MODELS', request: 'list:' });

  assert.equal(strider.ok, true);
  assert.deepEqual(strider.results, []);
  assert.equal(memory.ok, true);
  assert.deepEqual(memory.results, []);
  assert.equal(models.ok, true);
  assert.deepEqual(models.results, []);
});

test('memory knowledge combines live memory with persisted log history', async () => {
  const bus = createKnowledgeBus({
    modules: createKnowledgeModules({
      memorySearch: async () => [{ task: 'current browser state', result: 'live result' }],
      logSearch: async () => [{ kind: 'task', goal: 'past browser task', completed: true, ts: '2026-01-01T00:00:00.000Z' }]
    })
  });

  const result = await bus.request({ target: 'MEMORY', request: 'search: browser', limit: 2 });
  assert.equal(result.ok, true);
  assert.equal(result.results.length, 2);
  assert.deepEqual(new Set(result.results.map(item => item.source)), new Set(['live-memory', 'log.json']));
  assert.equal(result.results.find(item => item.source === 'log.json').completed, true);
});
