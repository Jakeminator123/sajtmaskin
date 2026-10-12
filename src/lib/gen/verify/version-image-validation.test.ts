import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const snapshot = vi.hoisted(() => vi.fn());
const validate = vi.hoisted(() => vi.fn());
const write = vi.hoisted(() => vi.fn());
const record = vi.hoisted(() => vi.fn());
const acquire = vi.hoisted(() => vi.fn());
const release = vi.hoisted(() => vi.fn());
const imported = vi.hoisted(() => vi.fn());
const repair = vi.hoisted(() => vi.fn());
const materialize = vi.hoisted(() => vi.fn());
vi.mock("@/lib/config", () => ({ FEATURES: { useUnsplash: true }, SECRETS: { unsplashAccessKey: "test" } }));
vi.mock("@/lib/gen/version-manager", () => ({ getVersionFilesSnapshot: snapshot }));
vi.mock("@/lib/gen/autofix/repair-generated-files", () => ({ repairGeneratedFiles: repair }));
vi.mock("@/lib/images/image-assets", () => ({ materializeImagesInTextFiles: materialize }));
vi.mock("@/lib/db/chat-repository-pg", () => ({
  chatHasImportedRepoVersion: imported,
  updateVersionFiles: write, recordKnownBrokenImageReplacements: record,
  acquireVersionLease: acquire, releaseVersionLease: release,
}));
vi.mock("@/lib/utils/image-validator", () => ({
  validateImages: validate,
  buildKnownImageReplacementMap: () => ({ "https://old.example/image": "https://new.example/image" }),
}));
import { prepareVersionImages, validateVersionImages, type VersionImageValidationInput,
  type VersionImagePreparationInput } from "./version-image-validation";

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

describe("prepareVersionImages held-only preparation", () => {
  const preparation: VersionImagePreparationInput = {
    chatId: "chat", versionId: "version", holderRunId: "holder",
    expectedFilesRevision: "rev_old", materialize: true,
  };
  const summary = { scannedFiles: 1, foundUrls: 1, replaced: 1, uploaded: 1, skipped: 0, totalBytesUploaded: 3 };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "mock-token");
    snapshot.mockResolvedValueOnce(base).mockResolvedValueOnce(changed);
    imported.mockResolvedValue(false);
    repair.mockImplementation((inputFiles) => ({ files: inputFiles, fixes: [] }));
    materialize.mockResolvedValue({
      files: [{ name: "app/page.tsx", content: "new" }], summary, warnings: [],
    });
    write.mockResolvedValue(true);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("persists heal and Blob output once with exact raw CAS and existing holder", async () => {
    repair.mockReturnValue({ files: [{ ...files[0], content: "healed" }], fixes: [{}] });
    const outcome = await prepareVersionImages(preparation);
    expect(materialize).toHaveBeenCalledWith(expect.objectContaining({
      files: [{ name: "app/page.tsx", content: "healed" }],
      strategy: "blob", namespace: { chatId: "chat", versionId: "version" },
      deadlineEpochMs: expect.any(Number),
    }));
    expect(write).toHaveBeenCalledExactlyOnceWith("version", JSON.stringify(fixedFiles), {
      holderRunId: "holder", expectedFilesJson: base.filesJson, invalidateVerification: true,
    });
    expect(outcome).toMatchObject({ kind: "prepared", persisted: true, filesRevision: "rev_new", materialization: summary });
    for (const mock of [validate, record, acquire, release]) expect(mock).not.toHaveBeenCalled();
  });

  it.each(["disabled", "missing token"])("can persist mechanical heal with Blob %s", async (mode) => {
    if (mode === "missing token") vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    repair.mockReturnValue({ files: fixedFiles, fixes: [{}] });
    expect(await prepareVersionImages({ ...preparation, materialize: mode !== "disabled" })).toMatchObject({
      kind: "prepared", persisted: true, filesRevision: "rev_new", materialization: null,
    });
    expect(materialize).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("a semantic no-op preserves raw JSON and rechecks the original revision without writing", async () => {
    materialize.mockResolvedValue({ files: [{ name: "app/page.tsx", content: "old" }], summary: { ...summary, replaced: 0 }, warnings: [] });
    snapshot.mockReset().mockResolvedValue(base);
    expect(await prepareVersionImages(preparation)).toMatchObject({ kind: "prepared", persisted: true, filesRevision: "rev_old" });
    expect(snapshot).toHaveBeenCalledTimes(2);
    expect(write).not.toHaveBeenCalled();
  });

  it("stops on supersession during a no-op rather than returning the old receipt", async () => {
    expect(await prepareVersionImages({ ...preparation, materialize: false })).toMatchObject({
      kind: "stopped", persisted: false, filesRevision: null,
    });
    expect(write).not.toHaveBeenCalled();
  });

  it("does not read back or invent a receipt when holder/CAS loses", async () => {
    write.mockResolvedValue(false);
    expect(await prepareVersionImages(preparation)).toMatchObject({ kind: "stopped", persisted: false, filesRevision: null });
    expect(snapshot).toHaveBeenCalledTimes(1);
  });

  it.each([null, { ...changed, filesRevision: null }, { ...changed, filesRevision: " " },
    { ...changed, filesRevision: "rev_old" }, { ...changed, filesJson: "different writer" }])(
    "rejects unproven readback: %j", async (readback) => {
      snapshot.mockReset().mockResolvedValueOnce(base).mockResolvedValueOnce(readback);
      expect(await prepareVersionImages(preparation)).toMatchObject({ kind: "stopped", persisted: false, filesRevision: null });
    },
  );

  it.each(["row", "followup"])("never heals, uploads or writes imported %s", async (origin) => {
    if (origin === "row") snapshot.mockReset().mockResolvedValue({ ...base, editKind: "imported_repo" });
    else imported.mockResolvedValue(true);
    expect(await prepareVersionImages(preparation)).toMatchObject({ kind: "verbatim", filesRevision: "rev_old" });
    for (const mock of [repair, materialize, write, validate, record, acquire, release]) expect(mock).not.toHaveBeenCalled();
    if (origin === "row") expect(imported).not.toHaveBeenCalled();
  });

  it.each(["throws", "missing"])("unknown lineage fails closed: %s", async (mode) => {
    if (mode === "throws") imported.mockRejectedValue(new Error("lineage unavailable"));
    else imported.mockResolvedValue(undefined);
    expect(await prepareVersionImages(preparation)).toMatchObject({ kind: "stopped", persisted: false, filesRevision: null });
    for (const mock of [repair, materialize, write]) expect(mock).not.toHaveBeenCalled();
  });

  it.each(["holder", "revision", "aborted", "deadline", "invalid deadline"])("stops before any work on %s", async (mode) => {
    const controller = new AbortController();
    if (mode === "aborted") controller.abort();
    const candidate = { ...preparation, signal: controller.signal,
      ...(mode === "holder" ? { holderRunId: " " } : {}),
      ...(mode === "revision" ? { expectedFilesRevision: " " } : {}),
      ...(mode === "deadline" ? { deadlineEpochMs: Date.now() - 1 } : {}),
      ...(mode === "invalid deadline" ? { deadlineEpochMs: NaN } : {}),
    };
    expect(await prepareVersionImages(candidate)).toMatchObject({ kind: "stopped", persisted: false, filesRevision: null });
    for (const mock of [snapshot, imported, repair, materialize, write]) expect(mock).not.toHaveBeenCalled();
  });

  it.each([null, { ...base, filesRevision: "other" }, { ...base, filesRevision: null }])(
    "stops on missing/stale initial snapshot: %j", async (initial) => {
      snapshot.mockReset().mockResolvedValue(initial);
      expect(await prepareVersionImages(preparation)).toMatchObject({ kind: "stopped", persisted: false, filesRevision: null });
      for (const mock of [imported, repair, materialize, write]) expect(mock).not.toHaveBeenCalled();
    },
  );

  it("empty files provide no usable revision receipt", async () => {
    snapshot.mockReset().mockResolvedValue({ ...base, files: [] });
    expect(await prepareVersionImages(preparation)).toMatchObject({ kind: "no_files", persisted: false, filesRevision: null });
    for (const mock of [imported, repair, materialize, write]) expect(mock).not.toHaveBeenCalled();
  });

  it.each(["abort", "deadline"])("does not persist partial materialization after %s", async (mode) => {
    const controller = new AbortController();
    let clock = 100;
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => clock);
    try {
      materialize.mockImplementation(async () => {
        if (mode === "abort") controller.abort(); else clock = 200;
        return { files: [{ name: "app/page.tsx", content: "new" }], summary, warnings: [] };
      });
      expect(await prepareVersionImages({ ...preparation, signal: controller.signal, deadlineEpochMs: 150 })).toMatchObject({
        kind: "stopped", persisted: false, filesRevision: null,
      });
      expect(materialize).toHaveBeenCalledWith(expect.objectContaining({ signal: controller.signal, deadlineEpochMs: 150 }));
      expect(write).not.toHaveBeenCalled();
    } finally { dateNow.mockRestore(); }
  });

  it("a failed persistence returns no revision", async () => {
    write.mockRejectedValue(new Error("write failed"));
    expect(await prepareVersionImages(preparation)).toMatchObject({ kind: "stopped", persisted: false, filesRevision: null });
  });

  it("never mutates the caller snapshot and preserves metadata across text-file projections", async () => {
    const frozen = Object.freeze(files.map((file) => Object.freeze({ ...file, locked: true })));
    const expected = [{ ...frozen[0], content: "new" }];
    snapshot.mockReset().mockResolvedValueOnce({ ...base, files: frozen }).mockResolvedValueOnce({ ...changed, filesJson: JSON.stringify(expected) });
    expect(await prepareVersionImages(Object.freeze(preparation))).toMatchObject({ kind: "prepared", filesRevision: "rev_new" });
    expect(frozen[0].content).toBe("old");
    expect(write.mock.calls[0][1]).toBe(JSON.stringify(expected));
  });
});
