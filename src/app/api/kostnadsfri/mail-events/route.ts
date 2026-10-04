import { NextRequest, NextResponse } from "next/server";
import { listKostnadsfriMailEventsAfter } from "@/lib/db/services/kostnadsfri";

const MAX_LIMIT = 1000;

function authorized(request: NextRequest): boolean {
  const expected = process.env.KOSTNADSFRI_API_KEY;
  return Boolean(expected) && request.headers.get("x-api-key") === expected;
}

/** Postgres-rendered UTC timestamp with microseconds, e.g. 2026-10-03T08:31:00.123456Z. */
const CURSOR_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

/**
 * JS `Date` normalizes 2026-02-31 to March 3 while Postgres rejects it, so the
 * parsed date must round-trip to the same calendar components (to the
 * millisecond; the microsecond digits are already constrained by the regex).
 * Year 0000 does not exist in PostgreSQL and is rejected too.
 */
function isCalendarExact(createdAt: string): boolean {
  // PostgreSQL has no AD year 0 (1 BC comes before AD 1), but JS Date and
  // ISO 8601 accept 0000, so it has to be rejected explicitly.
  if (createdAt.startsWith("0000-")) return false;
  const parsed = new Date(createdAt);
  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 23) === createdAt.slice(0, 23)
  );
}

function decodeCursor(value: string | null): { createdAt: string; messageId: string } | null {
  if (!value) return null;
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const separator = decoded.indexOf("|");
    const createdAt = decoded.slice(0, separator);
    const messageId = decoded.slice(separator + 1);
    if (
      separator < 1 ||
      !CURSOR_TIME.test(createdAt) ||
      !isCalendarExact(createdAt) ||
      !/^[a-f0-9]{32}$/.test(messageId)
    ) {
      return null;
    }
    return { createdAt, messageId };
  } catch {
    return null;
  }
}

// The timestamp text comes from Postgres at full microsecond precision. A JS
// Date round-trip would truncate to milliseconds and make the next page repeat
// the cursor row.
function encodeCursor(row: { cursor_created_at: string; message_id: string }): string {
  return Buffer.from(`${row.cursor_created_at}|${row.message_id}`).toString("base64url");
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const rawCursor = request.nextUrl.searchParams.get("cursor");
  const cursor = decodeCursor(rawCursor);
  if (rawCursor && !cursor) {
    return NextResponse.json({ success: false, error: "Invalid cursor" }, { status: 400 });
  }
  const parsedLimit = Number.parseInt(request.nextUrl.searchParams.get("limit") || "500", 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), MAX_LIMIT) : 500;
  try {
    const batch = await listKostnadsfriMailEventsAfter(
      cursor?.createdAt ?? null,
      cursor?.messageId ?? null,
      limit + 1,
    );
    const hasMore = batch.length > limit;
    const rows = batch.slice(0, limit);
    return NextResponse.json({
      success: true,
      checkedAt: new Date().toISOString(),
      complete: !hasMore,
      nextCursor: hasMore && rows.length > 0 ? encodeCursor(rows[rows.length - 1]) : null,
      mailEvents: rows.map((row) => ({
        messageId: row.message_id,
        slug: row.slug,
        recipient: row.recipient,
        sender: row.sender,
        flowId: row.flow_id,
        step: row.step,
        variant: row.variant,
        scheduledAt: row.scheduled_at ? new Date(row.scheduled_at).toISOString() : null,
        smtpAcceptedAt: row.smtp_accepted_at ? new Date(row.smtp_accepted_at).toISOString() : null,
        deliveredAt: row.delivered_at ? new Date(row.delivered_at).toISOString() : null,
        repliedAt: row.replied_at ? new Date(row.replied_at).toISOString() : null,
        outcome: row.outcome,
        source: row.source,
        createdAt: new Date(row.created_at).toISOString(),
      })),
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Internt fel. Försök igen senare." },
      { status: 500 },
    );
  }
}
