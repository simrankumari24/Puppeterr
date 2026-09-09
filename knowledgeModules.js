const { createStriderKnowledgeModule } = require("./knowledgeBus");

function boundedText(value, limit) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function normalizeSearchTerms(query) {
  return String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .map(term => term.trim())
    .filter(term => term.length >= 2)
    .slice(0, 12);
}

function rankSearchEntries(entries, query, limit) {
  const terms = normalizeSearchTerms(query);
  return (Array.isArray(entries) ? entries : [])
    .map((item, index) => {
      const haystack = Object.values(item && typeof item === "object" ? item : {})
        .filter(value => typeof value === "string" || typeof value === "number" || typeof value === "boolean")
        .join(" ")
        .toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { item, index, score };
    })
    .filter(row => !terms.length || row.score > 0)
    .sort((a, b) => b.score - a.score || b.index - a.index)
    .slice(0, limit)
    .map(row => row.item);
}

function createKnowledgeModules(providers = {}) {
  const modules = {};

  if (typeof providers.striderReport === "function") {
    modules.STRIDER = createStriderKnowledgeModule(providers.striderReport);
  }

  if (typeof providers.pageState === "function") {
    modules.PAGE = {
      state: async ({ limit }) => {
        const state = await providers.pageState();
        return {
          confidence: state ? 0.95 : 0.1,
          results: state ? [{
            url: boundedText(state.url, 240),
            title: boundedText(state.title, 160),
            text: boundedText(state.text, Math.min(1200, limit * 150)),
            links: Array.isArray(state.links) ? state.links.slice(0, limit).map(link => ({
              text: boundedText(link?.text, 80),
              href: boundedText(link?.href, 240)
            })) : [],
            inputs: Array.isArray(state.inputs) ? state.inputs.slice(0, limit) : [],
            buttons: Array.isArray(state.buttons) ? state.buttons.slice(0, limit) : []
          }] : []
        };
      },
      text: async ({ limit }) => {
        const state = await providers.pageState();
        return {
          confidence: state?.text ? 0.95 : 0.1,
          results: state?.text ? [{ text: boundedText(state.text, Math.min(2400, limit * 300)) }] : []
        };
      }
    };
  }

  if (typeof providers.visionSnapshot === "function") {
    modules.VISION = {
      snapshot: async () => {
        const snapshot = await providers.visionSnapshot();
        return {
          confidence: snapshot?.summary ? 0.85 : 0.2,
          results: snapshot ? [{
            summary: boundedText(snapshot.summary, 700),
            state: boundedText(snapshot.signal?.state, 80),
            focus: boundedText(snapshot.signal?.next_focus, 160),
            blocker: boundedText(snapshot.signal?.blocker, 80),
            latestUrl: boundedText(snapshot.latestUrl, 240)
          }] : []
        };
      }
    };
  }

  if (typeof providers.elementMap === "function") {
    modules.ELEMENT_MAP = {
      snapshot: async ({ query, limit }) => {
        const snapshot = await providers.elementMap(query, limit);
        return {
          confidence: snapshot ? 0.9 : 0.1,
          results: snapshot ? [{
            query: boundedText(query, 240),
            summary: boundedText(snapshot.summary, Math.min(1600, limit * 300)),
            clickable: Array.isArray(snapshot.clickable) ? snapshot.clickable.slice(0, limit) : []
          }] : []
        };
      }
    };
  }

  if (typeof providers.memorySearch === "function" || typeof providers.logSearch === "function") {
    modules.MEMORY = {
      search: async ({ query, limit }) => {
        const [liveEntries, historicalEntries] = await Promise.all([
          typeof providers.memorySearch === "function" ? providers.memorySearch(query, limit) : [],
          typeof providers.logSearch === "function" ? providers.logSearch(query, limit) : []
        ]);
        const list = rankSearchEntries([
          ...(Array.isArray(liveEntries) ? liveEntries.map(item => ({ ...item, source: item?.source || "live-memory" })) : []),
          ...(Array.isArray(historicalEntries) ? historicalEntries.map(item => ({ ...item, source: item?.source || "log.json" })) : [])
        ], query, limit);
        return {
          confidence: list.length ? 0.7 : 0.15,
          results: list.map(item => ({
            task: boundedText(item?.task || item?.goal, 240),
            result: boundedText(item?.result || item?.action_done || item?.error, 320),
            url: boundedText(item?.url, 240),
            source: boundedText(item?.source, 40),
            kind: boundedText(item?.kind, 40),
            status: boundedText(item?.status, 40),
            completed: typeof item?.completed === "boolean" ? item.completed : undefined,
            ts: boundedText(item?.ts, 40)
          }))
        };
      }
    };
  }

  if (typeof providers.learningContext === "function") {
    modules.LEARNING = {
      context: async ({ query, limit }) => ({
        confidence: 0.65,
        results: [{ context: boundedText(await providers.learningContext(query), Math.min(1000, limit * 180)) }]
      })
    };
  }

  if (typeof providers.modelCatalog === "function") {
    modules.MODELS = {
      list: async ({ limit }) => {
        const catalog = await providers.modelCatalog();
        const list = Array.isArray(catalog) ? catalog : [];
        return {
        confidence: 0.9,
        results: list.slice(0, limit).map(model => ({
          id: boundedText(model?.id, 160),
          name: boundedText(model?.name, 160),
          type: boundedText(model?.type, 80),
          capabilities: Array.isArray(model?.capabilities) ? model.capabilities.slice(0, 8) : []
        }))
        };
      }
    };
  }

  if (typeof providers.supervisorState === "function") {
    modules.SUPERVISOR = {
      decision: async () => {
        const state = await providers.supervisorState();
        return {
          confidence: state ? 0.8 : 0.1,
          results: state ? [{
            decision: boundedText(state.decision, 40),
            score: Number(state.score || 0),
            reason: boundedText(state.reason, 260)
          }] : []
        };
      }
    };
  }

  return modules;
}

module.exports = { createKnowledgeModules };