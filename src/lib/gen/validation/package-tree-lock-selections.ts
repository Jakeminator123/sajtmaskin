import { isMap, isScalar, parseAllDocuments } from "yaml";
import { major, valid } from "semver";

type Files = ReadonlyArray<{ path: string; content: string }>;
export type LockedNextReact = { next: string; react: string; reactSpecifier?: string };
const normalize = (path: string) => path.replace(/^\/+/, "").replace(/\\/g, "/");
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

function yamlDocument(raw: string, pnpm = false, expectedPnpmVersion?: string) {
  // Inspect the AST, not toJS(): no alias expansion or custom object types.
  if (raw.length > 2_000_000) return null;
  const docs = parseAllDocuments(raw, { schema: "failsafe", stringKeys: true, uniqueKeys: true });
  if (!docs.length || docs.length > (pnpm ? 2 : 1) || docs.some((doc) => doc.errors.length || doc.warnings.length)) return null;
  // pnpm's optional environment document precedes the project graph. Never
  // merge their importers or let an invalid environment document hide errors.
  const doc = docs.at(-1)!;
  if (docs.length === 2 && docs[0].get("lockfileVersion") !== doc.get("lockfileVersion")) return null;
  if (docs.length === 2 && expectedPnpmVersion) {
    const pin = docs[0].getIn(["importers", ".", "packageManagerDependencies", "pnpm", "version"]);
    if (valid(String(pin ?? "")) !== expectedPnpmVersion) return null;
  }
  return doc;
}

function pnpmVersion(value: unknown, name: "next" | "react"): string | null {
  if (typeof value !== "string") return null;
  const target = value.startsWith(`/${name}/`) ? value.slice(name.length + 2)
    : value.startsWith(`${name}@`) ? value.slice(name.length + 1) : value;
  const candidate = target.split(/[(_]/, 1)[0];
  return valid(candidate);
}

function declaredPnpmVersion(pkg: Record<string, unknown>): string | null {
  const dev = record(record(pkg.devEngines)?.packageManager);
  const legacy = typeof pkg.packageManager === "string" && pkg.packageManager.startsWith("pnpm@")
    ? valid(pkg.packageManager.slice("pnpm@".length)) : null;
  if (dev && (dev.name !== "pnpm" || dev.onFail === "ignore" || !valid(String(dev.version ?? "")))) return null;
  const pinned = dev ? valid(String(dev.version)) : null;
  if (legacy && pinned && legacy !== pinned) return null;
  return legacy ?? pinned;
}

function compatiblePnpmSchema(schema: unknown, pkg: Record<string, unknown>): boolean {
  if (typeof schema !== "string" || !/^\d+(?:\.\d+)?$/.test(schema)) return false;
  const schemaMajor = Number(schema.split(".")[0]);
  if (![5, 6, 9].includes(schemaMajor)) return false;
  if (typeof pkg.packageManager !== "string" && !record(record(pkg.devEngines)?.packageManager)) return true; // Vercel infers the manager from this known schema.
  const version = declaredPnpmVersion(pkg);
  const managerMajor = version ? major(version) : null;
  if (managerMajor === null) return false;
  // pnpm 7/8 explicitly accept both the legacy v5 and v6 formats in their
  // frozen-install path; a simple one-major-to-one-schema table is incorrect.
  const expected = managerMajor >= 5 && managerMajor <= 6 ? [5]
    : managerMajor === 7 || managerMajor === 8 ? [5, 6]
      : managerMajor >= 9 && managerMajor <= 12 ? [9] : [];
  return expected.includes(schemaMajor);
}

function pnpmSelections(raw: string, pkg: Record<string, unknown>): LockedNextReact | undefined {
  const managerVersion = declaredPnpmVersion(pkg);
  const managerMajor = managerVersion ? major(managerVersion) : null;
  // Older/default Vercel pnpm readers use single-document yaml.load. A newer
  // explicitly pinned reader is required before multi-document proof is safe.
  const doc = yamlDocument(raw, managerMajor !== null && managerMajor >= 11 && managerMajor <= 12, managerVersion ?? undefined);
  if (!doc || !compatiblePnpmSchema(doc.get("lockfileVersion"), pkg)) return undefined;
  const legacy = String(doc.get("lockfileVersion")).startsWith("5");
  const root = doc.has("importers") ? ["importers", "."] : [];
  const version = (name: "next" | "react") => {
    for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
      const entry = doc.getIn([...root, field, name], true);
      if (!entry) continue;
      if (legacy ? !isScalar(entry) : !isMap(entry)) return null;
      const specifier = isMap(entry) ? entry.get("specifier") : doc.getIn([...root, "specifiers", name]);
      // Frozen pnpm install refuses stale specifiers even when the selected
      // version happens to satisfy a newly widened manifest range.
      if (typeof specifier !== "string" || specifier !== record(pkg[field])?.[name]) return null;
      const value = isMap(entry) ? entry.get("version") : isScalar(entry) ? entry.value : null;
      return pnpmVersion(value, name);
    }
    return null;
  };
  const next = version("next"), react = version("react");
  return next && react ? { next, react, reactSpecifier: depsReactSpecifier(pkg) } : undefined;
}

function depsReactSpecifier(pkg: Record<string, unknown>): string | undefined {
  for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
    const specifier = record(pkg[field])?.react;
    if (typeof specifier === "string") return specifier;
  }
  return undefined;
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
  return { next: [...candidates.next][0], react: [...candidates.react][0], reactSpecifier: deps.react };
}

/** Sibling lock of the selected manifest; same pnpm > Yarn > npm order as preview-host. */
export function readLockedNextReact(files: Files, packagePath: string, pkg: Record<string, unknown>, deps: Record<string, string>): LockedNextReact | undefined {
  const folder = normalize(packagePath).slice(0, normalize(packagePath).lastIndexOf("/") + 1);
  const file = (name: string) => files.find((entry) => normalize(entry.path) === `${folder}${name}`);
  const pnpm = file("pnpm-lock.yaml") ?? file("pnpm-lock.yml");
  const yarn = file("yarn.lock");
  const npm = file("npm-shrinkwrap.json") ?? file("package-lock.json");
  const manager = pnpm ? "pnpm" : yarn ? "yarn" : npm ? "npm" : null;
  const dev = record(record(pkg.devEngines)?.packageManager);
  const declared = typeof pkg.packageManager === "string" ? pkg.packageManager.split("@")[0]
    : typeof dev?.name === "string" ? dev.name : null;
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
