import { AGENT_TOOL_MILESTONE_PART, AGENT_TOOL_PROGRESS_PART } from "./agent-tool-types.js";
import { t as applyChunkToParts } from "./message-builder-BymO4N_D.js";
//#region src/chat/agent-tools.ts
/**
* Pull a reserved `data-agent-progress` chunk (emitted by a running sub-agent's
* `reportProgress`) into a latest-wins snapshot. Returns `undefined` for any
* other chunk so the caller keeps the prior snapshot.
*/
function readAgentToolProgressChunk(chunk) {
	if (typeof chunk !== "object" || chunk === null || chunk.type !== "data-agent-progress") return;
	const data = chunk.data ?? {};
	return {
		...typeof data.fraction === "number" ? { fraction: data.fraction } : {},
		...typeof data.message === "string" ? { message: data.message } : {},
		...typeof data.phase === "string" ? { phase: data.phase } : {},
		...data.data !== void 0 ? { data: data.data } : {},
		at: Date.now()
	};
}
/**
* Pull a reserved `data-agent-milestone` chunk into a durable milestone record,
* or `undefined` for any other chunk. Milestones carry their own monotonic
* `sequence` so the caller can dedupe replay-vs-live races.
*/
function readAgentToolMilestoneChunk(chunk) {
	if (typeof chunk !== "object" || chunk === null || chunk.type !== "data-agent-milestone") return;
	const data = chunk.data ?? {};
	if (typeof data.name !== "string") return void 0;
	return {
		name: data.name,
		sequence: typeof data.sequence === "number" ? data.sequence : 0,
		at: typeof data.at === "number" ? data.at : Date.now(),
		...data.data !== void 0 ? { data: data.data } : {}
	};
}
/**
* Merge a milestone into a run's ordered milestone list, deduping on `sequence`
* (idempotent across replay + live races) and keeping the list sorted.
*/
function mergeMilestone(existing, milestone) {
	if (existing?.some((m) => m.sequence === milestone.sequence)) return existing;
	const list = existing ? [...existing, milestone] : [milestone];
	list.sort((a, b) => a.sequence - b.sequence);
	return list;
}
/** Latest-wins coalescing window for `reportProgress` emits (per run). */
const AGENT_TOOL_PROGRESS_COALESCE_MS = 200;
/**
* Shared implementation of `reportProgress` for chat hosts. Builds the reserved
* transient `data-agent-progress` wire frame, coalesces bursts to a bounded
* cadence (latest-wins; a `fraction >= 1` "done" frame always flushes), and
* persists a latest snapshot. `data` rides the live frame but is only persisted
* when the caller opts in via `{ persist: true }`.
*/
var AgentToolProgressEmitter = class {
	constructor(hooks) {
		this.hooks = hooks;
		this._lastEmitAt = /* @__PURE__ */ new Map();
	}
	report(progress, options) {
		const active = this.hooks.resolveActiveRun();
		if (!active) return "inactive";
		const { runId, requestId } = active;
		const now = Date.now();
		if (typeof progress.milestone === "string" && progress.milestone) {
			this._lastEmitAt.set(runId, now);
			const sequence = this.hooks.persistMilestone(runId, progress.milestone, progress.data, now);
			this.hooks.broadcast(requestId, JSON.stringify({
				type: AGENT_TOOL_MILESTONE_PART,
				data: {
					name: progress.milestone,
					sequence,
					at: now,
					...typeof progress.fraction === "number" ? { fraction: progress.fraction } : {},
					...typeof progress.message === "string" ? { message: progress.message } : {},
					...typeof progress.phase === "string" ? { phase: progress.phase } : {},
					...progress.data !== void 0 ? { data: progress.data } : {}
				}
			}));
			return "emitted";
		}
		const last = this._lastEmitAt.get(runId) ?? 0;
		const isDone = typeof progress.fraction === "number" && progress.fraction >= 1;
		if (now - last < AGENT_TOOL_PROGRESS_COALESCE_MS && !isDone) return "coalesced";
		this._lastEmitAt.set(runId, now);
		const wire = {
			...typeof progress.fraction === "number" ? { fraction: progress.fraction } : {},
			...typeof progress.message === "string" ? { message: progress.message } : {},
			...typeof progress.phase === "string" ? { phase: progress.phase } : {},
			...progress.data !== void 0 ? { data: progress.data } : {}
		};
		this.hooks.broadcast(requestId, JSON.stringify({
			type: AGENT_TOOL_PROGRESS_PART,
			transient: true,
			data: wire
		}));
		this.hooks.persistSnapshot(runId, {
			...typeof progress.fraction === "number" ? { fraction: progress.fraction } : {},
			...typeof progress.message === "string" ? { message: progress.message } : {},
			...typeof progress.phase === "string" ? { phase: progress.phase } : {},
			...options?.persist && progress.data !== void 0 ? { data: progress.data } : {}
		}, now);
		return "emitted";
	}
	/** Drop coalescing state for a settled run (called on terminal). */
	forget(runId) {
		this._lastEmitAt.delete(runId);
	}
};
function sortRuns(runs) {
	return [...runs].sort((a, b) => {
		if (a.order !== b.order) return a.order - b.order;
		return a.runId.localeCompare(b.runId);
	});
}
function rebuildIndexes(runsById) {
	const grouped = {};
	const unboundRuns = [];
	for (const run of Object.values(runsById)) if (run.parentToolCallId) {
		grouped[run.parentToolCallId] = grouped[run.parentToolCallId] ?? [];
		grouped[run.parentToolCallId].push(run);
	} else unboundRuns.push(run);
	for (const [toolCallId, runs] of Object.entries(grouped)) grouped[toolCallId] = sortRuns(runs);
	return {
		runsByToolCallId: grouped,
		unboundRuns: sortRuns(unboundRuns)
	};
}
function emptyRun(message) {
	const { event } = message;
	if (event.kind === "started") return {
		runId: event.runId,
		agentType: event.agentType,
		parentToolCallId: message.parentToolCallId,
		inputPreview: event.inputPreview,
		order: event.order,
		display: event.display,
		status: "running",
		parts: [],
		subAgent: {
			agent: event.agentType,
			name: event.runId
		}
	};
}
function applyToRun(prev, message) {
	const seeded = prev ?? emptyRun(message);
	const { event } = message;
	switch (event.kind) {
		case "started":
			if (seeded?.status === "completed" || seeded?.status === "error" || seeded?.status === "aborted" || seeded?.status === "interrupted") return seeded;
			return {
				...seeded,
				runId: event.runId,
				agentType: event.agentType,
				parentToolCallId: message.parentToolCallId,
				inputPreview: event.inputPreview,
				order: event.order,
				display: event.display,
				status: "running",
				parts: seeded?.parts ?? [],
				subAgent: {
					agent: event.agentType,
					name: event.runId
				}
			};
		case "chunk": {
			if (!seeded) return void 0;
			const parts = seeded.parts.map((part) => ({ ...part }));
			let parsed;
			try {
				parsed = JSON.parse(event.body);
				applyChunkToParts(parts, parsed);
			} catch {
				return seeded;
			}
			const progress = readAgentToolProgressChunk(parsed);
			if (progress) return {
				...seeded,
				parts,
				progress
			};
			const milestone = readAgentToolMilestoneChunk(parsed);
			if (milestone) {
				const milestones = mergeMilestone(seeded.milestones, milestone);
				const isNew = milestones !== seeded.milestones;
				const notOlder = seeded.progress === void 0 || milestone.at >= seeded.progress.at;
				if (!isNew || !notOlder) return {
					...seeded,
					parts,
					milestones
				};
				const data = parsed.data ?? {};
				const snapshot = {
					...typeof data.fraction === "number" ? { fraction: data.fraction } : {},
					...typeof data.message === "string" ? { message: data.message } : {},
					...typeof data.phase === "string" ? { phase: data.phase } : {},
					milestone: milestone.name,
					at: milestone.at
				};
				return {
					...seeded,
					parts,
					progress: snapshot,
					milestones
				};
			}
			return {
				...seeded,
				parts
			};
		}
		case "finished":
			if (!seeded) return void 0;
			return {
				...seeded,
				status: "completed",
				summary: event.summary,
				error: void 0
			};
		case "error":
			if (!seeded) return void 0;
			return {
				...seeded,
				status: "error",
				error: event.error
			};
		case "aborted":
			if (!seeded) return void 0;
			return {
				...seeded,
				status: "aborted",
				error: event.reason
			};
		case "interrupted":
			if (!seeded) return void 0;
			return {
				...seeded,
				status: "interrupted",
				error: event.error,
				reason: event.reason,
				childStillRunning: event.childStillRunning
			};
	}
}
function createAgentToolEventState() {
	return {
		runsById: {},
		runsByToolCallId: {},
		unboundRuns: []
	};
}
function applyAgentToolEvent(state, message) {
	if (message.type !== "agent-tool-event") return state;
	const runId = message.event.runId;
	const nextRun = applyToRun(state.runsById[runId], message);
	if (!nextRun) return state;
	const runsById = {
		...state.runsById,
		[runId]: nextRun
	};
	return {
		runsById,
		...rebuildIndexes(runsById)
	};
}
/**
* Snoop a host's outgoing chat frames while any agent-tool run is in flight and
* forward the owning run's streamed body to its live tailers (or capture its
* error), without altering the frame — the caller still broadcasts it (#1575).
*
* Shared verbatim by `@cloudflare/ai-chat` and `@cloudflare/think`; the only
* per-host variance (the response-frame type constant and the run-lookup, whose
* SQL differs) is supplied via {@link AgentToolBroadcastHooks}. Inspection runs
* for a run's whole lifecycle (live sequences exist even with no tailer), so
* error capture never depends on tailer timing. A frame belongs to a run iff it
* carries that run's turn request id, so concurrent runs can't cross-contaminate
* each other's progress or error state.
*/
function interceptAgentToolBroadcast(msg, hooks) {
	if ((hooks.forwarders.size > 0 || hooks.liveSequences.size > 0) && typeof msg === "string") try {
		const parsed = JSON.parse(msg);
		if (parsed.type === hooks.responseType && typeof parsed.id === "string") {
			const runId = hooks.runForRequest(parsed.id);
			if (runId !== null) {
				if (parsed.error === true && typeof parsed.body === "string") hooks.lastErrors.set(runId, parsed.body);
				else if (typeof parsed.body === "string" && parsed.body.length > 0) {
					const sequence = hooks.liveSequences.get(runId) ?? 0;
					hooks.liveSequences.set(runId, sequence + 1);
					const chunk = {
						sequence,
						body: parsed.body
					};
					const forwarders = hooks.forwarders.get(runId);
					if (forwarders) for (const forward of forwarders) forward(chunk);
				}
			}
		}
	} catch {}
}
//#endregion
export { interceptAgentToolBroadcast as i, applyAgentToolEvent as n, createAgentToolEventState as r, AgentToolProgressEmitter as t };

//# sourceMappingURL=agent-tools-y7zLfw4Q.js.map