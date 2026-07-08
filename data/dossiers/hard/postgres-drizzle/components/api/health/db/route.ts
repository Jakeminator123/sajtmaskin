import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getDb, isDbConfigured } from '@/lib/db';

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'Database is not configured (missing DATABASE_URL)' },
      { status: 503 },
    );
  }
  try {
    await getDb().execute(sql`select 1`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Database health check failed', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
