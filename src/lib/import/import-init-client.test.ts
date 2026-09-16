import { describe, expect, it } from "vitest";
import {
  parseDroppedImport,
  parseImportInitSuccess,
  readImportInitFailure,
  validateLocalZipFile,
} from "./import-init-client";
import { MAX_LOCAL_ZIP_UPLOAD_BYTES } from "./import-init-contract";

function transfer(partial: {
  files?: File[];
  uriList?: string;
  plain?: string;
}): DataTransfer {
  return {
    files: partial.files ?? [],
    getData: (type: string) => {
      if (type === "text/uri-list") return partial.uriList ?? "";
      if (type === "text/plain") return partial.plain ?? "";
      return "";
    },
  } as unknown as DataTransfer;
}

describe("validateLocalZipFile", () => {
  it("rejects non-zip and oversized files", () => {
    expect(validateLocalZipFile(new File(["x"], "notes.txt"))).toMatch(/ZIP-fil/);
    expect(
      validateLocalZipFile(new File([new Uint8Array(MAX_LOCAL_ZIP_UPLOAD_BYTES + 1)], "big.zip")),
    ).toMatch(/för stor/);
  });
});

describe("parseDroppedImport", () => {
  it("accepts a GitHub link from uri-list and a single ZIP", () => {
    expect(
      parseDroppedImport(
        transfer({ uriList: "#ignored\nhttps://github.com/acme/site\n" }),
      ),
    ).toEqual({ kind: "github", url: "https://github.com/acme/site" });

    const zip = new File(["PK"], "demo.zip", { type: "application/zip" });
    expect(parseDroppedImport(transfer({ files: [zip] }))).toEqual({ kind: "zip", file: zip });
  });

  it("rejects multiple files and non-GitHub URLs", () => {
    expect(
      parseDroppedImport(
        transfer({
          files: [new File(["a"], "a.zip"), new File(["b"], "b.zip")],
        }),
      ).kind,
    ).toBe("invalid");
    expect(parseDroppedImport(transfer({ plain: "https://example.com/repo.zip" })).kind).toBe(
      "invalid",
    );
  });
});

describe("parseImportInitSuccess", () => {
  it("requires the server-owned project id", () => {
    expect(
      parseImportInitSuccess({
        success: true,
        id: "chat_1",
        chatId: "chat_1",
        versionId: "ver_1",
      }),
    ).toBeNull();
    expect(
      parseImportInitSuccess({
        success: true,
        id: "chat_1",
        chatId: "chat_1",
        projectId: "proj_new",
        versionId: "ver_1",
        previewUrl: "https://preview.test",
        preview: { status: "starting", runtimeReady: false, retryable: true },
        source: "github",
        lockedFiles: [],
      })?.projectId,
    ).toBe("proj_new");
  });
});

describe("readImportInitFailure", () => {
  it("handles a 413 without JSON", async () => {
    const failure = await readImportInitFailure(new Response("payload too large", { status: 413 }));
    expect(failure.code).toBe("zip_too_large");
    expect(failure.error).toMatch(/för stor/i);
  });
});
