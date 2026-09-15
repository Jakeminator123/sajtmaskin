import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.hoisted(() => vi.fn());
const dbConfigured = vi.hoisted(() => ({ value: true }));

vi.mock("@/lib/db/client", () => ({
  get dbConfigured() {
    return dbConfigured.value;
  },
  db: {
    execute: (...args: unknown[]) => execute(...args),
  },
}));

import {
  buildTemplateInitClaimKey,
  claimTemplateInit,
  completeTemplateInitClaim,
  failTemplateInitClaim,
} from "./template-init-claim";

function existsProbe() {
  return { rows: [{ oid: "oid" }] };
}

function insertRow(overrides: Record<string, unknown> = {}) {
  return {
    claim_key: "project:proj_1:tmpl_1",
    operation_id: "op_1",
    status: "pending",
    claim_generation: 1,
    project_id: "proj_1",
    chat_id: null,
    version_id: null,
    ...overrides,
  };
}

describe("buildTemplateInitClaimKey", () => {
  it("scopes explicit projects separately from owner-only operations", () => {
    expect(
      buildTemplateInitClaimKey({
        projectId: "proj_1",
        templateId: "tmpl_1",
        userId: "user_1",
        sessionId: "sess_1",
      }),
    ).toBe("project:proj_1:tmpl_1");
    expect(
      buildTemplateInitClaimKey({
        templateId: "tmpl_1",
        userId: "user_1",
        sessionId: "sess_1",
      }),
    ).toBe("owner:user:user_1:tmpl_1");
    expect(
      buildTemplateInitClaimKey({
        templateId: "tmpl_1",
        sessionId: "sess_1",
      }),
    ).toBe("owner:session:sess_1:tmpl_1");
  });
});

describe("claimTemplateInit", () => {
  beforeEach(() => {
    execute.mockReset();
    dbConfigured.value = true;
  });

  it("acquires a new pending operation", async () => {
    execute.mockResolvedValueOnce(existsProbe()).mockResolvedValueOnce({
      rows: [insertRow()],
    });

    await expect(
      claimTemplateInit({
        projectId: "proj_1",
        templateId: "tmpl_1",
        userId: "user_1",
        sessionId: "sess_1",
      }),
    ).resolves.toMatchObject({
      kind: "acquired",
      operationId: "op_1",
      projectId: "proj_1",
      claimGeneration: 1,
    });
  });

  it("returns busy for an in-flight pending row so a lost response cannot start a second import", async () => {
    execute
      .mockResolvedValueOnce(existsProbe())
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          insertRow({
            expires_at: new Date(Date.now() + 60_000),
          }),
        ],
      });

    await expect(
      claimTemplateInit({
        projectId: "proj_1",
        templateId: "tmpl_1",
      }),
    ).resolves.toMatchObject({
      kind: "busy",
      operationId: "op_1",
    });
  });

  it("replays a completed row with the same operation id", async () => {
    execute
      .mockResolvedValueOnce(existsProbe())
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          insertRow({
            status: "completed",
            chat_id: "chat_1",
            version_id: "ver_1",
          }),
        ],
      });

    await expect(
      claimTemplateInit({
        projectId: "proj_1",
        templateId: "tmpl_1",
      }),
    ).resolves.toMatchObject({
      kind: "completed",
      operationId: "op_1",
      chatId: "chat_1",
      versionId: "ver_1",
    });
  });

  it("reuses the same operation id when retrying a failed row", async () => {
    execute
      .mockResolvedValueOnce(existsProbe())
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [insertRow({ status: "failed", operation_id: "op_same" })],
      })
      .mockResolvedValueOnce({
        rows: [insertRow({ status: "pending", operation_id: "op_same", claim_generation: 2 })],
      });

    await expect(
      claimTemplateInit({
        projectId: "proj_1",
        templateId: "tmpl_1",
      }),
    ).resolves.toMatchObject({
      kind: "acquired",
      operationId: "op_same",
      claimGeneration: 2,
    });
  });

  it("keeps two explicit projects on the same template isolated", async () => {
    execute
      .mockResolvedValueOnce(existsProbe())
      .mockResolvedValueOnce({ rows: [insertRow({ claim_key: "project:proj_a:tmpl_1", project_id: "proj_a", operation_id: "op_a" })] })
      .mockResolvedValueOnce(existsProbe())
      .mockResolvedValueOnce({ rows: [insertRow({ claim_key: "project:proj_b:tmpl_1", project_id: "proj_b", operation_id: "op_b" })] });

    const first = await claimTemplateInit({ projectId: "proj_a", templateId: "tmpl_1" });
    const second = await claimTemplateInit({ projectId: "proj_b", templateId: "tmpl_1" });
    expect(first).toMatchObject({ kind: "acquired", operationId: "op_a", projectId: "proj_a" });
    expect(second).toMatchObject({ kind: "acquired", operationId: "op_b", projectId: "proj_b" });
  });

  it("fails closed when the claim table probe is unavailable", async () => {
    execute.mockRejectedValueOnce(new Error("probe failed"));
    await expect(
      claimTemplateInit({ projectId: "proj_1", templateId: "tmpl_1" }),
    ).resolves.toMatchObject({ kind: "unavailable", reason: "unavailable" });
  });
});

describe("complete/fail template init claim", () => {
  beforeEach(() => {
    execute.mockReset();
    dbConfigured.value = true;
  });

  it("completes only the pending generation it owns", async () => {
    execute.mockResolvedValueOnce(existsProbe()).mockResolvedValueOnce({
      rows: [{ operation_id: "op_1" }],
    });
    await expect(
      completeTemplateInitClaim({
        claimKey: "project:proj_1:tmpl_1",
        operationId: "op_1",
        claimGeneration: 1,
        projectId: "proj_1",
        chatId: "chat_1",
        versionId: "ver_1",
      }),
    ).resolves.toBe(true);
  });

  it("marks the same operation failed so a retry can reclaim it", async () => {
    execute.mockResolvedValueOnce(existsProbe()).mockResolvedValueOnce({
      rows: [{ operation_id: "op_1" }],
    });
    await expect(
      failTemplateInitClaim({
        claimKey: "project:proj_1:tmpl_1",
        operationId: "op_1",
        claimGeneration: 1,
        error: "import failed",
      }),
    ).resolves.toBe(true);
  });
});
