import { afterEach, describe, expect, it } from "vitest";
import {
  builderDraftMatchesContext,
  consumeMatchingPendingBuilderDraft,
  currentBuilderReturnTo,
  googleOAuthStartHref,
  savePendingBuilderDraft,
  serializeAttachmentUrls,
  touchPendingBuilderDraftReturnTo,
} from "./pending-builder-draft";

afterEach(() => {
  sessionStorage.clear();
});

describe("pending builder draft", () => {
  it("keeps http(s) attachment URLs and drops local File-like values", () => {
    expect(
      serializeAttachmentUrls([
        { url: "https://blob.example/a.png" },
        { url: "blob:http://localhost/1" },
        { url: "/relative.png" },
        { url: "" },
        null,
      ]),
    ).toEqual(["https://blob.example/a.png"]);
  });

  it("matches builder project/chat context and rejects a different project", () => {
    expect(
      builderDraftMatchesContext("/builder?project=proj_1", "/builder?project=proj_1&foo=1"),
    ).toBe(true);
    expect(
      builderDraftMatchesContext("/builder?project=proj_1", "/builder?project=proj_2"),
    ).toBe(false);
    expect(
      builderDraftMatchesContext("/builder?chatId=chat_new", "/builder?chatId=chat_old"),
    ).toBe(false);
  });

  it("saves a typed prompt and restores it for the same builder returnTo after a Google-style navigation", () => {
    window.history.replaceState({}, "", "/builder?project=proj_1");
    const saved = savePendingBuilderDraft({
      text: "Bygg en pizzeria i Malmö",
      returnTo: "/builder?project=proj_1",
      attachmentUrls: ["https://blob.example/menu.png"],
    });
    expect(saved?.text).toBe("Bygg en pizzeria i Malmö");

    const href = googleOAuthStartHref("/builder?project=proj_1");
    expect(href).toBe("/api/auth/google?redirect=%2Fbuilder%3Fproject%3Dproj_1");
    expect(touchPendingBuilderDraftReturnTo("/builder?project=proj_1")?.text).toBe(
      "Bygg en pizzeria i Malmö",
    );

    expect(consumeMatchingPendingBuilderDraft("/builder?project=proj_2")).toBeNull();
    const restored = consumeMatchingPendingBuilderDraft(currentBuilderReturnTo());
    expect(restored).toMatchObject({
      text: "Bygg en pizzeria i Malmö",
      returnTo: "/builder?project=proj_1",
      attachmentUrls: ["https://blob.example/menu.png"],
    });
    expect(consumeMatchingPendingBuilderDraft(currentBuilderReturnTo())).toBeNull();
  });

  it("returns null when sessionStorage refuses the write", () => {
    const original = sessionStorage.setItem.bind(sessionStorage);
    sessionStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    try {
      expect(
        savePendingBuilderDraft({
          text: "Bygg en pizzeria i Malmö",
          returnTo: "/builder?project=proj_1",
        }),
      ).toBeNull();
    } finally {
      sessionStorage.setItem = original;
    }
  });
});
