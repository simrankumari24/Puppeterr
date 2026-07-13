import { JSONSchema7, Tool, ToolSet } from "ai";

//#region src/chat/client-tools.d.ts
/**
 * Wire-format tool schema sent from the client.
 * Uses `parameters` (JSONSchema7) rather than AI SDK's `inputSchema`
 * because Zod schemas cannot be serialized over the wire.
 */
type ClientToolSchema = {
  /** Unique name for the tool */ name: string /** Human-readable description of what the tool does */;
  description?: Tool["description"] /** JSON Schema defining the tool's input parameters */;
  parameters?: JSONSchema7;
};
/**
 * Executes a client-defined tool and returns its output.
 *
 * Used for the RPC path (e.g. a parent agent delegating to a Think sub-agent)
 * where the caller can run the client tools itself, rather than the
 * browser/WebSocket path where results are sent back asynchronously.
 */
type ClientToolExecutor = (call: {
  /** The name of the client tool the model called. */ toolName: string /** The model-generated input for the tool call. */;
  input: unknown /** The AI SDK tool-call id for the invocation. */;
  toolCallId: string;
}) => unknown | Promise<unknown>;
/**
 * Converts client tool schemas to AI SDK tool format.
 *
 * By default these tools have no `execute` function — when the AI model calls
 * them, the tool call is sent back to the client for execution.
 *
 * When `options.execute` is provided, each tool is built WITH an `execute` that
 * delegates to it. This is used by the RPC path (e.g. a parent agent driving a
 * Think sub-agent) so the model's client-tool call is resolved inline within
 * the same turn.
 *
 * @param clientTools - Array of tool schemas from the client
 * @param options - Optional `execute` delegate to run the tools inline
 * @returns Record of AI SDK tools that can be spread into your tools object
 */
declare function createToolsFromClientSchemas(
  clientTools?: ClientToolSchema[],
  options?: {
    execute?: ClientToolExecutor;
  }
): ToolSet;
//#endregion
export {
  ClientToolSchema as n,
  createToolsFromClientSchemas as r,
  ClientToolExecutor as t
};
//# sourceMappingURL=client-tools-aIBO0Fk7.d.ts.map
