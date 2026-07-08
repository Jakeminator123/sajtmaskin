import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DOSSIERS_PANEL_OPEN_EVENT,
  F3_REBUILD_REQUEST_EVENT,
  openDossiersPanel,
  readDossiersPanelOpenDetail,
  requestF3Rebuild,
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
