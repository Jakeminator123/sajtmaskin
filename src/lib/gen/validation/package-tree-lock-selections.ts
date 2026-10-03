import { isMap, isScalar, parseDocument } from "yaml";
import { valid } from "semver";

type Files = ReadonlyArray<{ path: string; content: string }>;
export type LockedNextReact = { next: string; react: string };
const normalize = (path: string) => path.replace(/^\/+/, "").replace(/\\/g, "/");
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

function yamlDocument(raw: string) {
  // Inspect the AST, not toJS(): no alias expansion or custom object types.
  if (raw.length > 2_000_000) return null;
  const doc = parseDocument(raw, { schema: "failsafe", stringKeys: true, uniqueKeys: true });
  return doc.errors.length || doc.warnings.length ? null : doc;
}

function pnpmVersion(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.replace(/^\/(?:next|react)\//, "").split(/[(_]/, 1)[0];
  return valid(candidate);
}

function pnpmSelections(raw: string, pkg: Record<string, unknown>): LockedNextReact | undefined {
  const doc = yamlDocument(raw);
  if (!doc) return undefined;
  const root = doc.has("importers") ? ["importers", "."] : [];
  const version = (name: string) => {
    for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
      const entry = doc.getIn([...root, field, name], true);
      if (!entry) continue;
      const specifier = isMap(entry) ? entry.get("specifier") : doc.getIn([...root, "specifiers", name]);
      // Frozen pnpm install refuses stale specifiers even when the selected
      // version happens to satisfy a newly widened manifest range.
      if (typeof specifier !== "string" || specifier !== record(pkg[field])?.[name]) return null;
      const value = isMap(entry) ? entry.get("version") : isScalar(entry) ? entry.value : null;
      return pnpmVersion(value);
    }
    return null;
  };
  const next = version("next"), react = version("react");
  return next && react ? { next, react } : undefined;
}

function yarnSelections(raw: string, deps: Record<string, string>): LockedNextReact | undefined {
  if (raw.length > 2_000_000) return undefined;
  const candidates: Record<string, Set<string>> = { next: new Set(), react: new Set() };
  const add = (selectors: string, version: unknown) => {
    if (typeof version !== "string" || !valid(version)) return;
    const descriptors = selectors.split(/,\s*/).map((part) => part.trim().replace(/^["']|["']$/g, ""));
    for (const name of ["next", "react"]) {
      if (descriptors.includes(`${name}@${deps[name]}`) || descriptors.includes(`${name}@npm:${deps[name]}`))
        candidates[name].add(version);
    }
  };
  if (/^__metadata:/m.test(raw)) {
    const doc = yamlDocument(raw);
    if (!doc || !isMap(doc.contents)) return undefined;
    for (const item of doc.contents.items) {
      if (isScalar(item.key) && typeof item.key.value === "string" && isMap(item.value))
        add(item.key.value, item.value.get("version"));
    }
  } else {
    // Yarn Classic is its own lock syntax, not YAML. Match only top-level
    // descriptors and their direct version field, never transitive entries.
    for (const block of raw.split(/(?=^[^\s#].+:\s*$)/m)) {
      const selectors = /^([^\s#].+):\s*$/m.exec(block)?.[1];
      const version = /^  version "([^"]+)"\s*$/m.exec(block)?.[1];
      if (selectors && version) add(selectors, version);
    }
  }
  if (candidates.next.size !== 1 || candidates.react.size !== 1) return undefined;
  return { next: [...candidates.next][0], react: [...candidates.react][0] };
}

/** Sibling lock of the selected manifest; same pnpm > Yarn > npm order as preview-host. */
export function readLockedNextReact(files: Files, packagePath: string, pkg: Record<string, unknown>, deps: Record<string, string>): LockedNextReact | undefined {
  const folder = normalize(packagePath).slice(0, normalize(packagePath).lastIndexOf("/") + 1);
  const file = (name: string) => files.find((entry) => normalize(entry.path) === `${folder}${name}`);
  const pnpm = file("pnpm-lock.yaml") ?? file("pnpm-lock.yml");
  const yarn = file("yarn.lock");
  const npm = file("npm-shrinkwrap.json") ?? file("package-lock.json");
  const manager = pnpm ? "pnpm" : yarn ? "yarn" : npm ? "npm" : null;
  const declared = typeof pkg.packageManager === "string" ? pkg.packageManager.split("@")[0] : null;
  // Corepack/Vercel may choose the declared manager; do not use evidence for
  // a different installer when the declaration and preview lock policy disagree.
  if (declared && declared !== manager) return undefined;
  // Preview recognizes the .yml alias, but pnpm's wanted lock and Vercel's
  // detection use pnpm-lock.yaml. The alias alone cannot prove selection.
  if (pnpm && normalize(pnpm.path) !== `${folder}pnpm-lock.yaml`) return undefined;
  try {
    if (pnpm) return pnpmSelections(pnpm.content, pkg);
    if (yarn) return yarnSelections(yarn.content, deps);
    if (!npm) return undefined;
    const lock = record(JSON.parse(npm.content));
    const packages = record(lock?.packages), legacy = record(lock?.dependencies);
    const next = record(packages?.["node_modules/next"] ?? legacy?.next)?.version;
    const react = record(packages?.["node_modules/react"] ?? legacy?.react)?.version;
    return typeof next === "string" && typeof react === "string" ? { next, react } : undefined;
  } catch {
    return undefined; // Invalid/unsupported locks never clear an ambiguous range.
  }
}
