import { NextRequest, NextResponse } from "next/server";
import { listKostnadsfriMailEventsAfter } from "@/lib/db/services/kostnadsfri";

const MAX_LIMIT = 1000;

function authorized(request: NextRequest): boolean {
  const expected = process.env.KOSTNADSFRI_API_KEY;
  return Boolean(expected) && request.headers.get("x-api-key") === expected;
}

function decodeCursor(value: string | null): { createdAt: Date; messageId: string } | null {
  if (!value) return null;
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const separator = decoded.indexOf("|");
    const createdAt = new Date(decoded.slice(0, separator));
    const messageId = decoded.slice(separator + 1);
    if (separator < 1 || Number.isNaN(createdAt.getTime()) || !/^[a-f0-9]{32}$/.test(messageId)) {
      return null;
    }
    return { createdAt, messageId };
  } catch {
    return null;
  }
}

function encodeCursor(row: { created_at: Date | string; message_id: string }): string {
  return Buffer.from(`${new Date(row.created_at).toISOString()}|${row.message_id}`).toString(
    "base64url",
  );
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
        smtpAcceptedAt: row.smtp_accepted_at
          ? new Date(row.smtp_accepted_at).toISOString()
          : null,
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
