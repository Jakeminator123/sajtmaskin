import { NextResponse } from 'next/server';

import { getSql, isDbConfigured } from '@/lib/db';

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json(
      {
        status: 'error',
        database: 'not-configured',
        message: 'Database is not configured (missing DATABASE_URL)',
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }

  try {
    const sql = getSql();
    const result = await sql`select 1 as ok`;

    return NextResponse.json({
      status: 'ok',
      database: 'reachable',
      result: result[0] ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // Log details server-side only — raw driver errors can leak connection
    // details through a public health endpoint.
    console.error('Neon database health check failed', error);
    return NextResponse.json(
      {
        status: 'error',
        database: 'unreachable',
        message: 'Database is unreachable. Check server logs for details.',
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
