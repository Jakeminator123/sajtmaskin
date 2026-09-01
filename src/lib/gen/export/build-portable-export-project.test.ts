import { beforeEach, describe, expect, it, vi } from "vitest";

const buildExportableProject = vi.hoisted(() => vi.fn());
const chatUsesVerbatimRepo = vi.hoisted(() => vi.fn());

vi.mock("./build-exportable-project", () => ({
  buildExportableProject,
  chatUsesVerbatimRepo,
}));

const { buildPortableExportProject } = await import("./build-portable-export-project");

describe("buildPortableExportProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses canonical assembly for ZIP/GitHub parity and only strips .env.local", async () => {
    chatUsesVerbatimRepo.mockResolvedValue(true);
    buildExportableProject.mockResolvedValue([
      { path: "app/page.tsx", content: "page" },
      { path: "public/.gitkeep", content: "" },
      { path: ".env.local", content: "PLACEHOLDER=value" },
    ]);

    const storedFiles = [{ path: "app/page.tsx", content: "raw" }];
    const result = await buildPortableExportProject(storedFiles, "chat_1");

    expect(chatUsesVerbatimRepo).toHaveBeenCalledWith("chat_1");
    expect(buildExportableProject).toHaveBeenCalledWith(storedFiles, {
      verbatimRepo: true,
    });
    expect(result).toEqual([
      { path: "app/page.tsx", content: "page" },
      { path: "public/.gitkeep", content: "" },
    ]);
  });
});
