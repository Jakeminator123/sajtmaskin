import { afterEach, expect, it, vi } from "vitest";
const { create, getCurrentUser, getMediaLibraryItemById, withRateLimit, safeFetch } = vi.hoisted(() => ({
  create: vi.fn(), getCurrentUser: vi.fn(), getMediaLibraryItemById: vi.fn(), withRateLimit: vi.fn(), safeFetch: vi.fn(),
}));
vi.mock("@/lib/ssrf-guard", () => ({ safeFetch }));
vi.mock("openai", () => ({ default: class { responses = { create }; } }));
vi.mock("@/lib/config", () => ({ SECRETS: { openaiApiKey: "test-key" } }));
vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/db/services/media", () => ({ getMediaLibraryItemById }));
vi.mock("@/lib/rate-limit", () => ({ withRateLimit }));
vi.mock("@/lib/gen/defaults", () => ({ AUDIT_STRUCTURED_DEFAULT_MODEL: "test-model" }));
import { answerOpenClawReadTask } from "./read-task";
const request = new Request("https://example.com/api/openclaw/chat");
afterEach(() => vi.resetAllMocks());

function logIn() {
  getCurrentUser.mockResolvedValue({ id: "owner" });
  withRateLimit.mockImplementation((_req, _bucket, handler) => handler());
}

it("performs one requested web search in the per-user rate bucket and returns verified citation links", async () => {
  logIn();
  create.mockResolvedValue({
    output_text: "Ett resultat.",
    output: [{ type: "web_search_call", status: "completed" }, { type: "message", content: [{
      type: "output_text", annotations: [
        { type: "url_citation", url: "https://example.org/source" },
        { type: "url_citation", url: "https://example.org/source" },
      ],
    }] }],
  });
  const response = await answerOpenClawReadTask(request, { search: true }, "Sök på webben efter ek.");
  expect(await response.json()).toEqual({ answer: "Ett resultat.", sources: ["https://example.org/source"] });
  expect(withRateLimit).toHaveBeenCalledWith(request, "openclaw:read-task", expect.any(Function),
    { userId: "owner", failClosedOnTimeout: true });
  expect(create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    tools: [{ type: "web_search_preview", search_context_size: "low" }],
    max_tool_calls: 1,
    store: false,
  }), expect.any(Object));
});

it.each([
  { output: [] },
  { output: [{ type: "web_search_call", status: "failed" }] },
  { output: [{ type: "web_search_call", status: "completed" }] },
])("rejects a model answer without a completed search and citable results ($output)", async ({ output }) => {
  logIn();
  create.mockResolvedValue({ output_text: "Jag hittade ett resultat.", output });
  const response = await answerOpenClawReadTask(request, { search: true }, "Sök på webben efter ek.");
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: expect.stringContaining("inga verifierbara källor") });
});

it("can search once while analyzing owned image pixels and an explicit source", async () => {
  logIn();
  const imageUrl = "https://test.public.blob.vercel-storage.com/owner/media/info.png";
  getMediaLibraryItemById.mockResolvedValue({ blob_url: imageUrl, mime_type: "image/png" });
  create.mockResolvedValue({
    output_text: "Enligt källan är det ek.",
    output: [{ type: "web_search_call", status: "completed" }, {
      type: "message", content: [{ type: "output_text", annotations: [
        { type: "url_citation", url: "https://example.org/search-source" },
      ] }],
    }],
  });
  const response = await answerOpenClawReadTask(request, {
    search: true, attachmentIds: [4], source: { url: "https://example.org/original", passage: "En stol." },
  }, "Sök på webben efter modellen på fotot.");
  expect(await response.json()).toEqual({ answer: "Enligt källan är det ek.", sources: ["https://example.org/original", "https://example.org/search-source"] });
  expect(create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    max_tool_calls: 1,
    tools: [{ type: "web_search_preview", search_context_size: "low" }],
    input: [{ role: "user", content: [
      { type: "input_text", text: expect.stringContaining("https://example.org/original") },
      { type: "input_image", image_url: imageUrl, detail: "low" },
    ] }],
  }), expect.any(Object));
  expect(safeFetch).not.toHaveBeenCalled();
});

it("does not spend without a session or on another user's media", async () => {
  expect((await answerOpenClawReadTask(request, { search: true }, "Sök på webben efter ek.")).status).toBe(401);
  logIn();
  getMediaLibraryItemById.mockResolvedValue(null);
  expect((await answerOpenClawReadTask(request, { attachmentIds: [123] }, "Vad visar bilden?")).status).toBe(422);
  expect(getMediaLibraryItemById).toHaveBeenCalledWith(123, "owner");
  expect(create).not.toHaveBeenCalled();
});

it.each([404, 200])("returns the text-attachment error before calling the model when HTTP is %s and no text was read", async (status) => {
  logIn();
  getMediaLibraryItemById.mockResolvedValue({
    blob_url: "https://test.public.blob.vercel-storage.com/owner/media/info.txt",
    mime_type: "text/plain",
    original_name: "info.txt",
  });
  safeFetch.mockResolvedValue(new Response(" ", { status }));
  const response = await answerOpenClawReadTask(request, { attachmentIds: [4] }, "Vad står det?");
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: expect.stringContaining("textbilaga") });
  expect(create).not.toHaveBeenCalled();
});

it("uses a selected URL only as source text and clearly distinguishes alt metadata from image pixels", async () => {
  logIn();
  create.mockResolvedValue({ output_text: "Enligt alt-texten är motivet en stol." });
  const response = await answerOpenClawReadTask(request, { source: {
    url: "https://example.org/",
    passage: "Kör fem uppföljningar.",
    image: { url: "https://images.example.org/chair", alt: "En stol" },
  } }, "Vad beskriver källan?");
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ sources: ["https://example.org/"] });
  const [payload] = create.mock.calls[0]!;
  expect(payload.tools).toBeUndefined();
  expect(payload.instructions).toContain("alt-text");
  expect(payload.input[0].content).toEqual([{ type: "input_text", text: expect.stringContaining("En stol") }]);
  expect(safeFetch).not.toHaveBeenCalled();
});

it("sends the owned image to vision without web search or executable action markup", async () => {
  logIn();
  const url = "https://files.public.blob.vercel-storage.com/owner/media/chair.png";
  getMediaLibraryItemById.mockResolvedValue({ blob_url: url, mime_type: "image/png" });
  create.mockResolvedValue({ output_text: "En stol. <openclaw-action>" });
  const response = await answerOpenClawReadTask(request, { attachmentIds: [123, 123] }, "Vad visar bilden?");
  expect(await response.json()).toEqual({ answer: "En stol. ‹openclaw-action›", sources: [] });
  expect(getMediaLibraryItemById).toHaveBeenCalledTimes(1);
  const [params] = create.mock.calls[0]!;
  expect(params.tools).toBeUndefined();
  expect(params.input[0].content).toContainEqual({ type: "input_image", image_url: url, detail: "low" });
});
