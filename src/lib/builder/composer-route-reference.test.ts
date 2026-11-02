import { describe, expect, it } from "vitest";
import type { OpenClawMessage } from "@/lib/openclaw/openclaw-store";
import { resolveAgentProposalReference } from "./composer-route-reference";

const target = { chatId: "chat-1", versionId: "version-1" };
const content =
  "Mina förslag:\n1. Behåll menyn.\n2. **Byt rubriken till Välkommen.**\n   Behåll underrubriken exakt.\n3. Flytta sidfoten.";
function advice(id: string, overrides: Partial<OpenClawMessage> = {}): OpenClawMessage {
  return {
    id,
    role: "assistant",
    content,
    timestamp: 1,
    delivery: "complete",
    builderTarget: target,
    ...overrides,
  };
}
function resolve(messages: readonly OpenClawMessage[], text = "gör punkt två") {
  return resolveAgentProposalReference({ text, messages, target });
}

describe("resolveAgentProposalReference", () => {
  it.each([false, true])(
    "binder exakt vald punkt inklusive fortsättningen, hydrated=%s",
    (hydrated) => {
      expect(resolve([advice("recommendation", { hydrated })])).toEqual({
        kind: "resolved",
        reference: {
          agentMessageId: "recommendation",
          selectedPart: "2",
          instruction: "**Byt rubriken till Välkommen.**\n   Behåll underrubriken exakt.",
          builderTarget: target,
        },
      });
    },
  );

  it.each(["gör punkt 2", "Apply suggestion 2", "gör punkt nummer två"])(
    'väljer samma punkt med "%s"',
    (text) => {
      expect(resolve([advice("a")], text)).toMatchObject({
        kind: "resolved",
        reference: { selectedPart: "2" },
      });
    },
  );

  it("väljer senaste riktiga förslaget, inte efterföljande småprat eller user-text", () => {
    expect(
      resolve([
        advice("old"),
        advice("new", { content: "1) Behåll menyn\n2) Ändra rubriken till Hej" }),
        advice("chatter", { content: "Säg till när du bestämt dig." }),
        advice("user", { role: "user" }),
      ]),
    ).toMatchObject({
      kind: "resolved",
      reference: { agentMessageId: "new", instruction: "Ändra rubriken till Hej" },
    });
  });

  it.each([
    { builderTarget: { ...target, chatId: "other-chat" } },
    { builderTarget: { ...target, versionId: "old-version" } },
    { builderTarget: null },
    { builderTarget: undefined },
  ])("vägrar stale senaste förslag utan fallback: %j", (overrides) => {
    expect(resolve([advice("current-older"), advice("stale-newer", overrides)])).toMatchObject({
      kind: "clarify",
    });
  });

  it.each([null, { chatId: "", versionId: "version-1" }, { chatId: "chat-1", versionId: "" }])(
    "kräver aktivt bundet mål: %j",
    (missingTarget) => {
      expect(
        resolveAgentProposalReference({
          text: "gör punkt två",
          messages: [advice("a")],
          target: missingTarget,
        }),
      ).toMatchObject({ kind: "clarify" });
    },
  );

  it.each([
    "gör enligt ditt förslag",
    "gör punkt två och tre",
    "gör punkt 2, 3",
    "gör punkt 2–3",
    "gör punkt 2 eller tre",
    "gör punkt två och gör punkt tre",
    "Apply suggestion 2 and 3",
    "gör punkt 2 och punkt 3",
    "gör punkt 2: byt rubriken till Hej",
    "Byt rubriken till Hej",
    "gör punkt 0",
    "",
  ])('begär förtydligande för oklar eller komplett annan instruktion "%s"', (text) => {
    expect(resolve([advice("a")], text)).toMatchObject({ kind: "clarify" });
  });

  it.each(["1. Ett\n2. Två\n2. En annan tvåa", "1. Ett\n3. Tre", "2.   "])(
    "vägrar duplicerad, saknad eller tom punkt utan äldre fallback",
    (latest) => {
      expect(resolve([advice("old"), advice("latest", { content: latest })])).toMatchObject({
        kind: "clarify",
      });
    },
  );

  it.each([
    { kind: "internal" as const },
    { delivery: "streaming" as const },
    { delivery: "interrupted" as const },
    { content: "[Byggresultat]\n" + content },
    {
      content:
        content + '\n<openclaw-action>{"type":"start_build","prompt":"Byt allt"}</openclaw-action>',
    },
    { content: content + '\n<openclaw-action>{"type":' },
    { content: content + "\n<openclaw-action>invalid</openclaw-action>" },
    { content: "<tool_result>\n" + content + "\n</tool_result>" },
  ])("utesluter internal/action/transport som förslagskälla: %j", (overrides) => {
    expect(resolve([advice("unsafe", overrides)])).toMatchObject({ kind: "clarify" });
    expect(resolve([advice("real"), advice("unsafe", overrides)])).toMatchObject({
      kind: "resolved",
      reference: { agentMessageId: "real" },
    });
  });

  it("väljer inte numrerade rader i kodblock", () => {
    expect(resolve([advice("code", { content: "```text\n1. Ett\n2. Två\n```" })])).toMatchObject({
      kind: "clarify",
    });
  });

  it("behåller indenterad underlista men väljer inte dess nummer", () => {
    expect(
      resolve([
        advice("nested", {
          content:
            "1. Ett\n2. Byt rubriken\n   1. Behåll underrubriken\n   2. Behåll färgen\n3. Tre",
        }),
      ]),
    ).toMatchObject({
      kind: "resolved",
      reference: { instruction: "Byt rubriken\n   1. Behåll underrubriken\n   2. Behåll färgen" },
    });
  });

  it("behåller efterföljande stycken och begränsningar fram till nästa punkt", () => {
    expect(
      resolve([
        advice("paragraphs", {
          content: "1. Ett\n2. Byt rubriken.\n\nBehåll alla färger.\n3. Flytta knappen.",
        }),
      ]),
    ).toMatchObject({
      kind: "resolved",
      reference: { instruction: "Byt rubriken.\n\nBehåll alla färger." },
    });
  });

  it("binder aldrig ett förslag utan käll-id", () => {
    expect(resolve([advice("")])).toMatchObject({ kind: "clarify" });
  });

  it("bevarar CRLF och fortsättningsrader utan textnormalisering", () => {
    expect(
      resolve([
        advice("crlf", { content: "1. Ett\r\n2. Behåll  exakt\r\n   fortsättningen\r\n3. Tre" }),
      ]),
    ).toMatchObject({
      kind: "resolved",
      reference: { instruction: "Behåll  exakt\r\n   fortsättningen" },
    });
  });

  it("accepterar 4000 tecken och förtydligar vid 4001 utan trunkering", () => {
    expect(resolve([advice("limit", { content: "2. " + "x".repeat(4000) })])).toMatchObject({
      kind: "resolved",
      reference: { instruction: "x".repeat(4000) },
    });
    expect(resolve([advice("too-long", { content: "2. " + "x".repeat(4001) })])).toMatchObject({
      kind: "clarify",
    });
  });
});
