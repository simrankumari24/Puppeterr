import { CreateBrowserToolsOptions } from "./ai.js";
import { ServerTool } from "@tanstack/ai";

//#region src/browser/tanstack-ai.d.ts
/**
 * Create TanStack AI tools for browser automation via CDP code mode.
 *
 * Returns an array with a single durable `browser_execute` `ServerTool`
 * backed by the same codemode runtime as `agents/browser/ai` — the model
 * writes TypeScript against the `cdp` connector and browser sessions
 * survive pauses.
 *
 * The stateless Quick Action tools are not surfaced through this TanStack
 * wrapper (it exposes only `browser_execute`); use `createQuickActionTools`
 * from `agents/browser/ai` if you want them.
 *
 * @example
 * ```ts
 * import { createBrowserTools } from "agents/browser/tanstack-ai";
 * import { chat } from "@tanstack/ai";
 *
 * // inside a Durable Object / Agent:
 * const browserTools = createBrowserTools({
 *   ctx: this.ctx,
 *   browser: this.env.BROWSER,
 *   loader: this.env.LOADER,
 * });
 *
 * const stream = chat({
 *   adapter: openaiText("gpt-4o"),
 *   tools: [...browserTools, ...otherTools],
 *   messages,
 * });
 * ```
 */
declare function createBrowserTools(
  options: CreateBrowserToolsOptions
): ServerTool[];
//#endregion
export { type CreateBrowserToolsOptions, createBrowserTools };
//# sourceMappingURL=tanstack-ai.d.ts.map
