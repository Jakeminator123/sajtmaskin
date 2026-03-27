/**
 * Pads missing boolean literal keys on object literals inside `export const <nav> = [ ... ] as const`
 * so TypeScript does not infer a discriminated union when mapping over items (e.g. `item.featured`).
 *
 * Only touches known export names and only when every array element is a `{ ... }` object literal.
 */

const AS_CONST_ARRAY_NAMES =
  /export\s+const\s+(navigation|navItems|menuItems|footerLinks|links)\s*=\s*\[/g;

/** Keys assigned only via boolean literals (true/false), optionally followed by `as const`. */
const BOOLEAN_LITERAL_KEY_RE =
  /\b([A-Za-z_$][\w$]*)\s*:\s*(?:true|false)(?:\s+as\s+const)?\b/g;

type RepairEntry = { fixer: string; description: string; file: string };

/** Match `]` that closes the `[` at `openIdx` (handles `{ }`, nested `[]`, strings). */
function scanMatchingArrayClose(code: string, openIdx: number): number {
  if (code[openIdx] !== "[") return -1;
  let depth = 1;
  let i = openIdx + 1;
  let inString: '"' | "'" | null = null;
  let escape = false;
  let inLine = false;
  let inBlock = false;

  while (i < code.length) {
    const c = code[i];
    const n = code[i + 1];

    if (inLine) {
      if (c === "\n" || c === "\r") inLine = false;
      i++;
      continue;
    }
    if (inBlock) {
      if (c === "*" && n === "/") {
        inBlock = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    if (!inString && c === "/" && n === "/") {
      inLine = true;
      i += 2;
      continue;
    }
    if (!inString && c === "/" && n === "*") {
      inBlock = true;
      i += 2;
      continue;
    }

    if (inString) {
      if (escape) {
        escape = false;
        i++;
        continue;
      }
      if (c === "\\") {
        escape = true;
        i++;
        continue;
      }
      if (c === inString) inString = null;
      i++;
      continue;
    }

    if (c === '"' || c === "'") {
      inString = c;
      i++;
      continue;
    }

    if (c === "{" || c === "[" || c === "(") {
      depth++;
      i++;
      continue;
    }
    if (c === "}" || c === "]" || c === ")") {
      depth--;
      if (depth === 0 && c === "]") return i;
      i++;
      continue;
    }
    i++;
  }
  return -1;
}

/** Split by commas at structural depth 0 (objects, arrays, parens). */
function splitTopLevelComma(body: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let inString: '"' | "'" | null = null;
  let escape = false;
  let inLine = false;
  let inBlock = false;

  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    const n = body[i + 1];

    if (inLine) {
      if (c === "\n" || c === "\r") inLine = false;
      continue;
    }
    if (inBlock) {
      if (c === "*" && n === "/") {
        inBlock = false;
        i++;
      }
      continue;
    }

    if (!inString && c === "/" && n === "/") {
      inLine = true;
      i++;
      continue;
    }
    if (!inString && c === "/" && n === "*") {
      inBlock = true;
      i++;
      continue;
    }

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === inString) inString = null;
      continue;
    }

    if (c === '"' || c === "'") {
      inString = c;
      continue;
    }

    if (c === "{" || c === "[" || c === "(") {
      depth++;
      continue;
    }
    if (c === "}" || c === "]" || c === ")") {
      depth--;
      continue;
    }

    if (c === "," && depth === 0) {
      const chunk = body.slice(start, i).trim();
      if (chunk) parts.push(chunk);
      start = i + 1;
    }
  }
  const tail = body.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function findMatchingBrace(obj: string, openPos: number): number {
  if (obj[openPos] !== "{") return -1;
  let depth = 1;
  let i = openPos + 1;
  let inString: '"' | "'" | null = null;
  let escape = false;
  let inLine = false;
  let inBlock = false;

  while (i < obj.length) {
    const c = obj[i];
    const n = obj[i + 1];

    if (inLine) {
      if (c === "\n" || c === "\r") inLine = false;
      i++;
      continue;
    }
    if (inBlock) {
      if (c === "*" && n === "/") {
        inBlock = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    if (!inString && c === "/" && n === "/") {
      inLine = true;
      i += 2;
      continue;
    }
    if (!inString && c === "/" && n === "*") {
      inBlock = true;
      i += 2;
      continue;
    }

    if (inString) {
      if (escape) {
        escape = false;
        i++;
        continue;
      }
      if (c === "\\") {
        escape = true;
        i++;
        continue;
      }
      if (c === inString) inString = null;
      i++;
      continue;
    }

    if (c === '"' || c === "'") {
      inString = c;
      i++;
      continue;
    }

    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

function collectBooleanKeysFromObject(objStr: string): Set<string> {
  const keys = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(BOOLEAN_LITERAL_KEY_RE.source, "g");
  while ((m = re.exec(objStr)) !== null) {
    keys.add(m[1]);
  }
  return keys;
}

function padObjectWithMissingBooleanKeys(objStr: string, keys: Set<string>): string {
  const trimmed = objStr.trim();
  if (!trimmed.startsWith("{")) return objStr;

  const closeBrace = findMatchingBrace(trimmed, 0);
  if (closeBrace === -1) return objStr;

  const present = collectBooleanKeysFromObject(trimmed.slice(0, closeBrace + 1));
  const missing = [...keys].filter((k) => !present.has(k)).sort();
  if (missing.length === 0) return objStr;

  let out = trimmed;
  for (const key of missing) {
    const c = findMatchingBrace(out, 0);
    if (c === -1) return objStr;
    const before = out.slice(0, c).trimEnd();
    const insertion = before.endsWith("{") || before === "{" ? `${key}: false` : `, ${key}: false`;
    out = `${before} ${insertion} }`;
  }
  return out;
}

function unionBooleanKeysAcrossObjects(objectStrs: string[]): Set<string> {
  const union = new Set<string>();
  for (const s of objectStrs) {
    for (const k of collectBooleanKeysFromObject(s)) {
      union.add(k);
    }
  }
  return union;
}

function guessJoinSeparator(inner: string): string {
  const t = inner.trim();
  if (/\}\s*,\s*\n/.test(t)) return ",\n";
  if (/,\s*\n/.test(t)) return ",\n";
  return ", ";
}

export function fixAsConstBooleanKeys(
  code: string,
  filePath: string,
): { code: string; fixed: boolean; fixes: RepairEntry[] } {
  if (!code.includes("] as const") && !code.includes("]as const")) {
    return { code, fixed: false, fixes: [] };
  }

  const replacements: Array<{ start: number; end: number; text: string }> = [];
  let m: RegExpExecArray | null;

  AS_CONST_ARRAY_NAMES.lastIndex = 0;
  while ((m = AS_CONST_ARRAY_NAMES.exec(code)) !== null) {
    const openIdx = m.index + m[0].length - 1;
    if (code[openIdx] !== "[") continue;

    const closeIdx = scanMatchingArrayClose(code, openIdx);
    if (closeIdx === -1) continue;

    const afterBracket = code.slice(closeIdx + 1);
    const asMatch = afterBracket.match(/^\s*as\s+const\b/);
    if (!asMatch) continue;

    let declEnd = closeIdx + 1 + asMatch[0].length;
    if (code[declEnd] === ";") declEnd++;

    const inner = code.slice(openIdx + 1, closeIdx);
    const elements = splitTopLevelComma(inner);
    if (elements.length === 0) continue;

    const allObjects = elements.every((el) => /^\s*\{/.test(el));
    if (!allObjects) continue;

    const keyUnion = unionBooleanKeysAcrossObjects(elements);
    if (keyUnion.size === 0) continue;

    const padded = elements.map((el) => padObjectWithMissingBooleanKeys(el, keyUnion));
    if (padded.every((p, i) => p === elements[i])) continue;

    const sep = guessJoinSeparator(inner);
    const newInner = padded.join(sep);
    const text =
      code.slice(m.index, openIdx + 1) + newInner + code.slice(closeIdx, declEnd);
    replacements.push({ start: m.index, end: declEnd, text });
  }

  if (replacements.length === 0) {
    return { code, fixed: false, fixes: [] };
  }

  replacements.sort((a, b) => b.start - a.start);
  let next = code;
  for (const r of replacements) {
    next = next.slice(0, r.start) + r.text + next.slice(r.end);
  }

  return {
    code: next,
    fixed: true,
    fixes: replacements.map(() => ({
      fixer: "as-const-boolean-keys",
      description:
        "Padded missing boolean keys on `as const` navigation/link arrays for consistent object shape",
      file: filePath,
    })),
  };
}
