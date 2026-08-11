import { NextResponse, after } from "next/server";
import {
  claimPruneSlot,
  insertDrainLogs,
  parseVercelDrainBody,
  pruneDrainLogs,
  selectDrainRowsToStore,
  verifyVercelDrainSignature,
} from "@/lib/vercel-log-drain";

export const runtime = "nodejs";

/**
 * True only when `VERCEL_LOG_DRAIN_ENABLED` is exactly `"true"`.
 * Default off — a mis-pointed drain must not start accepting signed traffic
 * just because a secret exists in env.
 */
export function isVercelLogDrainEnabled(
  value: string | undefined = process.env.VERCEL_LOG_DRAIN_ENABLED,
): boolean {
  return value === "true";
}

/**
 * Receiver for Vercel Log Drains (see `src/lib/vercel-log-drain.ts`).
 *
 * Dashboard URL (not an env var):
 *
 *     https://sajtmaskin.vercel.app/api/drains/vercel
 *
 * Two env gates, both required for signed deliveries:
 * 1. `VERCEL_LOG_DRAIN_ENABLED=true` — explicit opt-in kill switch (default off)
 * 2. `VERCEL_LOG_DRAIN_SECRET` — Signature Verification Secret from the drain dialog
 *
 * When either gate is off the route answers **410 Gone** (not 503). Retries from
 * a misconfigured same-app drain caused a multi-million invocation feedback loop
 * on 2026-08-11; 410 tells Vercel to stop and mark the drain errored instead of
 * hammering us. The unsigned `x-vercel-verify` ownership probe still returns 200
 * so the dashboard Verify/Create handshake works before you flip the switch.
 *
 * Kept lines land in `vercel_log_drain_events` (`dump-logs.mjs --kinds=drain`).
 */
export async function POST(req: Request) {
  // Vercel Custom Endpoint ownership probe: unsigned POST with
  // `x-vercel-verify`. Echo the header and 200 so dashboard Verify/Create works
  // before ENABLED + secret are wired. Real deliveries always carry a signature.
  const verifyToken = req.headers.get("x-vercel-verify");
  if (verifyToken && !req.headers.get("x-vercel-signature")) {
    return new NextResponse("OK", {
      status: 200,
      headers: { "x-vercel-verify": verifyToken },
    });
  }

  if (!isVercelLogDrainEnabled()) {
    // 410 (not 503): intentionally off. Do not invite retries — a same-app drain
    // that keeps retrying recreates the 2026-08-11 feedback loop.
    return NextResponse.json(
      {
        error: "Log drain disabled",
        stored: false,
        hint: "Set VERCEL_LOG_DRAIN_ENABLED=true in production and redeploy to accept deliveries.",
      },
      { status: 410 },
    );
  }

  const secret = process.env.VERCEL_LOG_DRAIN_SECRET;
  if (!secret) {
    // Same 410 rationale as the ENABLED gate: missing secret is a config state
    // that retries will not fix until a human deploys the env var.
    return NextResponse.json(
      { error: "Log drain secret not configured", stored: false },
      { status: 410 },
    );
  }

  const rawBody = await req.text();
  const verification = verifyVercelDrainSignature({
    rawBody,
    signatureHeader: req.headers.get("x-vercel-signature"),
    secret,
  });
  if (!verification.ok) {
    return NextResponse.json(
      { code: "invalid_signature", error: verification.reason },
      { status: 403 },
    );
  }

  const records = parseVercelDrainBody(rawBody);
  if (records === null) {
    return NextResponse.json({ error: "Invalid drain body" }, { status: 400 });
  }

  const rows = selectDrainRowsToStore(records);

  try {
    const result = await insertDrainLogs(rows);
    if (result.stored === null) {
      console.warn(
        `[vercel-drain] DB unconfigured — asking for redelivery of ${rows.length} row(s)`,
      );
      return NextResponse.json(
        { error: "Storage unavailable", stored: false, retry: true },
        { status: 503, headers: { "Retry-After": "60" } },
      );
    }

    if (claimPruneSlot()) {
      after(async () => {
        try {
          await pruneDrainLogs();
        } catch (err) {
          console.warn("[vercel-drain] retention prune failed:", err);
        }
      });
    }

    return NextResponse.json({ ok: true, received: records.length, stored: result.stored });
  } catch (err) {
    // Non-2xx → Vercel redelivers, so a transient DB failure does not silently
    // drop the batch.
    console.error("[vercel-drain] insert failed:", err);
    return NextResponse.json({ error: "Failed to store logs" }, { status: 500 });
  }
}
