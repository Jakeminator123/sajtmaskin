import { describe, expect, it } from "vitest";
import {
  blobSaveFailedMessage,
  missingBlobTokenMessage,
  parseRequireBlobFlag,
  shouldAbortForLocalOnlySave,
  shouldAbortForMissingBlobToken,
} from "./require-blob";

describe("embeddings --require-blob", () => {
  it("parses the flag from argv", () => {
    expect(parseRequireBlobFlag(["--only=variant"])).toBe(false);
    expect(parseRequireBlobFlag(["--require-blob"])).toBe(true);
    expect(parseRequireBlobFlag(["--only=scaffold", "--require-blob"])).toBe(true);
  });

  it("aborts before generate when the Blob token is missing", () => {
    expect(shouldAbortForMissingBlobToken(true, null)).toBe(true);
    expect(shouldAbortForMissingBlobToken(true, "")).toBe(true);
    expect(shouldAbortForMissingBlobToken(true, "vercel_blob_rw_…")).toBe(false);
    expect(shouldAbortForMissingBlobToken(false, null)).toBe(false);
  });

  it("aborts after save when storage stayed local", () => {
    expect(
      shouldAbortForLocalOnlySave(true, { storage: "local" }),
    ).toBe(true);
    expect(
      shouldAbortForLocalOnlySave(true, { storage: "blob" }),
    ).toBe(true);
    expect(
      shouldAbortForLocalOnlySave(true, {
        storage: "blob",
        blobUrl: "https://example.blob.vercel-storage.com/embeddings/x.json",
      }),
    ).toBe(false);
    expect(
      shouldAbortForLocalOnlySave(false, { storage: "local" }),
    ).toBe(false);
  });

  it("keeps operator-facing messages explicit", () => {
    expect(missingBlobTokenMessage()).toContain("BLOB_READ_WRITE_TOKEN");
    expect(missingBlobTokenMessage()).toContain("Vercel Blob");
    expect(blobSaveFailedMessage({ storage: "local" })).toContain("local");
  });
});
