import { ToolSet } from "ai";

//#region src/experimental/memory/session/types.d.ts
/**
 * Minimal message part shape used by Session internals.
 * Vercel AI SDK's `UIMessagePart` is structurally compatible.
 */
interface SessionMessagePart {
  type: string;
  text?: string;
  reasoning?: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  state?: string;
  result?: unknown;
}
interface SessionTokenCounterInput {
  /** Messages returned by `session.getHistory()` for the active branch. */
  messages: SessionMessage[];
  /** Frozen system prompt managed by the Session context system. */
  systemPrompt: string;
  /** Loaded context blocks that were used to build `systemPrompt`. */
  contextBlocks: ContextBlock[];
}
type SessionTokenCounter = (
  input: SessionTokenCounterInput
) => number | Promise<number>;
interface CompactAfterOptions {
  /**
   * Override the token estimate used by auto-compaction and status broadcasts.
   *
   * The default is a Workers-safe heuristic over message parts plus the
   * Session-managed frozen system prompt. Callers that have model-reported
   * usage or a tokenizer can provide a more precise counter here.
   */
  tokenCounter?: SessionTokenCounter;
}
/**
 * Context the Session passes to the registered compaction function. Lets the
 * same authoritative token accounting drive BOTH the "should we compact?"
 * (`compactAfter`) and "what should we compact?" (boundary) decisions, so a
 * consumer that wires a `tokenCounter` once doesn't hit the failure mode where
 * compaction fires every turn but silently no-ops because the boundary logic
 * used a different (under-counting) estimate.
 */
interface CompactContext {
  /** The Session's token counter (from `compactAfter`/options), if configured. */
  tokenCounter?: SessionTokenCounter;
}
type CompactionErrorHandler = (error: unknown) => void | Promise<void>;
/**
 * Minimal message shape used by Session internals.
 * Vercel AI SDK's `UIMessage` is structurally compatible — you can pass
 * `UIMessage` objects directly without conversion.
 */
interface SessionMessage {
  id: string;
  role: string;
  parts: SessionMessagePart[];
  createdAt?: Date;
}
/**
 * Options for creating a Session.
 */
interface SessionOptions {
  /** Context blocks for the system prompt. */
  context?: ContextConfig[];
  /** Provider for persisting the frozen system prompt. */
  promptStore?: WritableContextProvider;
  /** Custom token counter for auto-compaction/status estimates. */
  tokenCounter?: SessionTokenCounter;
  /** Called when automatic compaction fails after a threshold trigger. */
  onCompactionError?: CompactionErrorHandler;
}
//#endregion
//#region src/experimental/memory/session/provider.d.ts
interface SearchResult {
  id: string;
  role: string;
  content: string;
  createdAt?: string;
  sessionId?: string;
}
interface StoredCompaction {
  id: string;
  summary: string;
  fromMessageId: string;
  toMessageId: string;
  createdAt: string;
}
/** Per-row info for the active branch path, root → leaf order. */
interface HistoryRowStat {
  id: string;
  /** Stored message role (e.g. "user" / "assistant"). */
  role: string;
  /** Serialized content size of the stored row in bytes. */
  bytes: number;
}
/** Result of a byte-budgeted history read. */
interface RecentHistoryResult {
  /**
   * The most recent messages on the active branch path whose summed stored
   * content size fits `maxContentBytes`, root → leaf order, with compaction
   * overlays applied within the window. The window always covers at least
   * the leaf row (and `minRecentMessages` rows when requested), but rows
   * whose stored content fails to parse are skipped — so a corrupt leaf can
   * yield fewer messages than the window covers.
   */
  messages: SessionMessage[];
  /** True when older messages were left out to satisfy the byte budget. */
  truncated: boolean;
  /** Summed stored content size of the FULL path, in bytes. */
  totalContentBytes: number;
}
/**
 * Session storage provider.
 * Messages are tree-structured via parentId for branching.
 */
interface SessionProvider {
  getMessage(
    id: string
  ): SessionMessage | null | Promise<SessionMessage | null>;
  /**
   * Get conversation as a path from root to leaf.
   * Applies compaction overlays. If leafId is null, uses the latest leaf.
   */
  getHistory(
    leafId?: string | null
  ): SessionMessage[] | Promise<SessionMessage[]>;
  getLatestLeaf(): SessionMessage | null | Promise<SessionMessage | null>;
  getBranches(messageId: string): SessionMessage[] | Promise<SessionMessage[]>;
  getPathLength(leafId?: string | null): number | Promise<number>;
  /**
   * Optional: byte-budgeted read of the most recent messages on the active
   * branch path. Lets hosts hydrate a bounded window instead of the full
   * transcript, so wake-time memory scales with the budget rather than total
   * session history (#1710). Providers that don't implement it fall back to
   * a full `getHistory()` read in `Session.getRecentHistory()`.
   *
   * `minRecentMessages` (default 1) is a floor on the window size: the most
   * recent N rows are always included even when they exceed the byte budget.
   * Hosts use this to guarantee the window never shrinks below the recent
   * span their model context assembly expects (rows are individually capped
   * at write time, so the floor keeps memory bounded).
   */
  getRecentHistory?(
    leafId: string | null | undefined,
    maxContentBytes: number,
    minRecentMessages?: number
  ): RecentHistoryResult | Promise<RecentHistoryResult>;
  /**
   * Optional: per-row stored sizes for the active branch path (root → leaf),
   * WITHOUT loading message content. Lets hosts find oversized rows (e.g.
   * inline base64 media) and process them one at a time with bounded memory.
   */
  getHistoryRowStats?(
    leafId?: string | null
  ): HistoryRowStat[] | Promise<HistoryRowStat[]>;
  /**
   * Append a message.
   *
   * `parentId` semantics:
   *   - `undefined` / omitted → auto-detect: attach to the current latest leaf.
   *   - `null`                → create a root message with no parent.
   *   - string                → attach to the given parent id (provider may
   *                            fall back to root if the parent doesn't
   *                            belong to this session).
   *
   * Idempotent — appending the same `message.id` twice is a no-op.
   */
  appendMessage(
    message: SessionMessage,
    parentId?: string | null
  ): void | Promise<void>;
  updateMessage(message: SessionMessage): void | Promise<void>;
  deleteMessages(messageIds: string[]): void | Promise<void>;
  clearMessages(): void | Promise<void>;
  addCompaction(
    summary: string,
    fromMessageId: string,
    toMessageId: string
  ): StoredCompaction | Promise<StoredCompaction>;
  getCompactions(): StoredCompaction[] | Promise<StoredCompaction[]>;
  searchMessages?(
    query: string,
    limit?: number
  ): SearchResult[] | Promise<SearchResult[]>;
}
//#endregion
//#region src/experimental/memory/session/providers/agent.d.ts
interface SqlProvider {
  sql<T = Record<string, string | number | boolean | null>>(
    strings: TemplateStringsArray,
    ...values: (string | number | boolean | null)[]
  ): T[];
}
declare class AgentSessionProvider implements SessionProvider {
  private agent;
  private initialized;
  private sessionId;
  /**
   * Cached id of the active branch tip (latest leaf). `undefined` means "not
   * cached" (cold, or last lookup found the session empty).
   *
   * Finding the tip from scratch is an anti-join over every row in the
   * session (`latestLeafRow`), which is O(rows). It runs on every hydration
   * AND every auto-parent append, so on a long transcript it dominates the
   * read cost of a wake. The tip is maintained in place on append/delete/
   * clear, and a cached id is re-validated on read with an O(1) existence +
   * still-childless check before it's trusted — so the cache self-heals if
   * something else mutates the cached tip: a deleted tip or a tip that gained
   * a child fails the check and triggers a single recompute. Direct SQL or a
   * second provider instance that creates a newer leaf without touching the
   * cached tip is outside the supported writer model and will be observed on
   * the next cold lookup. The full scan therefore never runs more often than
   * the original unconditional version did. Reads are synchronous and the DO
   * is single-threaded, so no locking is needed.
   */
  private activeLeafId;
  /**
   * @param agent - Agent or any object with a `sql` tagged template method
   * @param sessionId - Optional session ID to isolate multiple sessions in the same DO.
   *                    Messages are filtered by session_id within shared tables.
   */
  constructor(agent: SqlProvider, sessionId?: string);
  private ensureTable;
  getMessage(id: string): SessionMessage | null;
  getHistory(leafId?: string | null): SessionMessage[];
  getRecentHistory(
    leafId: string | null | undefined,
    maxContentBytes: number,
    minRecentMessages?: number
  ): RecentHistoryResult;
  getHistoryRowStats(leafId?: string | null): HistoryRowStat[];
  getLatestLeaf(): SessionMessage | null;
  getBranches(messageId: string): SessionMessage[];
  getPathLength(leafId?: string | null): number;
  appendMessage(message: SessionMessage, parentId?: string | null): void;
  updateMessage(message: SessionMessage): void;
  deleteMessages(messageIds: string[]): void;
  clearMessages(): void;
  addCompaction(
    summary: string,
    fromMessageId: string,
    toMessageId: string
  ): StoredCompaction;
  getCompactions(): StoredCompaction[];
  searchMessages(query: string, limit?: number): SearchResult[];
  private latestLeafRow;
  private leafRowById;
  /**
   * The active branch path as (id, role, content size) rows, root → leaf.
   *
   * Recurses over (id, parent_id) only. Carrying `content` through the
   * recursive queue AND the ORDER BY sorter materializes the entire
   * transcript several times over inside SQLite's allocator, which in
   * workerd shares the isolate's memory budget with the JS heap — large
   * media-heavy sessions then fail with SQLITE_NOMEM on wake (#1710).
   * Content is fetched separately in bounded chunks (`messagesByPathStats`).
   */
  private pathRowStats;
  /**
   * Fetch and parse message content for an ordered list of path rows.
   *
   * Content is read in chunks bounded by both row count and cumulative
   * stored bytes (no ORDER BY — SQLite streams rows without materializing
   * the result set) and reassembled in path order. Rows that fail to parse
   * are skipped, matching previous behavior.
   */
  private messagesByPathStats;
  private indexFTS;
  private deleteFTS;
  private applyCompactions;
  private parse;
  private parseRows;
}
//#endregion
//#region src/experimental/memory/session/search.d.ts
/**
 * Storage interface for searchable context.
 *
 * - `get()` returns a summary of indexed content (rendered into system prompt)
 * - `search(query)` full-text search (via search_context tool)
 * - `set(key, content)` indexes content under a key (via set_context tool)
 */
interface SearchProvider extends ContextProvider {
  search(query: string): Promise<string | null>;
  set?(key: string, content: string): Promise<void>;
}
/**
 * Check if a provider is a SearchProvider (has a `search` method).
 */
declare function isSearchProvider(
  provider: unknown
): provider is SearchProvider;
/**
 * SearchProvider backed by Durable Object SQLite with FTS5.
 *
 * - `get()` returns a count of indexed entries
 * - `search(query)` full-text search using FTS5
 * - `set(key, content)` indexes or replaces content under a key
 *
 * Each instance uses a namespaced FTS5 table to avoid collisions
 * with the session message search.
 *
 * @example
 * ```ts
 * Session.create(this)
 *   .withContext("knowledge", {
 *     provider: new AgentSearchProvider(this)
 *   })
 * ```
 */
declare class AgentSearchProvider implements SearchProvider {
  private agent;
  private label;
  private initialized;
  constructor(agent: SqlProvider);
  init(label: string): void;
  private ensureTable;
  get(): Promise<string | null>;
  search(query: string): Promise<string | null>;
  set(key: string, content: string): Promise<void>;
  private deleteFTS;
}
//#endregion
//#region src/experimental/memory/session/skills.d.ts
/**
 * Storage interface for skill collections.
 *
 * - `get()` returns metadata listing (rendered into system prompt)
 * - `load(key)` fetches full content (via load_context tool)
 * - `set(key, content, description?)` writes an entry (via set_context tool)
 */
interface SkillProvider extends ContextProvider {
  load(key: string): Promise<string | null>;
  set?(key: string, content: string, description?: string): Promise<void>;
}
/**
 * Check if a provider is a SkillProvider (has a `load` method).
 */
declare function isSkillProvider(provider: unknown): provider is SkillProvider;
/**
 * SkillProvider backed by an R2 bucket.
 *
 * - `get()` returns a metadata listing of all skills (key + description)
 * - `load(key)` fetches a skill's full content
 * - `set(key, content, description?)` writes a skill
 *
 * Descriptions are pulled from R2 custom metadata (`description` key).
 * If a prefix is provided, it is prepended on storage operations and
 * stripped from keys in metadata. `keys`, when provided, is matched against
 * these prefix-relative keys.
 *
 * @example
 * ```ts
 * const skills = new R2SkillProvider(env.SKILLS_BUCKET, {
 *   prefix: "skills/",
 *   keys: ["code-review", "debugging"]
 * });
 * ```
 */
declare class R2SkillProvider implements SkillProvider {
  private bucket;
  private prefix;
  private keys;
  constructor(
    bucket: R2Bucket,
    options?: {
      prefix?: string;
      keys?: string[];
    }
  );
  get(): Promise<string | null>;
  load(key: string): Promise<string | null>;
  set(key: string, content: string, description?: string): Promise<void>;
  private allowsKey;
}
//#endregion
//#region src/experimental/memory/session/context.d.ts
/**
 * Base storage interface for a context block.
 * A provider with only `get()` is readonly.
 */
interface ContextProvider {
  get(): Promise<string | null>;
  /** Called by the context system to provide the block label before first use. */
  init?(label: string): void;
}
/**
 * Writable context provider — extends ContextProvider with `set()`.
 * Blocks backed by this provider are writable via the `set_context` tool.
 */
interface WritableContextProvider extends ContextProvider {
  set(content: string): Promise<void>;
}
/**
 * Check if a provider is writable (has a `set` method).
 */
declare function isWritableProvider(
  provider: unknown
): provider is WritableContextProvider;
/**
 * Configuration for a context block.
 */
interface ContextConfig {
  /** Block label — used as key and in tool descriptions */
  label: string;
  /** Human-readable description (shown to AI in tool) */
  description?: string;
  /** Maximum tokens allowed. Enforced on set. */
  maxTokens?: number;
  /** Storage provider. Determines block behavior:
   *  - ContextProvider (get only) → readonly
   *  - WritableContextProvider (get+set) → writable via set_context
   *  - SkillProvider (get+load+set?) → on-demand via load_context
   *  - SearchProvider (get+search+set?) → searchable via search_context
   *  If omitted, auto-wired to writable SQLite when using builder. */
  provider?:
    | ContextProvider
    | WritableContextProvider
    | SkillProvider
    | SearchProvider;
}
/**
 * A loaded context block with computed token count.
 */
interface ContextBlock {
  label: string;
  description?: string;
  content: string;
  tokens: number;
  maxTokens?: number;
  /** True if provider is writable (has set) */
  writable: boolean;
  /** True if backed by a SkillProvider */
  isSkill: boolean;
  /** True if backed by a SearchProvider */
  isSearchable: boolean;
}
//#endregion
//#region src/experimental/memory/utils/compaction-helpers.d.ts
type CompactTokenCounter = (
  messages: SessionMessage[]
) => number | Promise<number>;
/** Prefix for all compaction messages (overlays and summaries) */
declare const COMPACTION_PREFIX = "compaction_";
/** Check if a message is a compaction message */
declare function isCompactionMessage(msg: SessionMessage): boolean;
/**
 * Align a boundary index forward to avoid splitting tool call/result groups.
 * If the boundary falls between an assistant message with tool calls and its
 * tool results, move it forward past the results.
 */
declare function alignBoundaryForward(
  messages: SessionMessage[],
  idx: number
): number;
/**
 * Align a boundary index backward to avoid splitting tool call/result groups.
 * If the boundary falls in the middle of tool results, move it backward to
 * include the assistant message that made the calls.
 */
declare function alignBoundaryBackward(
  messages: SessionMessage[],
  idx: number
): number;
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
declare function findTailCutByTokens(
  messages: SessionMessage[],
  headEnd: number,
  tailTokenBudget?: number,
  minTailMessages?: number
): number;
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
declare function sanitizeToolPairs(
  messages: SessionMessage[]
): SessionMessage[];
/**
 * Compute a summary token budget based on the content being compressed.
 * 20% of the compressed content, clamped to 2K-8K tokens.
 */
declare function computeSummaryBudget(messages: SessionMessage[]): number;
/**
 * Build a prompt for LLM summarization of compressed messages.
 *
 * @param messages Messages to summarize
 * @param previousSummary Previous summary for iterative updates (or null for first compaction)
 * @param budget Target token count for the summary
 */
declare function buildSummaryPrompt(
  messages: SessionMessage[],
  previousSummary: string | null,
  budget: number
): string;
/**
 * Result of a compaction function — describes the overlay to store.
 */
interface CompactResult {
  /** First message ID in the compacted range */
  fromMessageId: string;
  /** Last message ID in the compacted range */
  toMessageId: string;
  /** Summary text to store as the overlay */
  summary: string;
}
interface CompactOptions {
  /**
   * Function to call the LLM for summarization.
   * Takes a user prompt string, returns the LLM's text response.
   */
  summarize: (prompt: string) => Promise<string>;
  /** Number of head messages to protect (default: 2) */
  protectHead?: number;
  /** Token budget for tail protection (default: 20000) */
  tailTokenBudget?: number;
  /** Minimum tail messages to protect (default: 2) */
  minTailMessages?: number;
  /**
   * Optional counter for tail-budget decisions. Use this when a tokenizer or
   * model-reported accounting is available; otherwise the Workers-safe
   * heuristic is used.
   */
  tokenCounter?: CompactTokenCounter;
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
declare function createCompactFunction(
  opts: CompactOptions
): (
  messages: SessionMessage[],
  context?: CompactContext
) => Promise<CompactResult | null>;
//#endregion
export {
  StoredCompaction as A,
  isSearchProvider as C,
  RecentHistoryResult as D,
  HistoryRowStat as E,
  SessionMessagePart as F,
  SessionOptions as I,
  SessionTokenCounter as L,
  CompactContext as M,
  CompactionErrorHandler as N,
  SearchResult as O,
  SessionMessage as P,
  SessionTokenCounterInput as R,
  SearchProvider as S,
  SqlProvider as T,
  isWritableProvider as _,
  alignBoundaryBackward as a,
  isSkillProvider as b,
  computeSummaryBudget as c,
  isCompactionMessage as d,
  sanitizeToolPairs as f,
  WritableContextProvider as g,
  ContextProvider as h,
  CompactTokenCounter as i,
  CompactAfterOptions as j,
  SessionProvider as k,
  createCompactFunction as l,
  ContextConfig as m,
  CompactOptions as n,
  alignBoundaryForward as o,
  ContextBlock as p,
  CompactResult as r,
  buildSummaryPrompt as s,
  COMPACTION_PREFIX as t,
  findTailCutByTokens as u,
  R2SkillProvider as v,
  AgentSessionProvider as w,
  AgentSearchProvider as x,
  SkillProvider as y
};
//# sourceMappingURL=compaction-helpers-wUz6M3us.d.ts.map
