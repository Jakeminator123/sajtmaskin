import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db';

export async function GET() {
  try {
    const result = await sql`select 1 as ok`;

    return NextResponse.json({
      status: 'ok',
      database: 'reachable',
      result: result[0] ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        database: 'unreachable',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
