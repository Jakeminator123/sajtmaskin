import { describe, it, expect } from "vitest";
import Ajv from "ajv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SCHEMA_DIR = resolve(__dirname, "..", "..", "..", "docs", "schemas", "strict");

function loadSchema(name: string): object {
  return JSON.parse(readFileSync(resolve(SCHEMA_DIR, name), "utf-8"));
}

describe("LLM telemetri strict schemas", () => {
  const ajv = new Ajv({ strict: false });

  describe("llm-fixer-aborted.schema.json", () => {
    const validate = ajv.compile(loadSchema("llm-fixer-aborted.schema.json"));

    it("matchar canonical payload från llm-fixer.ts", () => {
      const payload = {
        type: "llm_fixer_aborted",
        durationMs: 5000,
        errorsCount: 3,
        requiredFilesCount: 2,
      };
      expect(validate(payload)).toBe(true);
    });

    it("kastar payload med negativ durationMs", () => {
      const payload = {
        type: "llm_fixer_aborted",
        durationMs: -1,
        errorsCount: 0,
        requiredFilesCount: 0,
      };
      expect(validate(payload)).toBe(false);
    });
  });

  describe("dossier-verbatim-restored.schema.json", () => {
    const validate = ajv.compile(loadSchema("dossier-verbatim-restored.schema.json"));

    it("matchar canonical payload med båda reason-värden", () => {
      const payload = {
        type: "dossier_verbatim_restored",
        chatId: "test-chat",
        count: 2,
        files: [
          {
            path: "components/clerk-provider-shell.tsx",
            dossierId: "clerk-auth",
            reason: "verbatim_content_drift",
          },
          {
            path: "components/missing.tsx",
            dossierId: "stripe-checkout",
            reason: "verbatim_file_missing_in_llm_output",
          },
        ],
      };
      expect(validate(payload)).toBe(true);
    });

    it("kastar payload med count: 0 (minst 1 krävs)", () => {
      const payload = {
        type: "dossier_verbatim_restored",
        chatId: "test-chat",
        count: 0,
        files: [],
      };
      expect(validate(payload)).toBe(false);
    });
  });

  describe("llm-fixer-partial-response.schema.json", () => {
    const validate = ajv.compile(loadSchema("llm-fixer-partial-response.schema.json"));

    it("matchar canonical payload", () => {
      const payload = {
        type: "llm_fixer_partial_response",
        excludedFiles: [
          { path: "app/page.tsx", reason: "shrink_below_50pct (orig=18981, fixed=2362)" },
        ],
        totalFixedFilesAttempted: 5,
      };
      expect(validate(payload)).toBe(true);
    });
  });

  describe("site-done-telemetry.schema.json", () => {
    const validate = ajv.compile(loadSchema("site-done-telemetry.schema.json"));

    it("matchar canonical site.done med wave-7-fält", () => {
      const payload = {
        type: "site.done",
        chatId: "test-chat",
        versionId: "v1",
        durationMs: 427000,
        previewUrl: "https://vm.fly.dev/test-chat",
        previewBlocked: false,
        previewDeferred: false,
        f2TimeMs: null,
        f3TimeMs: null,
        warmTscSkipped: true,
      };
      expect(validate(payload)).toBe(true);
    });

    it("matchar minimum-payload utan optional fält", () => {
      const payload = {
        type: "site.done",
        chatId: "test-chat",
        versionId: null,
        durationMs: 0,
      };
      expect(validate(payload)).toBe(true);
    });
  });
});
