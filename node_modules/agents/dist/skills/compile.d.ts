//#region src/skills/compile.d.ts
interface CompiledSkillScript {
  /** Self-contained ESM source, ready to embed and run without a bundler. */
  content: string;
  /** Always `true`; mirrors the `precompiled` flag on skill resources. */
  precompiled: true;
}
interface CompileSkillScriptOptions {
  /**
   * JavaScript target for the emitted bundle. Defaults to `es2022`, which the
   * Workers runtime supports.
   */
  target?: string;
}
/**
 * Whether a resource path is a skill script that should be compiled ahead of
 * time (i.e. has a `.js`, `.mjs`, `.ts`, or `.tsx` extension).
 */
declare function isCompilableSkillScript(path: string): boolean;
/**
 * Compile a skill script file into a single self-contained ESM module.
 *
 * Resolves and inlines sibling imports relative to `entryPath`, strips
 * TypeScript types, and emits ESM so the script can run in the Worker sandbox
 * without an in-Worker bundler.
 *
 * @param entryPath Absolute path to the skill script file on disk.
 */
declare function compileSkillScript(
  entryPath: string,
  options?: CompileSkillScriptOptions
): Promise<CompiledSkillScript>;
//#endregion
export {
  CompileSkillScriptOptions,
  CompiledSkillScript,
  compileSkillScript,
  isCompilableSkillScript
};
//# sourceMappingURL=compile.d.ts.map
