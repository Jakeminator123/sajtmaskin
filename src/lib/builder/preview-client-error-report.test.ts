import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acceptClientErrorReport,
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

  it("tar max 5 fel per versionId per session", () => {
    for (let i = 0; i < 5; i++) {
      expect(acceptClientErrorReport("ver_a", `err-${i}`)).toBe(true);
    }
    expect(acceptClientErrorReport("ver_a", "err-5")).toBe(false);
    // Annan version har eget tak.
    expect(acceptClientErrorReport("ver_b", "err-0")).toBe(true);
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
});
