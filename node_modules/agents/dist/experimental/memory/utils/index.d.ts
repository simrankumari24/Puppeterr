import {
  P as SessionMessage,
  a as alignBoundaryBackward,
  c as computeSummaryBudget,
  d as isCompactionMessage,
  f as sanitizeToolPairs,
  i as CompactTokenCounter,
  l as createCompactFunction,
  n as CompactOptions,
  o as alignBoundaryForward,
  r as CompactResult,
  s as buildSummaryPrompt,
  t as COMPACTION_PREFIX,
  u as findTailCutByTokens
} from "../../../compaction-helpers-wUz6M3us.js";

//#region src/experimental/memory/utils/tokens.d.ts
/** Approximate characters per token for English text */
declare const CHARS_PER_TOKEN = 4;
/** Approximate token multiplier per whitespace-separated word */
declare const WORDS_TOKEN_MULTIPLIER = 1.3;
/** Approximate overhead tokens per message (role, framing) */
declare const TOKENS_PER_MESSAGE = 4;
/**
 * Estimate token count for a string using a hybrid heuristic.
 *
 * Takes the max of two estimates:
 * - Character-based: `length / 4` — better for dense content (JSON, code, URLs)
 * - Word-based: `words * 1.3` — better for natural language prose
 *
 * This is a heuristic. Do not use where exact counts are required.
 */
declare function estimateStringTokens(text: string): number;
/**
 * Estimate total token count for an array of UIMessages.
 *
 * Walks each message's parts (text, reasoning, tool invocations, tool results)
 * and applies per-message overhead.
 *
 * This is a heuristic. Do not use where exact counts are required.
 */
declare function estimateMessageTokens(messages: SessionMessage[]): number;
//#endregion
//#region src/experimental/memory/utils/compaction.d.ts
interface TruncateOptions {
  /** Number of recent messages to keep intact (default: 4) */
  keepRecent?: number;
  /** Max chars for tool outputs in older messages (default: 500) */
  maxToolOutputChars?: number;
  /** Max chars for text parts in older messages (default: 10000) */
  maxTextChars?: number;
}
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
declare function truncateOlderMessages(
  messages: SessionMessage[],
  options?: TruncateOptions
): SessionMessage[];
//#endregion
export {
  CHARS_PER_TOKEN,
  COMPACTION_PREFIX,
  type CompactOptions,
  type CompactResult,
  type CompactTokenCounter,
  TOKENS_PER_MESSAGE,
  type TruncateOptions,
  WORDS_TOKEN_MULTIPLIER,
  alignBoundaryBackward,
  alignBoundaryForward,
  buildSummaryPrompt,
  computeSummaryBudget,
  createCompactFunction,
  estimateMessageTokens,
  estimateStringTokens,
  findTailCutByTokens,
  isCompactionMessage,
  sanitizeToolPairs,
  truncateOlderMessages
};
//# sourceMappingURL=index.d.ts.map
