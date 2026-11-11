import { beforeEach, describe, expect, it, vi } from "vitest";
import { DrizzleQueryError } from "drizzle-orm";

const selectRows = vi.hoisted(() => vi.fn());
const updateRows = vi.hoisted(() => vi.fn());
const setValues = vi.hoisted(() => vi.fn());
vi.mock("./shared", () => ({ assertDbConfigured: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ dbConfigured: true, db: {
  select: () => ({ from: () => ({ where: () => ({ limit: selectRows }) }) }),
  update: () => ({ set: (values: unknown) => { setValues(values); return { where: () => ({ returning: updateRows }) }; } }),
} }));
import { ensureProjectPublishedIdentity } from "./projects";

beforeEach(() => {
  vi.resetAllMocks();
  selectRows.mockResolvedValue([{ id: "project", published_slug: null }]);
});

describe("published identity conflict retries", () => {
  it("retries a wrapped unique violation with the next slug", async () => {
    updateRows.mockRejectedValueOnce(new DrizzleQueryError("update app_projects", [],
      Object.assign(new Error("duplicate key"), { code: "23505" })))
      .mockResolvedValueOnce([{ id: "project", published_slug: "test-site-2" }]);
    await expect(ensureProjectPublishedIdentity("project", "Test Site"))
      .resolves.toMatchObject({ publishedSlug: "test-site-2" });
    expect(setValues.mock.calls.map(([value]) => value.published_slug)).toEqual(["test-site", "test-site-2"]);
  });

  it("preserves unrelated wrapped errors rather than consuming slug candidates", async () => {
    const error = new DrizzleQueryError("update app_projects", [],
      Object.assign(new Error("connection lost"), { code: "08006" }));
    updateRows.mockRejectedValueOnce(error);
    await expect(ensureProjectPublishedIdentity("project", "Test Site")).rejects.toBe(error);
    expect(updateRows).toHaveBeenCalledTimes(1);
  });
});
