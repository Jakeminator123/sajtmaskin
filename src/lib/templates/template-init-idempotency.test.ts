import { beforeEach, describe, expect, it, vi } from "vitest";

const listChatsByProject = vi.hoisted(() => vi.fn());
const getPreferredVersion = vi.hoisted(() => vi.fn());
const getLatestVersion = vi.hoisted(() => vi.fn());
const getChatOrchestrationSnapshot = vi.hoisted(() => vi.fn());
const getChat = vi.hoisted(() => vi.fn());
const getProjectData = vi.hoisted(() => vi.fn());
const saveProjectData = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/chat-repository-pg", () => ({
  listChatsByProject,
  getPreferredVersion,
  getLatestVersion,
  getChatOrchestrationSnapshot,
  getChat,
}));

vi.mock("@/lib/db/services/projects", () => ({
  getProjectData,
  saveProjectData,
}));

import {
  findExistingTemplateInit,
  isTemplateInitLookupError,
  markTemplateInitPending,
  parseTemplateInitFiles,
  pickMainTemplateCode,
  readTemplateIdFromOrchestrationSnapshot,
  readTemplateIdFromProjectMeta,
} from "./template-init-idempotency";

describe("template-init idempotency helpers", () => {
  it("reads templateId from project_data.meta", () => {
    expect(readTemplateIdFromProjectMeta({ templateId: "tmpl_1" })).toBe("tmpl_1");
    expect(readTemplateIdFromProjectMeta({ templateId: "  " })).toBeNull();
    expect(readTemplateIdFromProjectMeta(null)).toBeNull();
  });

  it("reads templateId from imported-repo snapshot shapes", () => {
    expect(
      readTemplateIdFromOrchestrationSnapshot({
        importedRepoBaseline: {
          contract: { origin: { kind: "v0_template", templateId: "tmpl_1" } },
        },
      }),
    ).toBe("tmpl_1");
    expect(
      readTemplateIdFromOrchestrationSnapshot({
        importedRepoBaseline: { origin: { templateId: "tmpl_legacy" } },
      }),
    ).toBe("tmpl_legacy");
    expect(readTemplateIdFromOrchestrationSnapshot({ origin: { templateId: "tmpl_root" } })).toBe(
      "tmpl_root",
    );
    expect(readTemplateIdFromOrchestrationSnapshot({ importedRepoBaseline: {} })).toBeNull();
  });

  it("parses version files_json into legacy template files and picks page.tsx", () => {
    const files = parseTemplateInitFiles(
      JSON.stringify([
        { path: "package.json", content: "{}" },
        { path: "app/page.tsx", content: "export default function Page() { return null; }" },
      ]),
    );
    expect(files).toEqual([
      { name: "package.json", content: "{}" },
      { name: "app/page.tsx", content: "export default function Page() { return null; }" },
    ]);
    expect(pickMainTemplateCode(files)).toContain("export default function Page");
    expect(parseTemplateInitFiles("not-json")).toEqual([]);
  });
});

describe("findExistingTemplateInit", () => {
  beforeEach(() => {
    listChatsByProject.mockReset();
    getPreferredVersion.mockReset();
    getLatestVersion.mockReset();
    getChatOrchestrationSnapshot.mockReset();
    getChat.mockReset();
    getProjectData.mockReset();
    saveProjectData.mockReset();
    listChatsByProject.mockResolvedValue([]);
    getPreferredVersion.mockResolvedValue(null);
    getLatestVersion.mockResolvedValue(null);
    getChatOrchestrationSnapshot.mockResolvedValue(null);
    getChat.mockResolvedValue(null);
    getProjectData.mockResolvedValue(null);
  });

  it("replays the chat whose snapshot origin matches templateId", async () => {
    listChatsByProject.mockResolvedValue([
      {
        id: "chat_other",
        model: "gpt-other",
        orchestration_snapshot: {
          importedRepoBaseline: {
            contract: { origin: { templateId: "tmpl_other" } },
          },
        },
      },
      {
        id: "chat_hit",
        model: "gpt-hit",
        orchestration_snapshot: {
          importedRepoBaseline: {
            contract: { origin: { templateId: "tmpl_1" } },
          },
        },
      },
    ]);
    getPreferredVersion.mockImplementation(async (chatId: string) =>
      chatId === "chat_hit"
        ? {
            id: "ver_hit",
            files_json: JSON.stringify([{ path: "app/page.tsx", content: "const x = 1;" }]),
            preview_url: "https://preview.example/chat_hit",
          }
        : null,
    );

    await expect(findExistingTemplateInit("proj_1", "tmpl_1")).resolves.toMatchObject({
      chatId: "chat_hit",
      projectId: "proj_1",
      versionId: "ver_hit",
      previewUrl: "https://preview.example/chat_hit",
      code: "const x = 1;",
      model: "gpt-hit",
    });
    expect(getPreferredVersion).toHaveBeenCalledWith("chat_hit");
  });

  it("does not reuse a different template chat on the same project", async () => {
    listChatsByProject.mockResolvedValue([
      {
        id: "chat_a",
        model: "gpt-a",
        orchestration_snapshot: {
          importedRepoBaseline: {
            contract: { origin: { templateId: "tmpl_a" } },
          },
        },
      },
    ]);
    getProjectData.mockResolvedValue({
      chat_id: "chat_a",
      meta: { templateId: "tmpl_b" },
    });

    await expect(findExistingTemplateInit("proj_1", "tmpl_b")).resolves.toBeNull();
    expect(getPreferredVersion).not.toHaveBeenCalled();
  });

  it("returns null when the matching chat has no version yet", async () => {
    listChatsByProject.mockResolvedValue([
      {
        id: "chat_pending",
        model: "gpt-1",
        orchestration_snapshot: {
          importedRepoBaseline: {
            contract: { origin: { templateId: "tmpl_1" } },
          },
        },
      },
    ]);

    await expect(findExistingTemplateInit("proj_1", "tmpl_1")).resolves.toBeNull();
  });

  it("throws a retryable lookup error when both version reads fail", async () => {
    listChatsByProject.mockResolvedValue([
      {
        id: "chat_hit",
        model: "gpt-hit",
        orchestration_snapshot: {
          importedRepoBaseline: {
            contract: { origin: { templateId: "tmpl_1" } },
          },
        },
      },
    ]);
    getPreferredVersion.mockRejectedValue(new Error("preferred down"));
    getLatestVersion.mockRejectedValue(new Error("latest down"));

    await expect(findExistingTemplateInit("proj_1", "tmpl_1")).rejects.toSatisfy(
      (error: unknown) => isTemplateInitLookupError(error) && (error as { retryable: boolean }).retryable,
    );
    expect(getLatestVersion).not.toHaveBeenCalled();
  });

  it("throws a retryable lookup error when preferred is missing and latest fails", async () => {
    listChatsByProject.mockResolvedValue([
      {
        id: "chat_hit",
        model: "gpt-hit",
        orchestration_snapshot: {
          importedRepoBaseline: {
            contract: { origin: { templateId: "tmpl_1" } },
          },
        },
      },
    ]);
    getPreferredVersion.mockResolvedValue(null);
    getLatestVersion.mockRejectedValue(new Error("latest down"));

    await expect(findExistingTemplateInit("proj_1", "tmpl_1")).rejects.toSatisfy((error: unknown) =>
      isTemplateInitLookupError(error),
    );
  });
});

describe("markTemplateInitPending", () => {
  it("writes templateId onto project_data.meta before chat creation", async () => {
    saveProjectData.mockResolvedValue(undefined);
    await markTemplateInitPending("proj_new", "tmpl_1");
    expect(saveProjectData).toHaveBeenCalledWith({
      project_id: "proj_new",
      meta_patch: {
        templateId: "tmpl_1",
        source: "template-init:pending",
      },
    });
  });
});
