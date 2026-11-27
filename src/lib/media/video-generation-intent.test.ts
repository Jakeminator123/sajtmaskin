import { describe, expect, it } from "vitest";
import { resolveVideoGenerationIntent } from "./video-generation-intent";

describe("video generation intent", () => {
  it("uses an explicitly selected image and separately extracts purchase and placement", () => {
    expect(resolveVideoGenerationIntent(
      "Kan du skapa en video: låt bilen köra framåt och lägg in den i heron. Jag godkänner högst 30 krediter.",
      [{ id: "media-123", mimeType: "image/jpeg", status: "success" }],
    )).toEqual({
      prompt: "låt bilen köra framåt", insert: true, placement: "den i heron",
      approvedCredits: 30, sourceMediaId: "123",
    });
  });

  it.each(["9007199254740993", "media-9223372036854775807"])("keeps the exact attached image id %s", (id) => {
    expect(resolveVideoGenerationIntent("Skapa en video: låt bilen svänga", [
      { id, mimeType: "image/jpeg", status: "success" },
    ])?.sourceMediaId).toBe(id.replace(/^media-/, ""));
  });

  it.each([
    "Bädda in befintlig MP4 på startsidan.",
    "Kan du lägga in min video?",
    "Hur skapar jag en video?",
    "Vad kostar det att skapa en video?",
    "Skapa inte en video, lägg bara in min gamla.",
    "Lägg in befintlig video och skapa en titel.",
  ])("keeps %s on the ordinary chat route", (message) => {
    expect(resolveVideoGenerationIntent(message, [])).toBeUndefined();
  });

  it("requests a selection when there is no uniquely attached supported picture", () => {
    const files = [
      { id: "media-123", mimeType: "image/jpeg", status: "success" },
      { id: "124", mimeType: "image/png", status: "success" },
    ];
    expect(resolveVideoGenerationIntent("Skapa en video av bilden.", files)).toEqual({ prompt: "", insert: false });
  });
});
