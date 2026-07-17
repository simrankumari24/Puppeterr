//#region src/experimental/webmcp.d.ts
/**
 * !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
 * !! WARNING: EXPERIMENTAL — DO NOT USE IN PRODUCTION                  !!
 * !!                                                                   !!
 * !! This API is under active development and WILL break between       !!
 * !! releases. Google's WebMCP API (navigator.modelContext) is still   !!
 * !! in early preview and subject to change.                           !!
 * !!                                                                   !!
 * !! If you use this, pin your agents version and expect to rewrite    !!
 * !! your code when upgrading.                                         !!
 * !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
 *
 * WebMCP adapter for Cloudflare Agents SDK.
 *
 * Bridges tools registered on an McpAgent server to Chrome's native
 * navigator.modelContext API, so browser-native agents can discover
 * and call them without extra infrastructure.
 *
 * @example Bridge a remote McpAgent endpoint into the page
 * ```ts
 * import { registerWebMcp } from "agents/experimental/webmcp";
 *
 * const handle = await registerWebMcp({ url: "/mcp" });
 *
 * // Later, to clean up:
 * await handle.dispose();
 * ```
 *
 * @example Mix in-page tools with bridged tools (recommended pattern)
 * ```ts
 * import { registerWebMcp } from "agents/experimental/webmcp";
 *
 * // 1. Register page-local tools — things only the page can do
 * navigator.modelContext?.registerTool({
 *   name: "scroll_to_section",
 *   description: "Scroll the page to a named section",
 *   inputSchema: {
 *     type: "object",
 *     properties: { id: { type: "string" } },
 *     required: ["id"]
 *   },
 *   async execute({ id }) {
 *     document.getElementById(String(id))?.scrollIntoView({ behavior: "smooth" });
 *     return "ok";
 *   }
 * });
 *
 * // 2. Bridge server tools — things that need durable storage / auth / DB access
 * const handle = await registerWebMcp({
 *   url: "/mcp",
 *   prefix: "remote.",            // optional namespace to avoid collisions
 *   getHeaders: async () => ({ Authorization: `Bearer ${await getToken()}` })
 * });
 *
 * // The browser AI sees both kinds of tools side by side.
 * ```
 *
 * @experimental This API is not yet stable and may change.
 */
interface ModelContextToolAnnotations {
  readOnlyHint?: boolean;
}
interface ModelContextClient {
  requestUserInteraction(callback: () => Promise<unknown>): Promise<unknown>;
}
interface ModelContextTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  execute: (
    input: Record<string, unknown>,
    client: ModelContextClient
  ) => Promise<unknown>;
  annotations?: ModelContextToolAnnotations;
}
interface ModelContextRegisterToolOptions {
  signal?: AbortSignal;
}
interface ModelContext {
  registerTool(
    tool: ModelContextTool,
    options?: ModelContextRegisterToolOptions
  ): void;
}
declare global {
  interface Navigator {
    modelContext?: ModelContext;
  }
}
interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
  };
}
/**
 * Logger interface for adapter diagnostics. Defaults to `console`.
 * Pass a no-op implementation (or `quiet: true`) to silence output.
 */
interface WebMcpLogger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}
interface WebMcpOptions {
  /** URL of the MCP endpoint (absolute or relative, e.g. `"/mcp"`). */
  url: string;
  /**
   * Additional headers to include in every request to the MCP server.
   * Useful for static authentication (e.g. `{ Authorization: "Bearer <token>" }`).
   */
  headers?: Record<string, string>;
  /**
   * Async function that returns headers for each request.
   * Called before every request, useful for tokens that refresh.
   * If both `headers` and `getHeaders` are provided, they are merged
   * with `getHeaders` values taking precedence.
   */
  getHeaders?: () => Promise<Record<string, string>> | Record<string, string>;
  /**
   * If true, listen for `tools/list_changed` notifications and re-sync
   * tools with `navigator.modelContext`. The adapter opens an SSE GET to
   * the MCP endpoint to receive notifications; servers that don't support
   * server-initiated streams (e.g. respond `405` on GET) gracefully degrade.
   * @default true
   */
  watch?: boolean;
  /**
   * Optional namespace prefix prepended to every tool name registered with
   * `navigator.modelContext`. Useful when bridging multiple MCP servers, or
   * when the page also registers in-page tools and you want to avoid
   * collisions. The original (unprefixed) name is still used on the wire
   * when calling the server.
   *
   * @example `prefix: "remote."` turns `search` into `remote.search`.
   */
  prefix?: string;
  /**
   * Per-request timeout (in milliseconds) applied to `tools/list` and
   * `tools/call`. If the server doesn't respond in time, the request is
   * aborted and the resulting error is surfaced through the normal error
   * paths (`onError` for sync, rejection for tool execution).
   */
  timeoutMs?: number;
  /**
   * Custom logger. Defaults to `console` with a `[webmcp-adapter]` prefix.
   * Pass `{ info: () => {}, warn: () => {}, error: () => {} }` to silence.
   */
  logger?: WebMcpLogger;
  /** Convenience shortcut for `logger: SILENT_LOGGER`. @default false */
  quiet?: boolean;
  /**
   * Called whenever the adapter performs a successful sync (initial load
   * and on `tools/list_changed`). Receives the tools as the server returned
   * them (with their original, unprefixed names).
   */
  onSync?: (tools: McpTool[]) => void;
  /**
   * Called when an error occurs during background work that the caller
   * cannot otherwise observe — specifically: a watch-mode re-sync failure.
   *
   * **Not** called for:
   * - Initialization failures (those reject the `registerWebMcp` promise).
   * - Per-tool execution failures (those reject the `execute` promise the
   *   browser host awaits; Chrome surfaces them to the AI).
   */
  onError?: (error: Error) => void;
}
interface WebMcpHandle {
  /**
   * Currently registered tool names (with `prefix` applied). Returns a fresh
   * snapshot on each access — safe to mutate.
   */
  readonly tools: ReadonlyArray<string>;
  /**
   * Re-fetch the tool list from the server and re-register everything.
   * If a sync is already in flight (from a `tools/list_changed` notification
   * or a previous `refresh()` call), returns the in-flight promise rather
   * than starting a second sync.
   */
  refresh(): Promise<void>;
  /**
   * Unregister all tools, signal any in-flight work to abort, and close the
   * MCP connection. Safe to call multiple times.
   */
  dispose(): Promise<void>;
  /** True after `dispose()` has been called at least once. */
  readonly disposed: boolean;
}
/**
 * Discovers tools from a Cloudflare McpAgent endpoint and registers them
 * with Chrome's native `navigator.modelContext` API.
 *
 * On browsers without `navigator.modelContext` (everything except recent
 * Chrome with the relevant flags), this function is a no-op and returns a
 * handle with an empty tools array. No network request is made.
 *
 * @example
 * ```ts
 * import { registerWebMcp } from "agents/experimental/webmcp";
 *
 * const handle = await registerWebMcp({ url: "/mcp" });
 * console.log("Registered tools:", handle.tools);
 *
 * // Clean up when done (e.g. in a React effect cleanup)
 * await handle.dispose();
 * ```
 *
 * See the JSDoc on the module itself for the recommended "in-page tools +
 * remote tools" composition pattern.
 */
declare function registerWebMcp(options: WebMcpOptions): Promise<WebMcpHandle>;
//#endregion
export { WebMcpHandle, WebMcpLogger, WebMcpOptions, registerWebMcp };
//# sourceMappingURL=webmcp.d.ts.map
