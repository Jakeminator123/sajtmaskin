import { NextResponse } from "next/server";
import { getMongoDb } from "@/lib/mongodb";

export async function GET() {
  try {
    const db = await getMongoDb();
    await db.command({ ping: 1 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("MongoDB health check failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
