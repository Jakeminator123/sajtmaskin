import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCollaborationSummaries } from "./collaboration-summaries";

afterEach(() => vi.unstubAllGlobals());

describe("collaboration summaries for long histories", () => {
  it("batches all 205 versions, deduplicates IDs and preserves every badge", async () => {
    const ids = Array.from({ length: 205 }, (_, index) => `v_${index}`);
    const seen: string[] = [];
    let active = 0;
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      expect(++active).toBe(1);
      const parsed = new URL(String(url), "http://localhost");
      expect(parsed.pathname).toBe("/api/engine/chats/c1/versions/collaboration-summaries");
      const batch = parsed.searchParams.get("versionIds")!.split(",");
      expect(batch.length).toBeLessThanOrEqual(100);
      seen.push(...batch);
      await Promise.resolve();
      active--;
      return Response.json({ summaries: Object.fromEntries(batch.map((id) => [id, {
        approvalStatus: "approved", unresolvedCount: 2,
      }])) });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchCollaborationSummaries("c1", [...ids, "v_0"]);
    expect(seen).toEqual(ids);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(Object.keys(result.summaries)).toHaveLength(205);
    expect(result.summaries.v_204).toEqual({ approvalStatus: "approved", unresolvedCount: 2 });
  });

  it("rejects a failed later batch so SWR retains previous badges", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ summaries: { v_0: { unresolvedCount: 2 } } }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchCollaborationSummaries("c1", Array.from({ length: 101 }, (_, i) => `v_${i}`)))
      .rejects.toThrow("Failed to load collaboration summaries");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
