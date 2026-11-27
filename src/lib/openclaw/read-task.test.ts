import { afterEach, expect, it, vi } from "vitest";
const { create, getCurrentUser, getMediaLibraryItemById, withRateLimit } = vi.hoisted(() => ({
  create: vi.fn(), getCurrentUser: vi.fn(), getMediaLibraryItemById: vi.fn(), withRateLimit: vi.fn(),
}));
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
    output: [{ type: "web_search_call" }, { type: "message", content: [{
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

it("does not spend without a session or on another user's media", async () => {
  expect((await answerOpenClawReadTask(request, { search: true }, "Sök på webben efter ek.")).status).toBe(401);
  logIn();
  getMediaLibraryItemById.mockResolvedValue(null);
  expect((await answerOpenClawReadTask(request, { attachmentIds: [123] }, "Vad visar bilden?")).status).toBe(422);
  expect(getMediaLibraryItemById).toHaveBeenCalledWith(123, "owner");
  expect(create).not.toHaveBeenCalled();
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
