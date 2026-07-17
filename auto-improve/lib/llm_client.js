const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function findNearestEnvFile(startDir) {
  let current = path.resolve(startDir || process.cwd());
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(current, ".env");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

// Load .env file if it exists.
function loadDotEnv() {
  const envFile = findNearestEnvFile(process.cwd());
  if (!envFile || !fs.existsSync(envFile)) return;
  
  const content = fs.readFileSync(envFile, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const raw = String(line || "").trim();
    if (!raw || raw.startsWith("#")) continue;
    const [k, ...v] = raw.split("=");
    const key = (k || "").trim();
    if (!key || process.env[key]) continue;
    let value = v.join("=").trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnv();

function flattenMessageContent(content) {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === "string") return part;
        if (part && typeof part.text === "string") return part.text;
        if (part && part.type === "text" && typeof part.content === "string") return part.content;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (typeof content === "object" && typeof content.text === "string") return content.text;
  return "";
}

function extractCloudflareText(payload) {
  if (!payload) return "";
  if (typeof payload === "string") return payload;

  const result = payload.result;
  if (typeof result === "string") return result;
  if (typeof payload.response === "string") return payload.response;

  const choiceContent = result?.choices?.[0]?.message?.content;
  if (typeof choiceContent === "string" && choiceContent.trim()) return choiceContent;
  const directChoiceContent = payload?.choices?.[0]?.message?.content;
  if (typeof directChoiceContent === "string" && directChoiceContent.trim()) return directChoiceContent;

  const candidates = [
    result?.response,
    result?.output_text,
    result?.text,
    payload?.output_text,
    payload?.text
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }

  const msgBlocks = [
    result?.message,
    result?.messages,
    payload?.message,
    payload?.messages
  ];

  for (const block of msgBlocks) {
    if (!block) continue;
    if (Array.isArray(block)) {
      const merged = block.map(item => flattenMessageContent(item?.content || item)).filter(Boolean).join("\n");
      if (merged.trim()) return merged;
    } else {
      const single = flattenMessageContent(block?.content || block);
      if (single.trim()) return single;
    }
  }

  return "";
}

function extractJson(text) {
  const value = String(text || "");
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  const candidate = value.slice(start, end + 1);

  try {
    return JSON.parse(candidate);
  } catch (_) {
    const repaired = candidate
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]");
    try {
      return JSON.parse(repaired);
    } catch (_) {
      return null;
    }
  }
}

function stripCodeFenceWrappers(text) {
  const value = String(text || "").trim();
  if (!value.startsWith("```") ) return value;

  const lines = value.split(/\r?\n/);
  if (lines.length >= 3 && lines[0].startsWith("```")) {
    const last = lines[lines.length - 1].trim();
    if (last === "```") {
      return lines.slice(1, -1).join("\n").trim();
    }
  }

  return value
    .replace(/^```[a-zA-Z0-9_-]*\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();
}

function extractJsonObject(text) {
  return extractJson(text);
}

function deterministicScore(seed) {
  const hash = crypto.createHash("sha1").update(seed).digest("hex");
  const raw = parseInt(hash.slice(0, 6), 16);
  return 600 + (raw % 390);
}

async function generateWithProvider(config, prompt, schemaHint) {
  const provider = String(config.ai_provider || "mock").toLowerCase();
  if (provider === "mock") {
    return {
      provider,
      model: config.ai_model || "mock-model",
      text: JSON.stringify({
        title: "Mock proposal",
        rationale: "Mock mode is enabled. Set ai_provider to a real backend to generate full patch proposals.",
        risk: "low",
        diff: ""
      })
    };
  }

  if (provider === "cloudflare") {
    const accountId = process.env.CF_ACCOUNT_ID || "";
    const apiKey = process.env.CF_API_TOKEN || "";
    const model = config.ai_model || "@cf/moonshotai/kimi-k2.7-code";
    
    if (!accountId || !apiKey) {
      return {
        provider,
        model,
        text: JSON.stringify({
          title: "Cloudflare not configured",
          rationale: "Missing CF_ACCOUNT_ID or CF_API_TOKEN environment variables. Falling back to mock mode.",
          risk: "high",
          diff: ""
        })
      };
    }

    try {
      const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
      const body = {
        messages: [
          { role: "system", content: "You are a strict software patch generator. Output valid JSON only. Do not include markdown code fences." },
          { role: "user", content: `${prompt}\n\nSchema hint:\n${schemaHint || "{}"}` }
        ]
      };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData?.errors?.[0]?.message || `HTTP ${response.status}`;
        throw new Error(`Cloudflare API error: ${errMsg}`);
      }

      const payload = await response.json();
      const text = extractCloudflareText(payload);
      return { provider, model, text, raw: payload };
    } catch (err) {
      return {
        provider,
        model,
        text: JSON.stringify({
          title: "Cloudflare call failed",
          rationale: `Error: ${err.message}. Falling back to mock mode.`,
          risk: "high",
          diff: ""
        })
      };
    }
  }

  if (provider === "openai_compatible") {
    const endpoint = process.env.AI_ENDPOINT || "";
    const apiKey = process.env.AI_API_KEY || "";
    const model = config.ai_model || process.env.AI_MODEL || "gpt-4o-mini";
    if (!endpoint || !apiKey) {
      return {
        provider,
        model,
        text: JSON.stringify({
          title: "Provider not configured",
          rationale: "Missing AI_ENDPOINT or AI_API_KEY. Falling back to empty patch proposal.",
          risk: "high",
          diff: ""
        })
      };
    }

    const body = {
      model,
      messages: [
        { role: "system", content: "You are a strict software patch generator. Output JSON only." },
        { role: "user", content: `${prompt}\n\nSchema hint:\n${schemaHint || "{}"}` }
      ],
      temperature: 0.2
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    const payload = await response.json().catch(() => ({}));
    const text = payload?.choices?.[0]?.message?.content || "";
    return { provider, model, text };
  }

  return {
    provider,
    model: config.ai_model || "unknown-model",
    text: JSON.stringify({
      title: "Unknown provider",
      rationale: `Unsupported ai_provider '${provider}'. Supported: mock, cloudflare, openai_compatible`,
      risk: "high",
      diff: ""
    })
  };
}

function fallbackReview(patchId, diffText, reviewerRole) {
  const changedLines = String(diffText || "")
    .split(/\r?\n/)
    .filter(line => (line.startsWith("+") || line.startsWith("-")) && !line.startsWith("+++") && !line.startsWith("---"))
    .length;
  const seed = `${patchId}:${reviewerRole}:${changedLines}`;
  let score = deterministicScore(seed);

  if (changedLines === 0) score = Math.min(score, 650);
  if (changedLines > 150) score = Math.min(score, 780);

  return {
    score,
    notes: [
      changedLines === 0 ? "No effective patch content detected." : `Patch changes ${changedLines} lines.`,
      "Fallback reviewer used deterministic scoring."
    ]
  };
}

module.exports = {
  generateWithProvider,
  extractJson,
  extractJsonObject,
  stripCodeFenceWrappers,
  fallbackReview
};
