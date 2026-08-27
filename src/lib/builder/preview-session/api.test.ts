import { afterEach, describe, expect, it, vi } from "vitest";
import { postPreviewHibernate } from "./api";

describe("postPreviewHibernate lifecycle fencing", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("serializes an explicit legacy null token instead of omitting lifecycle identity", async () => {
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => new Response(JSON.stringify({ ok: true, hibernated: true })));
    vi.stubGlobal("fetch", fetchMock);

    await postPreviewHibernate({
      chatId: "chat_1",
      versionId: "v1",
      previewSessionId: "ps_1",
      lifecycleToken: null,
    });

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init).toBeDefined();
    if (!init) throw new Error("fetch init missing");
    expect(JSON.parse(String(init.body))).toMatchObject({
      versionId: "v1",
      previewSessionId: "ps_1",
      lifecycleToken: null,
    });
  });
});
