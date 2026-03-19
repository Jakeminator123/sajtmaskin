import { normalizeStoragePathname, toBuffer } from "./shared";
import type {
  StorageBody,
  StorageListOptions,
  StorageObject,
  StorageObjectInfo,
  StorageProvider,
  StoragePutOptions,
} from "./types";

export interface VercelBlobProviderOptions {
  token?: string | null;
  defaultAccess?: "public" | "private";
}

type BlobSdkRecord = {
  pathname?: string;
  url: string;
  contentType?: string | null;
  size?: number | null;
  uploadedAt?: Date | string | null;
};

export class VercelBlobProvider implements StorageProvider {
  readonly kind = "blob" as const;

  constructor(private readonly options: VercelBlobProviderOptions = {}) {}

  async put(
    pathname: string,
    body: StorageBody,
    options: StoragePutOptions = {},
  ): Promise<StorageObjectInfo> {
    const normalized = normalizeStoragePathname(pathname);
    const blobSdk = await this.getSdk();
    const blob = (await blobSdk.put(normalized, body, {
      access: options.access ?? this.options.defaultAccess ?? "public",
      addRandomSuffix: options.addRandomSuffix,
      contentType: options.contentType,
      ...this.withToken(),
    })) as BlobSdkRecord;

    return toBlobInfo(blob, {
      fallbackPathname: normalized,
      fallbackContentType: options.contentType ?? null,
      fallbackSize: measureBodySize(body),
    });
  }

  async get(pathname: string): Promise<StorageObject | null> {
    const match = await this.findByPathname(pathname);
    if (!match || !match.url) return null;

    const response = await fetch(match.url, { cache: "no-store" });
    if (!response.ok) return null;

    const body = Buffer.from(await response.arrayBuffer());
    return {
      ...match,
      body,
      contentType: response.headers.get("content-type") ?? match.contentType,
      size: match.size ?? body.length,
    };
  }

  async delete(target: string): Promise<boolean> {
    const blobSdk = await this.getSdk();

    if (isHttpUrl(target)) {
      await this.deleteByUrl(blobSdk, target);
      return true;
    }

    const match = await this.findByPathname(target);
    if (!match || !match.url) return false;

    await this.deleteByUrl(blobSdk, match.url);
    return true;
  }

  async list(options: StorageListOptions = {}): Promise<StorageObjectInfo[]> {
    const blobSdk = await this.getSdk();
    const prefix = options.prefix ? normalizeStoragePathname(options.prefix) : null;
    const result = await blobSdk.list({
      ...this.withToken(),
      ...(prefix ? { prefix } : {}),
      ...(options.limit ? { limit: options.limit } : {}),
    });

    const blobs = Array.isArray(result?.blobs) ? (result.blobs as BlobSdkRecord[]) : [];
    return blobs
      .filter((blob) => Boolean(blob.pathname))
      .map((blob) =>
        toBlobInfo(blob, {
          fallbackPathname: blob.pathname ?? prefix ?? "unknown",
          fallbackContentType: blob.contentType ?? null,
          fallbackSize: typeof blob.size === "number" ? blob.size : null,
        }),
      )
      .filter((blob) => !prefix || matchesPathBoundary(blob.pathname, prefix));
  }

  private async findByPathname(pathname: string): Promise<StorageObjectInfo | null> {
    const normalized = normalizeStoragePathname(pathname);
    const blobSdk = await this.getSdk();
    const result = await blobSdk.list({
      ...this.withToken(),
      prefix: normalized,
      limit: 10,
    });

    const blobs = Array.isArray(result?.blobs) ? (result.blobs as BlobSdkRecord[]) : [];
    const match = blobs.find((blob) => blob.pathname === normalized) ?? blobs[0];
    if (!match) return null;

    return toBlobInfo(match, {
      fallbackPathname: normalized,
      fallbackContentType: match.contentType ?? null,
      fallbackSize: typeof match.size === "number" ? match.size : null,
    });
  }

  private async deleteByUrl(blobSdk: any, url: string): Promise<void> {
    if (this.options.token) {
      await blobSdk.del(url, { token: this.options.token });
      return;
    }
    await blobSdk.del(url);
  }

  private withToken(): Record<string, string> {
    return this.options.token ? { token: this.options.token } : {};
  }

  private async getSdk(): Promise<any> {
    return (await import("@vercel/blob")) as any;
  }
}

function toBlobInfo(
  blob: BlobSdkRecord,
  fallback: {
    fallbackPathname: string;
    fallbackContentType: string | null;
    fallbackSize: number | null;
  },
): StorageObjectInfo {
  return {
    pathname: normalizeStoragePathname(blob.pathname ?? fallback.fallbackPathname),
    url: blob.url,
    fsPath: null,
    contentType: blob.contentType ?? fallback.fallbackContentType,
    size: typeof blob.size === "number" ? blob.size : fallback.fallbackSize,
    uploadedAt: toDate(blob.uploadedAt),
  };
}

function measureBodySize(body: StorageBody): number {
  return toBuffer(body).length;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function matchesPathBoundary(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
