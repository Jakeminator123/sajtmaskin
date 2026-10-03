import { beforeEach, describe, expect, it, vi } from "vitest";

const createProject = vi.hoisted(() => vi.fn());

vi.mock("@/lib/projects/project-client", () => ({ createProject }));

import { createAuditBuildHandoff } from "./audit-handoff-client";

const payload = {
  domain: "example.se",
  url: "https://example.se",
  company: "Example AB",
  audit_scores: { seo: 70 },
};

describe("createAuditBuildHandoff", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    createProject.mockReset();
    createProject.mockResolvedValue({ id: "project_1" });
  });

  it("creates the project, stores the audit payload, and returns the existing builder href", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ success: true, promptId: "prompt_1" })));

    const result = await createAuditBuildHandoff(payload, "website");

    expect(createProject).toHaveBeenCalledWith(
      expect.stringMatching(/^Audit - /),
      "audit",
      "Bygg en förbättrad sajt för example.se",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/prompts",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          prompt: "Bygg en förbättrad sajt för example.se",
          source: "audit",
          projectId: "project_1",
          payload,
        }),
      }),
    );
    expect(result).toEqual({
      projectId: "project_1",
      promptId: "prompt_1",
      href:
        "/builder?project=project_1&source=audit&promptId=prompt_1&buildMethod=audit&buildIntent=website",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed on a non-JSON or unsuccessful prompt response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("not json", { status: 502 }));

    await expect(createAuditBuildHandoff(payload, "website")).rejects.toThrow(
      "Kunde inte spara audit-prompten",
    );
  });
});
