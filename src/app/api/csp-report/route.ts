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
import { withRateLimit } from "@/lib/rateLimit";

export async function POST(req: Request) {
  return withRateLimit(req, "csp:report", async () => {
    try {
      const body = await req.json();
      const report =
        body && typeof body === "object" && "csp-report" in body
          ? body["csp-report"]
          : body;
      console.warn("[CSP Violation]", JSON.stringify(report));
    } catch {
      // Malformed report — ignore
    }
    return new NextResponse(null, { status: 204 });
  });
}
