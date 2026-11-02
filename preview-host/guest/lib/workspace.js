"use strict";

// Workspace-filer inne i gästmaskinen. Medvetet fristående från hostens
// `src/runtime/workspace-files.js`: gästbilden får bara `guest/` som
// byggkontext och ska inte dra in hostens store/runtime-kod. Kontraktet är
// detsamma som hostens: manifestet `.preview-host-files.json` avgör vilka
// filer en full snapshot får ta bort (lockfiler som pakethanteraren skrev
// lämnas kvar), och varje sökväg måste stanna inne i workspace-roten.
//
// Binärt innehåll avkodas på hosten (`materializeBinaryContent`) och skickas
// hit som `{ encoding: "base64", content }`; gästen skriver bara bytes.

const fs = require("node:fs");
const path = require("node:path");

const MANIFEST_NAME = ".preview-host-files.json";
const DEPS_STATE_NAME = ".preview-host-deps.json";
const WORKSPACE_NAME_RE = /^(live|verify-[A-Za-z0-9_-]{1,80})$/;

function isSafeRelativePath(filePath) {
  if (!filePath || typeof filePath !== "string") return false;
  if (path.isAbsolute(filePath)) return false;
  if (/^[a-zA-Z]:/.test(filePath)) return false;
  const normalized = path.posix.normalize(filePath.replace(/\\/g, "/"));
  if (normalized.startsWith("../") || normalized === "..") return false;
  if (normalized.startsWith("/")) return false;
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "..")) return false;
  return true;
}

function isValidWorkspaceName(name) {
  return typeof name === "string" && WORKSPACE_NAME_RE.test(name);
}

function workspaceDirFor(root, name) {
  if (!isValidWorkspaceName(name)) {
    throw new Error(`Invalid workspace name: "${name}"`);
  }
  return path.join(root, name);
}

function unsafePathError(relPath) {
  const error = new Error(`Unsafe workspace path: "${relPath}"`);
  error.code = "UNSAFE_WORKSPACE_PATH";
  return error;
}

/**
 * Resolve `relPath` strictly inside `workspaceDir`. The directory is created
 * first so the realpath check has something to resolve; symlinks inside the
 * workspace that point outside are rejected by the realpath comparison.
 */
function resolveInsideWorkspace(workspaceDir, relPath) {
  if (!isSafeRelativePath(relPath)) throw unsafePathError(relPath);
  fs.mkdirSync(workspaceDir, { recursive: true });
  const root = fs.realpathSync(path.resolve(workspaceDir));
  const resolved = path.resolve(root, relPath);
  const relative = path.relative(root, resolved);
  const posixRelative = relative.split(/[\\/]+/).join("/");
  if (
    posixRelative === "" ||
    posixRelative === ".." ||
    posixRelative.startsWith("../") ||
    path.isAbsolute(relative)
  ) {
    throw unsafePathError(relPath);
  }
  // A path component that already exists as a symlink could escape after the
  // lexical check. Walk the existing prefix through realpath as well.
  let probe = resolved;
  while (probe !== root) {
    if (fs.existsSync(probe)) {
      const real = fs.realpathSync(probe);
      if (real !== root && !real.startsWith(root + path.sep)) {
        throw unsafePathError(relPath);
      }
      break;
    }
    probe = path.dirname(probe);
  }
  return resolved;
}

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function manifestPath(workspaceDir) {
  return path.join(workspaceDir, MANIFEST_NAME);
}

function depsStatePath(workspaceDir) {
  return path.join(workspaceDir, DEPS_STATE_NAME);
}

function decodeTransportEntry(relPath, entry) {
  if (typeof entry === "string") return Buffer.from(entry, "utf8");
  if (!entry || typeof entry !== "object") {
    throw new Error(`Invalid file entry for "${relPath}"`);
  }
  if (typeof entry.content !== "string") {
    throw new Error(`Invalid file content for "${relPath}"`);
  }
  if (entry.encoding === "base64") return Buffer.from(entry.content, "base64");
  if (entry.encoding === undefined || entry.encoding === "utf8") {
    return Buffer.from(entry.content, "utf8");
  }
  throw new Error(`Unsupported encoding "${entry.encoding}" for "${relPath}"`);
}

function writeEntry(absPath, bytes) {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, bytes);
}

/**
 * Full snapshot: write every file, remove only paths from the previous
 * manifest that are absent now, then persist the new manifest.
 */
function writeWorkspaceSnapshot(workspaceDir, files) {
  if (!files || typeof files !== "object" || Array.isArray(files)) {
    throw new Error("files must be an object");
  }
  fs.mkdirSync(workspaceDir, { recursive: true });
  const prior = readJsonIfExists(manifestPath(workspaceDir));
  const previousFiles = Array.isArray(prior?.files) ? prior.files : [];
  const nextFiles = Object.keys(files);
  const nextSet = new Set(nextFiles);
  const removals = [];
  for (const relPath of previousFiles) {
    if (!nextSet.has(relPath)) removals.push(resolveInsideWorkspace(workspaceDir, relPath));
  }
  const writes = [];
  for (const [relPath, entry] of Object.entries(files)) {
    writes.push({
      absPath: resolveInsideWorkspace(workspaceDir, relPath),
      bytes: decodeTransportEntry(relPath, entry),
    });
  }
  for (const absPath of removals) fs.rmSync(absPath, { recursive: true, force: true });
  for (const { absPath, bytes } of writes) writeEntry(absPath, bytes);
  fs.writeFileSync(manifestPath(workspaceDir), JSON.stringify({ files: nextFiles }, null, 2), "utf8");
  return { written: writes.length, removed: removals.length };
}

/** Diff write: only the given files are touched; manifest is union minus removals. */
function patchWorkspace(workspaceDir, files, removedPaths = []) {
  fs.mkdirSync(workspaceDir, { recursive: true });
  const prior = readJsonIfExists(manifestPath(workspaceDir));
  const manifestSet = new Set(Array.isArray(prior?.files) ? prior.files : []);
  const removals = [];
  for (const relPath of Array.isArray(removedPaths) ? removedPaths : []) {
    if (typeof relPath !== "string" || !relPath) continue;
    removals.push({ relPath, absPath: resolveInsideWorkspace(workspaceDir, relPath) });
  }
  const writes = [];
  for (const [relPath, entry] of Object.entries(files || {})) {
    writes.push({
      relPath,
      absPath: resolveInsideWorkspace(workspaceDir, relPath),
      bytes: decodeTransportEntry(relPath, entry),
    });
  }
  for (const { relPath, absPath } of removals) {
    fs.rmSync(absPath, { recursive: true, force: true });
    manifestSet.delete(relPath);
  }
  for (const { relPath, absPath, bytes } of writes) {
    writeEntry(absPath, bytes);
    manifestSet.add(relPath);
  }
  fs.writeFileSync(
    manifestPath(workspaceDir),
    JSON.stringify({ files: Array.from(manifestSet) }, null, 2),
    "utf8",
  );
  return { written: writes.length, removed: removals.length };
}

function readWorkspaceFile(workspaceDir, relPath, maxBytes) {
  const absPath = resolveInsideWorkspace(workspaceDir, relPath);
  let stat;
  try {
    stat = fs.statSync(absPath);
  } catch {
    return { exists: false };
  }
  if (!stat.isFile()) return { exists: false };
  if (stat.size > maxBytes) {
    return { exists: true, bytes: stat.size, tooLarge: true, content: null };
  }
  return { exists: true, bytes: stat.size, content: fs.readFileSync(absPath, "utf8") };
}

function removeWorkspace(workspaceDir) {
  fs.rmSync(workspaceDir, { recursive: true, force: true });
}

function readDependencyState(workspaceDir) {
  const state = readJsonIfExists(depsStatePath(workspaceDir));
  if (!state || typeof state !== "object") return null;
  const fingerprint =
    typeof state.fingerprint === "string" && state.fingerprint.trim()
      ? state.fingerprint.trim()
      : null;
  return fingerprint ? { fingerprint } : null;
}

function writeDependencyState(workspaceDir, fingerprint) {
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.writeFileSync(depsStatePath(workspaceDir), JSON.stringify({ fingerprint }, null, 2), "utf8");
}

function copyDirectory(sourceDir, targetDir) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.cpSync(sourceDir, targetDir, { recursive: true });
}

module.exports = {
  MANIFEST_NAME,
  DEPS_STATE_NAME,
  isSafeRelativePath,
  isValidWorkspaceName,
  workspaceDirFor,
  resolveInsideWorkspace,
  writeWorkspaceSnapshot,
  patchWorkspace,
  readWorkspaceFile,
  removeWorkspace,
  readDependencyState,
  writeDependencyState,
  copyDirectory,
};
