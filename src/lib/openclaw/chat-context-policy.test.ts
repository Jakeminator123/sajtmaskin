import { describe, expect, it } from "vitest";
import {
  decideOpenClawCodeContextMode,
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

  it("uses snippet mode for focused code questions", () => {
    expect(
      decideOpenClawCodeContextMode({
        messages: [{ role: "user", content: "Kan du förklara den här koden?" }],
        page: "builder",
        chatId: "chat_123",
        currentCode: "export default function Page() {}",
      }),
    ).toBe("snippet");
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
});
