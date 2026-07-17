import { build } from "esbuild";
//#region src/skills/compile.ts
/**
* Build-time skill-script compiler.
*
* Skill scripts must be self-contained JavaScript modules before they can run:
* the Worker runtime executes them directly through the sandbox and does **not**
* ship an in-Worker bundler. This module compiles a skill script (TypeScript or
* multi-file JavaScript) into a single self-contained ESM bundle using esbuild.
*
* It runs in Node (build time) only — the Agents Vite plugin uses it to compile
* bundled skills, and skills served from R2 or other dynamic sources should be
* compiled with {@link compileSkillScript} before upload.
*
* @module
*/
/** Skill-script extensions that can (and must) be compiled ahead of time. */
const COMPILABLE_SCRIPT_EXTENSIONS = /* @__PURE__ */ new Set([
	".js",
	".mjs",
	".ts",
	".tsx"
]);
function extensionOf(path) {
	const file = path.split("/").at(-1) ?? path;
	const index = file.lastIndexOf(".");
	return index === -1 ? "" : file.slice(index).toLowerCase();
}
/**
* Whether a resource path is a skill script that should be compiled ahead of
* time (i.e. has a `.js`, `.mjs`, `.ts`, or `.tsx` extension).
*/
function isCompilableSkillScript(path) {
	return COMPILABLE_SCRIPT_EXTENSIONS.has(extensionOf(path));
}
/**
* Compile a skill script file into a single self-contained ESM module.
*
* Resolves and inlines sibling imports relative to `entryPath`, strips
* TypeScript types, and emits ESM so the script can run in the Worker sandbox
* without an in-Worker bundler.
*
* @param entryPath Absolute path to the skill script file on disk.
*/
async function compileSkillScript(entryPath, options = {}) {
	const output = (await build({
		entryPoints: [entryPath],
		bundle: true,
		write: false,
		format: "esm",
		platform: "browser",
		target: options.target ?? "es2022",
		logLevel: "silent",
		legalComments: "none"
	})).outputFiles?.[0];
	if (!output) throw new Error(`esbuild produced no output when compiling skill script "${entryPath}".`);
	return {
		content: output.text,
		precompiled: true
	};
}
//#endregion
export { compileSkillScript, isCompilableSkillScript };

//# sourceMappingURL=compile.js.map