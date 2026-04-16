/**
 * Detects and removes duplicate import bindings — when the same identifier
 * is imported from two different sources.
 *
 * Example:
 *   import { Hash as ImageIcon } from "lucide-react"
 *   import ImageIcon from "@/components/image-icon"   // ← duplicate, removed
 *
 * When a duplicate is found, the first import wins. If one import is from
 * a local stub path (e.g. @/components/image-icon) and the other from a
 * well-known package, the package import is preferred regardless of order.
 */

const IMPORT_LINE_RE =
  /^import\s+(?:type\s+)?(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*["']([^"']+)["'];?\s*$/gm;

const STUB_PATH_RE = /^[@.]\/components\//;

interface ImportBinding {
  name: string;
  lineIndex: number;
  source: string;
  isStub: boolean;
}

export function fixDuplicateImportBindings(
  code: string,
  _filePath: string,
): { code: string; fixed: boolean; removedBindings: string[] } {
  const lines = code.split("\n");
  const bindings: ImportBinding[] = [];
  const importLineIndices = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    IMPORT_LINE_RE.lastIndex = 0;
    const match = IMPORT_LINE_RE.exec(line);
    if (!match) continue;

    const defaultName = match[1]?.trim() || null;
    const namedPart = match[2] || "";
    const source = match[3];
    const isStub = STUB_PATH_RE.test(source);

    importLineIndices.add(i);

    if (defaultName) {
      bindings.push({ name: defaultName, lineIndex: i, source, isStub });
    }

    for (const spec of namedPart.split(",")) {
      const trimmed = spec.trim();
      if (!trimmed) continue;
      const asMatch = trimmed.match(/\w+\s+as\s+(\w+)/);
      const localName = asMatch ? asMatch[1] : trimmed.replace(/^type\s+/, "");
      if (localName) {
        bindings.push({ name: localName, lineIndex: i, source, isStub });
      }
    }
  }

  const seen = new Map<string, ImportBinding>();
  const linesToRemoveOrPatch = new Map<number, Set<string>>();
  const removedBindings: string[] = [];

  for (const binding of bindings) {
    const existing = seen.get(binding.name);
    if (!existing) {
      seen.set(binding.name, binding);
      continue;
    }

    const drop = binding.isStub && !existing.isStub ? binding : existing.isStub && !binding.isStub ? existing : binding;
    const keep = drop === binding ? existing : binding;

    if (!linesToRemoveOrPatch.has(drop.lineIndex)) {
      linesToRemoveOrPatch.set(drop.lineIndex, new Set());
    }
    linesToRemoveOrPatch.get(drop.lineIndex)!.add(drop.name);
    removedBindings.push(drop.name);

    seen.set(keep.name, keep);
  }

  if (removedBindings.length === 0) {
    return { code, fixed: false, removedBindings: [] };
  }

  const resultLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const namesToDrop = linesToRemoveOrPatch.get(i);
    if (!namesToDrop) {
      resultLines.push(lines[i]);
      continue;
    }

    const line = lines[i];
    IMPORT_LINE_RE.lastIndex = 0;
    const match = IMPORT_LINE_RE.exec(line);
    if (!match) {
      resultLines.push(line);
      continue;
    }

    const defaultName = match[1]?.trim() || null;
    const namedPart = match[2] || "";
    const source = match[3];

    const keepDefault = defaultName && !namesToDrop.has(defaultName);
    const namedSpecs = namedPart
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const keptNamed = namedSpecs.filter((spec) => {
      const asMatch = spec.match(/\w+\s+as\s+(\w+)/);
      const localName = asMatch ? asMatch[1] : spec.replace(/^type\s+/, "");
      return !namesToDrop.has(localName);
    });

    if (!keepDefault && keptNamed.length === 0) {
      continue;
    }

    let rebuilt = "import ";
    if (keepDefault && defaultName) {
      rebuilt += defaultName;
      if (keptNamed.length > 0) rebuilt += ", ";
    }
    if (keptNamed.length > 0) {
      rebuilt += `{ ${keptNamed.join(", ")} }`;
    }
    rebuilt += ` from "${source}";`;
    resultLines.push(rebuilt);
  }

  return {
    code: resultLines.join("\n"),
    fixed: true,
    removedBindings,
  };
}
