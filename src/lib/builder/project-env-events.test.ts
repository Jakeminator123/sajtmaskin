import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DOSSIERS_PANEL_OPEN_EVENT,
  F3_REBUILD_REQUEST_EVENT,
  openDossiersPanel,
  readDossiersPanelOpenDetail,
  readF3StatusDetail,
  readProjectEnvVarsUpdatedDetail,
  requestF3Rebuild,
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
