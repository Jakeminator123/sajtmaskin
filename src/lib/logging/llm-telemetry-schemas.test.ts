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

  describe("site-aborted.schema.json", () => {
    const validate = ajv.compile(loadSchema("site-aborted.schema.json"));

    it("matchar provider-abort efter content (full payload)", () => {
      const payload = {
        type: "site.aborted",
        chatId: "chat_abc123",
        versionId: null,
        reason: "provider_aborted_after_content",
        kind: "create",
        elapsedMs: 84230,
      };
      expect(validate(payload)).toBe(true);
    });

    it("matchar minimum-payload (bara type + reason)", () => {
      const payload = {
        type: "site.aborted",
        reason: "stream_closed_without_done",
      };
      expect(validate(payload)).toBe(true);
    });

    it("matchar staleness_inferred från generation-log-writer", () => {
      const payload = {
        type: "site.aborted",
        chatId: "chat_xyz",
        versionId: null,
        reason: "staleness_inferred",
        stalenessMs: 1_800_001,
      };
      expect(validate(payload)).toBe(true);
    });

    it("kastar okänd reason-enum", () => {
      const payload = {
        type: "site.aborted",
        reason: "made_up_reason",
      };
      expect(validate(payload)).toBe(false);
    });

    it("kastar fel discriminant-värde", () => {
      const payload = {
        type: "site.failed",
        reason: "stream_error",
      };
      expect(validate(payload)).toBe(false);
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

  describe("product-postcheck.schema.json", () => {
    const validate = ajv.compile(loadSchema("product-postcheck.schema.json"));

    it("matchar product_postcheck.summary", () => {
      const payload = {
        level: "warning",
        category: "product_postcheck.summary",
        message: "F2 Product Postcheck found 1 warning(s).",
        meta: {
          warningCount: 1,
          productBlocked: false,
          durationMs: 1234,
          checkedUrl: "https://vm-fly-jakem.fly.dev/chat_1",
        },
      };
      expect(validate(payload)).toBe(true);
    });

    it("matchar product_postcheck.broken_image", () => {
      const payload = {
        level: "warning",
        category: "product_postcheck.broken_image",
        message: "Bilden laddade inte",
        meta: {
          code: "broken_image",
          src: "https://images.example/broken.jpg",
          alt: "Porträtt",
          durationMs: 42,
          checkedUrl: "http://localhost:3000/preview",
        },
      };
      expect(validate(payload)).toBe(true);
    });

    it("matchar product_postcheck.skipped", () => {
      const payload = {
        level: "info",
        category: "product_postcheck.skipped",
        message: "F2 Product Postcheck skipped.",
        meta: {
          skippedReason: "url_not_allowed",
          durationMs: 0,
          checkedUrl: "https://example.com",
        },
      };
      expect(validate(payload)).toBe(true);
    });

    it("kastar icke-product-kategori", () => {
      const payload = {
        level: "warning",
        category: "quality-gate:typecheck",
        message: "Wrong lane",
      };
      expect(validate(payload)).toBe(false);
    });
  });
});
