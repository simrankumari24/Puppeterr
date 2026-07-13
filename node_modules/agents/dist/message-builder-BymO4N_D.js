//#region src/chat/message-builder.ts
/** Whether a value is a plain (non-array, non-null) object. */
function isPlainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
/**
* Coerce a tool part's `input` into a provider-acceptable object.
*
* The Anthropic Messages API requires `tool_use.input` to be a JSON **object** —
* `null`, `undefined`, `""`, a raw string, **or an array** are all rejected with
* `tool_use.input: Input should be an object` (verified empirically against the
* live API: `{}` → 200, but `""`, `[]`, and `[{...}]` all → 400). A streamed
* tool call that finishes with no `input_json_delta` events (the model called
* the tool with no args), or whose input surfaces as a stringified JSON blob,
* can persist one of these shapes — and because it lives in durable storage, the
* session is then wedged across reconnects, redeploys, and DO evictions.
* Enforcing the invariant at the write boundary (and as a read-side repair
* backstop) keeps the transcript valid.
*
* - A plain (non-array) object is returned untouched (`changed: false`).
* - A string that parses to a plain object is parsed.
* - Everything else (`null`, `undefined`, `""`, arrays, primitives, non-object
*   or unparseable JSON) collapses to `{}`.
*/
function normalizeToolInput(raw) {
	if (isPlainObject(raw)) return {
		input: raw,
		changed: false
	};
	if (typeof raw === "string" && raw.trim().startsWith("{")) try {
		const parsed = JSON.parse(raw);
		if (isPlainObject(parsed)) return {
			input: parsed,
			changed: true
		};
	} catch {}
	return {
		input: {},
		changed: true
	};
}
/**
* Applies a stream chunk to a mutable parts array, building up the message
* incrementally. Returns true if the chunk was handled, false if it was
* an unrecognized type (caller may handle it with additional logic).
*
* Handles all common chunk types that both server and client need:
* - text-start / text-delta / text-end
* - reasoning-start / reasoning-delta / reasoning-end
* - file
* - source-url / source-document
* - tool-input-start / tool-input-delta / tool-input-available / tool-input-error
* - tool-output-available / tool-output-error
* - step-start (aliased from start-step)
* - data-* (developer-defined typed JSON blobs)
*
* @param parts - The mutable parts array to update
* @param chunk - The parsed stream chunk data
* @returns true if handled, false if the chunk type is not recognized
*/
function applyChunkToParts(parts, chunk) {
	switch (chunk.type) {
		case "text-start":
			parts.push({
				type: "text",
				text: "",
				state: "streaming"
			});
			return true;
		case "text-delta": {
			const lastTextPart = findLastPartByType(parts, "text");
			if (lastTextPart && lastTextPart.type === "text") lastTextPart.text += chunk.delta ?? "";
			else parts.push({
				type: "text",
				text: chunk.delta ?? "",
				state: "streaming"
			});
			return true;
		}
		case "text-end": {
			const lastTextPart = findLastPartByType(parts, "text");
			if (lastTextPart && "state" in lastTextPart) lastTextPart.state = "done";
			return true;
		}
		case "reasoning-start":
			parts.push({
				type: "reasoning",
				text: "",
				state: "streaming"
			});
			return true;
		case "reasoning-delta": {
			const lastReasoningPart = findLastPartByType(parts, "reasoning");
			if (lastReasoningPart && lastReasoningPart.type === "reasoning") {
				lastReasoningPart.text += chunk.delta ?? "";
				mergeProviderMetadata(lastReasoningPart, chunk.providerMetadata);
			} else parts.push({
				type: "reasoning",
				text: chunk.delta ?? "",
				state: "streaming",
				...chunk.providerMetadata != null ? { providerMetadata: chunk.providerMetadata } : {}
			});
			return true;
		}
		case "reasoning-end": {
			const lastReasoningPart = findLastPartByType(parts, "reasoning");
			if (lastReasoningPart && "state" in lastReasoningPart) {
				lastReasoningPart.state = "done";
				mergeProviderMetadata(lastReasoningPart, chunk.providerMetadata);
			}
			return true;
		}
		case "file":
			parts.push({
				type: "file",
				mediaType: chunk.mediaType,
				url: chunk.url
			});
			return true;
		case "source-url":
			parts.push({
				type: "source-url",
				sourceId: chunk.sourceId,
				url: chunk.url,
				title: chunk.title,
				providerMetadata: chunk.providerMetadata
			});
			return true;
		case "source-document":
			parts.push({
				type: "source-document",
				sourceId: chunk.sourceId,
				mediaType: chunk.mediaType,
				title: chunk.title,
				filename: chunk.filename,
				providerMetadata: chunk.providerMetadata
			});
			return true;
		case "tool-input-start":
			if (findToolPartByCallId(parts, chunk.toolCallId)) return true;
			parts.push({
				type: `tool-${chunk.toolName}`,
				toolCallId: chunk.toolCallId,
				toolName: chunk.toolName,
				state: "input-streaming",
				input: void 0,
				...chunk.providerExecuted != null ? { providerExecuted: chunk.providerExecuted } : {},
				...chunk.providerMetadata != null ? { callProviderMetadata: chunk.providerMetadata } : {},
				...chunk.title != null ? { title: chunk.title } : {}
			});
			return true;
		case "tool-input-delta": {
			const toolPart = findToolPartByCallId(parts, chunk.toolCallId);
			if (toolPart && toolPart.state === "input-streaming") toolPart.input = chunk.input;
			return true;
		}
		case "tool-input-available": {
			const existing = findToolPartByCallId(parts, chunk.toolCallId);
			if (existing) {
				const p = existing;
				if (p.state === "input-streaming") {
					p.state = "input-available";
					p.input = normalizeToolInput(chunk.input).input;
					if (chunk.providerExecuted != null) p.providerExecuted = chunk.providerExecuted;
					if (chunk.providerMetadata != null) p.callProviderMetadata = chunk.providerMetadata;
					if (chunk.title != null) p.title = chunk.title;
				}
				return true;
			}
			parts.push({
				type: `tool-${chunk.toolName}`,
				toolCallId: chunk.toolCallId,
				toolName: chunk.toolName,
				state: "input-available",
				input: normalizeToolInput(chunk.input).input,
				...chunk.providerExecuted != null ? { providerExecuted: chunk.providerExecuted } : {},
				...chunk.providerMetadata != null ? { callProviderMetadata: chunk.providerMetadata } : {},
				...chunk.title != null ? { title: chunk.title } : {}
			});
			return true;
		}
		case "tool-input-error": {
			const existing = findToolPartByCallId(parts, chunk.toolCallId);
			if (existing) {
				const p = existing;
				if (p.state === "output-available" || p.state === "output-error" || p.state === "output-denied") return true;
				p.state = "output-error";
				p.errorText = chunk.errorText;
				p.input = normalizeToolInput(chunk.input).input;
				if (chunk.providerExecuted != null) p.providerExecuted = chunk.providerExecuted;
				if (chunk.providerMetadata != null) p.callProviderMetadata = chunk.providerMetadata;
			} else parts.push({
				type: `tool-${chunk.toolName}`,
				toolCallId: chunk.toolCallId,
				toolName: chunk.toolName,
				state: "output-error",
				input: normalizeToolInput(chunk.input).input,
				errorText: chunk.errorText,
				...chunk.providerExecuted != null ? { providerExecuted: chunk.providerExecuted } : {},
				...chunk.providerMetadata != null ? { callProviderMetadata: chunk.providerMetadata } : {}
			});
			return true;
		}
		case "tool-approval-request": {
			const toolPart = findToolPartByCallId(parts, chunk.toolCallId);
			if (toolPart) {
				const p = toolPart;
				if (p.state === "approval-responded" || p.state === "output-available" || p.state === "output-error" || p.state === "output-denied") return true;
				p.state = "approval-requested";
				p.approval = {
					id: chunk.approvalId,
					...chunk.approvalDescriptor !== void 0 && { descriptor: chunk.approvalDescriptor }
				};
			}
			return true;
		}
		case "tool-output-denied": {
			const toolPart = findToolPartByCallId(parts, chunk.toolCallId);
			if (toolPart) {
				const p = toolPart;
				if (p.state === "output-available" || p.state === "output-error" || p.state === "output-denied" || p.state === "approval-responded") return true;
				p.state = "output-denied";
			}
			return true;
		}
		case "tool-output-available": {
			const toolPart = findToolPartByCallId(parts, chunk.toolCallId);
			if (toolPart) {
				const p = toolPart;
				p.state = "output-available";
				p.output = chunk.output;
				if (chunk.preliminary !== void 0) p.preliminary = chunk.preliminary;
			}
			return true;
		}
		case "tool-output-error": {
			const toolPart = findToolPartByCallId(parts, chunk.toolCallId);
			if (toolPart) {
				const p = toolPart;
				p.state = "output-error";
				p.errorText = chunk.errorText;
			}
			return true;
		}
		case "step-start":
		case "start-step":
			parts.push({ type: "step-start" });
			return true;
		default:
			if (chunk.type.startsWith("data-")) {
				if (chunk.transient) return true;
				if (chunk.id != null) {
					const existing = findDataPartByTypeAndId(parts, chunk.type, chunk.id);
					if (existing) {
						existing.data = chunk.data;
						return true;
					}
				}
				parts.push({
					type: chunk.type,
					...chunk.id != null && { id: chunk.id },
					data: chunk.data
				});
				return true;
			}
			return false;
	}
}
/**
* Returns true if `chunk` would be a no-op replay against the already-known
* `parts` — i.e. some upstream is re-emitting events for a tool call that
* the message has already advanced past.
*
* Used by stream broadcasters to suppress re-broadcasting these chunks to
* connected clients. AI SDK v6's `updateToolPart` mutates an existing tool
* part in place when a chunk arrives with a matching `toolCallId`, so a
* replayed `tool-input-start` would clobber an `output-available` part back
* to `input-streaming` on the client (issue #1404).
*
* Only returns true when re-broadcasting would *visibly regress* state on
* a v6 client. Safe-by-construction chunk types (e.g. `tool-output-available`
* carrying the same output the part already has) return false.
*
* Conditions:
* - `tool-input-start` for a `toolCallId` that already exists in `parts`.
* - `tool-input-delta` for a `toolCallId` whose existing part is no longer
*   `input-streaming`.
* - `tool-input-available` for a `toolCallId` whose existing part is no
*   longer `input-streaming` (i.e. has already advanced to `input-available`
*   or any terminal state).
* - `tool-output-denied` for a `toolCallId` whose existing part is already
*   settled (`output-available` / `output-error` / `output-denied`) or
*   user-approved (`approval-responded`). A continuation that re-validates
*   the transcript can re-emit a denial for an approval the SDK now deems
*   unneeded; `applyChunkToParts` already drops it server-side, and this stops
*   it reaching the client (where the in-place `updateToolPart` would flip the
*   part to `output-denied`) and the replay buffer. Mirrors the
*   first-write-wins guard in `applyChunkToParts`.
* - `tool-approval-request` for a `toolCallId` whose existing part is already
*   `approval-responded` or settled. A continuation replaying a prior tool
*   round-trip can re-emit the approval request; left unfiltered it would
*   revert an already-approved tool back to `approval-requested` on the client
*   (re-showing Approve/Reject) and replay that regression on reconnect. Same
*   pattern and rationale as `tool-output-denied`.
*/
function isReplayChunk(parts, chunk) {
	if (chunk.type === "tool-output-denied" || chunk.type === "tool-approval-request") {
		if (!chunk.toolCallId) return false;
		const existing = findToolPartByCallId(parts, chunk.toolCallId);
		if (!existing) return false;
		const state = existing.state;
		return state === "output-available" || state === "output-error" || state === "output-denied" || state === "approval-responded";
	}
	if (chunk.type !== "tool-input-start" && chunk.type !== "tool-input-delta" && chunk.type !== "tool-input-available") return false;
	if (!chunk.toolCallId) return false;
	const existing = findToolPartByCallId(parts, chunk.toolCallId);
	if (!existing) return false;
	if (chunk.type === "tool-input-start") return true;
	return existing.state !== "input-streaming";
}
/**
* Finds the last part in the array matching the given type.
* Searches from the end for efficiency (the part we want is usually recent).
*/
function findLastPartByType(parts, type) {
	for (let i = parts.length - 1; i >= 0; i--) if (parts[i].type === type) return parts[i];
}
/**
* Finds a tool part by its toolCallId.
* Searches from the end since the tool part is usually recent.
*/
function findToolPartByCallId(parts, toolCallId) {
	if (!toolCallId) return void 0;
	for (let i = parts.length - 1; i >= 0; i--) {
		const p = parts[i];
		if ("toolCallId" in p && p.toolCallId === toolCallId) return p;
	}
}
/**
* Shallow-merges providerMetadata from a chunk onto an existing part.
* Preserves any metadata already on the part (e.g. from earlier deltas)
* while adding new keys from the chunk. This is critical for providers
* like Anthropic that emit the thinking block signature on reasoning-end.
*/
function mergeProviderMetadata(part, metadata) {
	if (metadata == null) return;
	const p = part;
	p.providerMetadata = {
		...p.providerMetadata,
		...metadata
	};
}
/**
* Finds a data part by its type and id for reconciliation.
* Data parts use type+id as a composite key so when the same combination
* is seen again, the existing part's data is updated in-place.
*/
function findDataPartByTypeAndId(parts, type, id) {
	for (let i = parts.length - 1; i >= 0; i--) {
		const p = parts[i];
		if (p.type === type && "id" in p && p.id === id) return p;
	}
}
/**
* Rebuild the partial text + parts of an interrupted assistant turn from its
* stored resumable-stream chunks. Replays each chunk body through
* {@link applyChunkToParts}; malformed bodies are skipped. Shared by
* `AIChatAgent` and `Think`, which read the chunks from their
* `ResumableStream` (`getStreamChunks`) and pass them in.
*
* `@internal`
*/
function getPartialStreamText(chunks) {
	const parts = [];
	for (const chunk of chunks) try {
		applyChunkToParts(parts, JSON.parse(chunk.body));
	} catch {}
	return {
		text: parts.filter((p) => p.type === "text" && "text" in p).map((p) => p.text).join(""),
		parts
	};
}
//#endregion
export { normalizeToolInput as i, getPartialStreamText as n, isReplayChunk as r, applyChunkToParts as t };

//# sourceMappingURL=message-builder-BymO4N_D.js.map