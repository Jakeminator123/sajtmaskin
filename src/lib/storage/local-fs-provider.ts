import fs from "fs/promises";
import path from "path";
import {
  decodeStoragePathname,
  encodeStoragePathname,
  normalizeStoragePathname,
  resolveStorageAbsolutePath,
  stripPublicBaseFromTarget,
  toBuffer,
} from "./shared";
import type {
  StorageListOptions,
  StorageObject,
  StorageObjectInfo,
  StorageProvider,
  StoragePutOptions,
} from "./types";

const CONTENT_TYPE_MAP: Record<string, string> = {
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".css": "text/css",
  ".gif": "image/gif",
  ".html": "text/html",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".md": "text/markdown",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".webm": "video/webm",
  ".webp": "image/webp",
};

export interface LocalFsProviderOptions {
  rootDir: string;
  publicUrlBase?: string;
}

export class LocalFsProvider implements StorageProvider {
  readonly kind = "local" as const;

  constructor(private readonly options: LocalFsProviderOptions) {}

  async put(
    pathname: string,
    body: Buffer | Uint8Array | ArrayBuffer | string,
    options: StoragePutOptions = {},
  ): Promise<StorageObjectInfo> {
    const normalized = normalizeStoragePathname(pathname);
    const absolutePath = resolveStorageAbsolutePath(this.options.rootDir, normalized);
    const buffer = toBuffer(body);

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, buffer);

    const stat = await fs.stat(absolutePath);
    return {
      pathname: normalized,
      url: this.buildPublicUrl(normalized),
      fsPath: absolutePath,
      contentType: options.contentType ?? inferContentType(normalized),
      size: stat.size,
      uploadedAt: stat.mtime,
    };
  }

  async get(pathname: string): Promise<StorageObject | null> {
    const normalized = normalizeStoragePathname(pathname);
    const absolutePath = resolveStorageAbsolutePath(this.options.rootDir, normalized);

    try {
      const [body, stat] = await Promise.all([fs.readFile(absolutePath), fs.stat(absolutePath)]);
      return {
        pathname: normalized,
        url: this.buildPublicUrl(normalized),
        fsPath: absolutePath,
        contentType: inferContentType(normalized),
        size: stat.size,
        uploadedAt: stat.mtime,
        body,
      };
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async delete(target: string): Promise<boolean> {
    const pathname = this.resolveTargetPathname(target);
    const absolutePath = resolveStorageAbsolutePath(this.options.rootDir, pathname);

    try {
      await fs.unlink(absolutePath);
      await pruneEmptyParents(path.dirname(absolutePath), path.resolve(this.options.rootDir));
      return true;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return false;
      }
      throw error;
    }
  }

  async list(options: StorageListOptions = {}): Promise<StorageObjectInfo[]> {
    const absoluteRoot = path.resolve(this.options.rootDir);
    const results: StorageObjectInfo[] = [];
    const prefix = options.prefix ? normalizeStoragePathname(options.prefix) : null;
    const files = await walkFiles(absoluteRoot, options.limit ?? Infinity);

    for (const absolutePath of files) {
      const pathname = path.relative(absoluteRoot, absolutePath).split(path.sep).join("/");
      if (prefix && !matchesPathBoundary(pathname, prefix)) {
        continue;
      }
      const stat = await fs.stat(absolutePath);
      results.push({
        pathname,
        url: this.buildPublicUrl(pathname),
        fsPath: absolutePath,
        contentType: inferContentType(pathname),
        size: stat.size,
        uploadedAt: stat.mtime,
      });
      if (results.length >= (options.limit ?? Infinity)) {
        break;
      }
    }

    return results;
  }

  private buildPublicUrl(pathname: string): string | null {
    if (!this.options.publicUrlBase) return null;
    const base = this.options.publicUrlBase.replace(/\/+$/, "");
    return `${base}/${encodeStoragePathname(pathname)}`;
  }

  private resolveTargetPathname(target: string): string {
    const fromBase = stripPublicBaseFromTarget(target, this.options.publicUrlBase);
    if (fromBase !== null) {
      return normalizeStoragePathname(decodeStoragePathname(fromBase));
    }
    return normalizeStoragePathname(target);
  }
}

async function walkFiles(rootDir: string, limit: number): Promise<string[]> {
  const results: string[] = [];

  async function visit(dir: string): Promise<void> {
    if (results.length >= limit) return;

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      if (results.length >= limit) return;
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (entry.isFile()) {
        results.push(absolutePath);
      }
    }
  }

  await visit(rootDir);
  return results;
}

async function pruneEmptyParents(startDir: string, stopDir: string): Promise<void> {
  let current = startDir;
  const absoluteStop = path.resolve(stopDir);

  while (current.startsWith(absoluteStop) && current !== absoluteStop) {
    const entries = await fs.readdir(current);
    if (entries.length > 0) return;
    await fs.rmdir(current);
    current = path.dirname(current);
  }
}

function inferContentType(pathname: string): string | null {
  const ext = path.extname(pathname).toLowerCase();
  return CONTENT_TYPE_MAP[ext] ?? null;
}

function matchesPathBoundary(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error !== null && typeof error === "object" && "code" in error;
}
