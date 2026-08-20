import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { META_MAX_STRING, truncateMetaStrings } from "./dump-logs-meta.mjs";
import { annotateReportedQualityGate } from "./lib/reported-quality-gate.mjs";

const dumpLogsSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "dump-logs.mjs"),
  "utf8",
);

/** Mirror of KIND_SPECS.telemetry.sanitizeRow — dump-logs.mjs has top-level DB I/O. */
function sanitizeTelemetryRow(row: {
  meta: unknown;
  quality_gate_result?: string | null;
  product_blocked?: boolean;
}) {
  return annotateReportedQualityGate({ ...row, meta: truncateMetaStrings(row.meta) });
}

describe("dump-logs.mjs telemetry kind", () => {
  it("selektar meta och sanerar den (samma mönster som errors)", () => {
    // Source lock: KIND_SPECS cannot be imported (script connects on load).
    const telemetryBlock = dumpLogsSource.match(
      /telemetry:\s*\{[\s\S]*?\n  \},\n  errors:/,
    )?.[0];
    expect(telemetryBlock, "telemetry kind block").toBeDefined();
    expect(telemetryBlock).toContain('"meta"');
    expect(telemetryBlock).toContain("annotateReportedQualityGate");
    expect(telemetryBlock).toContain("truncateMetaStrings(row.meta)");
    expect(telemetryBlock).toContain("product_blocked");
    expect(dumpLogsSource).toContain("reported-quality-gate.mjs");

    const longPayload = "z".repeat(META_MAX_STRING + 500);
    const sanitized = sanitizeTelemetryRow({
      meta: { streamMs: 1200, postStreamSteps: { autofix: { durationMs: 50 } }, blob: longPayload },
    });
    expect(sanitized.meta).toMatchObject({
      streamMs: 1200,
      postStreamSteps: { autofix: { durationMs: 50 } },
    });
    expect(String((sanitized.meta as { blob: string }).blob)).toContain("[trunkerad");

    const overlaid = sanitizeTelemetryRow({
      quality_gate_result: "preflight_passed",
      product_blocked: true,
      meta: { streamMs: 10 },
    });
    expect(overlaid.quality_gate_result).toBe("preflight_passed");
    expect(overlaid.reported_quality_gate).toBe("product_blocked");
    expect(overlaid.quality_gate_overlaid).toBe(true);
  });

  it("behåller duration_ms/token-kolumner och errors-kindets meta-sanering (motprov)", () => {
    const telemetryBlock = dumpLogsSource.match(
      /telemetry:\s*\{[\s\S]*?\n  \},\n  errors:/,
    )?.[0];
    expect(telemetryBlock).toContain('"duration_ms"');
    expect(telemetryBlock).toContain('"prompt_tokens"');
    expect(telemetryBlock).toContain('"completion_tokens"');

    const errorsBlock = dumpLogsSource.match(
      /errors:\s*\{[\s\S]*?\n  \},\n  chats:/,
    )?.[0];
    expect(errorsBlock, "errors kind block").toBeDefined();
    expect(errorsBlock).toContain('"meta"');
    expect(errorsBlock).toContain(
      "sanitizeRow: (row) => ({ ...row, meta: truncateMetaStrings(row.meta) })",
    );
  });
});
