import { NextResponse } from "next/server";

import { getMongoDb, isDbConfigured } from "@/lib/mongodb";

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Database is not configured (missing MONGODB_URI)" },
      { status: 503 },
    );
  }
  try {
    const db = await getMongoDb();
    await db.command({ ping: 1 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    // Keep this catch: invalid configuration or an unreachable cluster must
    // return a controlled response, never crash at import or request time.
    console.error("MongoDB health check failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
