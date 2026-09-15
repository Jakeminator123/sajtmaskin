import { beforeEach, describe, expect, it, vi } from "vitest";

const updatedRows = vi.fn(() => [] as unknown[]);
const updateSetSpy = vi.fn();
const updateWhereSpy = vi.fn();

vi.mock("./shared", () => ({ assertDbConfigured: vi.fn() }));

vi.mock("@/lib/db/schema", () => ({
  appProjects: {
    id: "app_projects.id",
    custom_domain: "app_projects.custom_domain",
  },
  companyProfiles: { project_id: "company_profiles.project_id" },
  domainOrders: { project_id: "domain_orders.project_id" },
  projectData: { project_id: "project_data.project_id" },
  projectFiles: { project_id: "project_files.project_id" },
  promptHandoffs: { id: "prompt_handoffs.id" },
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    update: vi.fn(() => ({
      set: (values: unknown) => {
        updateSetSpy(values);
        return {
          where: (clause: unknown) => {
            updateWhereSpy(clause);
            return { returning: () => Promise.resolve(updatedRows()) };
          },
        };
      },
    })),
  },
  dbConfigured: true,
}));

import { db } from "@/lib/db/client";
import { clearProjectCustomDomain } from "./projects";

describe("clearProjectCustomDomain expected-domain guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updatedRows.mockReturnValue([]);
  });

  it("does not write when the expected hostname is not a domain", async () => {
    await expect(clearProjectCustomDomain("proj_1", "not a host")).resolves.toBe(false);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns false when the row has already become another domain", async () => {
    updatedRows.mockReturnValue([]);
    await expect(clearProjectCustomDomain("proj_1", "exempel.se")).resolves.toBe(false);
    expect(updateSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({ custom_domain: null, custom_domain_verified_at: null }),
    );
    expect(updateWhereSpy).toHaveBeenCalled();
  });

  it("returns true only when the expected hostname still matches", async () => {
    updatedRows.mockReturnValue([{ id: "proj_1" }]);
    await expect(clearProjectCustomDomain("proj_1", "exempel.se")).resolves.toBe(true);
  });
});
