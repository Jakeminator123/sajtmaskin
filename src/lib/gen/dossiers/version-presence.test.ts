import { describe, expect, it } from "vitest";

import {
  resolveCapabilitiesPresentInVersion,
  resolveDossierIdsPresentInVersion,
  resolveDossiersPresentInVersion,
  resolveSelectedDossiersWithVersionPresence,
} from "./version-presence";

/**
 * Version-presence resolves the dossiers whose ACTUAL files are in a version —
 * the signal-gate ground truth the ai-tool-calling incident needed (the panel
 * showed `total: 0` because the snapshot floor was F2-muted and the
 * provider-key→capability mapping only knew `ai-chat`, never `ai-tool-calling`).
 *
 * Matching rule (review round 2): all server files + ≥1 distinctive file for
 * server dossiers; ≥1 distinctive file for client-only dossiers. Distinctive =
 * declared by exactly one dossier in the pool.
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

  // Relaxed matching (review round 2, impact 5): the user edited/renamed a
  // REWRITABLE client component (checkout-button.tsx absorbed into a custom
  // pricing card), but the verbatim server route is untouched. Evidence must
  // survive — otherwise a built-and-configured Stripe integration would drop
  // out of the F3 scope on the next build.
  it("still matches stripe-checkout when a client component was renamed away (server core intact)", () => {
    const ids = resolveDossierIdsPresentInVersion([
      "app/api/checkout-session/route.ts",
      // shared config-notice remains, checkout-button.tsx is gone
      "components/integration-config-notice.tsx",
    ]);
    expect(ids).toContain("stripe-checkout");
  });

  // False-positive guard: a path shared by SEVERAL dossiers (the chat route is
  // declared by both openai-chat and rag-chat) is never sole evidence.
  it("does NOT match any chat dossier from the shared chat route alone", () => {
    const ids = resolveDossierIdsPresentInVersion(["app/api/chat/route.ts"]);
    expect(ids).not.toContain("openai-chat");
    expect(ids).not.toContain("rag-chat");
  });

  it("does NOT match a dossier from a shared helper file alone", () => {
    // integration-config-notice.tsx is shipped by several hard dossiers.
    const ids = resolveDossierIdsPresentInVersion([
      "components/integration-config-notice.tsx",
    ]);
    expect(ids).toEqual([]);
  });

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

  it("does not resolve a server dossier when its server files are missing", () => {
    // rag-chat's client component alone (chat.tsx is rag-distinctive) is not
    // enough — ALL server files must be present for a server dossier.
    const ids = resolveDossierIdsPresentInVersion(["components/chat.tsx"]);
    expect(ids).not.toContain("rag-chat");
  });

  // Client-only (soft) dossiers: one distinctive file is enough evidence.
  it("matches a soft dossier from a single distinctive client file", () => {
    const ids = resolveDossierIdsPresentInVersion([
      "components/gallery-lightbox.tsx",
    ]);
    expect(ids).toContain("gallery-lightbox");
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

// Fix 1 (review round 2): ONE owner for "selected dossiers incl. file
// evidence". Snapshot selection ∪ version presence, deduped by id, consumed by
// the dossiers panel + readiness + finalize-design + stream F3 gate + deploy.
describe("resolveSelectedDossiersWithVersionPresence", () => {
  it("unions snapshot selection with file-evidenced dossiers (dedupe by id)", () => {
    const selected = resolveSelectedDossiersWithVersionPresence({
      snapshot: { requestedCapabilities: ["gallery-lightbox"] },
      versionFiles: [
        { path: "app/api/assistant/route.ts" },
        { path: "components/gallery-lightbox.tsx" },
      ],
      configuredEnvKeys: new Set<string>(),
    });
    const ids = selected.map((s) => s.entry.id);
    // Snapshot part (capability-selected) + presence part, no duplicate
    // gallery-lightbox even though both sources produce it.
    expect(ids).toContain("gallery-lightbox");
    expect(ids).toContain("ai-tool-calling-chat");
    expect(ids.filter((id) => id === "gallery-lightbox")).toHaveLength(1);
  });

  it("degrades to snapshot-only when version files are unavailable", () => {
    const selected = resolveSelectedDossiersWithVersionPresence({
      snapshot: { requestedCapabilities: ["gallery-lightbox"] },
      versionFiles: null,
      configuredEnvKeys: new Set<string>(),
    });
    expect(selected.map((s) => s.entry.id)).toEqual(["gallery-lightbox"]);
  });

  it("returns presence-only for an empty/missing snapshot (the incident shape)", () => {
    const selected = resolveSelectedDossiersWithVersionPresence({
      snapshot: null,
      versionFiles: [{ path: "app/api/assistant/route.ts" }],
      configuredEnvKeys: new Set<string>(),
    });
    expect(selected.map((s) => s.entry.id)).toEqual(["ai-tool-calling-chat"]);
  });
});
