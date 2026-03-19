export type StorageBody = string | Buffer | Uint8Array | ArrayBuffer;

export interface StoragePutOptions {
  access?: "public" | "private";
  addRandomSuffix?: boolean;
  contentType?: string;
}

export interface StorageListOptions {
  prefix?: string;
  limit?: number;
}

export interface StorageObjectInfo {
  pathname: string;
  url: string | null;
  fsPath: string | null;
  contentType: string | null;
  size: number | null;
  uploadedAt: Date | null;
}

export interface StorageObject extends StorageObjectInfo {
  body: Buffer;
}

export interface StorageProvider {
  readonly kind: "blob" | "local";
  put(pathname: string, body: StorageBody, options?: StoragePutOptions): Promise<StorageObjectInfo>;
  get(pathname: string): Promise<StorageObject | null>;
  delete(target: string): Promise<boolean>;
  list(options?: StorageListOptions): Promise<StorageObjectInfo[]>;
}
