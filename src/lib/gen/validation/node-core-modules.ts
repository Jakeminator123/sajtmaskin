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
  "sea",
  "sqlite",
  "stream",
  "string_decoder",
  "sys",
  "test",
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

export const NODE_CORE_MODULES: ReadonlySet<string> = new Set(NODE_CORE_MODULE_NAMES);

/**
 * True for any specifier that resolves to a Node core module, including the
 * `node:` prefix and sub-paths (`node:fs/promises`, `stream/web`,
 * `util/types`).
 */
export function isNodeCoreModule(source: string): boolean {
  if (!source) return false;
  const withoutPrefix = source.startsWith("node:") ? source.slice("node:".length) : source;
  const base = withoutPrefix.split("/")[0] ?? "";
  return NODE_CORE_MODULES.has(base);
}
