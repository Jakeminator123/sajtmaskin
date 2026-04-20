import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    const result = await query<{
      id: number;
      title: string;
      released_year: number | null;
      score: number | null;
    }>(
      `select id, title, released_year, score
       from movies
       order by id desc
       limit 20`,
    );

    return NextResponse.json({ movies: result.rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to fetch movies', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
