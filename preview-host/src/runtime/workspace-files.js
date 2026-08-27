"use strict";

// Workspace-materialisering (filsnapshot → disk) och next.config-patchning för
// preview-basePath. Ren extraktion ur runtime.js — ingen beteendeändring.

const fs = require("node:fs");
const path = require("node:path");
const acorn = require("acorn");

const {
  ensureDir,
  manifestPathForWorkspace,
  readJsonIfExists,
  workspaceDirForChat,
} = require("./shared.js");

/** Inject basePath env hook so Fly /{chatId} previews get CSS/JS. Handles .ts/.mjs/.js and common export patterns.
 *
 * Injicerar även (när `SAJTMASKIN_PREVIEW_DISABLE_HMR === "true"`) en
 * `webpack`-mutator som filtrerar bort `HotModuleReplacementPlugin`.
 * Resultat: Next dev's webpack-HMR-klient genereras inte alls och försöker
 * inte upprätta `wss://vm-fly-jakem.fly.dev/<chatId>/_next/webpack-hmr`.
 * Det tystar console-spammet som annars dyker upp några ggr per sekund
 * eftersom Fly's edge-proxy inte alltid lyckas med WS-handshakes genom
 * chatId-prefix. Hot-reload tappas men preview-host gör full iframe-
 * reload via refreshToken vid varje generation ändå. */
// TODO(#4): Geist (and likely other recently-added Google Fonts) sometimes
// 404 in preview at `/<chatId>/_next/static/media/<hash>-s.p.woff2`. Suspected
// causes (timebox lapsed before reproducing live):
//   1. Next dev's font loader fetches the woff2 from Google Fonts at compile
//      time and caches it under `.next/static/media`. If the Fly machine has
//      restricted egress to fonts.gstatic.com / fonts.googleapis.com the
//      compiled `_next/static/media/*` references are stale/missing and 404.
//   2. The font loader's hashed asset path may not pick up the basePath we
//      inject via `SAJTMASKIN_PREVIEW_BASE_PATH`, so the <link rel="preload">
//      points at `/{chatId}/_next/static/media/...` but the asset only exists
//      at `/_next/static/media/...` (or vice versa).
// CONFIRMED variant (2026-07-09, live-verified): Next DevTools/dev-overlay
// requests ITS OWN Geist font at root-absolute `/__nextjs_font/geist-latin.woff2`
// (no chatId prefix — basePath is ignored by the overlay), which this host
// misread as chatId "__nextjs_font" → generic JSON 404. Mitigated via the
// Referer-fallback in `nextInternalRefererFallback()` (proxyPreviewRequest).
// Bandage in place: `font-import-fixer.ts` rewrites `Geist`/`Geist_Mono` to
// `Inter`/`JetBrains_Mono` for generated layouts. Remove that bandage once the
// remaining `_next/static/media` variant above is confirmed fixed.
// En självkörande funktion bygger ett patch-objekt vid require-tid.
// Innehåller: basePath (när env satt) + webpack-mutator som tar bort
// HMR-plugin (när SAJTMASKIN_PREVIEW_DISABLE_HMR=true). Spread:as in
// i Next config med `...EXPRESSION`. Funkar för .js/.mjs/.ts.
const NEXT_CONFIG_ENV_SNIPPET =
  "(()=>{const o={};if(process.env.SAJTMASKIN_PREVIEW_BASE_PATH?.trim())o.basePath=process.env.SAJTMASKIN_PREVIEW_BASE_PATH.trim();if(process.env.SAJTMASKIN_PREVIEW_DISABLE_HMR===\"true\"){o.webpack=(c)=>{c.plugins=(c.plugins||[]).filter((p)=>!(p&&p.constructor&&p.constructor.name===\"HotModuleReplacementPlugin\"));return c;};}return o;})()";

function findNextConfigPath(workspaceDir) {
  const candidates = ["next.config.ts", "next.config.mjs", "next.config.js"];
  for (const name of candidates) {
    const p = path.join(workspaceDir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// Replaces TypeScript-only syntax with same-length whitespace so acorn (JS-only)
// can parse the result while AST node positions still map 1:1 onto the original
// source — letting us slice insertions back into the original file safely.
function stripTsToWhitespace(source) {
  function blank(match) {
    return match.replace(/[^\n]/g, " ");
  }
  let out = source;
  out = out.replace(/import\s+type\s+[^;]*;/g, blank);
  out = out.replace(/export\s+type\s+[^;]*;/g, blank);
  out = out.replace(/^\s*type\s+\w+\s*=\s*[^;]+;/gm, blank);
  out = out.replace(/^\s*interface\s+\w+[^{]*\{[\s\S]*?\n\}/gm, blank);
  out = out.replace(
    /(\b(?:const|let|var)\s+\w+)(\s*:\s*[\w.<>,\s|&[\]'"`]+?)(\s*=)/g,
    (_m, decl, ann, eq) => decl + ann.replace(/[^\n]/g, " ") + eq,
  );
  out = out.replace(/\bsatisfies\s+[\w.<>,\s|&[\]'"`]+/g, blank);
  out = out.replace(/\bas\s+[A-Z][\w.]*(?:<[^>]+>)?/g, blank);
  return out;
}

function findReturnedObjectExpression(node) {
  if (!node) return null;
  if (node.type === "ObjectExpression") return node;
  if (node.type !== "BlockStatement") return null;
  for (const stmt of node.body) {
    if (stmt.type === "ReturnStatement" && stmt.argument?.type === "ObjectExpression") {
      return stmt.argument;
    }
  }
  return null;
}

function findConfigObjectExpression(program) {
  const body = program.body || [];
  const varInits = new Map();
  for (const node of body) {
    if (node.type === "VariableDeclaration") {
      for (const decl of node.declarations) {
        if (
          decl.id?.type === "Identifier" &&
          decl.init?.type === "ObjectExpression"
        ) {
          varInits.set(decl.id.name, decl.init);
        }
      }
    }
  }
  for (const node of body) {
    if (node.type !== "ExportDefaultDeclaration") continue;
    const d = node.declaration;
    if (d.type === "ObjectExpression") return d;
    if (d.type === "Identifier" && varInits.has(d.name)) return varInits.get(d.name);
    if (
      d.type === "FunctionDeclaration" ||
      d.type === "FunctionExpression" ||
      d.type === "ArrowFunctionExpression"
    ) {
      const found = findReturnedObjectExpression(d.body);
      if (found) return found;
    }
  }
  for (const node of body) {
    if (node.type !== "ExpressionStatement") continue;
    const expr = node.expression;
    if (expr?.type !== "AssignmentExpression") continue;
    const { left, right } = expr;
    const isModuleExports =
      left.type === "MemberExpression" &&
      left.object?.type === "Identifier" &&
      left.object.name === "module" &&
      left.property?.type === "Identifier" &&
      left.property.name === "exports";
    if (!isModuleExports) continue;
    if (right.type === "ObjectExpression") return right;
    if (right.type === "Identifier" && varInits.has(right.name)) return varInits.get(right.name);
  }
  if (varInits.size > 0) {
    return varInits.values().next().value;
  }
  return null;
}

/**
 * AST-based next.config patcher. Handles five shapes:
 *   - `const cfg = { … }`
 *   - `const cfg: NextConfig = { … }`
 *   - `module.exports = { … }`
 *   - `export default { … }`
 *   - `export default function() { return { … } }`
 *
 * Returns `{ applied, reason?, file?, method? }` for inspection (used by the
 * snapshot test in scripts/test-patch.mjs). Callers that don't care about the
 * outcome can ignore the return value.
 */
function patchNextConfigViaAst(workspaceDir) {
  const cfgPath = findNextConfigPath(workspaceDir);
  if (!cfgPath) return { applied: false, reason: "no_config_file" };
  const original = fs.readFileSync(cfgPath, "utf8");
  if (original.includes("SAJTMASKIN_PREVIEW_BASE_PATH")) {
    return { applied: false, reason: "already_patched" };
  }
  if (/\bbasePath\s*:/.test(original)) {
    return { applied: false, reason: "basePath_already_present" };
  }

  const isTypeScript = cfgPath.endsWith(".ts");
  const parseable = isTypeScript ? stripTsToWhitespace(original) : original;
  let program;
  try {
    program = acorn.parse(parseable, {
      sourceType: "module",
      ecmaVersion: "latest",
      allowReturnOutsideFunction: true,
    });
  } catch (error) {
    return {
      applied: false,
      reason: `ast_parse_failed:${error instanceof Error ? error.message : "unknown"}`,
    };
  }

  const target = findConfigObjectExpression(program);
  if (!target) {
    return { applied: false, reason: "no_target_object" };
  }

  // target.start points at the opening `{` in the (preprocessed) source. Since
  // stripTsToWhitespace preserves byte offsets, the same offset is the `{` in
  // the original source — we slice in `\n  ...envSnippet,` right after it.
  const insertAt = target.start + 1;
  const patched =
    original.slice(0, insertAt) +
    `\n  ...${NEXT_CONFIG_ENV_SNIPPET},` +
    original.slice(insertAt);
  fs.writeFileSync(cfgPath, patched, "utf8");
  return { applied: true, method: "ast", file: path.basename(cfgPath) };
}

// Regex fallback retained for shapes the AST walker doesn't recognise (e.g.
// `withSentryConfig({...})`, `withMDX({...})` wrappers we haven't taught the
// AST walker about yet). Same skip rules as the AST patcher.
function patchNextConfigViaRegex(workspaceDir) {
  const cfgPath = findNextConfigPath(workspaceDir);
  if (!cfgPath) return { applied: false, reason: "no_config_file" };
  let s = fs.readFileSync(cfgPath, "utf8");
  if (s.includes("SAJTMASKIN_PREVIEW_BASE_PATH")) {
    return { applied: false, reason: "already_patched" };
  }
  if (/\bbasePath\s*:/.test(s)) {
    return { applied: false, reason: "basePath_already_present" };
  }
  const tries = [
    /(const\s+\w+\s*(?::\s*\w+\s*)?=\s*\{)/,
    /(export\s+default\s*\{)/,
    /(module\.exports\s*=\s*\{)/,
  ];
  for (const pattern of tries) {
    if (pattern.test(s)) {
      s = s.replace(pattern, `$1\n  ...${NEXT_CONFIG_ENV_SNIPPET},`);
      fs.writeFileSync(cfgPath, s, "utf8");
      return { applied: true, method: "regex", file: path.basename(cfgPath) };
    }
  }
  return { applied: false, reason: "no_pattern_matched" };
}

function patchNextConfigForPreviewBasePath(workspaceDir) {
  const astResult = patchNextConfigViaAst(workspaceDir);
  if (astResult.applied) return astResult;
  // Skip-reasons (already patched, basePath present, no config file) are
  // terminal — falling back to regex would either be a no-op or risk corrupting
  // an already-patched file. Only retry on parse/walker failure.
  const fallbackable =
    astResult.reason &&
    (astResult.reason.startsWith("ast_parse_failed") ||
      astResult.reason === "no_target_object");
  if (!fallbackable) return astResult;
  return patchNextConfigViaRegex(workspaceDir);
}

const BINARY_BASE64_PREFIX = "base64:";
const KNOWN_TEMPLATE_ASSET_MAGICS = [
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG
  Buffer.from([0xff, 0xd8, 0xff]), // JPEG
  Buffer.from("GIF87a", "ascii"),
  Buffer.from("GIF89a", "ascii"),
  Buffer.from([0x00, 0x00, 0x01, 0x00]), // ICO
  Buffer.from("wOFF", "ascii"),
  Buffer.from("wOF2", "ascii"),
  Buffer.from([0x00, 0x01, 0x00, 0x00]), // TrueType sfnt
  Buffer.from("OTTO", "ascii"), // OpenType CFF
  Buffer.from("%PDF-", "ascii"),
];
const ISO_BMFF_ASSET_BRANDS = new Set([
  "avif", "avis", "isom", "iso2", "iso3", "iso4", "iso5", "iso6",
  "mp41", "mp42", "avc1", "M4V ", "M4A ", "MSNV", "dash", "qt  ",
]);
const EOT_VERSIONS = new Set([0x00010000, 0x00020001, 0x00020002]);

function startsWithBytes(buffer, prefix) {
  return buffer.length >= prefix.length && buffer.subarray(0, prefix.length).equals(prefix);
}

function readEbmlVint(buffer, offset) {
  if (offset >= buffer.length) return null;
  const first = buffer[offset];
  let length = 1;
  let marker = 0x80;
  while (length <= 4 && (first & marker) === 0) {
    length += 1;
    marker >>= 1;
  }
  if (length > 4 || offset + length > buffer.length) return null;
  let value = first & (marker - 1);
  for (let index = 1; index < length; index += 1) value = value * 256 + buffer[offset + index];
  if (value === 2 ** (7 * length) - 1) return null;
  return { length, value };
}

function readEbmlIdLength(buffer, offset) {
  if (offset >= buffer.length) return null;
  let length = 1;
  let marker = 0x80;
  while (length <= 4 && (buffer[offset] & marker) === 0) {
    length += 1;
    marker >>= 1;
  }
  return length <= 4 && offset + length <= buffer.length ? length : null;
}

function hasWebmMagic(buffer) {
  if (!startsWithBytes(buffer, Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return false;
  const headerSize = readEbmlVint(buffer, 4);
  if (!headerSize) return false;
  let offset = 4 + headerSize.length;
  const headerEnd = offset + headerSize.value;
  if (headerEnd > buffer.length) return false;
  while (offset < headerEnd) {
    const idLength = readEbmlIdLength(buffer, offset);
    if (!idLength) return false;
    const size = readEbmlVint(buffer, offset + idLength);
    if (!size) return false;
    const valueStart = offset + idLength + size.length;
    const valueEnd = valueStart + size.value;
    if (valueEnd > headerEnd) return false;
    if (idLength === 2 && buffer[offset] === 0x42 && buffer[offset + 1] === 0x82) {
      return size.value === 4 && buffer.subarray(valueStart, valueEnd).toString("ascii") === "webm";
    }
    offset = valueEnd;
  }
  return false;
}

function hasRiffAssetMagic(buffer) {
  if (buffer.length < 12 || buffer.subarray(0, 4).toString("ascii") !== "RIFF") return false;
  const declaredEnd = buffer.readUInt32LE(4) + 8;
  const formType = buffer.subarray(8, 12).toString("ascii");
  return (
    declaredEnd >= 12 &&
    declaredEnd <= buffer.length &&
    (formType === "WEBP" || formType === "WAVE" || formType === "AVI ")
  );
}

function hasIsoBmffAssetMagic(buffer) {
  if (buffer.length < 16 || buffer.subarray(4, 8).toString("ascii") !== "ftyp") return false;
  const boxSize = buffer.readUInt32BE(0);
  if (boxSize < 16 || boxSize > buffer.length || (boxSize - 16) % 4 !== 0) return false;
  if (ISO_BMFF_ASSET_BRANDS.has(buffer.subarray(8, 12).toString("ascii"))) return true;
  for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
    if (ISO_BMFF_ASSET_BRANDS.has(buffer.subarray(offset, offset + 4).toString("ascii"))) {
      return true;
    }
  }
  return false;
}

function hasBmpMagic(buffer) {
  if (buffer.length < 14 || buffer.subarray(0, 2).toString("ascii") !== "BM") return false;
  const declaredSize = buffer.readUInt32LE(2);
  const pixelOffset = buffer.readUInt32LE(10);
  return declaredSize === buffer.length && buffer.readUInt32LE(6) === 0 && pixelOffset >= 14 && pixelOffset <= declaredSize;
}

function hasEotMagic(buffer) {
  if (buffer.length < 36) return false;
  const declaredSize = buffer.readUInt32LE(0);
  const fontDataSize = buffer.readUInt32LE(4);
  return declaredSize === buffer.length && fontDataSize > 0 && fontDataSize <= declaredSize && EOT_VERSIONS.has(buffer.readUInt32LE(8)) && buffer.readUInt16LE(34) === 0x504c;
}

function hasId3v2Magic(buffer) {
  if (buffer.length < 10 || buffer.subarray(0, 3).toString("ascii") !== "ID3") return false;
  if (buffer[3] < 2 || buffer[3] > 4 || buffer[4] === 0xff) return false;
  for (let offset = 6; offset <= 9; offset += 1) {
    if ((buffer[offset] & 0x80) !== 0) return false;
  }
  const tagSize = (buffer[6] << 21) | (buffer[7] << 14) | (buffer[8] << 7) | buffer[9];
  return 10 + tagSize <= buffer.length;
}

function hasKnownTemplateAssetMagic(buffer) {
  if (KNOWN_TEMPLATE_ASSET_MAGICS.some((magic) => startsWithBytes(buffer, magic))) {
    return true;
  }
  return (
    hasRiffAssetMagic(buffer) ||
    hasIsoBmffAssetMagic(buffer) ||
    hasBmpMagic(buffer) ||
    hasEotMagic(buffer) ||
    hasId3v2Magic(buffer) ||
    hasWebmMagic(buffer)
  );
}

function isBase64AlphabetCode(code) {
  return (
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    (code >= 0x30 && code <= 0x39) ||
    code === 0x2b ||
    code === 0x2f
  );
}

function decodeCanonicalBase64(value) {
  if (!value || value.length % 4 !== 0) return null;
  let dataEnd = value.length;
  while (dataEnd > 0 && value.charCodeAt(dataEnd - 1) === 0x3d) dataEnd -= 1;
  if (value.length - dataEnd > 2) return null;
  for (let index = 0; index < dataEnd; index += 1) {
    if (!isBase64AlphabetCode(value.charCodeAt(index))) return null;
  }
  const decoded = Buffer.from(value, "base64");
  return decoded.toString("base64") === value ? decoded : null;
}

/**
 * Compatibility shield for versions persisted before template-import binary
 * normalization. Decode the normal transport envelope, then unwrap at most one
 * historical nested envelope when canonical Base64 reveals a known asset
 * signature. A nested text envelope stays byte-for-byte intact.
 */
function materializeBinaryContent(content) {
  const decoded = Buffer.from(content.slice(BINARY_BASE64_PREFIX.length), "base64");
  const legacyEnvelope = decoded.toString("utf8");
  if (!legacyEnvelope.startsWith(BINARY_BASE64_PREFIX)) return decoded;
  const legacyDecoded = decodeCanonicalBase64(
    legacyEnvelope.slice(BINARY_BASE64_PREFIX.length),
  );
  return legacyDecoded && hasKnownTemplateAssetMagic(legacyDecoded) ? legacyDecoded : decoded;
}

function writeFilesIntoWorkspace(workspaceDir, filesJson) {
  ensureDir(workspaceDir);
  const priorManifest = readJsonIfExists(manifestPathForWorkspace(workspaceDir));
  const previousFiles = Array.isArray(priorManifest?.files) ? priorManifest.files : [];
  const nextFiles = Object.keys(filesJson);
  const nextSet = new Set(nextFiles);
  for (const relPath of previousFiles) {
    if (!nextSet.has(relPath)) {
      fs.rmSync(path.join(workspaceDir, relPath), { recursive: true, force: true });
    }
  }
  for (const [relPath, content] of Object.entries(filesJson)) {
    const absPath = path.join(workspaceDir, relPath);
    ensureDir(path.dirname(absPath));
    if (typeof content === "string" && content.startsWith(BINARY_BASE64_PREFIX)) {
      fs.writeFileSync(absPath, materializeBinaryContent(content));
    } else {
      fs.writeFileSync(absPath, content, "utf8");
    }
  }
  fs.writeFileSync(
    manifestPathForWorkspace(workspaceDir),
    JSON.stringify({ files: nextFiles }, null, 2),
    "utf8",
  );
  return workspaceDir;
}

function writeWorkspaceFiles(chatId, filesJson) {
  return writeFilesIntoWorkspace(workspaceDirForChat(chatId), filesJson);
}

/**
 * Fast Edit Lane: write ONLY the changed files into an existing workspace and
 * remove `removedPaths`, without deleting any other files. The manifest is
 * updated to the union of prior + changed minus removed so a later full boot
 * stays consistent. Does not touch the running dev process — Next dev's file
 * watcher lazily recompiles the changed route on the next request.
 */
function patchWorkspaceFiles(chatId, files, removedPaths = []) {
  const workspaceDir = workspaceDirForChat(chatId);
  ensureDir(workspaceDir);
  const priorManifest = readJsonIfExists(manifestPathForWorkspace(workspaceDir));
  const manifestSet = new Set(Array.isArray(priorManifest?.files) ? priorManifest.files : []);
  for (const relPath of removedPaths) {
    if (typeof relPath !== "string" || !relPath) continue;
    fs.rmSync(path.join(workspaceDir, relPath), { recursive: true, force: true });
    manifestSet.delete(relPath);
  }
  for (const [relPath, content] of Object.entries(files || {})) {
    const absPath = path.join(workspaceDir, relPath);
    ensureDir(path.dirname(absPath));
    if (typeof content === "string" && content.startsWith(BINARY_BASE64_PREFIX)) {
      fs.writeFileSync(absPath, materializeBinaryContent(content));
    } else {
      fs.writeFileSync(absPath, content, "utf8");
    }
    manifestSet.add(relPath);
  }
  fs.writeFileSync(
    manifestPathForWorkspace(workspaceDir),
    JSON.stringify({ files: Array.from(manifestSet) }, null, 2),
    "utf8",
  );
  return workspaceDir;
}

const PATCH_DEP_CRITICAL_PATHS = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "pnpm-lock.yml",
  "yarn.lock",
]);

/**
 * Returns true when any of the supplied paths is dependency/config-critical and
 * therefore requires a full runtime restart (npm install and/or Next config
 * reload) rather than a hot file patch. `.env*` is included because Next reads
 * env only at boot.
 */
function patchTouchesStructuralPath(paths) {
  for (const relPath of paths) {
    const p = String(relPath || "").replace(/\\/g, "/").trim().toLowerCase();
    if (!p) continue;
    if (PATCH_DEP_CRITICAL_PATHS.has(p)) return true;
    if (/^next\.config\.(?:js|cjs|mjs|ts)$/.test(p)) return true;
    if (/^tsconfig(?:\.[\w.-]+)?\.json$/.test(p)) return true;
    if (p === ".env" || p.startsWith(".env.")) return true;
    if (/^(?:postcss|tailwind)\.config\.[\w.-]+$/.test(p)) return true;
  }
  return false;
}

module.exports = {
  patchNextConfigViaAst,
  patchNextConfigViaRegex,
  patchNextConfigForPreviewBasePath,
  stripTsToWhitespace,
  findConfigObjectExpression,
  writeFilesIntoWorkspace,
  writeWorkspaceFiles,
  patchWorkspaceFiles,
  patchTouchesStructuralPath,
};
