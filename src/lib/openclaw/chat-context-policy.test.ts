import { describe, expect, it } from "vitest";
import {
  decideOpenClawCodeContextMode,
  decideOpenClawRoutingIntent,
  getLatestOpenClawUserText,
} from "./chat-context-policy";

describe("chat-context-policy", () => {
  it("finds the latest user message", () => {
    expect(
      getLatestOpenClawUserText([
        { role: "user", content: "första" },
        { role: "assistant", content: "svar" },
        { role: "user", content: "  andra frågan  " },
      ]),
    ).toBe("andra frågan");
  });

  it("avoids code context for regular field-writing requests", () => {
    expect(
      decideOpenClawCodeContextMode({
        messages: [
          {
            role: "user",
            content:
              "Kan du skriva i frilägesfältet på startsidan och lägga in en bra prompt?",
          },
        ],
        page: "builder",
        chatId: "chat_123",
        currentCode: "<div />",
      }),
    ).toBe("none");
  });

  it("uses light mode for focused code questions", () => {
    expect(
      decideOpenClawCodeContextMode({
        messages: [{ role: "user", content: "Kan du förklara den här koden?" }],
        page: "builder",
        chatId: "chat_123",
        currentCode: "export default function Page() {}",
      }),
    ).toBe("light");
  });

  it("uses manifest mode for file-location questions", () => {
    expect(
      decideOpenClawCodeContextMode({
        messages: [
          { role: "user", content: "Vilken fil hanterar previewpanelen och var ligger den?" },
        ],
        page: "builder",
        chatId: "chat_123",
        currentCode: "export default function Page() {}",
      }),
    ).toBe("manifest");
  });

  it("uses full mode only for explicit read-the-code requests", () => {
    expect(
      decideOpenClawCodeContextMode({
        messages: [{ role: "user", content: "Kan du läsa koden och granska hela projektet?" }],
        page: "builder",
        chatId: "chat_123",
        currentCode: "export default function Page() {}",
      }),
    ).toBe("full");
  });

  it("uses manifest mode for improvement reviews without requiring full-code access", () => {
    expect(
      decideOpenClawCodeContextMode({
        messages: [{ role: "user", content: "Vad kan förbättras i den här versionen?" }],
        page: "builder",
        chatId: "chat_123",
        currentCode: "export default function Page() {}",
      }),
    ).toBe("manifest");
  });

  it("marks latest-prompt questions as review intent", () => {
    expect(
      decideOpenClawRoutingIntent({
        messages: [{ role: "user", content: "Kan du granska min senaste prompt och säga vad som kan förbättras?" }],
      }),
    ).toBe("review");
  });

  it("uses manifest mode for edit intents when edit is on and debug is off", () => {
    expect(
      decideOpenClawCodeContextMode({
        messages: [{ role: "user", content: "byt rubriken" }],
        page: "builder",
        chatId: "chat_123",
        currentCode: "export default function Page() {}",
        edit: true,
        debug: false,
      }),
    ).toBe("manifest");
  });

  it("keeps none for edit-looking prompts when both edit and debug are off", () => {
    expect(
      decideOpenClawCodeContextMode({
        messages: [{ role: "user", content: "byt rubriken" }],
        page: "builder",
        chatId: "chat_123",
        currentCode: "export default function Page() {}",
        edit: false,
        debug: false,
      }),
    ).toBe("none");
  });

  it("does not grant code context from edit flag alone without edit intent", () => {
    expect(
      decideOpenClawCodeContextMode({
        messages: [{ role: "user", content: "Hur fungerar buildern?" }],
        page: "builder",
        chatId: "chat_123",
        currentCode: "export default function Page() {}",
        edit: true,
        debug: false,
      }),
    ).toBe("none");
  });

  it("returns none without chatId and without currentCode regardless of prompt", () => {
    const prompts = [
      "Kan du läsa koden och granska hela projektet?",
      "Vilken fil hanterar previewpanelen?",
      "Kan du förklara den här koden?",
      "Vad kan förbättras i den här versionen?",
    ];
    for (const content of prompts) {
      expect(
        decideOpenClawCodeContextMode({
          messages: [{ role: "user", content }],
          page: "builder",
          chatId: "",
          currentCode: "   ",
        }),
      ).toBe("none");
      expect(
        decideOpenClawCodeContextMode({
          messages: [{ role: "user", content }],
          page: "builder",
        }),
      ).toBe("none");
    }
  });

  it("returns none outside the builder page even with chat and code present", () => {
    expect(
      decideOpenClawCodeContextMode({
        messages: [{ role: "user", content: "Kan du läsa koden och granska hela projektet?" }],
        page: "landing",
        chatId: "chat_123",
        currentCode: "export default function Page() {}",
      }),
    ).toBe("none");
    expect(
      decideOpenClawCodeContextMode({
        messages: [{ role: "user", content: "Vilken fil hanterar previewpanelen?" }],
        page: "home",
        chatId: "chat_123",
        currentCode: "export default function Page() {}",
      }),
    ).toBe("none");
  });
});
