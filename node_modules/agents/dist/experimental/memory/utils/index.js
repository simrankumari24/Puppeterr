import { t as truncateToolOutput } from "../../../tool-output-truncation-CNnnGZQ3.js";
import { a as computeSummaryBudget, c as isCompactionMessage, d as TOKENS_PER_MESSAGE, f as WORDS_TOKEN_MULTIPLIER, i as buildSummaryPrompt, l as sanitizeToolPairs, m as estimateStringTokens, n as alignBoundaryBackward, o as createCompactFunction, p as estimateMessageTokens, r as alignBoundaryForward, s as findTailCutByTokens, t as COMPACTION_PREFIX, u as CHARS_PER_TOKEN } from "../../../compaction-helpers-iiKMr2TQ.js";
//#region src/experimental/memory/utils/compaction.ts
/**
* Read-time context truncation.
*
* Truncates older tool outputs and long text before sending to the LLM.
* Structured tool outputs keep their container shape so tool-specific
* `toModelOutput` handlers can safely replay older results.
* Does NOT mutate stored messages — operates on a copy.
*/
/**
* Truncate tool outputs and long text in older messages.
* Returns a new array — input messages are not mutated.
*
* Recent messages (last `keepRecent`) are left intact.
* Older messages get tool outputs and long text truncated. Structured tool
* outputs are truncated in place instead of being replaced by raw strings.
*
* Use in assembleContext() before sending to the LLM:
* ```typescript
* async assembleContext() {
*   const history = this.sessions.getHistory(this._sessionId);
*   const truncated = truncateOlderMessages(history);
*   return convertToModelMessages(truncated);
* }
* ```
*/
function truncateOlderMessages(messages, options) {
	const keepRecent = options?.keepRecent ?? 4;
	const maxToolOutput = options?.maxToolOutputChars ?? 500;
	const maxText = options?.maxTextChars ?? 1e4;
	if (messages.length <= keepRecent) return messages;
	const cutoff = messages.length - keepRecent;
	const result = [];
	for (let i = 0; i < messages.length; i++) {
		if (i >= cutoff) {
			result.push(messages[i]);
			continue;
		}
		const msg = messages[i];
		let changed = false;
		const truncatedParts = msg.parts.map((part) => {
			if ((part.type.startsWith("tool-") || part.type === "dynamic-tool") && "output" in part) {
				const output = part.output;
				if (output !== void 0) {
					const truncated = truncateToolOutput(output, maxToolOutput);
					if (truncated.truncated) {
						changed = true;
						return {
							...part,
							output: truncated.output
						};
					}
				}
			}
			if (part.type === "text" && "text" in part) {
				const text = part.text;
				if (text.length > maxText) {
					changed = true;
					return {
						...part,
						text: `${text.slice(0, maxText)}... [truncated ${text.length} chars]`
					};
				}
			}
			return part;
		});
		result.push(changed ? {
			...msg,
			parts: truncatedParts
		} : msg);
	}
	return result;
}
//#endregion
export { CHARS_PER_TOKEN, COMPACTION_PREFIX, TOKENS_PER_MESSAGE, WORDS_TOKEN_MULTIPLIER, alignBoundaryBackward, alignBoundaryForward, buildSummaryPrompt, computeSummaryBudget, createCompactFunction, estimateMessageTokens, estimateStringTokens, findTailCutByTokens, isCompactionMessage, sanitizeToolPairs, truncateOlderMessages };

//# sourceMappingURL=index.js.map