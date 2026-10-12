import { beforeEach, describe, expect, it, vi } from "vitest";

const snapshot = vi.hoisted(() => vi.fn());
const validate = vi.hoisted(() => vi.fn());
const write = vi.hoisted(() => vi.fn());
const record = vi.hoisted(() => vi.fn());
const acquire = vi.hoisted(() => vi.fn());
const release = vi.hoisted(() => vi.fn());
const imported = vi.hoisted(() => vi.fn());
vi.mock("@/lib/config", () => ({ FEATURES: { useUnsplash: true }, SECRETS: { unsplashAccessKey: "test" } }));
vi.mock("@/lib/gen/version-manager", () => ({ getVersionFilesSnapshot: snapshot }));
vi.mock("@/lib/db/chat-repository-pg", () => ({
  chatHasImportedRepoVersion: imported,
  updateVersionFiles: write, recordKnownBrokenImageReplacements: record,
  acquireVersionLease: acquire, releaseVersionLease: release,
}));
vi.mock("@/lib/utils/image-validator", () => ({
  validateImages: validate,
  buildKnownImageReplacementMap: () => ({ "https://old.example/image": "https://new.example/image" }),
}));
import { validateVersionImages, type VersionImageValidationInput } from "./version-image-validation";

const files = [{ path: "app/page.tsx", content: "old", language: "tsx" as const }];
const fixedFiles = [{ ...files[0], content: "new" }];
const base = { files, filesJson: JSON.stringify(files, null, 2), filesRevision: "rev_old" };
const changed = { files: fixedFiles, filesJson: JSON.stringify(fixedFiles), filesRevision: "rev_new" };
const result = { total: 1, broken: [{ url: "https://old.example/image", alt: "", file: "app/page.tsx",
  status: 404, replacementUrl: "https://new.example/image" }], replacedCount: 1,
  files: [{ name: "app/page.tsx", content: "new" }], warnings: [] };
const input: VersionImageValidationInput = {
  chatId: "chat", versionId: "version", autoFix: true,
  holderRunId: "holder", expectedFilesRevision: "rev_old",
};

describe("validateVersionImages shared server orchestration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    snapshot.mockResolvedValue(base).mockResolvedValueOnce(base).mockResolvedValueOnce(changed);
    validate.mockResolvedValue(result);
    write.mockResolvedValue(true);
    record.mockResolvedValue(true);
    imported.mockResolvedValue(false);
  });

  it("passes exact raw CAS base and existing holder; returns only authoritative new revision", async () => {
    const outcome = await validateVersionImages(input);
    expect(write).toHaveBeenCalledWith("version", JSON.stringify(fixedFiles), {
      holderRunId: "holder", expectedFilesJson: base.filesJson, invalidateVerification: true,
    });
    expect(outcome).toMatchObject({ kind: "checked", result: { fixed: true, persisted: true, filesRevision: "rev_new" } });
    expect(acquire).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it("stops after lost holder/CAS false, without readback or known-map write", async () => {
    write.mockResolvedValue(false);
    expect(await validateVersionImages(input)).toMatchObject({ kind: "stopped", result: { fixed: false, persisted: false } });
    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(record).not.toHaveBeenCalled();
  });

  it.each([null, { ...changed, filesRevision: null }, { ...changed, filesJson: "another writer" }])(
    "cannot reuse old revision when authoritative readback is absent or changed: %j", async (readback) => {
      snapshot.mockReset().mockResolvedValueOnce(base).mockResolvedValueOnce(readback);
      expect(await validateVersionImages(input)).toMatchObject({
        kind: "stopped", result: { persisted: false, fixed: false, filesRevision: null },
      });
      expect(record).not.toHaveBeenCalled();
    },
  );

  it("stops before validation on expected revision mismatch", async () => {
    expect(await validateVersionImages({ ...input, expectedFilesRevision: "stale" })).toMatchObject({ kind: "stopped" });
    expect(validate).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("dry-run never writes files or replacement history", async () => {
    await validateVersionImages({ ...input, autoFix: false });
    expect(write).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it.each(["row", "lineage"])("protects imported repo %s from image mutations", async (origin) => {
    if (origin === "row") snapshot.mockReset().mockResolvedValue({ ...base, editKind: "imported_repo" });
    else imported.mockResolvedValue(true);
    await validateVersionImages(input);
    expect(validate).toHaveBeenCalledWith(expect.objectContaining({ autoFix: false }));
    expect(write).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it("unknown import lineage fails closed before validation or mutation", async () => {
    imported.mockRejectedValue(new Error("DB unavailable"));
    await expect(validateVersionImages(input)).rejects.toThrow("DB unavailable");
    expect(validate).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it("abort during validation prevents every mutation", async () => {
    const controller = new AbortController();
    validate.mockImplementation(async () => { controller.abort(); return result; });
    expect(await validateVersionImages({ ...input, signal: controller.signal })).toMatchObject({ kind: "stopped" });
    expect(write).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it("does not invalidate a no-op scan", async () => {
    validate.mockResolvedValue({ ...result, replacedCount: 0, broken: [] });
    expect(await validateVersionImages(input)).toMatchObject({ kind: "checked", result: { fixed: false, filesRevision: "rev_old" } });
    expect(write).not.toHaveBeenCalled();
  });

  it("copies caller URLs and never mutates the snapshot", async () => {
    const frozen = Object.freeze(files.map((file) => Object.freeze({ ...file })));
    snapshot.mockReset().mockResolvedValueOnce({ ...base, files: frozen }).mockResolvedValueOnce(changed);
    const urls = Object.freeze(["https://old.example/image"]);
    const frozenInput = Object.freeze({ ...input, urls });
    await validateVersionImages(frozenInput);
    expect(validate.mock.calls[0][0].onlyUrls).toEqual(urls);
    expect(validate.mock.calls[0][0].onlyUrls).not.toBe(urls);
    expect(frozen[0].content).toBe("old");
  });

  it("import alone performs no validation, DB mutation or lease action", async () => {
    vi.clearAllMocks();
    vi.resetModules();
    await import("./version-image-validation");
    for (const mock of [snapshot, imported, validate, write, record, acquire, release]) expect(mock).not.toHaveBeenCalled();
  });
});
