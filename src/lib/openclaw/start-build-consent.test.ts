import { describe, expect, it } from "vitest";

import type { OpenClawMessage } from "@/lib/openclaw/openclaw-store";
import { resolveStartBuildAutoRun } from "./start-build-consent";

function msg(
  id: string,
  role: "user" | "assistant",
  content: string,
  extra: Partial<OpenClawMessage> = {},
): OpenClawMessage {
  return { id, role, content, timestamp: 1, kind: "chat", ...extra } as OpenClawMessage;
}

describe("resolveStartBuildAutoRun", () => {
  it("lets a polite change request that reached the agent start its build", () => {
    const messages = [
      msg("u1", "user", "Kan du lägga till en karta på kontaktsidan", { allowBuild: true }),
      msg("a1", "assistant", ""),
    ];
    expect(resolveStartBuildAutoRun(messages, "a1")).toEqual({ allowed: true, userTurnId: "u1" });
  });

  it("keeps a question as a manual proposal even with forged consent metadata", () => {
    const messages = [
      msg("u1", "user", "Kan du lägga till en karta?", { allowBuild: true }),
      msg("a1", "assistant", ""),
    ];
    expect(resolveStartBuildAutoRun(messages, "a1").allowed).toBe(false);
  });

  it("never lets a build-result wake-up start the next build", () => {
    const messages = [
      msg("u1", "user", "Kan du lägga till en karta på kontaktsidan", { allowBuild: true }),
      msg("a1", "assistant", "Bygget startar."),
      msg("d1", "user", "[Byggresultat] Builderturen är klar.", { kind: "internal", allowBuild: true }),
      msg("a2", "assistant", ""),
    ];
    expect(resolveStartBuildAutoRun(messages, "a2")).toEqual({ allowed: false, userTurnId: "d1" });
  });

  it("follows a file-content turn back to the question it serves", () => {
    const messages = [
      msg("u1", "user", "Jag vill ha en rosa knapp i headern", { allowBuild: true }),
      msg("a1", "assistant", "Jag läser filen först."),
      msg("f1", "user", "[Filinnehåll] --- app/page.tsx ---", { kind: "internal" }),
      msg("a2", "assistant", ""),
    ];
    expect(resolveStartBuildAutoRun(messages, "a2")).toEqual({ allowed: true, userTurnId: "u1" });
  });
});
