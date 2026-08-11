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
 * Receiver for Vercel Log Drains (see `src/lib/vercel-log-drain.ts`).
 *
 * This path is what goes in the drain's **URL** field in the Vercel dashboard
 * (Team → Settings → Drains → Add Drain → Logs → Custom Endpoint):
 *
 *     https://sajtmaskin.vercel.app/api/drains/vercel
 *
 * The dialog's "Signature Verification Secret" must be stored as
 * `VERCEL_LOG_DRAIN_SECRET` in Vercel env, otherwise this route rejects every
 * delivery — a drain endpoint with no secret is an open write surface for
 * anyone who guesses the URL.
 *
 * Kept lines land in `vercel_log_drain_events` and are read back via
 * `dump-logs.mjs --kinds=drain` (backoffice Logg-export, `/logg` step 3c).
 */
export async function POST(req: Request) {
  // Vercel Custom Endpoint ownership probe: unsigned POST with
  // `x-vercel-verify`. Echo the header and 200 so dashboard Verify/Create works
  // before the signed secret is wired. Real deliveries always carry a signature.
  const verifyToken = req.headers.get("x-vercel-verify");
  if (verifyToken && !req.headers.get("x-vercel-signature")) {
    return new NextResponse("OK", {
      status: 200,
      headers: { "x-vercel-verify": verifyToken },
    });
  }

  const secret = process.env.VERCEL_LOG_DRAIN_SECRET;
  if (!secret) {
    // 503 rather than 500: this is a configuration state, and answering
    // non-2xx keeps Vercel retrying instead of spending the delivery on a
    // receiver that cannot verify it.
    return NextResponse.json(
      { error: "Log drain not configured", stored: false },
      { status: 503, headers: { "Retry-After": "300" } },
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
