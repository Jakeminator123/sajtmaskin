import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// db/client mock — drives setProjectThumbnail's SELECT (previous path) and
// UPDATE ... RETURNING (rowcount guard, audit A#19).
// ---------------------------------------------------------------------------
const selectRows = vi.fn(() => [] as unknown[]);
const updatedRows = vi.fn(() => [] as unknown[]);
const updateSetSpy = vi.fn();

vi.mock("./shared", () => ({ assertDbConfigured: vi.fn() }));

vi.mock("@/lib/db/schema", () => ({
  appProjects: {
    id: "app_projects.id",
    user_id: "app_projects.user_id",
    session_id: "app_projects.session_id",
    thumbnail_path: "app_projects.thumbnail_path",
  },
  companyProfiles: { project_id: "company_profiles.project_id" },
  domainOrders: { project_id: "domain_orders.project_id" },
  projectData: { project_id: "project_data.project_id" },
  projectFiles: { project_id: "project_files.project_id" },
  promptHandoffs: { id: "prompt_handoffs.id" },
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(selectRows()) }),
      }),
    })),
    update: vi.fn(() => ({
      set: (values: unknown) => {
        updateSetSpy(values);
        return {
          where: () => ({ returning: () => Promise.resolve(updatedRows()) }),
        };
      },
    })),
  },
  dbConfigured: true,
}));

import { db } from "@/lib/db/client";
import { setProjectThumbnail } from "./projects";

describe("setProjectThumbnail rowcount guard (audit A#19)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectRows.mockReturnValue([]);
    updatedRows.mockReturnValue([]);
  });

  it("returns null when the scope has no identity, without touching the DB", async () => {
    const result = await setProjectThumbnail("proj_1", "https://blob.example/new.jpg", {});
    expect(result).toBeNull();
    expect(db.select).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns null when no owned project row exists", async () => {
    const result = await setProjectThumbnail("proj_1", "https://blob.example/new.jpg", {
      userId: "user_1",
    });
    expect(result).toBeNull();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns the previous path when the UPDATE matched a row", async () => {
    selectRows.mockReturnValue([{ thumbnail_path: "https://blob.example/old.jpg" }]);
    updatedRows.mockReturnValue([{ id: "proj_1" }]);
    const result = await setProjectThumbnail("proj_1", "https://blob.example/new.jpg", {
      userId: "user_1",
    });
    expect(result).toEqual({ previousThumbnailPath: "https://blob.example/old.jpg" });
    expect(updateSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({ thumbnail_path: "https://blob.example/new.jpg" }),
    );
  });

  it("returns null when the row vanished between SELECT and UPDATE (no false-green)", async () => {
    selectRows.mockReturnValue([{ thumbnail_path: null }]);
    updatedRows.mockReturnValue([]);
    const result = await setProjectThumbnail("proj_1", "https://blob.example/new.jpg", {
      userId: "user_1",
    });
    expect(result).toBeNull();
  });
});
