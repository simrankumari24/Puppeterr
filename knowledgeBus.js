const DEFAULT_RESULT_LIMIT = 8;
const MAX_RESULT_LIMIT = 20;
const MAX_QUERY_LENGTH = 240;

function normalizeTarget(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeTool(value) {
  return String(value || "").trim().toLowerCase();
}

function parseRequestTool(request) {
  const raw = String(request || "").trim();
  const match = raw.match(/^([a-z][a-z0-9_.-]*)\s*:\s*(.*)$/i);
  if (!match) return { tool: "search", query: raw };
  return { tool: normalizeTool(match[1]), query: String(match[2] || "").trim() };
}

function clampLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_RESULT_LIMIT;
  return Math.max(1, Math.min(MAX_RESULT_LIMIT, Math.floor(parsed)));
}

function createKnowledgeBus({ modules = {} } = {}) {
  const registry = new Map();

  function registerModule(target, tools = {}) {
    const normalizedTarget = normalizeTarget(target);
    if (!normalizedTarget) throw new Error("Knowledge module target is required");
    if (!tools || typeof tools !== "object") throw new Error(`Tools for ${normalizedTarget} must be an object`);
    registry.set(normalizedTarget, new Map(Object.entries(tools).map(([name, handler]) => {
      if (typeof handler !== "function") throw new Error(`${normalizedTarget}.${name} must be a function`);
      return [normalizeTool(name), handler];
    })));
    return normalizedTarget;
  }

  for (const [target, tools] of Object.entries(modules)) registerModule(target, tools);

  async function request(envelope = {}) {
    const target = normalizeTarget(envelope.target);
    const parsed = parseRequestTool(envelope.request);
    const tool = normalizeTool(envelope.tool || parsed.tool);
    const query = String(envelope.query ?? parsed.query ?? "").trim().slice(0, MAX_QUERY_LENGTH);
    const limit = clampLimit(envelope.limit);
    const tools = registry.get(target);
    const handler = tools?.get(tool);

    console.log(`[knowledgebus] ${JSON.stringify({
      target,
      tool,
      query,
      limit
    })}`);

    if (!target || !tool) return { ok: false, error: "target and tool are required", results: [], confidence: 0 };
    if (!tools) return { ok: false, source: target, error: `Unknown knowledge module: ${target}`, results: [], confidence: 0 };
    if (!handler) return { ok: false, source: target, error: `Unknown knowledge tool: ${tool}`, results: [], confidence: 0 };

    try {
      const result = await handler({ query, limit, envelope });
      const safeResult = result && typeof result === "object" ? result : {};
      return {
        ok: true,
        source: target,
        tool,
        confidence: Number.isFinite(Number(safeResult.confidence)) ? Math.max(0, Math.min(1, Number(safeResult.confidence))) : 0,
        results: Array.isArray(safeResult.results) ? safeResult.results.slice(0, limit) : [],
        ...(safeResult.meta && typeof safeResult.meta === "object" ? { meta: safeResult.meta } : {})
      };
    } catch (error) {
      // Every return path from request() — success or failure — now
      // consistently includes `results` (always an array) and
      // `confidence`. Before this fix, only the success path did; any
      // caller that assumed a uniform response shape (reasonable for a
      // request/response API) and read response.results.length
      // unconditionally would crash with "Cannot read properties of
      // undefined (reading 'length')" on ANY failure — wrong target name,
      // wrong tool name, unregistered module, or a thrown handler error.
      return { ok: false, source: target, tool, error: error?.message || String(error), results: [], confidence: 0 };
    }
  }

  function describeTools() {
    return Array.from(registry.entries()).flatMap(([target, tools]) => Array.from(tools.keys()).map(tool => ({ target, tool })));
  }

  return { registerModule, request, describeTools };
}

function createStriderKnowledgeModule(getReport) {
  if (typeof getReport !== "function") throw new Error("Strider knowledge module requires getReport");

  async function search({ query, limit }) {
    const report = await getReport({ limit: MAX_RESULT_LIMIT });
    const topMatches = Array.isArray(report?.topMatches) ? report.topMatches : [];
    const terms = String(query || "").toLowerCase().split(/\s+/).map(term => term.trim()).filter(term => term.length >= 2).slice(0, 12);
    const ranked = topMatches
      .map(item => {
        const haystack = [item?.url, item?.domain, item?.title, item?.textPreview, ...(item?.relevanceMatched || [])].join(" ").toLowerCase();
        const hits = terms.filter(term => haystack.includes(term)).length;
        return { item, hits };
      })
      .filter(row => !terms.length || row.hits > 0)
      .sort((a, b) => b.hits - a.hits || Number(b.item?.relevanceScore || 0) - Number(a.item?.relevanceScore || 0))
      .slice(0, limit)
      .map(({ item }) => ({
        url: String(item?.url || ""),
        domain: String(item?.domain || ""),
        title: String(item?.title || "").slice(0, 160),
        preview: String(item?.textPreview || "").replace(/\s+/g, " ").slice(0, 300),
        relevanceScore: Number(item?.relevanceScore || 0),
        matched: Array.isArray(item?.relevanceMatched) ? item.relevanceMatched.slice(0, 5) : []
      }));

    const bestScore = ranked.reduce((best, item) => Math.max(best, Number(item.relevanceScore || 0)), 0);
    return {
      confidence: ranked.length ? Math.min(1, 0.45 + (bestScore / 100) * 0.5) : 0.15,
      results: ranked,
      meta: {
        query: String(query || "").slice(0, MAX_QUERY_LENGTH),
        relevantCount: Number(report?.relevantCount || 0),
        totalNodes: Number(report?.totalNodes || 0),
        allowedDomains: Array.isArray(report?.allowedDomains) ? report.allowedDomains.slice(0, 12) : []
      }
    };
  }

  return { search };
}

module.exports = {
  DEFAULT_RESULT_LIMIT,
  MAX_RESULT_LIMIT,
  MAX_QUERY_LENGTH,
  createKnowledgeBus,
  createStriderKnowledgeModule
};