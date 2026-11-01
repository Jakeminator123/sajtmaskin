/**
 * CSP Violation Report Endpoint
 * POST /api/csp-report
 *
 * Receives Content-Security-Policy violation reports from browsers.
 * Browsers send reports with Content-Type: application/csp-report and
 * body: { "csp-report": { ... } }. Also accepts application/json.
 *
 * No authentication required — browsers send reports automatically.
 * Rate-limited to prevent abuse.
 */

import { NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rate-limit";
import { readRequestJsonWithLimit } from "@/lib/api/read-limited-body";

const MAX_LOG_FIELD_LENGTH = 500;
const MAX_CSP_REPORT_BODY_BYTES = 65_536;

function formatReportLogValue(value: unknown): string {
  return String(value)
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .slice(0, MAX_LOG_FIELD_LENGTH);
}

function summarizeReport(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "non-object payload";
  const report =
    (payload as { "csp-report"?: unknown })["csp-report"] ??
    (payload as { cspReport?: unknown }).cspReport ??
    payload;
  if (!report || typeof report !== "object") return "no csp-report key";
  const r = report as Record<string, unknown>;
  const directive = r["violated-directive"] ?? r["effective-directive"] ?? "?";
  const blocked = r["blocked-uri"] ?? "?";
  const docUri = r["document-uri"] ?? "?";
  return `directive=${formatReportLogValue(directive)} blocked=${formatReportLogValue(blocked)} doc=${formatReportLogValue(docUri)}`;
}

function isReportOnlyEvalNoise(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const report =
    (payload as { "csp-report"?: unknown })["csp-report"] ??
    (payload as { cspReport?: unknown }).cspReport ??
    payload;
  if (!report || typeof report !== "object") return false;
  const r = report as Record<string, unknown>;
  return (
    r.disposition === "report" &&
    r["effective-directive"] === "script-src" &&
    r["blocked-uri"] === "eval"
  );
}

export async function POST(req: Request) {
  return withRateLimit(req, "csp:report", async () => {
    try {
      const bodyResult = await readRequestJsonWithLimit<unknown>(req, MAX_CSP_REPORT_BODY_BYTES);
      if (!bodyResult.ok) return new NextResponse(null, { status: 204 });
      const body = bodyResult.value;
      if (process.env.NODE_ENV === "production" && isReportOnlyEvalNoise(body)) {
        return new NextResponse(null, { status: 204 });
      }
      if (process.env.NODE_ENV !== "production") {
        console.info("[csp-report]", summarizeReport(body));
      } else {
        console.warn("[CSP Violation]", summarizeReport(body));
      }
    } catch {
      // Malformed report — ignore
    }
    return new NextResponse(null, { status: 204 });
  });
}
