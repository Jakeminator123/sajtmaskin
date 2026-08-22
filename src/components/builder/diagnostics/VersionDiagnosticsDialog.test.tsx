import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { VersionDiagnosticsDialog } from "./VersionDiagnosticsDialog";

const { dispatchAutoFixEventMock } = vi.hoisted(() => ({
  dispatchAutoFixEventMock: vi.fn(),
}));

vi.mock("@/lib/hooks/chat/auto-fix-events", () => ({
  dispatchAutoFixEvent: dispatchAutoFixEventMock,
}));

afterEach(() => {
  vi.unstubAllGlobals();
  dispatchAutoFixEventMock.mockReset();
});

describe("VersionDiagnosticsDialog", () => {
  it("labels the selected version and separates current, unscoped, and historical logs", async () => {
    const logs = [
      {
        id: "unscoped",
        level: "info",
        category: "preview",
        message: "Current unscoped observation",
        meta: {},
      },
      {
        id: "current",
        level: "info",
        category: "editorial",
        message: "Current pass observation",
        meta: { logPassId: "pass-new" },
      },
      {
        id: "historical",
        level: "error",
        category: "quality-gate:typecheck",
        message: "Historical failure",
        meta: { logPassId: "pass-old" },
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          success: true,
          logs,
          summary: {
            latestPassId: "pass-new",
            activeTotal: 2,
            activeByLevel: { info: 2, warning: 0, error: 0 },
          },
        }),
      ),
    );

    render(
      <VersionDiagnosticsDialog
        chatId="chat-1"
        versionId="version-1"
        versionLabel="v7.1"
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(await screen.findByText("Current pass observation")).toBeTruthy();
    expect(screen.getByText(/Vald version:/).textContent).toContain("v7.1");
    expect(screen.getByRole("heading", { name: "Aktuellt körpass" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Observationer utan körpass" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Historiska körpass" })).toBeTruthy();
    expect(screen.getByText("Current unscoped observation")).toBeTruthy();

    const historicalDetails = screen.getByText(/Tidigare körpass · pass-old/).closest("details");
    expect(historicalDetails?.hasAttribute("open")).toBe(false);
    expect((screen.getByRole("button", { name: "Kör autofix" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByText("Historical failure")).toBeTruthy();
  });

  it("hides stale diagnostics and blocks autofix while a new version is loading", async () => {
    let resolveSecondResponse: (response: Response) => void = () => {
      throw new Error("Second diagnostics response was not initialized");
    };
    const secondResponse = new Promise<Response>((resolve) => {
      resolveSecondResponse = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          logs: [
            {
              id: "v1-error",
              level: "error",
              category: "quality-gate:typecheck",
              message: "Fix version one",
              meta: { logPassId: "pass-v1" },
            },
          ],
          summary: {
            latestPassId: "pass-v1",
            activeTotal: 1,
            activeByLevel: { info: 0, warning: 0, error: 1 },
          },
        }),
      )
      .mockImplementationOnce(() => secondResponse);
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <VersionDiagnosticsDialog
        chatId="chat-1"
        versionId="version-1"
        versionLabel="v1"
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(await screen.findByText("Fix version one")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Kör autofix" }) as HTMLButtonElement).disabled).toBe(
      false,
    );

    rerender(
      <VersionDiagnosticsDialog
        chatId="chat-1"
        versionId="version-2"
        versionLabel="v2"
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.queryByText("Fix version one")).toBeNull();
    expect(screen.getByText(/Vald version:/).textContent).toContain("v2");
    expect((screen.getByRole("button", { name: "Kör autofix" }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    resolveSecondResponse(
      Response.json({
        success: true,
        logs: [
          {
            id: "v2-error",
            level: "error",
            category: "quality-gate:lint",
            message: "Fix version two",
            meta: { logPassId: "pass-v2" },
          },
        ],
        summary: {
          latestPassId: "pass-v2",
          activeTotal: 1,
          activeByLevel: { info: 0, warning: 0, error: 1 },
        },
      }),
    );

    expect(await screen.findByText("Fix version two")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Kör autofix" }));
    expect(dispatchAutoFixEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat-1",
        versionId: "version-2",
        reasons: ["Fix version two"],
      }),
    );
  });
});
