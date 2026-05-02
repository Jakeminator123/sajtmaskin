import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewPanelF3Trigger } from "./PreviewPanelF3Trigger";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

describe("PreviewPanelF3Trigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a specific stale-version warning when finalize-design rejects an old F2 base", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/error-log")) {
        return Response.json({ logs: [] });
      }
      if (url.includes("/finalize-design")) {
        return Response.json(
          {
            ready: false,
            reason: "stale_design_version",
            requestedVersionId: "ver_old",
            latestVersionId: "ver_new",
            message:
              "En nyare designversion finns. Välj den senaste versionen innan du bygger integrationer.",
          },
          { status: 409 },
        );
      }
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const onReady = vi.fn();

    render(
      <PreviewPanelF3Trigger
        chatId="chat_1"
        versionId="ver_old"
        onReady={onReady}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /bygg integrationer/i }));

    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith(
        "Nyare designversion finns",
        expect.objectContaining({
          description:
            "En nyare designversion finns. Välj den senaste versionen innan du bygger integrationer.",
        }),
      );
    });
    expect(onReady).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
