import { describe, expect, it, vi } from "vitest";
import { schedulePreviewPreWarm } from "./preview-prewarm";

describe("schedulePreviewPreWarm", () => {
  const scaffoldFiles = [
    { path: "app/page.tsx", content: "export default function Page(){return <main/>}" },
  ];

  it("does not trigger when prewarm flag is disabled", () => {
    const startPreviewSessionFn = vi.fn();
    const started = schedulePreviewPreWarm({
      enabled: false,
      buildIntent: "website",
      chatId: "chat_1",
      scaffoldFiles,
      startPreviewSessionFn,
    });
    expect(started).toBe(false);
    expect(startPreviewSessionFn).not.toHaveBeenCalled();
  });

  it("triggers fire-and-forget prewarm when flag is on for website builds", () => {
    const startPreviewSessionFn = vi.fn().mockResolvedValue({
      ok: true,
      result: {
        sandboxUrl: "https://preview.example",
        sandboxId: "sandbox_1",
        sandboxPreviewMode: "dev_only",
        fidelityTier: 2,
        startOutcome: "recreated",
      },
    });
    const started = schedulePreviewPreWarm({
      enabled: true,
      buildIntent: "website",
      chatId: "chat_1",
      scaffoldFiles,
      startPreviewSessionFn,
    });
    expect(started).toBe(true);
    expect(startPreviewSessionFn).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          path: "app/page.tsx",
          language: "tsx",
        }),
      ]),
      expect.objectContaining({
        chatId: "chat_1",
        versionIdForSession: null,
        precache: true,
      }),
    );
  });

  it("keeps init flow non-blocking even when prewarm fails", async () => {
    const warningSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const startPreviewSessionFn = vi.fn().mockRejectedValue(new Error("prewarm boom"));
    expect(() =>
      schedulePreviewPreWarm({
        enabled: true,
        buildIntent: "website",
        chatId: "chat_1",
        scaffoldFiles,
        startPreviewSessionFn,
      }),
    ).not.toThrow();
    await Promise.resolve();
    expect(startPreviewSessionFn).toHaveBeenCalledTimes(1);
    expect(warningSpy).toHaveBeenCalledWith(
      "[preview-prewarm] Failed (opportunistic, continuing):",
      expect.any(Error),
    );
    warningSpy.mockRestore();
  });
});
