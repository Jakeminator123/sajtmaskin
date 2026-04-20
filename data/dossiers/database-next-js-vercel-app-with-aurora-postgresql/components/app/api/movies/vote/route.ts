import { NextRequest, NextResponse } from 'next/server';
import { withTransaction } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const movieId = Number(body.movieId);
    const increment = Number(body.increment ?? 1);

    if (!Number.isInteger(movieId) || !Number.isInteger(increment)) {
      return NextResponse.json(
        { error: 'movieId and increment must be integers' },
        { status: 400 },
      );
    }

    const movie = await withTransaction(async (client) => {
      const result = await client.query<{
        id: number;
        title: string;
        score: number;
      }>(
        `update movies
         set score = coalesce(score, 0) + $2
         where id = $1
         returning id, title, score`,
        [movieId, increment],
      );

      return result.rows[0] ?? null;
    });

    if (!movie) {
      return NextResponse.json({ error: 'Movie not found' }, { status: 404 });
    }

    return NextResponse.json({ movie });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to update movie score', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
