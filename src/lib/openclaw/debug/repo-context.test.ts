import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildOpenClawRepoContextBlock,
  fetchRepoFile,
  fetchRepoFiles,
  isRepoContextConfigured,
} from "./repo-context";

afterEach(() => {
  vi.restoreAllMocks();
});

// In the test env OC_REPO_READ_TOKEN / OC_REPO_SLUG are unset, so the reader is
// unconfigured. Assert the read-only guard: it never performs a network fetch
// and returns empty/null — OpenClaw can't reach the platform repo without an
// explicit, read-only token.
describe("repo-context read-only guard (unconfigured)", () => {
  it("reports not configured", () => {
    expect(isRepoContextConfigured()).toBe(false);
  });

  it("never fetches when unconfigured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await fetchRepoFile("src/lib/gen/url-compress.ts")).toBeNull();
    expect(await fetchRepoFiles(["a.ts", "b.ts"])).toEqual([]);
    expect(await buildOpenClawRepoContextBlock()).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
