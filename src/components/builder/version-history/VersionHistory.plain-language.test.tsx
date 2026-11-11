import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VersionHistory } from "../VersionHistory";

vi.mock("@/lib/hooks/useVersions", () => ({
  useVersions: () => ({ versions: [], isLoading: false, mutate: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(() => undefined, {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  }),
}));

const PREVIEW_URL = "https://demo.example/cafe-lindgren";

/**
 * V-11 (rig test 2026-11-11): the card showed "Degraderad", "Ej verifierad",
 * "F2 Product Postcheck skipped (product_postcheck_skipped:…" and the raw
 * preview URL. Codes and URL now live behind "Tekniska detaljer".
 */
describe("VersionHistory — kortet på begriplig svenska", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("visar ingen intern kod eller rå URL utanför detaljvyn", () => {
    render(
      <VersionHistory
        chatId="chat_1"
        selectedVersionId={null}
        onVersionSelect={vi.fn()}
        versions={[
          {
            id: "ver_1",
            versionId: "ver_1",
            canPin: false,
            versionNumber: 1,
            createdAt: new Date("2026-11-11T14:23:00Z").toISOString(),
            releaseState: "draft",
            verificationState: "pending",
            demoUrl: PREVIEW_URL,
            verificationSummary:
              "F2 Product Postcheck skipped (product_postcheck_skipped: preview_not_running).",
            busStatus: {
              phase: "done",
              degradations: [
                {
                  kind: "product_postcheck_skipped",
                  message:
                    "F2 Product Postcheck skipped (product_postcheck_skipped: preview_not_running).",
                  meta: { skippedReason: "preview_not_running" },
                },
              ],
            },
          } as never,
        ]}
        mutateVersions={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.getByText("Klar med anmärkning")).toBeTruthy();
    expect(
      screen.getByText(
        "Produktkontrollen hoppades över: förhandsvisningen var inte igång för den här versionen.",
      ),
    ).toBeTruthy();
    for (const jargon of ["Degraderad", "Ej verifierad", "Preview-URL finns", "VM live"]) {
      expect(screen.queryByText(jargon)).toBeNull();
    }

    const details = screen.getByText("Tekniska detaljer").closest("details");
    expect(details).toBeTruthy();
    expect(details?.open).toBe(false);
    const url = screen.getByText(PREVIEW_URL);
    expect(url.closest("details")).toBe(details);
    for (const node of screen.getAllByText(/product_postcheck_skipped/)) {
      expect(node.closest("details")).toBe(details);
    }
  });
});
