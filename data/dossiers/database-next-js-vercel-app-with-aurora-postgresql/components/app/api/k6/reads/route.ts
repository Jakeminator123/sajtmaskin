import { type NextRequest, NextResponse } from 'next/server';
import { queryMovies } from '@/lib/load-test/db';

export async function GET(_request: NextRequest) {
  try {
    await queryMovies();
    return NextResponse.json({ message: 'Successfully queried movies' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error querying movies:', message);
    return NextResponse.json(
      { error: 'Failed to query movies', details: message },
      { status: 500 }
    );
  }
}

