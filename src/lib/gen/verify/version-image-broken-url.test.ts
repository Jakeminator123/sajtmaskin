import { afterEach, describe, expect, it, vi } from "vitest";

const snapshot = vi.hoisted(() => vi.fn());
const write = vi.hoisted(() => vi.fn());
const record = vi.hoisted(() => vi.fn());
const imported = vi.hoisted(() => vi.fn());
const safeFetch = vi.hoisted(() => vi.fn((url: string, init?: RequestInit) => globalThis.fetch(url, init)));

vi.mock("@/lib/config", () => ({ FEATURES: { useUnsplash: true }, SECRETS: { unsplashAccessKey: "test-key" } }));
// Image probes use the pinned SSRF transport, not global fetch. Keep both
// transport boundaries offline while exercising the real replacement flow.
vi.mock("@/lib/ssrf-guard", () => ({ safeFetch }));
vi.mock("@/lib/gen/version-manager", () => ({ getVersionFilesSnapshot: snapshot }));
vi.mock("@/lib/gen/autofix/repair-generated-files", () => ({
  repairGeneratedFiles: (files: unknown) => ({ files, fixes: [] }),
}));
vi.mock("@/lib/images/image-assets", () => ({ materializeImagesInTextFiles: vi.fn() }));
vi.mock("@/lib/db/chat-repository-pg", () => ({
  chatHasImportedRepoVersion: imported,
  updateVersionFiles: write,
  recordKnownBrokenImageReplacements: record,
}));

import { prepareVersionImages } from "./version-image-validation";

const deadUrl = "https://images.unsplash.com/photo-original-broken?w=800";
const page = {
  path: "app/page.tsx",
  language: "tsx" as const,
  content: `export default function Page(){return <img src="${deadUrl}" alt="Studio" />;}`,
};

describe("prepareVersionImages broken URL replacement", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("replaces a 404 image in the server preparation path", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.unsplash.com")) {
        return new Response(JSON.stringify({
          results: [{ id: "2", urls: { raw: "https://images.unsplash.com/photo-live-candidate" } }],
        }), { status: 200 });
      }
      if (url.includes("photo-live-candidate")) return new Response(null, { status: 200 });
      return new Response(null, { status: 404 });
    });
    imported.mockResolvedValue(false);
    write.mockResolvedValue(true);
    record.mockResolvedValue(undefined);
    const replaced = [{ ...page, content: page.content.replace(deadUrl, "https://images.unsplash.com/photo-live-candidate?w=800") }];
    snapshot.mockResolvedValueOnce({
      files: [page], filesJson: JSON.stringify([page]), filesRevision: "rev_old", editKind: null,
    }).mockResolvedValueOnce({
      files: replaced, filesJson: JSON.stringify(replaced), filesRevision: "rev_new", editKind: null,
    });

    const outcome = await prepareVersionImages({
      chatId: "chat", versionId: "version", holderRunId: "holder",
      expectedFilesRevision: "rev_old", materialize: false,
    });

    expect(outcome).toMatchObject({ kind: "prepared", persisted: true, filesRevision: "rev_new" });
    expect(fetchSpy).toHaveBeenCalled();
    expect(safeFetch).toHaveBeenCalledWith(deadUrl, expect.objectContaining({ method: "HEAD", headersOnly: true }));
    expect(safeFetch).toHaveBeenCalledWith(
      "https://images.unsplash.com/photo-live-candidate?w=800",
      expect.objectContaining({ method: "HEAD", headersOnly: true }),
    );
    const written = String(write.mock.calls[0]?.[1]);
    expect(written).toContain("photo-live-candidate");
    expect(written).not.toContain("photo-original-broken");
    expect(record).toHaveBeenCalledWith("chat", expect.objectContaining({ [deadUrl]: expect.stringContaining("photo-live-candidate") }));
  });
});
