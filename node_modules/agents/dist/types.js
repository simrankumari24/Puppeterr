//#region src/types.ts
/**
* Enum for message types to improve type safety and maintainability
*/
let MessageType = /* @__PURE__ */ function(MessageType) {
	MessageType["CF_AGENT_MCP_SERVERS"] = "cf_agent_mcp_servers";
	MessageType["CF_MCP_AGENT_EVENT"] = "cf_mcp_agent_event";
	MessageType["CF_AGENT_STATE"] = "cf_agent_state";
	MessageType["CF_AGENT_STATE_ERROR"] = "cf_agent_state_error";
	MessageType["CF_AGENT_IDENTITY"] = "cf_agent_identity";
	MessageType["CF_AGENT_SESSION"] = "cf_agent_session";
	MessageType["CF_AGENT_SESSION_ERROR"] = "cf_agent_session_error";
	MessageType["RPC"] = "rpc";
	return MessageType;
}({});
//#endregion
export { MessageType };

//# sourceMappingURL=types.js.map