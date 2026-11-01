import { describe, expect, it, vi } from "vitest";
import { errorLog, sanitizeErrorTextForLog } from "./debug";

describe("production-safe error logging", () => {
  it("redacts connection credentials, bearer tokens, query secrets and log breaks", () => {
    const sanitized = sanitizeErrorTextForLog(
      "postgres://user:pass@db.example/app\r\nBearer abc123 https://x.test/?token=secret",
    );

    expect(sanitized).toContain("postgres://[redacted]@db.example/app");
    expect(sanitized).toContain("Bearer [redacted]");
    expect(sanitized).toContain("token=[redacted]");
    expect(sanitized).not.toMatch(/[\r\n]/);
    expect(sanitized).not.toContain("user:pass");
    expect(sanitized).not.toContain("abc123");
  });

  it("uses the sanitized error message in the console", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      errorLog("DB", "query failed", new Error("postgres://user:pass@db.example/app"));
      expect(consoleError.mock.calls[0]?.join(" ")).not.toContain("user:pass");
    } finally {
      consoleError.mockRestore();
    }
  });
});
