import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as mediaConfig from "../../../../data/dossiers/hard/vercel-blob-media/components/lib/media-storage/config";
import * as mediaSeed from "../../../../data/dossiers/hard/vercel-blob-media/components/lib/media-storage/seed-media";

const blobMocks = vi.hoisted(() => ({
  list: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@vercel/blob", () => blobMocks);

interface ServerModule {
  MediaStorageNotConfiguredError: new () => Error;
  listMedia: (options?: { folder?: string; limit?: number }) => Promise<{
    items: Array<{ id: string; kind: "image" | "video" }>;
    demo: boolean;
  }>;
  uploadMedia: (
    file: string,
    options: { filename: string; contentType?: string; folder?: string },
  ) => Promise<{ id: string; kind: "image" | "video" }>;
}

function loadActualServerModule(): ServerModule {
  const serverPath = resolve(
    "data/dossiers/hard/vercel-blob-media/components/lib/media-storage/server.ts",
  );
  const sourceText = readFileSync(serverPath, "utf8");
  const sourceFile = ts.createSourceFile(
    serverPath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const imports = sourceFile.statements
    .filter(ts.isImportDeclaration)
    .map((statement) => (statement.moduleSpecifier as ts.StringLiteral).text);
  expect(imports).toEqual(["server-only", "@vercel/blob", "./config", "./seed-media"]);

  // Generated projects resolve `server-only` through Next. The root repo does
  // not install that marker package, so this bounded CommonJS loader maps only
  // that empty marker, Blob spies and the real config/seed modules. Keeping the
  // original imports in the transpiled source preserves their names/aliases;
  // any new import fails closed. Native dossier CI owns Next bundling.
  const compiled = ts.transpileModule(sourceText, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: serverPath,
  }).outputText;
  const runtimeModule = { exports: {} as ServerModule };
  const requireModule = (specifier: string): unknown => {
    if (specifier === "server-only") return {};
    if (specifier === "@vercel/blob") return blobMocks;
    if (specifier === "./config") return mediaConfig;
    if (specifier === "./seed-media") return mediaSeed;
    throw new Error(`Unexpected server module import: ${specifier}`);
  };
  const evaluate = new Function(
    "require",
    "exports",
    "module",
    `${compiled}\nreturn module.exports;`,
  ) as (...args: unknown[]) => ServerModule;

  return evaluate(requireModule, runtimeModule.exports, runtimeModule);
}

const { MediaStorageNotConfiguredError, listMedia, uploadMedia } = loadActualServerModule();

const ENV_KEYS = ["BLOB_READ_WRITE_TOKEN", "VERCEL_OIDC_TOKEN", "BLOB_STORE_ID"] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("vercel-blob-media server credential contract", () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
    blobMocks.list.mockReset();
    blobMocks.put.mockReset();
  });

  afterEach(restoreEnv);

  it.each([
    ["missing", undefined],
    ["blank", "  \t  "],
    ["placeholder", "blob_read_write_token_placeholder_preview_not_real"],
    ["wrong prefix", "vercel_blob_ro_store_test_secret"],
  ])(
    "keeps the seed/no-upload path for a %s token without calling the SDK",
    async (_label, token) => {
      if (token !== undefined) process.env.BLOB_READ_WRITE_TOKEN = token;

      const listed = await listMedia();
      expect(listed).toEqual({ items: mediaSeed.seedMedia, demo: true });
      expect(listed.items).toBe(mediaSeed.seedMedia);
      await expect(
        uploadMedia("image bytes", { filename: "owner-photo.jpg", contentType: "image/jpeg" }),
      ).rejects.toBeInstanceOf(MediaStorageNotConfiguredError);

      expect(blobMocks.list).not.toHaveBeenCalled();
      expect(blobMocks.put).not.toHaveBeenCalled();
    },
  );

  it("passes the validated existing token explicitly to list and put despite synthetic SDK env", async () => {
    const token = "vercel_blob_rw_teststore_testsecret";
    process.env.BLOB_READ_WRITE_TOKEN = `  ${token}\t `;
    process.env.VERCEL_OIDC_TOKEN = "synthetic-oidc-token-that-must-not-win";
    process.env.BLOB_STORE_ID = "synthetic-store-that-must-not-win";
    blobMocks.list.mockResolvedValue({
      blobs: [
        {
          pathname: "media/owner-photo.jpg",
          url: "https://test.public.blob.vercel-storage.com/media/owner-photo.jpg",
          uploadedAt: new Date("2026-10-06T08:00:00.000Z"),
        },
      ],
    });
    blobMocks.put.mockResolvedValue({
      pathname: "media/owner-photo-testhash.jpg",
      url: "https://test.public.blob.vercel-storage.com/media/owner-photo-testhash.jpg",
    });

    await expect(listMedia({ folder: "owner", limit: 5 })).resolves.toMatchObject({ demo: false });
    await expect(
      uploadMedia("image bytes", { filename: "owner-photo.jpg", contentType: "image/jpeg" }),
    ).resolves.toMatchObject({ kind: "image" });

    expect(blobMocks.list).toHaveBeenCalledWith({
      prefix: "media/owner/",
      limit: 5,
      token,
    });
    expect(blobMocks.put).toHaveBeenCalledWith(
      "media/owner-photo.jpg",
      "image bytes",
      expect.objectContaining({
        access: "public",
        addRandomSuffix: true,
        contentType: "image/jpeg",
        token,
      }),
    );
  });
});
