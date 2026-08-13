import type { SaveEmbeddingsResult } from "../../src/lib/gen/embeddings/embeddings-storage";

export function parseRequireBlobFlag(argv: readonly string[]): boolean {
  return argv.includes("--require-blob");
}

export function missingBlobTokenMessage(): string {
  return (
    "BLOB_READ_WRITE_TOKEN saknas — operator-körning kräver publicering till Vercel Blob " +
    "(embeddings/*.json). Lokal JSON är bara gitignorerad cache, inte källan. " +
    "Sätt token i .env.local och kör om."
  );
}

export function blobSaveFailedMessage(saved: {
  storage: string;
  blobUrl?: string;
}): string {
  return (
    `Embeddings sparades som ${saved.storage}` +
    (saved.blobUrl ? "" : " utan Blob-URL") +
    ". Operator-körning kräver Vercel Blob."
  );
}

export function shouldAbortForMissingBlobToken(
  requireBlob: boolean,
  token: string | null,
): boolean {
  return requireBlob && !token;
}

export function shouldAbortForLocalOnlySave(
  requireBlob: boolean,
  saved: Pick<SaveEmbeddingsResult, "storage" | "blobUrl">,
): boolean {
  return requireBlob && (saved.storage !== "blob" || !saved.blobUrl);
}
