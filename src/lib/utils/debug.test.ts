import { describe, expect, it, vi } from "vitest";
import { errorLog, sanitizeErrorForLog, sanitizeErrorTextForLog } from "./debug";

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
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain("user:pass");
    } finally {
      consoleError.mockRestore();
    }
  });

  it("keeps safe structured diagnostics and omits request bodies and SQL params", () => {
    const result = sanitizeErrorForLog({
      name: "DatabaseError", code: "DB_QUERY_FAILED", status: 500,
      message: "Failed query: insert into plans params: secret-prompt",
      params: ["private-value"], requestBody: "private-prompt", token: "private-key",
      cause: Object.assign(new Error("Bearer credential-secret"), { code: "ECONNRESET" }),
    });
    expect(result).toMatchObject({ name: "DatabaseError", code: "DB_QUERY_FAILED", status: 500,
      cause: { code: "ECONNRESET", message: "Bearer [redacted]" } });
    expect(JSON.stringify(result)).not.toMatch(/private-|secret-prompt|credential-secret/);
  });

  it("sanitizes non-Error objects and strings before console logging", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      errorLog("engine", "failed", { message: "prompt: confidential", code: "E_FAIL", data: "hidden-body" });
      errorLog("engine", "failed", "Bearer very-secret-token");
      const logged = JSON.stringify(spy.mock.calls);
      expect(logged).toContain("E_FAIL");
      expect(logged).not.toMatch(/confidential|hidden-body|very-secret-token/);
    } finally { spy.mockRestore(); }
  });
});
