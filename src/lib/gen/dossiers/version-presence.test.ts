import { describe, expect, it } from "vitest";

import {
  resolveCapabilitiesPresentInVersion,
  resolveDossierIdsPresentInVersion,
  resolveDossiersPresentInVersion,
} from "./version-presence";

/**
 * Version-presence resolves the dossiers whose ACTUAL files are in a version —
 * the signal-gate ground truth the ai-tool-calling incident needed (the panel
 * showed `total: 0` because the snapshot floor was F2-muted and the
 * provider-key→capability mapping only knew `ai-chat`, never `ai-tool-calling`).
 */
describe("resolveDossierIdsPresentInVersion", () => {
  it("detects ai-tool-calling-chat from its built assistant route", () => {
    const ids = resolveDossierIdsPresentInVersion([
      "app/page.tsx",
      "app/api/assistant/route.ts",
      "components/ai-assistant.tsx",
    ]);
    expect(ids).toContain("ai-tool-calling-chat");
  });

  it("returns [] for a version with no dossier files", () => {
    expect(
      resolveDossierIdsPresentInVersion(["app/page.tsx", "app/layout.tsx"]),
    ).toEqual([]);
  });

  it("returns [] for empty input", () => {
    expect(resolveDossierIdsPresentInVersion([])).toEqual([]);
  });

  // openai-chat and rag-chat both ship `app/api/chat/route.ts`; requiring ALL
  // declared files present disambiguates them so a chat route alone never
  // resolves to both (which would inflate the F3 selection).
  it("resolves openai-chat (not rag-chat) from its full file set", () => {
    const ids = resolveDossierIdsPresentInVersion([
      "app/api/chat/route.ts",
      "components/chat-panel.tsx",
    ]);
    expect(ids).toContain("openai-chat");
    expect(ids).not.toContain("rag-chat");
  });

  it("resolves rag-chat (not openai-chat) from its full file set", () => {
    const ids = resolveDossierIdsPresentInVersion([
      "app/api/chat/route.ts",
      "components/chat.tsx",
      "components/rag-config-notice.tsx",
      "lib/rag/config.ts",
      "lib/rag/db/index.ts",
      "lib/rag/db/schema.ts",
      "lib/rag/ingest.ts",
      "lib/rag/retrieval.ts",
      "lib/rag-migrations.sql",
    ]);
    expect(ids).toContain("rag-chat");
    expect(ids).not.toContain("openai-chat");
  });

  it("does not resolve a dossier when only some of its declared files are present", () => {
    // openai-chat needs BOTH chat-panel.tsx and the chat route.
    const ids = resolveDossierIdsPresentInVersion(["app/api/chat/route.ts"]);
    expect(ids).not.toContain("openai-chat");
  });

  it("normalizes leading ./ and / in file paths", () => {
    const ids = resolveDossierIdsPresentInVersion([
      "./app/api/assistant/route.ts",
    ]);
    expect(ids).toContain("ai-tool-calling-chat");
  });
});

describe("resolveDossiersPresentInVersion", () => {
  it("returns SelectedDossier entries reporting the true dossier capability", () => {
    // Pass an explicit (empty) project env-key set so `configured` reflects the
    // project rather than the platform process.env (deterministic across envs).
    const selected = resolveDossiersPresentInVersion(
      [
        { path: "app/api/assistant/route.ts" },
        { path: "components/ai-assistant.tsx" },
      ],
      new Set<string>(),
    );
    const aiTool = selected.find((s) => s.entry.id === "ai-tool-calling-chat");
    expect(aiTool).toBeDefined();
    expect(aiTool?.entry.capability).toBe("ai-tool-calling");
    // A hard dossier with no configured env keys → configured: false.
    expect(aiTool?.configured).toBe(false);
  });

  it("marks a hard dossier configured when its required env keys are provided", () => {
    const selected = resolveDossiersPresentInVersion(
      [{ path: "app/api/assistant/route.ts" }],
      new Set(["OPENAI_API_KEY"]),
    );
    const aiTool = selected.find((s) => s.entry.id === "ai-tool-calling-chat");
    expect(aiTool?.configured).toBe(true);
  });
});

describe("resolveCapabilitiesPresentInVersion", () => {
  it("returns the capabilities of the present dossiers", () => {
    const caps = resolveCapabilitiesPresentInVersion([
      "app/api/assistant/route.ts",
    ]);
    expect(caps).toContain("ai-tool-calling");
  });
});
