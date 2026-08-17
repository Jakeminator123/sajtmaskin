import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acceptClientErrorReport,
  markClientErrorVersionPromoted,
  releaseClientErrorReport,
  reportPreviewClientError,
  resetClientErrorReportGateForTests,
  sanitizeClientErrorPayload,
} from "./preview-client-error-report";

describe("sanitizeClientErrorPayload", () => {
  it("accepterar giltig payload och trunkerar message/stack", () => {
    const longMsg = "x".repeat(600);
    const longStack = "y".repeat(1200);
    const result = sanitizeClientErrorPayload({
      kind: "hydration",
      message: longMsg,
      stack: longStack,
      href: "/about",
    });
    expect(result).toEqual({
      kind: "hydration",
      message: "x".repeat(500),
      stack: "y".repeat(1000),
      href: "/about",
    });
  });

  it("avvisar ogiltiga fält", () => {
    expect(sanitizeClientErrorPayload(null)).toBeNull();
    expect(sanitizeClientErrorPayload({ kind: "boom", message: "x", href: "/" })).toBeNull();
    expect(sanitizeClientErrorPayload({ kind: "uncaught", message: "", href: "/" })).toBeNull();
    expect(
      sanitizeClientErrorPayload({ kind: "uncaught", message: "ok", href: 12 }),
    ).toBeNull();
    expect(
      sanitizeClientErrorPayload({
        kind: "unhandledrejection",
        message: "ok",
        href: "/",
        stack: 99,
      }),
    ).toEqual({
      kind: "unhandledrejection",
      message: "ok",
      href: "/",
    });
  });
});

describe("acceptClientErrorReport", () => {
  afterEach(() => {
    resetClientErrorReportGateForTests();
  });

  it("dedupar samma message per versionId", () => {
    expect(acceptClientErrorReport("ver_1", "Hydration failed")).toBe(true);
    expect(acceptClientErrorReport("ver_1", "Hydration failed")).toBe(false);
    expect(acceptClientErrorReport("ver_1", "Other error")).toBe(true);
  });

  it("behåller tidigare gate-beteende när promotionsfas saknas", () => {
    expect(acceptClientErrorReport("ver_legacy", "Hydration failed")).toBe(true);
    expect(acceptClientErrorReport("ver_legacy", "Hydration failed", undefined)).toBe(false);
    expect(acceptClientErrorReport("ver_legacy", "Hydration failed", null)).toBe(false);
  });

  it("öppnar en ny gate efter promotion men dedupar inom samma fas", () => {
    const promotedAt = "2026-08-15T10:00:00.000Z";
    expect(acceptClientErrorReport("ver_phase", "Hydration failed", null)).toBe(true);
    expect(acceptClientErrorReport("ver_phase", "Hydration failed", null)).toBe(false);
    expect(acceptClientErrorReport("ver_phase", "Hydration failed", promotedAt)).toBe(true);
    expect(acceptClientErrorReport("ver_phase", "Hydration failed", promotedAt)).toBe(false);
  });

  it("byter omedelbart till promoted-fasen och förblir där när SWR är stale", () => {
    expect(acceptClientErrorReport("ver_marked", "Hydration failed", null)).toBe(true);
    expect(acceptClientErrorReport("ver_marked", "Hydration failed", null)).toBe(false);

    markClientErrorVersionPromoted("ver_marked");
    expect(acceptClientErrorReport("ver_marked", "Hydration failed", null)).toBe(true);
    expect(acceptClientErrorReport("ver_marked", "Hydration failed", null)).toBe(false);
    expect(
      acceptClientErrorReport(
        "ver_marked",
        "Hydration failed",
        "2026-08-15T10:00:00.000Z",
      ),
    ).toBe(false);
  });

  it("tar max 5 fel per versionId per session", () => {
    for (let i = 0; i < 5; i++) {
      expect(acceptClientErrorReport("ver_a", `err-${i}`)).toBe(true);
    }
    expect(acceptClientErrorReport("ver_a", "err-5")).toBe(false);
    // Annan version har eget tak.
    expect(acceptClientErrorReport("ver_b", "err-0")).toBe(true);
  });

  it("nollställer kvoten när promotionsfasen ändras", () => {
    for (let i = 0; i < 5; i++) {
      expect(acceptClientErrorReport("ver_quota", `pre-${i}`, null)).toBe(true);
    }
    expect(acceptClientErrorReport("ver_quota", "pre-5", null)).toBe(false);

    const promotedAt = "2026-08-15T10:00:00.000Z";
    for (let i = 0; i < 5; i++) {
      expect(acceptClientErrorReport("ver_quota", `post-${i}`, promotedAt)).toBe(true);
    }
    expect(acceptClientErrorReport("ver_quota", "post-5", promotedAt)).toBe(false);
  });

  it("release öppnar gaten igen (bugbot: transient POST-miss får inte bränna kvoten)", () => {
    expect(acceptClientErrorReport("ver_r", "Hydration failed")).toBe(true);
    expect(acceptClientErrorReport("ver_r", "Hydration failed")).toBe(false);
    releaseClientErrorReport("ver_r", "Hydration failed");
    expect(acceptClientErrorReport("ver_r", "Hydration failed")).toBe(true);
  });
});

describe("reportPreviewClientError", () => {
  afterEach(() => {
    resetClientErrorReportGateForTests();
    vi.unstubAllGlobals();
  });

  it("släpper gaten vid misslyckad POST så felet kan rapporteras igen", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    const payload = { kind: "hydration", message: "Hydration failed", href: "/about" };

    reportPreviewClientError("chat_1", "ver_f", payload);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // 503:an ska ha släppt gaten → samma fel går att posta igen.
    reportPreviewClientError("chat_1", "ver_f", payload);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("lyckad POST håller gaten stängd för samma message", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    const payload = { kind: "uncaught", message: "Boom", href: "/" };

    reportPreviewClientError("chat_1", "ver_g", payload);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    reportPreviewClientError("chat_1", "ver_g", payload);
    // Ingen andra POST — dedupe består efter lyckat svar.
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rapporterar samma lyckade message igen efter promotion, men bara en gång i nya fasen", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    const payload = { kind: "uncaught", message: "Boom", href: "/" };

    reportPreviewClientError("chat_1", "ver_phase", payload, null);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const promotedAt = "2026-08-15T10:00:00.000Z";
    reportPreviewClientError("chat_1", "ver_phase", payload, promotedAt);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    reportPreviewClientError("chat_1", "ver_phase", payload, promotedAt);
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("låter inte ett sent pre-promotion-misslyckande öppna promoted-gaten", async () => {
    let rejectPreRequest!: (reason?: unknown) => void;
    const preRequest = new Promise<Response>((_resolve, reject) => {
      rejectPreRequest = reject;
    });
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(preRequest)
      .mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    const payload = { kind: "uncaught", message: "Boom", href: "/" };

    reportPreviewClientError("chat_1", "ver_race", payload, null);
    markClientErrorVersionPromoted("ver_race");
    reportPreviewClientError("chat_1", "ver_race", payload, null);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    rejectPreRequest(new Error("late network failure"));
    await Promise.resolve();
    reportPreviewClientError("chat_1", "ver_race", payload, null);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
