import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DOSSIERS_PANEL_OPEN_EVENT,
  F3_REBUILD_REQUEST_EVENT,
  describeF3SuccessTitle,
  openDossiersPanel,
  readDossiersPanelOpenDetail,
  readF3StatusDetail,
  readProjectEnvVarsUpdatedDetail,
  requestF3Rebuild,
  resolveF3StatusTitle,
  subtractSavedKeysFromF3Requirements,
  type F3RequirementsDetail,
} from "./project-env-events";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("openDossiersPanel / readDossiersPanelOpenDetail", () => {
  it("dispatches highlighted keys and reads them back", () => {
    let received: string[] | null = null;
    const handler = (event: Event) => {
      received = readDossiersPanelOpenDetail(event).envKeys;
    };
    window.addEventListener(DOSSIERS_PANEL_OPEN_EVENT, handler);
    try {
      openDossiersPanel(["STRIPE_SECRET_KEY", "RESEND_API_KEY"]);
    } finally {
      window.removeEventListener(DOSSIERS_PANEL_OPEN_EVENT, handler);
    }
    expect(received).toEqual(["STRIPE_SECRET_KEY", "RESEND_API_KEY"]);
  });

  it("dispatches an empty key list when called with no keys", () => {
    let received: string[] | null = null;
    const handler = (event: Event) => {
      received = readDossiersPanelOpenDetail(event).envKeys;
    };
    window.addEventListener(DOSSIERS_PANEL_OPEN_EVENT, handler);
    try {
      openDossiersPanel();
    } finally {
      window.removeEventListener(DOSSIERS_PANEL_OPEN_EVENT, handler);
    }
    expect(received).toEqual([]);
  });

  it("filters out non-string / blank keys from the detail", () => {
    const detail = { envKeys: ["OK_KEY", "", "  ", 42, null] };
    const event = new CustomEvent(DOSSIERS_PANEL_OPEN_EVENT, { detail });
    expect(readDossiersPanelOpenDetail(event).envKeys).toEqual(["OK_KEY"]);
  });
});

describe("requestF3Rebuild", () => {
  it("dispatches the rebuild-request event", () => {
    const handler = vi.fn();
    window.addEventListener(F3_REBUILD_REQUEST_EVENT, handler);
    try {
      requestF3Rebuild();
    } finally {
      window.removeEventListener(F3_REBUILD_REQUEST_EVENT, handler);
    }
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

// Bugbot on the Byggblock-status diff: a 412 payload must be reconciled when
// keys are saved elsewhere (Byggblock inline inputs), so the requirements
// surface never keeps listing a key the project already has.
describe("subtractSavedKeysFromF3Requirements", () => {
  const detail: F3RequirementsDetail = {
    parentVersionId: "ver_1",
    projectId: "proj_1",
    missingByIntegration: [
      { key: "clerk", name: "Clerk", missing: ["CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] },
      { key: "resend", name: "Resend", missing: ["RESEND_API_KEY"] },
    ],
  };

  it("removes saved keys and drops emptied integrations", () => {
    const next = subtractSavedKeysFromF3Requirements(detail, ["resend_api_key"]);
    expect(next?.missingByIntegration).toEqual([
      {
        key: "clerk",
        name: "Clerk",
        missing: ["CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"],
      },
    ]);
  });

  it("returns an all-clear payload (not null) when every key is saved", () => {
    const next = subtractSavedKeysFromF3Requirements(detail, [
      "CLERK_SECRET_KEY",
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      "RESEND_API_KEY",
    ]);
    expect(next).not.toBeNull();
    expect(next?.missingByIntegration).toEqual([]);
    expect(next?.parentVersionId).toBe("ver_1");
  });

  it("returns the same reference when nothing matches (no pointless re-render)", () => {
    expect(subtractSavedKeysFromF3Requirements(detail, ["UNRELATED_KEY"])).toBe(detail);
    expect(subtractSavedKeysFromF3Requirements(detail, [])).toBe(detail);
    expect(subtractSavedKeysFromF3Requirements(null, ["X"])).toBeNull();
  });
});

// Codex P2 on #525: deletes fire the same updated-event as saves; the
// action discriminator lets the 412-reconciliation ignore them.
describe("readProjectEnvVarsUpdatedDetail action", () => {
  function eventWith(detail: Record<string, unknown>): Event {
    return new CustomEvent("sajtmaskin:project-env-vars-updated", { detail });
  }

  it("defaults a legacy dispatch (no action) to saved", () => {
    const parsed = readProjectEnvVarsUpdatedDetail(
      eventWith({ projectId: "proj_1", envKeys: ["K"] }),
    );
    expect(parsed?.action).toBe("saved");
  });

  it("preserves the deleted action", () => {
    const parsed = readProjectEnvVarsUpdatedDetail(
      eventWith({ projectId: "proj_1", envKeys: ["K"], action: "deleted" }),
    );
    expect(parsed?.action).toBe("deleted");
  });
});

// The chat-stream lane has no `onStatus` callback, so the F3 verdict reaches
// the builder's discrete status row through this event (bugbot on #639).
describe("readF3StatusDetail", () => {
  function eventWith(detail: unknown): Event {
    return new CustomEvent("sajtmaskin:f3-status", { detail });
  }

  it("reads a full verdict including the judged version", () => {
    const parsed = readF3StatusDetail(
      eventWith({
        tone: "error",
        title: "ReleaseGate behöver åtgärdas",
        description: "Underkända kontroller: typecheck.",
        versionId: " ver_f3 ",
        chatId: "chat_1",
      }),
    );
    expect(parsed).toEqual({
      tone: "error",
      title: "ReleaseGate behöver åtgärdas",
      description: "Underkända kontroller: typecheck.",
      versionId: "ver_f3",
      chatId: "chat_1",
    });
  });

  it("normalizes a missing version and chat to null rather than dropping the verdict", () => {
    const parsed = readF3StatusDetail(
      eventWith({ tone: "warning", title: "T", description: "D" }),
    );
    expect(parsed?.versionId).toBeNull();
    expect(parsed?.chatId).toBeNull();
  });

  it("rejects malformed payloads", () => {
    expect(readF3StatusDetail(eventWith(null))).toBeNull();
    expect(readF3StatusDetail(eventWith({ tone: "nope", title: "T", description: "D" }))).toBeNull();
    expect(readF3StatusDetail(eventWith({ tone: "error", description: "D" }))).toBeNull();
  });
});

describe("describeF3SuccessTitle", () => {
  it("names both live and demo counts together", () => {
    expect(describeF3SuccessTitle({ builtLive: 2, builtDemo: 1 })).toBe(
      "Byggblock — 2 live, 1 demo",
    );
  });

  it("keeps mixed per-building-block truth instead of rating the whole site", () => {
    expect(
      describeF3SuccessTitle({
        builtLive: 1,
        builtDemo: 1,
        blockedBuild: 1,
        planned: 2,
      }),
    ).toBe("Byggblock — 1 live, 1 demo, 1 väntar på nyckel, 2 inte byggd");
  });

  it("omits a zero bucket instead of naming it", () => {
    expect(describeF3SuccessTitle({ builtLive: 1, builtDemo: 0 })).toBe("Byggblock — 1 live");
    expect(describeF3SuccessTitle({ builtLive: 0, builtDemo: 3 })).toBe("Byggblock — 3 demo");
  });

  it("falls back to a counts-free phrase when counts are unknown", () => {
    expect(describeF3SuccessTitle(null)).toBe("Integrationsbygget är klart");
    expect(describeF3SuccessTitle(undefined)).toBe("Integrationsbygget är klart");
    expect(describeF3SuccessTitle({ builtLive: 0, builtDemo: 0 })).toBe(
      "Integrationsbygget är klart",
    );
  });
});

// Bugbot, 5th pass on this diff: `PreviewPanelF3Trigger` only ever has
// dossier counts fetched for the OLD parent version, never the version its
// success message is about (it reports the just-created/promoted F3
// versionId). `usesLiveDossierCounts` + this resolver let the shell layer
// (`use-f3-tips-chrome.ts`) swap in the REAL count-based title from ITS OWN
// fresher, version-scoped `dossierCounts` — see that file's
// `visibleF3Status` derivation for the other half of this contract.
describe("resolveF3StatusTitle", () => {
  it("leaves an ordinary status untouched", () => {
    const status = { title: "ReleaseGate behöver åtgärdas", tone: "error" as const };
    expect(resolveF3StatusTitle(status, { builtLive: 5, builtDemo: 0 })).toBe(status);
  });

  it("keeps the reported (counts-free) title when fresh counts aren't available yet", () => {
    const status = {
      title: "Integrationsbygget är klart",
      usesLiveDossierCounts: true,
    };
    expect(resolveF3StatusTitle(status, null)).toEqual(status);
    expect(resolveF3StatusTitle(status, undefined)).toEqual(status);
  });

  it("swaps in the counts-based title once fresh counts arrive", () => {
    const status = {
      title: "Integrationsbygget är klart",
      usesLiveDossierCounts: true,
      tone: "success" as const,
    };
    expect(resolveF3StatusTitle(status, { builtLive: 2, builtDemo: 1 })).toEqual({
      ...status,
      title: "Byggblock — 2 live, 1 demo",
    });
  });
});
