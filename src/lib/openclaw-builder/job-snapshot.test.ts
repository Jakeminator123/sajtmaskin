import { describe, expect, it } from "vitest";

import {
  MAX_SNAPSHOT_FILES,
  MAX_SNAPSHOT_PATH_LENGTH,
  getBuilderJob,
  getProjectSnapshot,
  type FrozenBuilderJob,
  type SnapshotFile,
} from "./job-snapshot";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

function frozenJob(overrides: Partial<FrozenBuilderJob> = {}): FrozenBuilderJob {
  return {
    jobId: "job-1",
    tenantId: "tenant-1",
    projectId: "project-1",
    chatId: "chat-1",
    baseVersionId: "ver-1",
    baseFilesRevision: "rev-1",
    generationInputPackageHash: HASH_A,
    lineageHash: HASH_B,
    lane: "openclaw_shadow",
    allowedTools: ["read"],
    status: "running",
    ...overrides,
  };
}

function requester(overrides: { tenantId?: string; projectId?: string; chatId?: string } = {}) {
  return {
    tenantId: "tenant-1",
    projectId: "project-1",
    chatId: "chat-1",
    ...overrides,
  };
}

function snapshotRequester(
  overrides: {
    tenantId?: string;
    projectId?: string;
    chatId?: string;
    jobId?: string;
    baseVersionId?: string;
    baseFilesRevision?: string;
  } = {},
) {
  return {
    tenantId: "tenant-1",
    projectId: "project-1",
    chatId: "chat-1",
    jobId: "job-1",
    baseVersionId: "ver-1",
    baseFilesRevision: "rev-1",
    ...overrides,
  };
}

function snapshotFile(overrides: Partial<SnapshotFile> = {}): SnapshotFile {
  return {
    path: "src/app/page.tsx",
    bytes: 12,
    language: "tsx",
    sha256: HASH_C,
    ...overrides,
  };
}

describe("getBuilderJob", () => {
  it("returns the frozen job fields on a matching request", () => {
    const job = frozenJob();
    const result = getBuilderJob({
      job,
      requestedJobId: "job-1",
      requester: requester(),
    });
    expect(result).toEqual({ ok: true, job });
    if (result.ok) {
      expect(result.job).toEqual({
        jobId: "job-1",
        tenantId: "tenant-1",
        projectId: "project-1",
        chatId: "chat-1",
        baseVersionId: "ver-1",
        baseFilesRevision: "rev-1",
        generationInputPackageHash: HASH_A,
        lineageHash: HASH_B,
        lane: "openclaw_shadow",
        allowedTools: ["read"],
        status: "running",
      });
      expect(result.job).not.toHaveProperty("userPrompt");
      expect(result.job).not.toHaveProperty("sources");
      expect(result.job).not.toHaveProperty("engineSystemPrompt");
    }
  });

  it("does not invent a GenerationInputPackage on the returned job", () => {
    const extra = {
      ...frozenJob(),
      userPrompt: "bygg en sajt",
      engineSystemPrompt: "you are a builder",
    } as FrozenBuilderJob & { userPrompt: string; engineSystemPrompt: string };
    const result = getBuilderJob({
      job: extra,
      requestedJobId: "job-1",
      requester: requester(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.job).not.toHaveProperty("userPrompt");
      expect(result.job).not.toHaveProperty("engineSystemPrompt");
      expect(Object.keys(result.job).sort()).toEqual(
        [
          "allowedTools",
          "baseFilesRevision",
          "baseVersionId",
          "chatId",
          "generationInputPackageHash",
          "jobId",
          "lane",
          "lineageHash",
          "projectId",
          "status",
          "tenantId",
        ].sort(),
      );
    }
  });

  it("returns job_not_found when requestedJobId does not match", () => {
    expect(
      getBuilderJob({
        job: frozenJob(),
        requestedJobId: "job-other",
        requester: requester(),
      }),
    ).toEqual({ ok: false, code: "job_not_found" });
  });

  it("returns identity_mismatch when tenant, project, or chat differs", () => {
    const job = frozenJob();
    expect(
      getBuilderJob({
        job,
        requestedJobId: "job-1",
        requester: requester({ tenantId: "tenant-other" }),
      }),
    ).toEqual({ ok: false, code: "identity_mismatch" });
    expect(
      getBuilderJob({
        job,
        requestedJobId: "job-1",
        requester: requester({ projectId: "project-other" }),
      }),
    ).toEqual({ ok: false, code: "identity_mismatch" });
    expect(
      getBuilderJob({
        job,
        requestedJobId: "job-1",
        requester: requester({ chatId: "chat-other" }),
      }),
    ).toEqual({ ok: false, code: "identity_mismatch" });
  });

  it("returns invalid_job for a hash that is not 64 lowercase hex", () => {
    expect(
      getBuilderJob({
        job: frozenJob({ generationInputPackageHash: "A".repeat(64) }),
        requestedJobId: "job-1",
        requester: requester(),
      }),
    ).toEqual({ ok: false, code: "invalid_job" });
    expect(
      getBuilderJob({
        job: frozenJob({ lineageHash: "not-a-hash" }),
        requestedJobId: "job-1",
        requester: requester(),
      }),
    ).toEqual({ ok: false, code: "invalid_job" });
    expect(
      getBuilderJob({
        job: frozenJob({ lineageHash: HASH_B.slice(0, 63) }),
        requestedJobId: "job-1",
        requester: requester(),
      }),
    ).toEqual({ ok: false, code: "invalid_job" });
  });

  it("returns invalid_job when required ids are empty", () => {
    expect(
      getBuilderJob({
        job: frozenJob({ jobId: "" }),
        requestedJobId: "",
        requester: requester(),
      }),
    ).toEqual({ ok: false, code: "invalid_job" });
  });
});

describe("getProjectSnapshot", () => {
  it("returns the frozen version, revision, and files sorted by path", () => {
    const files = [
      snapshotFile({ path: "src/lib/z.ts", bytes: 2, sha256: "d".repeat(64) }),
      snapshotFile({ path: "src/app/page.tsx", bytes: 12, sha256: HASH_C }),
    ];
    const result = getProjectSnapshot({
      job: frozenJob(),
      requester: snapshotRequester(),
      files,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.versionId).toBe("ver-1");
      expect(result.filesRevision).toBe("rev-1");
      expect(result.fileCount).toBe(2);
      expect(result.files.map((file) => file.path)).toEqual([
        "src/app/page.tsx",
        "src/lib/z.ts",
      ]);
      expect(result.files[0]).toEqual({
        path: "src/app/page.tsx",
        bytes: 12,
        language: "tsx",
        sha256: HASH_C,
      });
    }
  });

  it("never includes file contents on a successful snapshot", () => {
    const stuffed = {
      ...snapshotFile(),
      content: "export default function Page() { return null; }",
    };
    const result = getProjectSnapshot({
      job: frozenJob(),
      requester: snapshotRequester(),
      files: [stuffed],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.files[0]).not.toHaveProperty("content");
      expect(Object.keys(result.files[0] ?? {}).sort()).toEqual(
        ["bytes", "language", "path", "sha256"].sort(),
      );
    }
  });

  it("returns stale_version when the requester version does not match", () => {
    expect(
      getProjectSnapshot({
        job: frozenJob(),
        requester: snapshotRequester({ baseVersionId: "ver-old" }),
        files: [snapshotFile()],
      }),
    ).toEqual({ ok: false, code: "stale_version" });
  });

  it("returns stale_revision when the requester revision does not match", () => {
    expect(
      getProjectSnapshot({
        job: frozenJob(),
        requester: snapshotRequester({ baseFilesRevision: "rev-old" }),
        files: [snapshotFile()],
      }),
    ).toEqual({ ok: false, code: "stale_revision" });
  });

  it("returns identity_mismatch when tenant, project, chat, or job differs", () => {
    expect(
      getProjectSnapshot({
        job: frozenJob(),
        requester: snapshotRequester({ tenantId: "tenant-other" }),
        files: [snapshotFile()],
      }),
    ).toEqual({ ok: false, code: "identity_mismatch" });
    expect(
      getProjectSnapshot({
        job: frozenJob(),
        requester: snapshotRequester({ projectId: "project-other" }),
        files: [snapshotFile()],
      }),
    ).toEqual({ ok: false, code: "identity_mismatch" });
    expect(
      getProjectSnapshot({
        job: frozenJob(),
        requester: snapshotRequester({ chatId: "chat-other" }),
        files: [snapshotFile()],
      }),
    ).toEqual({ ok: false, code: "identity_mismatch" });
    expect(
      getProjectSnapshot({
        job: frozenJob(),
        requester: snapshotRequester({ jobId: "job-other" }),
        files: [snapshotFile()],
      }),
    ).toEqual({ ok: false, code: "identity_mismatch" });
  });

  it("returns invalid_snapshot for traversal or restricted snapshot paths", () => {
    for (const path of ["../secret.ts", "foo/../../etc/passwd", ".env", "keys/id_ed25519"]) {
      expect(
        getProjectSnapshot({
          job: frozenJob(),
          requester: snapshotRequester(),
          files: [snapshotFile({ path })],
        }),
      ).toEqual({ ok: false, code: "invalid_snapshot" });
    }
  });

  it("returns job_not_running unless status is running", () => {
    for (const status of [
      "pending",
      "completed",
      "failed",
      "stale",
      "cancelled",
      "superseded",
      "expired",
    ] as const) {
      expect(
        getProjectSnapshot({
          job: frozenJob({ status }),
          requester: snapshotRequester(),
          files: [snapshotFile()],
        }),
      ).toEqual({ ok: false, code: "job_not_running" });
    }
  });

  it("returns invalid_snapshot for duplicate paths", () => {
    expect(
      getProjectSnapshot({
        job: frozenJob(),
        requester: snapshotRequester(),
        files: [
          snapshotFile({ path: "src/app/page.tsx", sha256: HASH_C }),
          snapshotFile({ path: "src/app/page.tsx", sha256: "d".repeat(64) }),
        ],
      }),
    ).toEqual({ ok: false, code: "invalid_snapshot" });
  });

  it("returns invalid_snapshot for a sha256 that is not 64 lowercase hex", () => {
    expect(
      getProjectSnapshot({
        job: frozenJob(),
        requester: snapshotRequester(),
        files: [snapshotFile({ sha256: "not-a-sha" })],
      }),
    ).toEqual({ ok: false, code: "invalid_snapshot" });
    expect(
      getProjectSnapshot({
        job: frozenJob(),
        requester: snapshotRequester(),
        files: [snapshotFile({ sha256: "C".repeat(64) })],
      }),
    ).toEqual({ ok: false, code: "invalid_snapshot" });
  });

  it("returns invalid_snapshot when the manifest has too many files", () => {
    const files = Array.from({ length: MAX_SNAPSHOT_FILES + 1 }, (_, index) =>
      snapshotFile({
        path: `src/f-${String(index).padStart(3, "0")}.ts`,
        sha256: HASH_C,
      }),
    );
    expect(
      getProjectSnapshot({
        job: frozenJob(),
        requester: snapshotRequester(),
        files,
      }),
    ).toEqual({ ok: false, code: "invalid_snapshot" });
  });

  it("returns invalid_snapshot for empty, overlong, or negatively sized paths", () => {
    expect(
      getProjectSnapshot({
        job: frozenJob(),
        requester: snapshotRequester(),
        files: [snapshotFile({ path: "" })],
      }),
    ).toEqual({ ok: false, code: "invalid_snapshot" });
    expect(
      getProjectSnapshot({
        job: frozenJob(),
        requester: snapshotRequester(),
        files: [snapshotFile({ path: "x".repeat(MAX_SNAPSHOT_PATH_LENGTH + 1) })],
      }),
    ).toEqual({ ok: false, code: "invalid_snapshot" });
    expect(
      getProjectSnapshot({
        job: frozenJob(),
        requester: snapshotRequester(),
        files: [snapshotFile({ bytes: -1 })],
      }),
    ).toEqual({ ok: false, code: "invalid_snapshot" });
  });

  it("accepts an empty file list for a running job", () => {
    const result = getProjectSnapshot({
      job: frozenJob(),
      requester: snapshotRequester(),
      files: [],
    });
    expect(result).toEqual({
      ok: true,
      versionId: "ver-1",
      filesRevision: "rev-1",
      fileCount: 0,
      files: [],
    });
  });
});
