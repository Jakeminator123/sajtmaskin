import { afterEach, describe, expect, it, vi } from "vitest";
const { safeFetch, getCurrentUser } = vi.hoisted(() => ({ safeFetch: vi.fn(), getCurrentUser: vi.fn() }));
vi.mock("@/lib/ssrf-guard", async (original) => ({
  ...await original<typeof import("@/lib/ssrf-guard")>(), safeFetch,
}));
vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));
import { POST } from "./route";

const requestPage = (url: string) => POST(new Request("http://localhost/api/openclaw/source-page", {
  method: "POST", body: JSON.stringify({ url }),
}));

afterEach(() => vi.resetAllMocks());

describe("source page intake", () => {
  it("reads one HTML page and returns selectable verbatim passages and deduplicated images", async () => {
    getCurrentUser.mockResolvedValue({ id: "owner" });
    const html = new Response(`<title>Ateljén</title><meta name="generator" content="WordPress">
      <nav><p>Meny</p></nav><main><p>Handgjorda stolar.</p>
      <p>Handgjorda stolar.</p><img src="../stol.png" alt="Målad ek">
      <img src="../stol.png"><img data-src="https://cdn.example.org/asset?id=12" alt="Detalj">
      <img src="http://localhost/image.png"><a href="/next">Nästa</a></main>`, {
      headers: { "content-type": "text/html" },
    });
    Object.defineProperty(html, "url", { value: "https://example.com/verkstad/index" });
    safeFetch.mockResolvedValue(html);

    const response = await requestPage("https://example.com/verkstad/index#details");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      title: "Ateljén",
      url: "https://example.com/verkstad/index",
      passages: ["Handgjorda stolar."],
      images: [
        { url: "https://example.com/stol.png", alt: "Målad ek" },
        { url: "https://cdn.example.org/asset?id=12", alt: "Detalj" },
      ],
    });
    expect(safeFetch).toHaveBeenCalledExactlyOnceWith("https://example.com/verkstad/index",
      expect.objectContaining({ maxBodyBytes: 1_500_000 }));
  });

  it.each(["http://localhost/test", "https://owner:secret@example.com/", "file:///root"])(
    "rejects input outside public HTTP before fetching: %s", async (url) => {
      getCurrentUser.mockResolvedValue({ id: "owner" });
      expect((await requestPage(url)).status).toBe(400);
      expect(safeFetch).not.toHaveBeenCalled();
    },
  );

  it("requires login and returns a bounded error for blocked redirects", async () => {
    expect((await requestPage("https://example.com/")).status).toBe(401);
    expect(safeFetch).not.toHaveBeenCalled();
    getCurrentUser.mockResolvedValue({ id: "owner" });
    safeFetch.mockRejectedValue(new Error("redirect refused"));
    expect((await requestPage("https://example.com/")).status).toBe(422);
    expect(safeFetch).toHaveBeenCalledTimes(1);
  });
});
