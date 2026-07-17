import { ToolSet } from "ai";

//#region src/skills/frontmatter.d.ts
interface ParsedSkillMarkdown {
  data: Record<string, unknown>;
  body: string;
}
declare function parseSkillFrontmatter(raw: string): ParsedSkillMarkdown;
declare function parseSkillMarkdown(raw: string): {
  name: string;
  description: string;
  body: string;
  compatibility?: string;
  license?: string;
  allowedTools?: string;
  metadata?: Record<string, unknown>;
} | null;
//#endregion
//#region src/skills/types.d.ts
interface SkillDescriptor {
  name: string;
  description: string;
  compatibility?: string;
  license?: string;
  allowedTools?: string;
  metadata?: Record<string, unknown>;
  sourceId?: string;
  version?: string;
}
interface SkillContent extends SkillDescriptor {
  body: string;
  rawContent?: string;
  resources?: SkillResourceDescriptor[];
}
interface SkillResourceDescriptor {
  path: string;
  kind: "reference" | "script" | "asset" | "file";
  size?: number;
  encoding?: "text" | "base64";
  mimeType?: string;
  /**
   * Set when a script resource was compiled to a self-contained JavaScript
   * module ahead of time — by the Agents Vite plugin for bundled skills, or via
   * `compileSkillScript` from `agents/skills/compile` for R2/dynamic skills. The
   * runtime runs precompiled scripts directly; the runtime ships no in-Worker
   * bundler, so non-precompiled TypeScript or multi-file scripts cannot run.
   */
  precompiled?: boolean;
}
interface SkillResource extends SkillResourceDescriptor {
  content: string;
}
interface SkillScriptContext {
  skill: SkillDescriptor;
}
/**
 * The `ctx` object passed as the second argument to function-style JS/TS
 * skill scripts (`export default async function run(input, ctx)`).
 *
 * Capabilities are gated by the runner: `workspace` throws unless workspace
 * access is enabled, and `tools` only resolves tools the runner was given.
 */
interface SkillRunContext {
  /** Metadata for the skill that owns this script. */
  skill: SkillDescriptor;
  /** Text bundled resources by relative path (e.g. `references/style-guide.md`). */
  files: Record<string, string>;
  /** Workspace access, gated by the runner's `workspace` permission. */
  workspace: {
    readFile(path: string): Promise<string | null>;
    listFiles(path?: string): Promise<unknown>;
    glob(pattern: string): Promise<unknown>;
    stat(path: string): Promise<{
      type: string;
      size: number;
    } | null>;
    writeFile(path: string, content: string): Promise<void>;
  };
  /** Explicitly granted tools: `tools.call(name, input)` or `tools.<name>(input)`. */
  tools: {
    call(name: string, input?: unknown): Promise<unknown>;
  } & Record<string, (input?: unknown) => Promise<unknown>>;
  /** Scratch artifacts returned to the model as `outputFiles`. */
  output: {
    writeFile(name: string, content: string): Promise<void>;
  };
}
interface SkillScriptRequest {
  skill: SkillContent;
  path: string;
  source: string;
  input: unknown;
  resources?: SkillResource[];
}
interface SkillScriptRunner {
  run(request: SkillScriptRequest): Promise<unknown>;
}
interface SkillSource {
  id: string;
  fingerprint: string;
  list(): Promise<SkillDescriptor[]>;
  load(name: string): Promise<SkillContent | null>;
  readResource?(name: string, path: string): Promise<SkillResource | null>;
  refresh?(): Promise<void>;
}
interface SkillManifestResource extends SkillResourceDescriptor {
  content: string;
}
interface SkillManifestEntry {
  name: string;
  description: string;
  body: string;
  rawContent?: string;
  compatibility?: string;
  license?: string;
  allowedTools?: string;
  metadata?: Record<string, unknown>;
  version?: string;
  resources?: SkillManifestResource[];
}
interface SkillManifest {
  id: string;
  fingerprint: string;
  skills: SkillManifestEntry[];
}
interface SkillRegistrySnapshot {
  fingerprint: string;
  catalogPrompt: string | null;
}
//#endregion
//#region src/skills/manifest.d.ts
declare function fromManifest(manifest: SkillManifest): SkillSource;
//#endregion
//#region src/skills/r2.d.ts
interface R2SkillSourceOptions {
  prefix?: string;
  skills?: string[];
  id?: string;
  fingerprint?: "metadata" | "content";
  refreshIntervalMs?: number;
}
declare function r2(
  bucket: R2Bucket,
  options?: R2SkillSourceOptions
): SkillSource;
//#endregion
//#region src/skills/runner.d.ts
/**
 * Minimal workspace surface the skill runner needs. A concrete `Workspace`
 * from `@cloudflare/shell` (or Think's `WorkspaceLike`) satisfies this
 * structurally, so the runner does not depend on a filesystem package.
 */
interface SkillWorkspace {
  readFile(path: string): Promise<string | null>;
  writeFile(path: string, content: string): Promise<void>;
  readDir(path: string): Promise<unknown>;
  glob(pattern: string): Promise<unknown>;
  stat(path: string): Promise<{
    type: string;
    size?: number;
  } | null>;
}
/**
 * Options for {@link runner}.
 *
 * @experimental Skill script execution is experimental and the option shape
 * may change before stabilizing.
 */
interface WorkerSkillScriptRunnerOptions {
  loader: WorkerLoader;
  timeout?: number;
  network?: boolean;
  workspace?: "none" | "read" | "read-write";
  workspaceInstance?: SkillWorkspace;
  tools?: ToolSet | (() => ToolSet | Promise<ToolSet>);
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
declare function runner(
  options: WorkerSkillScriptRunnerOptions
): SkillScriptRunner;
//#endregion
//#region src/skills/registry.d.ts
declare class SkillRegistry {
  readonly contextLabel = "think_skills";
  /**
   * Non-fatal diagnostics collected during the most recent {@link load} or
   * {@link refresh} (duplicate skill names, sources that failed to list).
   * Reset on every load so it never grows unbounded across refreshes.
   */
  readonly warnings: string[];
  private sources;
  private scriptRunner;
  private descriptors;
  private sourceBySkill;
  private loaded;
  constructor(sources: SkillSource[], scriptRunner?: SkillScriptRunner | null);
  get fingerprint(): string;
  load(): Promise<void>;
  refresh(): Promise<void>;
  snapshot(): Promise<SkillRegistrySnapshot>;
  systemPrompt(): Promise<string | null>;
  loadSkill(name: string): Promise<SkillContent | null>;
  private resolveResourceTarget;
  private readResource;
  private readSkillResources;
  tools(): ToolSet;
}
//#endregion
export {
  type R2SkillSourceOptions,
  type SkillContent,
  type SkillDescriptor,
  type SkillManifest,
  type SkillManifestEntry,
  type SkillManifestResource,
  SkillRegistry,
  type SkillRegistrySnapshot,
  type SkillResource,
  type SkillResourceDescriptor,
  type SkillRunContext,
  type SkillScriptContext,
  type SkillScriptRequest,
  type SkillScriptRunner,
  type SkillSource,
  type SkillWorkspace,
  type WorkerSkillScriptRunnerOptions,
  fromManifest,
  parseSkillFrontmatter,
  parseSkillMarkdown,
  r2,
  runner
};
//# sourceMappingURL=index.d.ts.map
