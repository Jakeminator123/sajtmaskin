import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VersionMismatchOverlay } from "./VersionMismatchOverlay";

describe("VersionMismatchOverlay", () => {
  it("renderar diskret banner UTAN force-restart-knapp i suppressions-fallet (M#pv3)", () => {
    const onForceRestart = vi.fn();
    render(
      <VersionMismatchOverlay
        payload={{
          chatId: "chat_1",
          expectedVersionId: "ver_failed",
          currentVersionId: "ver_restored",
          mismatchDirection: "session_newer",
          msSinceMismatch: 3_000,
          reason: "suppressed_failed_version",
        }}
        onForceRestart={onForceRestart}
      />,
    );

    const banner = screen.getByTestId("version-mismatch-banner");
    expect(banner.textContent).toContain(
      "Den valda versionen misslyckades och har ingen egen preview",
    );
    expect(banner.textContent).toContain("ver_rest");
    // Ingen blocking overlay, ingen "Automatisk omstart räckte inte"-lögn,
    // ingen knapp som kan återutlösa restore-studsen.
    expect(screen.queryByTestId("version-mismatch-overlay")).toBeNull();
    expect(screen.queryByRole("button", { name: /Försök igen/i })).toBeNull();
    expect(onForceRestart).not.toHaveBeenCalled();
  });

  it("renderar blocking overlay med Försök igen vid förbrukad auto-resync", () => {
    const onForceRestart = vi.fn();
    render(
      <VersionMismatchOverlay
        payload={{
          chatId: "chat_1",
          expectedVersionId: "ver_2",
          currentVersionId: "ver_1",
          mismatchDirection: "session_older",
          msSinceMismatch: 15_000,
          reason: "auto_resync_exhausted",
        }}
        onForceRestart={onForceRestart}
      />,
    );

    expect(screen.getByTestId("version-mismatch-overlay")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Försök igen/i }));
    expect(onForceRestart).toHaveBeenCalledTimes(1);
  });

  it("behandlar payload utan reason som förbrukad auto-resync (bakåtkompatibelt)", () => {
    render(
      <VersionMismatchOverlay
        payload={{
          chatId: "chat_1",
          expectedVersionId: "ver_2",
          currentVersionId: "ver_1",
          msSinceMismatch: 12_000,
        }}
      />,
    );

    expect(screen.getByTestId("version-mismatch-overlay")).toBeTruthy();
    expect(screen.queryByTestId("version-mismatch-banner")).toBeNull();
  });
});
