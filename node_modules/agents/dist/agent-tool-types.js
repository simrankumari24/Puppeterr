//#region src/agent-tool-types.ts
/**
* Reserved chunk type a sub-agent emits via `reportProgress` while it runs.
* Rides the child's own UI-message stream as a **transient** data part, so it
* re-broadcasts to the parent's clients (via the parent's tail) and surfaces in
* `useAgentToolEvents` without persisting into the child's stored message parts.
* See `design/rfc-detached-agent-tools.md` §"Progress and milestone signaling".
*/
const AGENT_TOOL_PROGRESS_PART = "data-agent-progress";
/**
* Reserved chunk type a sub-agent emits via `reportProgress({ milestone })`.
* Unlike the ephemeral progress part this rides the child's stream as a
* **persisted** data part, so it survives eviction, replays on drill-in, and
* re-resolves milestone waiters. See `design/rfc-detached-agent-tools.md`.
*/
const AGENT_TOOL_MILESTONE_PART = "data-agent-milestone";
//#endregion
export { AGENT_TOOL_MILESTONE_PART, AGENT_TOOL_PROGRESS_PART };

//# sourceMappingURL=agent-tool-types.js.map