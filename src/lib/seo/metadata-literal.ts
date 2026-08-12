/**
 * Reading and writing string literals inside a Next.js metadata export.
 *
 * A plain regex cannot do this safely, and the two ways it fails both ship
 * broken sites:
 *
 *   1. `([^"'`]*)` stops at the first quote, so an already-escaped literal
 *      (`title: "He said \"hi\""`) matches a span that ends in the middle of
 *      the string. Replacing that span corrupts the file.
 *   2. The first `title:` in the file is not necessarily the metadata title —
 *      `openGraph: { title: … }` above it wins, and the rewrite lands on the
 *      wrong field while the real one keeps its defect.
 *
 * So this module tokenizes instead: it locates the metadata object, walks it
 * with string/comment/depth awareness, and only accepts a key at the object's
 * TOP level. Values are written with `JSON.stringify`, which is the only way
 * to guarantee that model-authored text — newlines, quotes, backslashes,
 * `${`, control characters — lands as a valid TypeScript literal rather than
 * as a syntax error the customer discovers when their build fails.
 */

/** What the metadata object says about a key. */
export type MetadataStringRead =
  | { kind: "literal"; value: string }
  /** Present, but not a plain literal (a call, a variable, a template with holes). */
  | { kind: "dynamic" }
  | { kind: "missing" };

const QUOTES = new Set(['"', "'", "`"]);

/**
 * Index just past the token starting at `i`, when that token is a string or a
 * comment. Returns `i` unchanged for anything else, so callers can use it as a
 * "skip the parts where braces do not count" step.
 */
function skipStringOrComment(source: string, i: number): number {
  const ch = source[i];
  if (ch === "/" && source[i + 1] === "/") {
    const nl = source.indexOf("\n", i);
    return nl === -1 ? source.length : nl;
  }
  if (ch === "/" && source[i + 1] === "*") {
    const close = source.indexOf("*/", i + 2);
    return close === -1 ? source.length : close + 2;
  }
  if (!ch || !QUOTES.has(ch)) return i;
  const end = endOfStringLiteral(source, i);
  return end === -1 ? source.length : end;
}

/** Index just past the closing quote of the literal opening at `start`, or -1. */
function endOfStringLiteral(source: string, start: number): number {
  const quote = source[start];
  for (let i = start + 1; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "\\") {
      i += 1;
      continue;
    }
    if (ch === quote) return i + 1;
    // An unescaped newline terminates '…' and "…" — bail rather than run to EOF.
    if (quote !== "`" && ch === "\n") return -1;
  }
  return -1;
}

/** Index just past the `}` matching the `{` at `open`, or -1. */
function endOfObject(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const skipped = skipStringOrComment(source, i);
    if (skipped !== i) {
      i = skipped - 1;
      continue;
    }
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * Where the metadata object literal lives.
 *
 * Handles both shapes Next.js accepts: `export const metadata = { … }` and the
 * first `return { … }` inside `export function generateMetadata`. A dynamic
 * metadata function that returns a variable has no object here, which is the
 * correct answer — we then know nothing about its keys rather than guessing.
 */
export function findMetadataObject(source: string): { start: number; end: number } | null {
  const constMatch = /export\s+const\s+metadata\b/.exec(source);
  if (constMatch) {
    const eq = source.indexOf("=", constMatch.index + constMatch[0].length);
    if (eq !== -1) {
      const open = source.indexOf("{", eq);
      if (open !== -1) {
        const end = endOfObject(source, open);
        if (end !== -1) return { start: open, end };
      }
    }
  }

  const fnMatch = /export\s+(?:async\s+)?function\s+generateMetadata\b/.exec(source);
  if (fnMatch) {
    const returnMatch = /\breturn\s*\{/.exec(source.slice(fnMatch.index));
    if (returnMatch) {
      const open = fnMatch.index + returnMatch.index + returnMatch[0].length - 1;
      const end = endOfObject(source, open);
      if (end !== -1) return { start: open, end };
    }
  }

  return null;
}

/** Position of the value for a TOP-level `key:` inside the object, or -1. */
function findTopLevelValueStart(
  source: string,
  object: { start: number; end: number },
  key: string,
): number {
  let depth = 0;
  for (let i = object.start; i < object.end; i += 1) {
    const skipped = skipStringOrComment(source, i);
    if (skipped !== i) {
      i = skipped - 1;
      continue;
    }
    const ch = source[i];
    if (ch === "{" || ch === "[" || ch === "(") {
      depth += 1;
      continue;
    }
    if (ch === "}" || ch === "]" || ch === ")") {
      depth -= 1;
      continue;
    }
    // Depth 1 is the object's own body: `{` above counted the opening brace.
    if (depth !== 1) continue;
    if (!source.startsWith(key, i)) continue;
    // Whole-word only, so `title` does not match inside `pageTitle`.
    const before = i === 0 ? "" : source[i - 1];
    if (/[\w$]/.test(before)) continue;
    let after = i + key.length;
    if (/[\w$]/.test(source[after] ?? "")) continue;
    while (/\s/.test(source[after] ?? "")) after += 1;
    if (source[after] !== ":") continue;
    after += 1;
    while (/\s/.test(source[after] ?? "")) after += 1;
    return after;
  }
  return -1;
}

/** Decode the source text of a literal into the string it denotes. */
function decodeLiteral(raw: string): string | null {
  const quote = raw[0];
  const body = raw.slice(1, -1);
  // A template with a hole is not a constant — the caller must treat it as
  // dynamic rather than pretend to know the rendered value.
  if (quote === "`" && /\$\{/.test(body)) return null;
  let out = "";
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = body[i + 1];
    i += 1;
    switch (next) {
      case "n": out += "\n"; break;
      case "r": out += "\r"; break;
      case "t": out += "\t"; break;
      case "b": out += "\b"; break;
      case "f": out += "\f"; break;
      case "v": out += "\v"; break;
      case "0": out += "\0"; break;
      case "\n": break; // line continuation
      case "x": {
        const hex = body.slice(i + 1, i + 3);
        if (/^[0-9a-fA-F]{2}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          i += 2;
        } else out += "x";
        break;
      }
      case "u": {
        if (body[i + 1] === "{") {
          const close = body.indexOf("}", i + 2);
          const hex = close === -1 ? "" : body.slice(i + 2, close);
          if (/^[0-9a-fA-F]{1,6}$/.test(hex)) {
            out += String.fromCodePoint(parseInt(hex, 16));
            i = close;
          } else out += "u";
        } else {
          const hex = body.slice(i + 1, i + 5);
          if (/^[0-9a-fA-F]{4}$/.test(hex)) {
            out += String.fromCharCode(parseInt(hex, 16));
            i += 4;
          } else out += "u";
        }
        break;
      }
      default: out += next ?? "";
    }
  }
  return out;
}

/** Read a top-level metadata string, distinguishing "absent" from "not a literal". */
export function readMetadataString(source: string, key: string): MetadataStringRead {
  const object = findMetadataObject(source);
  if (!object) return { kind: "missing" };
  const valueStart = findTopLevelValueStart(source, object, key);
  if (valueStart === -1) return { kind: "missing" };
  const ch = source[valueStart];
  if (!ch || !QUOTES.has(ch)) return { kind: "dynamic" };
  const end = endOfStringLiteral(source, valueStart);
  if (end === -1) return { kind: "dynamic" };
  const value = decodeLiteral(source.slice(valueStart, end));
  return value === null ? { kind: "dynamic" } : { kind: "literal", value };
}

/**
 * Encode a value as a TypeScript string literal that cannot break the parse.
 *
 * `JSON.stringify` covers quotes, backslashes, newlines and control chars.
 * U+2028/U+2029 are legal in JSON and legal in modern JS string literals, but
 * they still break older tooling in the generated project's own toolchain, so
 * they are escaped rather than passed through.
 */
export function toSafeStringLiteral(value: string): string {
  return JSON.stringify(value).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

/**
 * Insert a top-level `key: value` into the metadata object when the key is
 * absent. The entry goes in as the FIRST property: appending after the last
 * one would need a separating comma there, and if that property ends in a
 * trailing `//` comment the comma lands inside the comment and the file no
 * longer parses.
 */
function insertMetadataString(
  source: string,
  object: { start: number; end: number },
  key: string,
  value: string,
): string {
  const open = object.start;
  const close = object.end - 1;
  const inner = source.slice(open + 1, close);
  const literal = toSafeStringLiteral(value);
  const entry = `${key}: ${literal}`;

  if (inner.trim() === "") {
    const insertion = `\n  ${entry},\n`;
    return source.slice(0, open + 1) + insertion + source.slice(close);
  }

  const indentMatch = /\n(\s+)\S/.exec(source.slice(open, close));
  const propIndent = indentMatch?.[1] ?? "  ";
  const rest = source.slice(open + 1);
  const restOnOwnLine = /^\r?\n/.test(rest);

  return (
    source.slice(0, open + 1) +
    `\n${propIndent}${entry},` +
    (restOnOwnLine ? "" : `\n${propIndent}`) +
    rest
  );
}

/**
 * Write a top-level metadata string. Replaces an existing plain string literal,
 * or inserts the key when it is absent. Returns the source unchanged when there
 * is no metadata object, or when the key exists but is not a plain literal —
 * overwriting a computed value would delete logic we did not write.
 */
export function writeMetadataString(source: string, key: string, value: string): string {
  const object = findMetadataObject(source);
  if (!object) return source;
  const valueStart = findTopLevelValueStart(source, object, key);
  if (valueStart === -1) {
    return insertMetadataString(source, object, key, value);
  }
  const ch = source[valueStart];
  if (!ch || !QUOTES.has(ch)) return source;
  const end = endOfStringLiteral(source, valueStart);
  if (end === -1) return source;
  if (ch === "`" && /\$\{/.test(source.slice(valueStart, end))) return source;
  return source.slice(0, valueStart) + toSafeStringLiteral(value) + source.slice(end);
}
