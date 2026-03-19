import path from "path";
import type { StorageBody } from "./types";

export function normalizeStoragePathname(input: string): string {
  const normalized = input
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .replace(/\/+$/, "");
  if (!normalized) {
    throw new Error("Storage pathname cannot be empty.");
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Invalid storage pathname: ${input}`);
  }
  return normalized;
}

export function resolveStorageAbsolutePath(rootDir: string, pathname: string): string {
  const normalized = normalizeStoragePathname(pathname);
  const absolutePath = path.resolve(rootDir, ...normalized.split("/"));
  const absoluteRoot = path.resolve(rootDir);
  const relative = path.relative(absoluteRoot, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Storage pathname escapes root: ${pathname}`);
  }
  return absolutePath;
}

export function encodeStoragePathname(pathname: string): string {
  return normalizeStoragePathname(pathname)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function decodeStoragePathname(pathname: string): string {
  return pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment))
    .join("/");
}

export function stripPublicBaseFromTarget(
  target: string,
  publicUrlBase?: string,
): string | null {
  if (!publicUrlBase) return null;

  const normalizedBase = publicUrlBase.replace(/\/+$/, "");
  const candidates = [target];

  try {
    candidates.push(new URL(target, "http://localhost").pathname);
  } catch {
    // Ignore invalid URL strings and fall back to raw target matching.
  }

  for (const candidate of candidates) {
    const withLeadingSlash = candidate.startsWith("/") ? candidate : `/${candidate}`;
    if (withLeadingSlash === normalizedBase) return "";
    const prefix = `${normalizedBase}/`;
    if (withLeadingSlash.startsWith(prefix)) {
      return withLeadingSlash.slice(prefix.length);
    }
  }

  return null;
}

export function toBuffer(body: StorageBody): Buffer {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  return Buffer.from(body, "utf-8");
}
