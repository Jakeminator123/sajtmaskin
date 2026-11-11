import { beforeEach, describe, expect, it, vi } from "vitest";

// drizzle-orm stand-ins that keep the WHERE clause inspectable.
vi.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => ({ and: conditions }),
  or: (...conditions: unknown[]) => ({ or: conditions }),
  eq: (column: unknown, value: unknown) => ({ eq: [column, value] }),
  isNull: (column: unknown) => ({ isNull: column }),
  desc: (column: unknown) => ({ desc: column }),
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));

const updatedRows = vi.fn(() => [] as unknown[]);
const updateSetSpy = vi.fn();
const updateWhereSpy = vi.fn();

vi.mock("./shared", () => ({ assertDbConfigured: vi.fn() }));

vi.mock("@/lib/db/schema", () => ({
  appProjects: {
    id: "app_projects.id",
    name: "app_projects.name",
    user_id: "app_projects.user_id",
    session_id: "app_projects.session_id",
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
          where: (condition: unknown) => {
            updateWhereSpy(condition);
            return { returning: () => Promise.resolve(updatedRows()) };
          },
        };
      },
    })),
  },
  dbConfigured: true,
}));

import { db } from "@/lib/db/client";
import { renameProjectIfNameIs } from "./projects";

describe("renameProjectIfNameIs (compare-and-set, R-1744)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updatedRows.mockReturnValue([]);
  });

  it("puts the expected name and the owner in the same UPDATE", async () => {
    updatedRows.mockReturnValue([{ id: "proj_1", name: "Café Lindgren" }]);

    const row = await renameProjectIfNameIs("proj_1", "Namnlöst projekt", "Café Lindgren", {
      userId: "user_1",
    });

    expect(row).toEqual({ id: "proj_1", name: "Café Lindgren" });
    expect(updateSetSpy).toHaveBeenCalledWith(expect.objectContaining({ name: "Café Lindgren" }));
    expect(updateWhereSpy).toHaveBeenCalledWith({
      and: [
        { eq: ["app_projects.id", "proj_1"] },
        { eq: ["app_projects.user_id", "user_1"] },
        { eq: ["app_projects.name", "Namnlöst projekt"] },
      ],
    });
  });

  it("returns null when no row still has the expected name", async () => {
    const row = await renameProjectIfNameIs("proj_1", "Namnlöst projekt", "Frisör Klipp", {
      userId: "user_1",
    });
    expect(row).toBeNull();
  });

  it("never writes without an owner identity", async () => {
    const row = await renameProjectIfNameIs("proj_1", "Namnlöst projekt", "Café Lindgren", {});
    expect(row).toBeNull();
    expect(db.update).not.toHaveBeenCalled();
  });
});
