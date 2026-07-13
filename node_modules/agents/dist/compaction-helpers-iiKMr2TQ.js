//#region src/experimental/memory/utils/tokens.ts
/** Approximate characters per token for English text */
const CHARS_PER_TOKEN = 4;
/** Approximate token multiplier per whitespace-separated word */
const WORDS_TOKEN_MULTIPLIER = 1.3;
/** Approximate overhead tokens per message (role, framing) */
const TOKENS_PER_MESSAGE = 4;
/**
* Estimate token count for a string using a hybrid heuristic.
*
* Takes the max of two estimates:
* - Character-based: `length / 4` — better for dense content (JSON, code, URLs)
* - Word-based: `words * 1.3` — better for natural language prose
*
* This is a heuristic. Do not use where exact counts are required.
*/
function estimateStringTokens(text) {
	if (!text) return 0;
	const charEstimate = text.length / 4;
	const wordEstimate = text.split(/\s+/).filter(Boolean).length * WORDS_TOKEN_MULTIPLIER;
	return Math.ceil(Math.max(charEstimate, wordEstimate));
}
function estimateUnknownTokens(value) {
	if (value === null || value === void 0) return 0;
	if (typeof value === "string") return estimateStringTokens(value);
	try {
		return estimateStringTokens(JSON.stringify(value));
	} catch {
		return estimateStringTokens(String(value));
	}
}
/**
* Estimate total token count for an array of UIMessages.
*
* Walks each message's parts (text, reasoning, tool invocations, tool results)
* and applies per-message overhead.
*
* This is a heuristic. Do not use where exact counts are required.
*/
function estimateMessageTokens(messages) {
	let tokens = 0;
	for (const msg of messages) {
		tokens += 4;
		for (const part of msg.parts) if (part.type === "text" || part.type === "reasoning") tokens += estimateUnknownTokens(part.text ?? part.reasoning);
		else if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
			tokens += estimateUnknownTokens(part.input);
			tokens += estimateUnknownTokens(part.output ?? part.result);
		} else if (part.text !== void 0) tokens += estimateUnknownTokens(part.text);
		else if (part.result !== void 0) tokens += estimateUnknownTokens(part.result);
	}
	return tokens;
}
//#endregion
//#region src/experimental/memory/utils/compaction-helpers.ts
/** Prefix for all compaction messages (overlays and summaries) */
const COMPACTION_PREFIX = "compaction_";
/** Check if a message is a compaction message */
function isCompactionMessage(msg) {
	return msg.id.startsWith(COMPACTION_PREFIX);
}
/**
* Check if a message contains tool invocations.
*/
function hasToolCalls(msg) {
	return msg.parts.some((p) => p.type.startsWith("tool-") || p.type === "dynamic-tool");
}
/**
* Get tool call IDs from a message's parts.
*/
function getToolCallIds(msg) {
	const ids = /* @__PURE__ */ new Set();
	for (const part of msg.parts) if ((part.type.startsWith("tool-") || part.type === "dynamic-tool") && "toolCallId" in part) ids.add(part.toolCallId);
	return ids;
}
/**
* Check if a message is a tool result referencing a specific call ID.
*/
function isToolResultFor(msg, callIds) {
	return msg.parts.some((p) => (p.type.startsWith("tool-") || p.type === "dynamic-tool") && "toolCallId" in p && callIds.has(p.toolCallId));
}
/**
* Align a boundary index forward to avoid splitting tool call/result groups.
* If the boundary falls between an assistant message with tool calls and its
* tool results, move it forward past the results.
*/
function alignBoundaryForward(messages, idx) {
	if (idx <= 0 || idx >= messages.length) return idx;
	const prev = messages[idx - 1];
	if (prev.role === "assistant" && hasToolCalls(prev)) {
		const callIds = getToolCallIds(prev);
		while (idx < messages.length && isToolResultFor(messages[idx], callIds)) idx++;
	}
	return idx;
}
/**
* Align a boundary index backward to avoid splitting tool call/result groups.
* If the boundary falls in the middle of tool results, move it backward to
* include the assistant message that made the calls.
*/
function alignBoundaryBackward(messages, idx) {
	if (idx <= 0 || idx >= messages.length) return idx;
	while (idx > 0) {
		const msg = messages[idx];
		if (msg.role === "assistant" && hasToolCalls(msg)) break;
		const prev = messages[idx - 1];
		if (prev.role === "assistant" && hasToolCalls(prev)) {
			if (isToolResultFor(msg, getToolCallIds(prev))) {
				idx--;
				continue;
			}
		}
		break;
	}
	return idx;
}
/**
* Find the compression end boundary using a token budget for the tail.
* Walks backward from the end, accumulating tokens until budget is reached.
* Returns the index where compression should stop (everything from this
* index onward is protected).
*
* @param messages All messages
* @param headEnd Index where the protected head ends (compression starts here)
* @param tailTokenBudget Maximum tokens to keep in the tail
* @param minTailMessages Minimum messages to protect in the tail (fallback)
*/
function findTailCutByTokens(messages, headEnd, tailTokenBudget = 2e4, minTailMessages = 2) {
	const n = messages.length;
	let accumulated = 0;
	let tokenCut = n;
	for (let i = n - 1; i >= headEnd; i--) {
		const msgTokens = estimateMessageTokens([messages[i]]);
		if (accumulated + msgTokens > tailTokenBudget && tokenCut < n) break;
		accumulated += msgTokens;
		tokenCut = i;
	}
	const minCut = n - minTailMessages;
	return alignBoundaryBackward(messages, minCut >= headEnd ? Math.min(tokenCut, minCut) : tokenCut);
}
async function findTailCutByTokensWithCounter(messages, headEnd, tokenCounter, tailTokenBudget = 2e4, minTailMessages = 2) {
	const n = messages.length;
	let accumulated = 0;
	let tokenCut = n;
	for (let i = n - 1; i >= headEnd; i--) {
		const msgTokens = await tokenCounter([messages[i]]);
		if (accumulated + msgTokens > tailTokenBudget && tokenCut < n) break;
		accumulated += msgTokens;
		tokenCut = i;
	}
	const minCut = n - minTailMessages;
	return alignBoundaryBackward(messages, minCut >= headEnd ? Math.min(tokenCut, minCut) : tokenCut);
}
/**
* Fix orphaned tool call/result pairs after compaction.
*
* Two failure modes:
* 1. Tool result references a call_id whose assistant tool_call was removed
*    → Remove the orphaned result
* 2. Assistant has tool_calls whose results were dropped
*    → Add stub results so the API doesn't error
*
* @param messages Messages after compaction
* @returns Sanitized messages with no orphaned pairs
*/
function sanitizeToolPairs(messages) {
	const survivingCallIds = /* @__PURE__ */ new Set();
	for (const msg of messages) if (msg.role === "assistant") for (const id of getToolCallIds(msg)) survivingCallIds.add(id);
	const resultCallIds = /* @__PURE__ */ new Set();
	for (const msg of messages) for (const part of msg.parts) if ((part.type.startsWith("tool-") || part.type === "dynamic-tool") && "toolCallId" in part && "output" in part) resultCallIds.add(part.toolCallId);
	const orphanedResults = /* @__PURE__ */ new Set();
	for (const id of resultCallIds) if (!survivingCallIds.has(id)) orphanedResults.add(id);
	let result = messages;
	if (orphanedResults.size > 0) result = result.map((msg) => {
		const filteredParts = msg.parts.filter((part) => {
			if ((part.type.startsWith("tool-") || part.type === "dynamic-tool") && "toolCallId" in part && "output" in part) return !orphanedResults.has(part.toolCallId);
			return true;
		});
		if (filteredParts.length !== msg.parts.length) return {
			...msg,
			parts: filteredParts
		};
		return msg;
	});
	const missingResults = /* @__PURE__ */ new Set();
	for (const id of survivingCallIds) if (!resultCallIds.has(id) && !orphanedResults.has(id)) missingResults.add(id);
	if (missingResults.size > 0) {
		const patched = [];
		for (const msg of result) {
			patched.push(msg);
			if (msg.role === "assistant") {
				for (const id of getToolCallIds(msg)) if (missingResults.has(id)) {
					const callPart = msg.parts.find((p) => "toolCallId" in p && p.toolCallId === id);
					patched.push({
						id: `stub-${id}`,
						role: "assistant",
						parts: [{
							type: "tool-result",
							toolCallId: id,
							toolName: callPart?.toolName ?? "unknown",
							result: "[Result from earlier conversation — see context summary above]"
						}],
						createdAt: /* @__PURE__ */ new Date()
					});
				}
			}
		}
		result = patched;
	}
	return result.filter((msg) => msg.parts.length > 0);
}
/**
* Compute a summary token budget based on the content being compressed.
* 20% of the compressed content, clamped to 2K-8K tokens.
*/
function computeSummaryBudget(messages) {
	const contentTokens = estimateMessageTokens(messages);
	const budget = Math.floor(contentTokens * .2);
	return Math.max(100, budget);
}
/**
* Build a prompt for LLM summarization of compressed messages.
*
* @param messages Messages to summarize
* @param previousSummary Previous summary for iterative updates (or null for first compaction)
* @param budget Target token count for the summary
*/
function buildSummaryPrompt(messages, previousSummary, budget) {
	const content = messages.map((msg) => {
		const textParts = msg.parts.filter((p) => p.type === "text").map((p) => p.text).join("\n");
		const toolParts = msg.parts.filter((p) => p.type.startsWith("tool-") || p.type === "dynamic-tool").map((p) => {
			const tp = p;
			const parts = [`[Tool: ${tp.toolName ?? "unknown"}]`];
			if (tp.input) parts.push(`Input: ${JSON.stringify(tp.input).slice(0, 500)}`);
			if (tp.output) parts.push(`Output: ${String(tp.output).slice(0, 500)}`);
			return parts.join("\n");
		}).join("\n");
		return `[${msg.role}]\n${textParts}${toolParts ? "\n" + toolParts : ""}`;
	}).join("\n\n---\n\n");
	if (previousSummary) return `You are updating a conversation summary. A previous summary exists below. New conversation turns have occurred since then and need to be incorporated.

PREVIOUS SUMMARY:
${previousSummary}

NEW TURNS TO INCORPORATE:
${content}

Update the summary. PRESERVE existing information that is still relevant. ADD new information. Remove information only if it is clearly obsolete.

## Topic
[What the conversation is about]

## Key Points
[Important information, decisions, and conclusions from the conversation]

## Current State
[Where things stand now — what has been done, what is in progress]

## Open Items
[Unresolved questions, pending tasks, or next steps discussed]

Target ~${budget} tokens. Be factual — only include information that was explicitly discussed in the conversation. Do NOT invent file paths, commands, or details that were not mentioned. Write only the summary body.`;
	return `Create a concise summary of this conversation that preserves the important information for future context.

CONVERSATION TO SUMMARIZE:
${content}

Use this structure:

## Topic
[What the conversation is about]

## Key Points
[Important information, decisions, and conclusions from the conversation]

## Current State
[Where things stand now — what has been done, what is in progress]

## Open Items
[Unresolved questions, pending tasks, or next steps discussed]

Target ~${budget} tokens. Be factual — only include information that was explicitly discussed in the conversation. Do NOT invent file paths, commands, or details that were not mentioned. Write only the summary body.`;
}
/**
* Reference compaction implementation.
*
* Implements the full hermes-style compaction algorithm:
* 1. Protect head messages (first N)
* 2. Protect tail by token budget (walk backward)
* 3. Align boundaries to tool call groups
* 4. Summarize middle section with LLM (structured format)
* 5. Sanitize orphaned tool pairs
* 6. Iterative summary updates on subsequent compactions
*
* @example
* ```typescript
* import { createCompactFunction } from "agents/experimental/memory/utils";
*
* const session = new Session(provider, {
*   compaction: {
*     tokenThreshold: 100000,
*     fn: createCompactFunction({
*       summarize: (prompt) => generateText({ model, prompt }).then(r => r.text)
*     })
*   }
* });
* ```
*/
function createCompactFunction(opts) {
	const protectHead = opts.protectHead ?? 3;
	const tailTokenBudget = opts.tailTokenBudget ?? 2e4;
	const minTailMessages = opts.minTailMessages ?? 2;
	return async (messages, context) => {
		if (messages.length <= protectHead + minTailMessages) return null;
		const sessionCounter = context?.tokenCounter;
		const tailCounter = opts.tokenCounter ?? (sessionCounter ? (msgs) => sessionCounter({
			messages: msgs,
			systemPrompt: "",
			contextBlocks: []
		}) : void 0);
		let compressStart = protectHead;
		compressStart = alignBoundaryForward(messages, compressStart);
		let compressEnd = tailCounter ? await findTailCutByTokensWithCounter(messages, compressStart, tailCounter, tailTokenBudget, minTailMessages) : findTailCutByTokens(messages, compressStart, tailTokenBudget, minTailMessages);
		if (compressEnd <= compressStart) return null;
		const middleMessages = messages.slice(compressStart, compressEnd).filter((m) => !isCompactionMessage(m));
		if (middleMessages.length === 0) return null;
		const existingCompaction = messages.find(isCompactionMessage);
		const prompt = buildSummaryPrompt(middleMessages, existingCompaction ? existingCompaction.parts.filter((p) => p.type === "text").map((p) => p.text).join("\n") : null, computeSummaryBudget(middleMessages));
		const summary = await opts.summarize(prompt);
		if (!summary.trim()) return null;
		return {
			fromMessageId: middleMessages[0].id,
			toMessageId: middleMessages[middleMessages.length - 1].id,
			summary
		};
	};
}
//#endregion
export { computeSummaryBudget as a, isCompactionMessage as c, TOKENS_PER_MESSAGE as d, WORDS_TOKEN_MULTIPLIER as f, buildSummaryPrompt as i, sanitizeToolPairs as l, estimateStringTokens as m, alignBoundaryBackward as n, createCompactFunction as o, estimateMessageTokens as p, alignBoundaryForward as r, findTailCutByTokens as s, COMPACTION_PREFIX as t, CHARS_PER_TOKEN as u };

//# sourceMappingURL=compaction-helpers-iiKMr2TQ.js.map