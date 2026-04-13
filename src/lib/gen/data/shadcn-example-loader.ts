import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface ComponentReference {
  name: string;
  code: string;
}

const cache = new Map<string, ComponentReference | null>();
const EXAMPLES_DIR = join(process.cwd(), "data", "shadcn-examples");

function loadOne(name: string): ComponentReference | null {
  if (cache.has(name)) return cache.get(name) ?? null;
  try {
    const raw = readFileSync(join(EXAMPLES_DIR, `${name}.json`), "utf-8");
    const parsed = JSON.parse(raw) as { name: string; code: string };
    const ref: ComponentReference = { name: parsed.name, code: parsed.code };
    cache.set(name, ref);
    return ref;
  } catch {
    cache.set(name, null);
    return null;
  }
}

/**
 * Load cached shadcn examples by name. Returns only those that exist
 * in the local cache. Silent fallback to empty array if cache is missing.
 */
export function loadShadcnExamples(names: string[]): ComponentReference[] {
  return names.map(loadOne).filter((r): r is ComponentReference => r !== null);
}
