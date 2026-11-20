import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteCache = vi.hoisted(() => vi.fn(async (_key: string): Promise<void> => undefined));
vi.mock("@/lib/data/redis", () => ({ deleteCache }));

const { invalidateProjectListCache, projectListCacheKey } = await import("./project-list-cache");

beforeEach(() => {
  deleteCache.mockClear();
});

describe("projektlistans cache (SM-133)", () => {
  it("läser per ägare: inloggad med gästcookie, inloggad, gäst", () => {
    expect(projectListCacheKey("user_1", "sess_1")).toBe("projects:list:user:user_1:session:sess_1");
    expect(projectListCacheKey("user_1", null)).toBe("projects:list:user:user_1");
    expect(projectListCacheKey(null, "sess_1")).toBe("projects:list:session:sess_1");
  });

  it("nollar varje nyckel listan kan ha läst för ägaren", async () => {
    await invalidateProjectListCache("user_1", "sess_1");

    expect(deleteCache.mock.calls.map(([key]) => key).sort()).toEqual(
      [
        "projects:list",
        "projects:list:session:sess_1",
        "projects:list:user:user_1",
        "projects:list:user:user_1:session:sess_1",
      ].sort(),
    );
  });

  it("rör aldrig en annan ägares nyckel", async () => {
    await invalidateProjectListCache("user_1", null);

    const keys = deleteCache.mock.calls.map(([key]) => key);
    expect(keys).toContain("projects:list:user:user_1");
    expect(keys.every((key) => key === "projects:list" || key.includes("user_1"))).toBe(true);
  });
});
