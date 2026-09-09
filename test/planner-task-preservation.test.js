const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadAgentComparisonFns() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'agent.js'), 'utf8');

  const extractFunction = (name) => {
    const start = source.indexOf(`function ${name}`);
    assert.notEqual(start, -1, `missing function: ${name}`);
    const nextStart = source.indexOf('\nfunction ', start + 1);
    const end = nextStart === -1 ? source.length : nextStart;
    return source.slice(start, end);
  };

  const sandbox = {
    console,
    URL,
    String,
    Number,
    Object,
    Array,
    Math,
    RegExp,
    Boolean,
    getHostFromUrl(rawUrl) {
      try {
        return new URL(String(rawUrl || '')).hostname.replace(/^www\./, '');
      } catch {
        return '';
      }
    },
    extractUrlFromText(goalText) {
      const match = String(goalText || '').match(/https?:\/\/[^\s)]+/i);
      if (!match) return null;
      return String(match[0]).replace(/[\]\[)\('"`]+$/g, '').replace(/[.,;!?]+$/g, '');
    },
    buildSearchResultsUrl(queryText, engine = 'google') {
      const q = String(queryText || '').trim();
      if (!q) return engine === 'bing' ? 'https://www.bing.com/' : 'https://www.google.com/';
      if (engine === 'bing') return `https://www.bing.com/search?q=${encodeURIComponent(q)}`;
      return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
    },
    isGoogleSearchResultsUrl(rawUrl) {
      try {
        const parsed = new URL(String(rawUrl || ''));
        const host = parsed.hostname.toLowerCase();
        return (host === 'google.com' || host.endsWith('.google.com')) && parsed.pathname === '/search';
      } catch {
        return false;
      }
    },
    extractSearchQuery(goalText) {
      const g = String(goalText || '');
      const quoted = g.match(/"([^"]{2,120})"/);
      if (quoted) {
        let q = quoted[1].replace(/\s+/g, ' ').trim();
        q = q.split(/\b(?:then|and then|after that|afterwards|next|validate|verify|confirm)\b/i)[0].trim();
        q = q.replace(/\b(?:that|the|this|search|result|results|was|were|is|are|successful)\b\s*$/i, '').trim();
        q = q.replace(/[.,;:!?]+$/g, '').trim();
        return q.split(/\s+/).slice(0, 8).join(' ').trim();
      }
      const matches =
        g.match(/search\s+for\s+([^\n\.]{2,120})/i) ||
        g.match(/\bsearch\s+([^\n\.]{2,120})/i) ||
        g.match(/search\s+up\s+([^\n\.]{2,120})/i) ||
        g.match(/look\s+up\s+([^\n\.]{2,120})/i);
      if (!matches) return null;
      let q = matches[1].replace(/\s+/g, ' ').trim();
      q = q.split(/\b(?:then|and then|after that|afterwards|next|validate|verify|confirm)\b/i)[0].trim();
      q = q.replace(/\b(?:that|the|this|search|result|results|was|were|is|are|successful)\b\s*$/i, '').trim();
      q = q.replace(/[.,;:!?]+$/g, '').trim();
      return q.split(/\s+/).slice(0, 8).join(' ').trim() || null;
    },
    pickDocsLinkFromState() { return null; },
    quoteCssText(value) {
      return `"${String(value).replace(/"/g, '\\"')}"`;
    }
  };

  vm.runInNewContext(
    [
      extractFunction('getExplicitSearchEnginePreference'),
      extractFunction('isSearchEngineComparisonGoal'),
      extractFunction('shouldUseHeuristicPlannerFallback'),
      extractFunction('preserveEvidenceText'),
      extractFunction('inferHeuristicPlan')
    ].join('\n\n'),
    sandbox
  );

  return sandbox;
}

test('reasoner keeps late evidence instead of dropping the final fact cluster', () => {
  const agent = loadAgentComparisonFns();
  const longText = 'A'.repeat(2000) + 'B'.repeat(1800) + 'NEEDED_FACT: 2026-09-08';
  const kept = agent.preserveEvidenceText(longText, 500);
  assert.match(kept, /NEEDED_FACT: 2026-09-08/);
  assert.ok(kept.length > 500);
});

test('heuristic fallback stays disabled for valid LLM output and only triggers on malformed or stuck recovery', () => {
  const agent = loadAgentComparisonFns();
  const goal = 'Search for "Jacksonville, FL" and compare results';
  const state = { url: 'https://www.google.com/search?q=Jacksonville%2C+FL' };

  assert.equal(agent.shouldUseHeuristicPlannerFallback({ done: false, actions: [] }, goal, state, ['Step 1: searched'], 0), false);
  assert.equal(agent.shouldUseHeuristicPlannerFallback({ done: false, actions: [], _parseFailed: true }, goal, state, ['Step 1: searched'], 0), true);
  assert.equal(agent.shouldUseHeuristicPlannerFallback({ done: false, actions: [] }, goal, state, ['Step 1: repeated fallback'], 4), true);
});

test('comparison planning keeps the explicit Bing task and compare intent intact', () => {
  const agent = loadAgentComparisonFns();
  const goal = 'On Bing Maps search for "Jacksonville, FL" then search the same thing on bing.com then compare and contrast';

  assert.equal(agent.isSearchEngineComparisonGoal(goal), true);

  const plan = agent.inferHeuristicPlan(goal, { url: 'about:blank' }, [], 0);
  assert.equal(plan.actions[0].action, 'goto');
  const url = new URL(String(plan.actions[0].params.url));
  assert.equal(url.origin, 'https://www.bing.com');
  assert.match(url.search, /\?q=Jacksonville%2C%20FL/i);
});
