import { Plugin } from "vite";

//#region src/vite.d.ts
interface AgentsPluginOptions {
  /**
   * Replace `turndown` with a diagnostic stub so `just-bash` (workspace bash
   * tool / skill runner) doesn't drag turndown's `require()`-using DOM fallback
   * into the Worker's module-init path and break deploys. Enabled by default.
   * Set to `false` if your app uses turndown directly and needs the real
   * implementation.
   */
  stubTurndown?: boolean;
}
/**
 * Vite plugin for Agents SDK projects.
 *
 * Handles TC39 decorator transforms (Oxc doesn't support them yet, oxc#9170) so
 * `@callable()` works at runtime, the `agents:skills` import transform, and
 * stubbing `turndown` to keep Workers deploys clean. Will grow to cover other
 * Agents-specific build concerns as needed.
 */
declare function agents(options?: AgentsPluginOptions): Plugin[];
//#endregion
export { AgentsPluginOptions, agents as default };
//# sourceMappingURL=vite.d.ts.map
