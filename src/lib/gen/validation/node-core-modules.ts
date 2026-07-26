/**
 * Node core modules (`crypto`, `fs`, `path`, …) in both the bare and the
 * `node:`-prefixed form. Canonical for the whole gen pipeline: dependency
 * completion (`dep-completer`) and preflight (`project-sanity`) must agree on
 * what is a core module, otherwise `import { createHash } from "crypto"` is
 * reported as an unpinned npm package and a repair pass "fixes" it by writing
 * `"crypto": "^1"` into package.json.
 *
 * The list is frozen instead of read from `node:module` at runtime because this
 * module is reachable from bundles that have no Node builtins available.
 * `node-core-modules.test.ts` diffs it against `Module.builtinModules` so a
 * Node upgrade that adds a module fails a test instead of silently drifting.
 *
 * The prefix matters: `sqlite`, `test` and `sea` are core ONLY as `node:sqlite`,
 * `node:test` and `node:sea`. All three are real npm packages under their bare
 * names, so treating the bare form as core would make the dep-completer skip
 * pinning them and preflight reject an explicit dependency — the same class of
 * false blocker this module exists to remove.
 */
const NODE_CORE_MODULE_NAMES = [
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "domain",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "inspector",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "string_decoder",
  "sys",
  "timers",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
] as const;

/** Core only WITH the prefix. Bare `sqlite`/`test`/`sea` are npm packages. */
const PREFIX_ONLY_NODE_CORE_MODULE_NAMES = ["sea", "sqlite", "test"] as const;

export const NODE_CORE_MODULES: ReadonlySet<string> = new Set(NODE_CORE_MODULE_NAMES);

export const PREFIX_ONLY_NODE_CORE_MODULES: ReadonlySet<string> = new Set(
  PREFIX_ONLY_NODE_CORE_MODULE_NAMES,
);

/**
 * True for any specifier that resolves to a Node core module, including the
 * `node:` prefix and sub-paths (`node:fs/promises`, `stream/web`,
 * `util/types`). Mirrors `module.isBuiltin()`, prefix rule included.
 */
export function isNodeCoreModule(source: string): boolean {
  if (!source) return false;
  const prefixed = source.startsWith("node:");
  const withoutPrefix = prefixed ? source.slice("node:".length) : source;
  const base = withoutPrefix.split("/")[0] ?? "";
  if (!base) return false;
  if (NODE_CORE_MODULES.has(base)) return true;
  return prefixed && PREFIX_ONLY_NODE_CORE_MODULES.has(base);
}
