import { i as _classPrivateFieldInitSpec, n as _classPrivateFieldSet2, r as _assertClassBrand, t as _classPrivateFieldGet2 } from "../classPrivateFieldGet2-DZBYAB34.js";
import { t as _classPrivateMethodInitSpec } from "../classPrivateMethodInitSpec-qMjJ6sHQ.js";
import { tool } from "ai";
import { RpcTarget } from "cloudflare:workers";
import { z } from "zod";
import { parse } from "yaml";
import { DynamicWorkerExecutor, resolveProvider } from "@cloudflare/codemode";
import { Bash, defineCommand } from "just-bash";
//#region src/skills/frontmatter.ts
function parseSkillFrontmatter(raw) {
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!match) return {
		data: {},
		body: raw
	};
	const parsed = parse(match[1] ?? "");
	return {
		data: parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {},
		body: match[2] ?? ""
	};
}
function optionalString(value) {
	return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function optionalRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function parseSkillMarkdown(raw) {
	const { data, body } = parseSkillFrontmatter(raw);
	const name = optionalString(data.name);
	const description = optionalString(data.description);
	if (!name || !description) return null;
	return {
		name,
		description,
		body,
		compatibility: optionalString(data.compatibility),
		license: optionalString(data.license),
		allowedTools: optionalString(data["allowed-tools"]),
		metadata: optionalRecord(data.metadata)
	};
}
//#endregion
//#region src/skills/types.ts
function validateSkillResourcePath(path) {
	if (path.startsWith("/") || path.includes("\0") || path.split("/").some((part) => part === "" || part === "." || part === "..")) return `Skill resource path must be a normalized relative path: ${path}`;
	return null;
}
//#endregion
//#region src/skills/manifest.ts
function descriptorFromEntry(sourceId, entry) {
	return {
		name: entry.name,
		description: entry.description,
		compatibility: entry.compatibility,
		license: entry.license,
		allowedTools: entry.allowedTools,
		metadata: entry.metadata,
		sourceId,
		version: entry.version
	};
}
function contentFromEntry(sourceId, entry) {
	return {
		...descriptorFromEntry(sourceId, entry),
		body: entry.body,
		rawContent: entry.rawContent,
		resources: entry.resources?.filter((resource) => validateSkillResourcePath(resource.path) === null).map(({ content: _content, ...resource }) => ({ ...resource }))
	};
}
function fromManifest(manifest) {
	const byName = new Map(manifest.skills.map((skill) => [skill.name, skill]));
	return {
		id: manifest.id,
		fingerprint: manifest.fingerprint,
		async list() {
			return manifest.skills.map((skill) => descriptorFromEntry(manifest.id, skill));
		},
		async load(name) {
			const skill = byName.get(name);
			return skill ? contentFromEntry(manifest.id, skill) : null;
		},
		async readResource(name, path) {
			const skill = byName.get(name);
			if (validateSkillResourcePath(path) !== null) return null;
			const resource = skill?.resources?.find((entry) => entry.path === path);
			if (resource && validateSkillResourcePath(resource.path) !== null) return null;
			return resource ? { ...resource } : null;
		}
	};
}
//#endregion
//#region src/skills/r2.ts
function normalizePrefix(prefix) {
	if (!prefix) return "";
	return prefix.endsWith("/") ? prefix : `${prefix}/`;
}
function resourceKind(path) {
	if (path.startsWith("references/")) return "reference";
	if (path.startsWith("scripts/")) return "script";
	if (path.startsWith("assets/")) return "asset";
	return "file";
}
const TEXT_EXTENSIONS = /* @__PURE__ */ new Set([
	".bash",
	".css",
	".csv",
	".html",
	".js",
	".json",
	".jsx",
	".md",
	".mjs",
	".py",
	".sh",
	".svg",
	".ts",
	".tsx",
	".txt",
	".xml",
	".yaml",
	".yml"
]);
const MIME_TYPES = /* @__PURE__ */ new Map([
	[".css", "text/css"],
	[".gif", "image/gif"],
	[".html", "text/html"],
	[".jpg", "image/jpeg"],
	[".jpeg", "image/jpeg"],
	[".js", "text/javascript"],
	[".json", "application/json"],
	[".md", "text/markdown"],
	[".mjs", "text/javascript"],
	[".pdf", "application/pdf"],
	[".png", "image/png"],
	[".py", "text/x-python"],
	[".sh", "text/x-shellscript"],
	[".svg", "image/svg+xml"],
	[".ts", "text/typescript"],
	[".tsx", "text/typescript"],
	[".txt", "text/plain"],
	[".webp", "image/webp"],
	[".woff", "font/woff"],
	[".woff2", "font/woff2"],
	[".xml", "application/xml"],
	[".yaml", "application/yaml"],
	[".yml", "application/yaml"]
]);
function extensionOf$1(path) {
	const file = path.split("/").at(-1) ?? path;
	const index = file.lastIndexOf(".");
	return index === -1 ? "" : file.slice(index).toLowerCase();
}
function resourceEncoding(path) {
	return TEXT_EXTENSIONS.has(extensionOf$1(path)) ? "text" : "base64";
}
function resourceMimeType(path) {
	return MIME_TYPES.get(extensionOf$1(path));
}
function base64Encode(bytes) {
	let binary = "";
	const view = new Uint8Array(bytes);
	for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
	return btoa(binary);
}
async function readObjectFingerprint(bucket, key, path) {
	const object = await bucket.get(key);
	if (!object) return null;
	const encoding = resourceEncoding(path);
	return `${encoding}:${encoding === "base64" ? base64Encode(await object.arrayBuffer()) : await object.text()}`;
}
function stableHash(parts) {
	let hash = 2166136261;
	for (const part of parts) {
		for (let i = 0; i < part.length; i++) {
			hash ^= part.charCodeAt(i);
			hash = Math.imul(hash, 16777619);
		}
		hash ^= 255;
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
}
function objectFingerprintPart(object) {
	return [
		object.key,
		String(object.size),
		object.etag,
		object.uploaded?.toISOString() ?? ""
	].join(":");
}
async function listAllObjects(bucket, prefix) {
	const objects = [];
	let cursor;
	let truncated = true;
	while (truncated) {
		const listed = await bucket.list({
			prefix,
			cursor
		});
		objects.push(...listed.objects);
		truncated = listed.truncated;
		cursor = listed.truncated ? listed.cursor : void 0;
	}
	return objects.sort((a, b) => a.key.localeCompare(b.key));
}
async function readObject(bucket, key) {
	const object = await bucket.get(key);
	return object ? object.text() : null;
}
async function readResourceObject(bucket, key, descriptor) {
	const object = await bucket.get(key);
	if (!object) return null;
	const encoding = descriptor.encoding ?? resourceEncoding(descriptor.path);
	const content = encoding === "base64" ? base64Encode(await object.arrayBuffer()) : await object.text();
	return {
		...descriptor,
		encoding,
		content
	};
}
function r2(bucket, options = {}) {
	const prefix = normalizePrefix(options.prefix);
	const id = options.id ?? `r2:${prefix || "/"}`;
	const allowedSkills = options.skills?.length ? new Set(options.skills) : null;
	const fingerprintMode = options.fingerprint ?? "metadata";
	const refreshIntervalMs = options.refreshIntervalMs ?? 6e4;
	let fingerprint = id;
	let loaded = false;
	let indexedAt = 0;
	let byName = /* @__PURE__ */ new Map();
	let resourcesByName = /* @__PURE__ */ new Map();
	async function refreshIndex(force = false) {
		if (loaded && !force && Date.now() - indexedAt < refreshIntervalMs) return;
		const objects = await listAllObjects(bucket, prefix);
		const objectsByKey = new Map(objects.map((object) => [object.key, object]));
		const skillDirectories = objects.map((object) => object.key.slice(prefix.length)).filter((key) => key.endsWith("/SKILL.md")).map((key) => key.slice(0, -9)).filter((directory) => directory && !directory.includes("/"));
		const nextByName = /* @__PURE__ */ new Map();
		const nextResourcesByName = /* @__PURE__ */ new Map();
		const fingerprintParts = [];
		for (const directory of skillDirectories) {
			const skillKey = `${prefix}${directory}/SKILL.md`;
			const rawContent = await readObject(bucket, skillKey);
			if (!rawContent) continue;
			const parsed = parseSkillMarkdown(rawContent);
			if (!parsed || allowedSkills?.has(parsed.name) === false) continue;
			const resourceKeys = objects.map((object) => object.key).filter((key) => key.startsWith(`${prefix}${directory}/`) && key !== skillKey).filter((key) => validateSkillResourcePath(key.slice(`${prefix}${directory}/`.length)) === null);
			const resources = [];
			for (const key of resourceKeys) {
				const path = key.slice(`${prefix}${directory}/`.length);
				const listedResource = objectsByKey.get(key);
				resources.push({
					path,
					kind: resourceKind(path),
					size: listedResource?.size,
					encoding: resourceEncoding(path),
					mimeType: resourceMimeType(path)
				});
			}
			const descriptor = {
				name: parsed.name,
				description: parsed.description,
				compatibility: parsed.compatibility,
				license: parsed.license,
				allowedTools: parsed.allowedTools,
				metadata: parsed.metadata,
				sourceId: id
			};
			const content = {
				...descriptor,
				body: parsed.body,
				rawContent,
				resources: resources.map((resource) => ({ ...resource }))
			};
			if (!nextByName.has(parsed.name)) {
				nextByName.set(parsed.name, {
					descriptor,
					content,
					directory
				});
				nextResourcesByName.set(parsed.name, resources);
			}
			const skillObjects = [skillKey, ...resourceKeys].map((key) => objectsByKey.get(key)).filter((object) => Boolean(object));
			if (fingerprintMode === "content") {
				fingerprintParts.push(rawContent);
				for (const key of resourceKeys) {
					const path = key.slice(`${prefix}${directory}/`.length);
					fingerprintParts.push(await readObjectFingerprint(bucket, key, path) ?? "");
				}
			} else fingerprintParts.push(...skillObjects.map(objectFingerprintPart));
		}
		byName = nextByName;
		resourcesByName = nextResourcesByName;
		fingerprint = `${id}:${stableHash(fingerprintParts)}`;
		loaded = true;
		indexedAt = Date.now();
	}
	return {
		id,
		get fingerprint() {
			return fingerprint;
		},
		async list() {
			await refreshIndex();
			return [...byName.values()].map(({ descriptor }) => ({ ...descriptor }));
		},
		async load(name) {
			await refreshIndex();
			const skill = byName.get(name);
			return skill ? { ...skill.content } : null;
		},
		async readResource(name, path) {
			if (validateSkillResourcePath(path) !== null) return null;
			await refreshIndex();
			const skill = byName.get(name);
			if (!skill) return null;
			const resource = resourcesByName.get(name)?.find((entry) => entry.path === path);
			if (!resource) return null;
			return readResourceObject(bucket, `${prefix}${skill.directory}/${path}`, resource);
		},
		async refresh() {
			await refreshIndex();
		}
	};
}
//#endregion
//#region src/skills/runner.ts
const DEFAULT_SCRIPT_TIMEOUT_MS = 3e4;
const MAX_OUTPUT_ARTIFACT_BYTES = 64e3;
const MAX_OUTPUT_ARTIFACTS = 20;
const SUPPORTED_SCRIPT_EXTENSIONS = /* @__PURE__ */ new Set([
	".js",
	".mjs",
	".ts",
	".tsx",
	".py",
	".sh",
	".bash"
]);
let runnerExperimentalWarned = false;
function extensionOf(path) {
	const file = path.split("/").at(-1) ?? path;
	const index = file.lastIndexOf(".");
	return index === -1 ? "" : file.slice(index).toLowerCase();
}
function effectiveTimeout(options) {
	return options.timeout ?? DEFAULT_SCRIPT_TIMEOUT_MS;
}
function effectiveWorkspaceAccess(options) {
	if (options.workspace) return options.workspace;
	return options.workspaceInstance ? "read" : "none";
}
function validateSkillScriptPath(path) {
	if (!path.startsWith("scripts/")) return {
		ok: false,
		error: `Skill script path must start with "scripts/": ${path}`
	};
	if (path.startsWith("/") || path.includes("\0") || path.split("/").some((part) => part === "" || part === "." || part === "..")) return {
		ok: false,
		error: `Skill script path must be a normalized relative path under "scripts/": ${path}`
	};
	const extension = extensionOf(path);
	if (!SUPPORTED_SCRIPT_EXTENSIONS.has(extension)) return {
		ok: false,
		error: `Unsupported skill script extension "${extension || "(none)"}" for ${path}. Supported extensions: ${[...SUPPORTED_SCRIPT_EXTENSIONS].join(", ")}`
	};
	if (extension === ".sh" || extension === ".bash") return {
		ok: true,
		runtime: "bash"
	};
	if (extension === ".py") return {
		ok: true,
		runtime: "python"
	};
	if (extension === ".ts" || extension === ".tsx") return {
		ok: true,
		runtime: "typescript"
	};
	return {
		ok: true,
		runtime: "javascript"
	};
}
function validateMountedResourcePaths(request) {
	for (const resource of request.resources ?? []) {
		const pathError = validateSkillResourcePath(resource.path);
		if (pathError) throw new Error(pathError);
	}
}
function skillScriptContext(request) {
	return { skill: {
		name: request.skill.name,
		description: request.skill.description,
		compatibility: request.skill.compatibility,
		license: request.skill.license,
		allowedTools: request.skill.allowedTools,
		metadata: request.skill.metadata,
		sourceId: request.skill.sourceId,
		version: request.skill.version
	} };
}
/**
* Text bundled resources exposed to function-style JS/TS scripts via
* `ctx.files`. Binary resources are omitted in v1.
*/
function textFilesMap(request) {
	const files = {};
	for (const resource of request.resources ?? []) if ((resource.encoding ?? "text") === "text") files[resource.path] = resource.content;
	return files;
}
function base64ToBytes(value) {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}
function stdinText(stdin) {
	return typeof stdin === "string" ? stdin : String(stdin ?? "");
}
function mountedFiles(request) {
	const files = {
		"/input.json": {
			content: JSON.stringify(request.input),
			encoding: "text"
		},
		"/context.json": {
			content: JSON.stringify(skillScriptContext(request)),
			encoding: "text"
		},
		"/skill/SKILL.md": {
			content: request.skill.rawContent ?? request.skill.body,
			encoding: "text"
		}
	};
	for (const resource of request.resources ?? []) {
		const pathError = validateSkillResourcePath(resource.path);
		if (pathError) throw new Error(pathError);
		files[`/skill/${resource.path}`] = {
			content: resource.content,
			encoding: resource.encoding ?? "text"
		};
	}
	files[`/skill/${request.path}`] = {
		content: request.source,
		encoding: "text"
	};
	return files;
}
function bashFiles(request) {
	const files = {
		"/input.json": JSON.stringify(request.input),
		"/context.json": JSON.stringify(skillScriptContext(request)),
		"/skill-script.sh": request.source,
		"/skill/SKILL.md": request.skill.rawContent ?? request.skill.body,
		[`/skill/${request.path}`]: request.source
	};
	for (const resource of request.resources ?? []) {
		const pathError = validateSkillResourcePath(resource.path);
		if (pathError) throw new Error(pathError);
		files[`/skill/${resource.path}`] = (resource.encoding ?? "text") === "base64" ? base64ToBytes(resource.content) : resource.content;
	}
	return files;
}
/**
* Wrap a function-style JS/TS skill module so it runs inside the codemode
* sandbox. The module must `export default` an async `run(input, ctx)`; we
* rewrite the default export to a local binding, build the `ctx` capability
* object from the host bridge proxy (`__host`), and invoke it.
*/
function scriptModule(source, request) {
	const runnableSource = stripStrayExports(source.replace(/^\s*export\s+default\s+/m, "const __skillRun = "));
	const skillMeta = skillScriptContext(request).skill;
	return [
		"async () => {",
		`  const input = ${JSON.stringify(request.input)};`,
		`  const __skill = ${JSON.stringify(skillMeta)};`,
		`  const __files = ${JSON.stringify(textFilesMap(request))};`,
		"  const workspace = {",
		"    readFile: (path) => __host.readFile(path),",
		"    listFiles: (path = \".\") => __host.listFiles(path),",
		"    glob: (pattern) => __host.glob(pattern),",
		"    stat: (path) => __host.stat(path),",
		"    writeFile: (path, content) => __host.writeFile({ path, content })",
		"  };",
		"  const tools = new Proxy(",
		"    { call: (name, input) => __host.callTool({ name, input }) },",
		"    {",
		"      get: (target, prop) =>",
		"        prop in target",
		"          ? target[prop]",
		"          : (input) => __host.callTool({ name: String(prop), input })",
		"    }",
		"  );",
		"  const output = {",
		"    writeFile: (name, content) => __host.writeOutput({ name, content })",
		"  };",
		"  const ctx = { skill: __skill, files: __files, workspace, tools, output };",
		"",
		runnableSource,
		"",
		"  if (typeof __skillRun !== \"function\") {",
		"    throw new Error(\"Skill script default export must be a function (input, ctx).\");",
		"  }",
		"  return await __skillRun(input, ctx);",
		"}"
	].join("\n");
}
/**
* Whether a script declares a default export, in either the raw author form
* (`export default ...`) or the bundled form esbuild emits
* (`export { run as default }`).
*/
function hasDefaultExport(source) {
	return /^\s*export\s+default\s+/m.test(source) || /export\s*\{[^}]*\bas\s+default\b[^}]*\}/m.test(source);
}
/**
* Remove `export { ... }` blocks, which are illegal inside the function wrapper
* the runner builds around skill scripts.
*/
function stripStrayExports(source) {
	return source.replace(/\n?export\s*\{[\s\S]*?\};?/g, "");
}
function rewriteBundledSource(source) {
	const defaultBinding = source.match(/\bexport\s*\{[^}]*\b([A-Za-z_$][\w$]*)\s+as\s+default\b[^}]*\}/m);
	const stripped = stripStrayExports(source);
	if (defaultBinding) return `${stripped}\nconst __skillRun = ${defaultBinding[1]};`;
	return stripped;
}
async function prepareJavaScriptSource(request, runtime) {
	if ((request.resources ?? []).some((resource) => resource.path === request.path && resource.precompiled === true)) return rewriteBundledSource(request.source);
	let scriptFileCount = 1;
	for (const resource of request.resources ?? []) {
		if (resource.path === request.path) continue;
		const extension = extensionOf(resource.path);
		if (resource.kind === "script" && (resource.encoding ?? "text") === "text" && [
			".js",
			".mjs",
			".ts",
			".tsx"
		].includes(extension)) scriptFileCount++;
	}
	if (runtime === "javascript" && scriptFileCount === 1) return request.source;
	throw new Error(`Skill script "${request.path}" must be compiled to a self-contained JavaScript module before it can run. Bundled skills are compiled automatically by the Agents Vite plugin. Skills served from R2 or other dynamic sources must be bundled ahead of time (e.g. with \`compileSkillScript\` from "agents/skills/compile") before upload.`);
}
async function executeToolFromSet(tools, name, input) {
	const target = tools?.[name];
	const execute = target && "execute" in target ? target.execute : void 0;
	if (!execute) throw new Error(`Tool not available: ${name}`);
	return execute(input);
}
function stringifyHostResult(result) {
	return JSON.stringify({ result });
}
function stringifyHostError(error) {
	return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
}
var _tools = /* @__PURE__ */ new WeakMap();
var _workspace = /* @__PURE__ */ new WeakMap();
var _workspaceAccess = /* @__PURE__ */ new WeakMap();
var _outputs = /* @__PURE__ */ new WeakMap();
var _SkillScriptHostBridge_brand = /* @__PURE__ */ new WeakSet();
/**
* The single source of truth for skill-script capabilities and permission
* enforcement. Every runtime delegates here:
*
* - JavaScript/TypeScript reach it through a codemode `ToolProvider`.
* - Python receives it as an RPC `RpcTarget` (JSON-marshalling methods).
* - Bash calls it from `just-bash` custom commands.
*
* Construct a fresh bridge per `run()` so the per-invocation `/output`
* artifact buffer is never shared between concurrent script runs.
*/
var SkillScriptHostBridge = class extends RpcTarget {
	constructor(tools, workspace, workspaceAccess) {
		super();
		_classPrivateMethodInitSpec(this, _SkillScriptHostBridge_brand);
		_classPrivateFieldInitSpec(this, _tools, void 0);
		_classPrivateFieldInitSpec(this, _workspace, void 0);
		_classPrivateFieldInitSpec(this, _workspaceAccess, void 0);
		_classPrivateFieldInitSpec(this, _outputs, /* @__PURE__ */ new Map());
		_classPrivateFieldSet2(_tools, this, tools);
		_classPrivateFieldSet2(_workspace, this, workspace);
		_classPrivateFieldSet2(_workspaceAccess, this, workspaceAccess);
	}
	get workspaceAccess() {
		return _classPrivateFieldGet2(_workspaceAccess, this);
	}
	hasTools() {
		return Boolean(_classPrivateFieldGet2(_tools, this) && Object.keys(_classPrivateFieldGet2(_tools, this)).length > 0);
	}
	async callTool(name, input) {
		return executeToolFromSet(_classPrivateFieldGet2(_tools, this), name, input);
	}
	async readFile(path) {
		return _assertClassBrand(_SkillScriptHostBridge_brand, this, _requireWorkspace).call(this, "read").readFile(path);
	}
	async listFiles(path = ".") {
		return _assertClassBrand(_SkillScriptHostBridge_brand, this, _requireWorkspace).call(this, "read").readDir(path);
	}
	async glob(pattern) {
		return _assertClassBrand(_SkillScriptHostBridge_brand, this, _requireWorkspace).call(this, "read").glob(pattern);
	}
	async stat(path) {
		const info = await _assertClassBrand(_SkillScriptHostBridge_brand, this, _requireWorkspace).call(this, "read").stat(path);
		if (!info) return null;
		return {
			type: info.type,
			size: info.size ?? 0
		};
	}
	async writeFile(path, content) {
		await _assertClassBrand(_SkillScriptHostBridge_brand, this, _requireWorkspace).call(this, "read-write").writeFile(path, content);
	}
	writeOutput(name, content) {
		const key = String(name);
		const text = typeof content === "string" ? content : String(content ?? "");
		if (new TextEncoder().encode(text).byteLength > MAX_OUTPUT_ARTIFACT_BYTES) throw new Error(`Output artifact "${key}" exceeds ${MAX_OUTPUT_ARTIFACT_BYTES} bytes.`);
		if (!_classPrivateFieldGet2(_outputs, this).has(key) && _classPrivateFieldGet2(_outputs, this).size >= MAX_OUTPUT_ARTIFACTS) throw new Error(`Too many skill output artifacts (max ${MAX_OUTPUT_ARTIFACTS}).`);
		_classPrivateFieldGet2(_outputs, this).set(key, {
			path: key,
			encoding: "text",
			content: text
		});
	}
	getOutputFiles() {
		return [..._classPrivateFieldGet2(_outputs, this).values()];
	}
	async tool(name, inputJson = "{}") {
		try {
			const input = inputJson.trim() ? JSON.parse(inputJson) : {};
			return stringifyHostResult(await this.callTool(name, input));
		} catch (error) {
			return stringifyHostError(error);
		}
	}
	async workspaceReadFile(path) {
		try {
			return stringifyHostResult(await this.readFile(path));
		} catch (error) {
			return stringifyHostError(error);
		}
	}
	async workspaceListFiles(path = ".") {
		try {
			return stringifyHostResult(await this.listFiles(path));
		} catch (error) {
			return stringifyHostError(error);
		}
	}
	async workspaceGlob(pattern) {
		try {
			return stringifyHostResult(await this.glob(pattern));
		} catch (error) {
			return stringifyHostError(error);
		}
	}
	async workspaceWriteFile(path, content) {
		try {
			await this.writeFile(path, content);
			return stringifyHostResult(null);
		} catch (error) {
			return stringifyHostError(error);
		}
	}
};
function _requireWorkspace(access) {
	if (!_classPrivateFieldGet2(_workspace, this) || _classPrivateFieldGet2(_workspaceAccess, this) === "none") throw new Error("Workspace access is not available.");
	if (access === "read-write" && _classPrivateFieldGet2(_workspaceAccess, this) !== "read-write") throw new Error("Workspace write access is not available.");
	return _classPrivateFieldGet2(_workspace, this);
}
/**
* Expose the bridge to JS/TS scripts as a single codemode provider namespace
* (`__host`). The sandbox `ctx` object wraps these calls into the friendly
* `workspace` / `tools` / `output` surface (see {@link scriptModule}).
*/
function hostProvider(bridge) {
	return {
		name: "__host",
		tools: {
			callTool: { execute: (a) => {
				const { name, input } = a;
				return bridge.callTool(name, input);
			} },
			readFile: { execute: (a) => bridge.readFile(String(a)) },
			listFiles: { execute: (a) => bridge.listFiles(typeof a === "string" ? a : ".") },
			glob: { execute: (a) => bridge.glob(String(a)) },
			stat: { execute: (a) => bridge.stat(String(a)) },
			writeFile: { execute: (a) => {
				const { path, content } = a;
				return bridge.writeFile(path, content);
			} },
			writeOutput: { execute: async (a) => {
				const { name, content } = a;
				bridge.writeOutput(name, content);
				return null;
			} }
		}
	};
}
function pythonScriptModule(request) {
	const source = request.source;
	const sourceLiteral = JSON.stringify(source);
	const filesLiteral = JSON.stringify(mountedFiles(request));
	return String.raw`
import asyncio
import base64
import contextlib
import inspect
import io
import json
import os
import sys
import time
import types
from js import Object
from pyodide.ffi import to_js as pyodide_to_js
from workers import WorkerEntrypoint

SKILL_SOURCE = ${sourceLiteral}
SKILL_FILES = ${filesLiteral}

async def maybe_await(value):
    if inspect.isawaitable(value):
        return await value
    return value

async def decode_host_response(raw):
    data = json.loads(str(raw))
    if "error" in data:
        raise Exception(data["error"])
    return data.get("result")

def to_js(obj):
    return pyodide_to_js(obj, dict_converter=Object.fromEntries)

def materialize_files():
    os.makedirs("/output", exist_ok=True)
    for path, file in SKILL_FILES.items():
        directory = os.path.dirname(path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        mode = "wb" if file.get("encoding") == "base64" else "w"
        with open(path, mode) as handle:
            if file.get("encoding") == "base64":
                handle.write(base64.b64decode(file.get("content", "")))
            else:
                handle.write(file.get("content", ""))

def collect_output_files():
    output_files = []
    if not os.path.isdir("/output"):
        return output_files

    for root, _dirs, files in os.walk("/output"):
        for name in sorted(files):
            path = os.path.join(root, name)
            with open(path, "rb") as handle:
                content = handle.read()
            if len(content) > ${MAX_OUTPUT_ARTIFACT_BYTES}:
                raise Exception(f"Output artifact exceeds ${MAX_OUTPUT_ARTIFACT_BYTES} bytes: {path}")
            try:
                output_files.append({
                    "path": path,
                    "encoding": "text",
                    "content": content.decode("utf-8")
                })
            except UnicodeDecodeError:
                output_files.append({
                    "path": path,
                    "encoding": "base64",
                    "content": base64.b64encode(content).decode("ascii")
                })

    return sorted(output_files, key=lambda file: file["path"])

def looks_function_style(source):
    return "def run(" in source or "async def run(" in source

def timeout_trace(deadline):
    def trace(frame, event, arg):
        if time.monotonic() > deadline:
            raise TimeoutError("Python script execution timed out")
        return trace
    return trace

class ToolNamespace:
    def __init__(self, host):
        self.host = host

    async def call(self, name, input=None):
        raw = await self.host.tool(name, json.dumps(input if input is not None else {}))
        return await decode_host_response(raw)

    def __getattr__(self, name):
        async def call_tool(input=None):
            return await self.call(name, input)
        return call_tool

class WorkspaceNamespace:
    def __init__(self, host):
        self.host = host

    async def read_file(self, path):
        raw = await self.host.workspaceReadFile(path)
        return await decode_host_response(raw)

    async def list_files(self, path="."):
        raw = await self.host.workspaceListFiles(path)
        return await decode_host_response(raw)

    async def glob(self, pattern):
        raw = await self.host.workspaceGlob(pattern)
        return await decode_host_response(raw)

    async def write_file(self, path, content):
        raw = await self.host.workspaceWriteFile(path, content)
        return await decode_host_response(raw)

class Default(WorkerEntrypoint):
    async def evaluate(self, input, ctx, host, timeout_ms=None):
        materialize_files()
        try:
            if looks_function_style(SKILL_SOURCE):
                skill_module = types.ModuleType("skill_script")
                skill_module.tools = ToolNamespace(host)
                skill_module.workspace = WorkspaceNamespace(host)
                exec(SKILL_SOURCE, skill_module.__dict__)
                if not hasattr(skill_module, "run") or not callable(skill_module.run):
                    raise Exception("Python function-style skill script must define a callable run(input, ctx).")
                execution = maybe_await(skill_module.run(input, ctx))
                previous_trace = sys.gettrace()
                if timeout_ms is not None:
                    sys.settrace(timeout_trace(time.monotonic() + (timeout_ms / 1000)))
                try:
                    if timeout_ms is not None:
                        result = await asyncio.wait_for(execution, timeout_ms / 1000)
                    else:
                        result = await execution
                finally:
                    sys.settrace(previous_trace)
                return to_js({
                    "result": result,
                    "logs": [],
                    "mode": "function",
                    "outputFiles": collect_output_files()
                })

            stdout = io.StringIO()
            stderr = io.StringIO()
            previous_stdin = sys.stdin
            previous_trace = sys.gettrace()
            if timeout_ms is not None:
                sys.settrace(timeout_trace(time.monotonic() + (timeout_ms / 1000)))
            sys.stdin = io.StringIO(json.dumps(input))
            try:
                namespace = {"__name__": "__main__", "__file__": "/skill/script.py"}
                with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                    exec(SKILL_SOURCE, namespace)
            finally:
                sys.stdin = previous_stdin
                sys.settrace(previous_trace)
            return to_js({
                "result": {
                    "stdout": stdout.getvalue(),
                    "stderr": stderr.getvalue(),
                    "exitCode": 0
                },
                "logs": [],
                "mode": "cli",
                "outputFiles": collect_output_files()
            })
        except TimeoutError:
            return to_js({"error": "Python script execution timed out", "logs": []})
        except SystemExit as err:
            return to_js({
                "result": {
                    "stdout": stdout.getvalue() if "stdout" in locals() else "",
                    "stderr": stderr.getvalue() if "stderr" in locals() else "",
                    "exitCode": int(err.code) if isinstance(err.code, int) else 1
                },
                "logs": [],
                "mode": "cli",
                "outputFiles": collect_output_files()
            })
        except asyncio.TimeoutError:
            return to_js({"error": "Python script execution timed out", "logs": []})
        except Exception as err:
            return to_js({"error": str(err), "logs": []})
`;
}
async function runPythonScript(request, options, bridge) {
	const execution = options.loader.get(`skill-python-${crypto.randomUUID()}`, () => ({
		compatibilityDate: "2026-05-23",
		compatibilityFlags: ["python_workers", "disable_python_external_sdk"],
		mainModule: "skill_runner.py",
		modules: { "skill_runner.py": pythonScriptModule(request) },
		globalOutbound: options.network ? void 0 : null
	})).getEntrypoint().evaluate(request.input, skillScriptContext(request), bridge, effectiveTimeout(options));
	let timeout = null;
	const timeoutPromise = new Promise((_, reject) => {
		timeout = setTimeout(() => reject(/* @__PURE__ */ new Error("Python script execution timed out")), effectiveTimeout(options));
	});
	try {
		const response = await Promise.race([execution, timeoutPromise]);
		if (response.error) throw new Error(response.error);
		const outputFiles = response.outputFiles ?? [];
		if (response.mode === "cli") {
			if (typeof response.result === "object" && response.result !== null && outputFiles.length > 0) return {
				...response.result,
				outputFiles
			};
			return response.result;
		}
		if (response.logs?.length || outputFiles.length > 0) return {
			result: response.result,
			...response.logs?.length ? { logs: response.logs } : {},
			...outputFiles.length > 0 ? { outputFiles } : {}
		};
		return response.result;
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}
async function runBashScript(request, options, bridge) {
	const customCommands = [];
	if (bridge.workspaceAccess !== "none") {
		customCommands.push(defineCommand("workspace-read", async (args) => {
			const path = args[0];
			if (!path) return {
				stdout: "",
				stderr: "Missing path\n",
				exitCode: 2
			};
			try {
				return {
					stdout: await bridge.readFile(path) ?? "",
					stderr: "",
					exitCode: 0
				};
			} catch (error) {
				return {
					stdout: "",
					stderr: `${error instanceof Error ? error.message : String(error)}\n`,
					exitCode: 1
				};
			}
		}), defineCommand("workspace-list", async (args) => {
			const path = args[0] ?? ".";
			try {
				return {
					stdout: JSON.stringify(await bridge.listFiles(path)) + "\n",
					stderr: "",
					exitCode: 0
				};
			} catch (error) {
				return {
					stdout: "",
					stderr: `${error instanceof Error ? error.message : String(error)}\n`,
					exitCode: 1
				};
			}
		}), defineCommand("workspace-glob", async (args) => {
			const pattern = args[0];
			if (!pattern) return {
				stdout: "",
				stderr: "Missing pattern\n",
				exitCode: 2
			};
			try {
				return {
					stdout: JSON.stringify(await bridge.glob(pattern)) + "\n",
					stderr: "",
					exitCode: 0
				};
			} catch (error) {
				return {
					stdout: "",
					stderr: `${error instanceof Error ? error.message : String(error)}\n`,
					exitCode: 1
				};
			}
		}));
		if (bridge.workspaceAccess === "read-write") customCommands.push(defineCommand("workspace-write", async (args, ctx) => {
			const path = args[0];
			if (!path) return {
				stdout: "",
				stderr: "Missing path\n",
				exitCode: 2
			};
			try {
				await bridge.writeFile(path, stdinText(ctx.stdin));
				return {
					stdout: "",
					stderr: "",
					exitCode: 0
				};
			} catch (error) {
				return {
					stdout: "",
					stderr: `${error instanceof Error ? error.message : String(error)}\n`,
					exitCode: 1
				};
			}
		}));
	}
	if (bridge.hasTools()) customCommands.push(defineCommand("tool", async (args, ctx) => {
		const name = args[0];
		if (!name) return {
			stdout: "",
			stderr: "Missing tool name\n",
			exitCode: 2
		};
		try {
			const rawInput = args[1] ?? stdinText(ctx.stdin) ?? "{}";
			const input = rawInput.trim() ? JSON.parse(rawInput) : {};
			const result = await bridge.callTool(name, input);
			return {
				stdout: JSON.stringify(result) + "\n",
				stderr: "",
				exitCode: 0
			};
		} catch (error) {
			return {
				stdout: "",
				stderr: `${error instanceof Error ? error.message : String(error)}\n`,
				exitCode: 1
			};
		}
	}));
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), effectiveTimeout(options));
	try {
		const result = await new Bash({
			files: bashFiles(request),
			customCommands,
			defenseInDepth: true,
			network: options.network ? {} : void 0
		}).exec("bash /skill-script.sh", {
			signal: controller.signal,
			stdin: JSON.stringify(request.input)
		});
		return {
			stdout: result.stdout,
			stderr: result.stderr,
			exitCode: result.exitCode
		};
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}
async function runJavaScriptScript(request, options, bridge, runtime) {
	if (!hasDefaultExport(request.source)) throw new Error("JS/TS skill scripts must `export default` an async run(input, ctx) function.");
	const source = await prepareJavaScriptSource(request, runtime);
	const result = await new DynamicWorkerExecutor({
		loader: options.loader,
		timeout: effectiveTimeout(options),
		globalOutbound: options.network ? void 0 : null
	}).execute(scriptModule(source, request), [resolveProvider(hostProvider(bridge))]);
	if (result.error) {
		const logs = result.logs?.length ? `\n\nConsole output:\n${result.logs.join("\n")}` : "";
		throw new Error(`${result.error}${logs}`);
	}
	const outputFiles = bridge.getOutputFiles();
	if (result.logs?.length || outputFiles.length > 0) return {
		result: result.result,
		...result.logs?.length ? { logs: result.logs } : {},
		...outputFiles.length > 0 ? { outputFiles } : {}
	};
	return result.result;
}
/**
* Create a skill script runner backed by a Worker Loader.
*
* Capabilities are opt-in and enforced by a single host bridge: no network and
* no tools by default, read-only workspace access when `workspaceInstance` is
* provided. JS/TS scripts are function-style (`export default run(input, ctx)`)
* and receive `ctx = { skill, files, workspace, tools, output }`. Python and
* Bash use the path-based `/skill`, `/input.json`, `/output` contract.
*
* @experimental Skill script execution is experimental and may change before
* stabilizing.
*/
function runner(options) {
	return { async run(request) {
		if (!runnerExperimentalWarned) {
			runnerExperimentalWarned = true;
			console.warn("[think] skills.runner script execution is experimental; the API and capabilities may change.");
		}
		const tools = typeof options.tools === "function" ? await options.tools() : options.tools;
		const validation = validateSkillScriptPath(request.path);
		if (!validation.ok) throw new Error(validation.error);
		validateMountedResourcePaths(request);
		const bridge = new SkillScriptHostBridge(tools, options.workspaceInstance, effectiveWorkspaceAccess(options));
		if (validation.runtime === "bash") return await runBashScript(request, options, bridge);
		if (validation.runtime === "python") return await runPythonScript(request, options, bridge);
		return await runJavaScriptScript(request, options, bridge, validation.runtime);
	} };
}
//#endregion
//#region src/skills/registry.ts
const SKILL_CONTEXT_LABEL = "think_skills";
function stableSourceFingerprint(sources) {
	return sources.map((source) => `${source.id}:${source.fingerprint}`).join("|");
}
function wrapSkillContent(skill) {
	const version = skill.version ? ` version="${skill.version}"` : "";
	const resourceList = skill.resources?.length ? [
		"",
		"<skill_resources>",
		...skill.resources.map((resource) => `  <file kind="${resource.kind}" encoding="${resource.encoding ?? "text"}"${resource.size === void 0 ? "" : ` size="${resource.size}"`}>${resource.path}</file>`),
		"</skill_resources>"
	].join("\n") : "";
	return [
		`<skill_content name="${skill.name}"${version}>`,
		skill.body.trim(),
		resourceList,
		"</skill_content>"
	].join("\n");
}
function renderResourceList(resources) {
	if (!resources?.length) return "No bundled resources.";
	return resources.map((resource) => {
		const encoding = resource.encoding ?? "text";
		const size = resource.size === void 0 ? "" : `, ${resource.size} bytes`;
		const mimeType = resource.mimeType ? `, ${resource.mimeType}` : "";
		return `- ${resource.path} (${resource.kind}, ${encoding}${mimeType}${size})`;
	}).join("\n");
}
function validateResourcePath(path) {
	if (path.startsWith("../")) return `Resource paths cannot use "../". To read from another skill, use a qualified path like "other-skill/references/file.md".`;
	return validateSkillResourcePath(path);
}
var SkillRegistry = class {
	constructor(sources, scriptRunner = null) {
		this.contextLabel = SKILL_CONTEXT_LABEL;
		this.warnings = [];
		this.descriptors = /* @__PURE__ */ new Map();
		this.sourceBySkill = /* @__PURE__ */ new Map();
		this.loaded = false;
		this.sources = sources;
		this.scriptRunner = scriptRunner;
	}
	get fingerprint() {
		return stableSourceFingerprint(this.sources);
	}
	async load() {
		if (this.loaded) return;
		this.descriptors.clear();
		this.sourceBySkill.clear();
		this.warnings.length = 0;
		for (const source of this.sources) {
			let descriptors;
			try {
				descriptors = await source.list();
			} catch (error) {
				this.warnings.push(`Skill source "${source.id}" failed to list skills and was skipped: ${error instanceof Error ? error.message : String(error)}`);
				continue;
			}
			for (const descriptor of descriptors) {
				const existing = this.descriptors.get(descriptor.name);
				if (existing) {
					this.warnings.push(`Duplicate skill "${descriptor.name}" from ${source.id} ignored; already registered from ${existing.sourceId}.`);
					continue;
				}
				this.descriptors.set(descriptor.name, {
					...descriptor,
					sourceId: descriptor.sourceId ?? source.id
				});
				this.sourceBySkill.set(descriptor.name, source);
			}
		}
		this.loaded = true;
	}
	async refresh() {
		const refreshErrors = [];
		await Promise.all(this.sources.map(async (source) => {
			try {
				await source.refresh?.();
			} catch (error) {
				refreshErrors.push(`Skill source "${source.id}" failed to refresh: ${error instanceof Error ? error.message : String(error)}`);
			}
		}));
		this.loaded = false;
		await this.load();
		this.warnings.push(...refreshErrors);
	}
	async snapshot() {
		await this.load();
		const catalog = [];
		for (const descriptor of this.descriptors.values()) catalog.push(`- ${descriptor.name}: ${descriptor.description}`);
		return {
			fingerprint: this.fingerprint,
			catalogPrompt: catalog.length ? [
				"Available skills. When a task matches a skill, use activate_skill with its name before proceeding.",
				"",
				...catalog
			].join("\n") : null
		};
	}
	async systemPrompt() {
		return (await this.snapshot()).catalogPrompt;
	}
	async loadSkill(name) {
		await this.load();
		const source = this.sourceBySkill.get(name);
		return source ? source.load(name) : null;
	}
	resolveResourceTarget(name, path) {
		const pathError = validateResourcePath(path);
		if (pathError) return {
			ok: false,
			error: pathError
		};
		if (name) return {
			ok: true,
			name,
			path
		};
		const [candidateName, ...rest] = path.split("/");
		if (!candidateName || rest.length === 0) return {
			ok: false,
			error: "Resource path must include a skill name when name is omitted, for example: cloudflare-brand/references/tokens.md"
		};
		if (!this.descriptors.has(candidateName)) return {
			ok: false,
			error: `Unknown skill in qualified resource path: ${candidateName}`
		};
		return {
			ok: true,
			name: candidateName,
			path: rest.join("/")
		};
	}
	async readResource(name, path) {
		const source = this.sourceBySkill.get(name);
		if (!source?.readResource) return `Skill "${name}" has no readable resources.`;
		return await source.readResource(name, path) ?? `Resource not found: ${name}/${path}`;
	}
	async readSkillResources(skill) {
		const resources = [];
		for (const descriptor of skill.resources ?? []) {
			const resource = await this.readResource(skill.name, descriptor.path);
			if (typeof resource !== "string") resources.push(resource);
		}
		return resources;
	}
	tools() {
		const modelSkillNames = [...this.descriptors.values()].map((skill) => skill.name);
		const tools = {};
		if (modelSkillNames.length > 0) tools.activate_skill = tool({
			description: "Activate a skill by name. Use this when the user's task matches one of the available skills.",
			inputSchema: z.object({ name: z.enum(modelSkillNames) }),
			execute: async ({ name }) => {
				const skill = await this.loadSkill(name);
				if (!skill) return `Skill not found: ${name}`;
				return [
					wrapSkillContent(skill),
					"",
					"Bundled resources:",
					renderResourceList(skill.resources)
				].join("\n");
			}
		});
		if (modelSkillNames.length > 0) tools.read_skill_resource = tool({
			description: "Read a bundled resource from an available skill by relative path. Pass name and path, or use a qualified path like skill-name/references/file.md.",
			inputSchema: z.object({
				name: z.enum(modelSkillNames).optional(),
				path: z.string().min(1)
			}),
			execute: async ({ name, path }) => {
				const target = this.resolveResourceTarget(name, path);
				if (!target.ok) return target.error;
				const resource = await this.readResource(target.name, target.path);
				if (typeof resource === "string") return resource;
				const encoding = resource.encoding ?? "text";
				const mimeType = resource.mimeType ? ` mimeType="${resource.mimeType}"` : "";
				return [
					`<skill_resource name="${target.name}" path="${resource.path}" kind="${resource.kind}" encoding="${encoding}"${mimeType}>`,
					resource.content,
					"</skill_resource>"
				].join("\n");
			}
		});
		if (modelSkillNames.length > 0 && this.scriptRunner) tools.run_skill_script = tool({
			description: "Run a bundled script resource from an available skill. Use only when a skill instructs you to run a script.",
			inputSchema: z.object({
				name: z.enum(modelSkillNames),
				path: z.string().min(1),
				input: z.unknown().default({})
			}),
			execute: async ({ name, path, input = {} }) => {
				const validation = validateSkillScriptPath(path);
				if (!validation.ok) return validation.error;
				const skill = await this.loadSkill(name);
				if (!skill) return `Skill not found: ${name}`;
				const script = skill.resources?.find((resource) => resource.path === path);
				if (!script) return `Script not found: ${name}/${path}`;
				if (script.kind !== "script") return `Resource is not a script: ${name}/${path}`;
				const source = this.sourceBySkill.get(name);
				if (!source?.readResource) return `Skill "${name}" has no readable resources.`;
				const resource = await source.readResource(name, path);
				if (!resource) return `Script not found: ${name}/${path}`;
				if ((resource.encoding ?? "text") !== "text") return `Script resource must be text, got ${resource.encoding}: ${name}/${path}`;
				try {
					return await this.scriptRunner.run({
						skill,
						path,
						source: resource.content,
						input,
						resources: await this.readSkillResources(skill)
					});
				} catch (error) {
					return `Skill script failed: ${error instanceof Error ? error.message : String(error)}`;
				}
			}
		});
		return tools;
	}
};
//#endregion
export { SkillRegistry, fromManifest, parseSkillFrontmatter, parseSkillMarkdown, r2, runner };

//# sourceMappingURL=index.js.map