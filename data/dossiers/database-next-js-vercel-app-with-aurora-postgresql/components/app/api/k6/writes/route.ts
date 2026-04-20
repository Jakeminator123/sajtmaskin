import { type NextRequest, NextResponse } from 'next/server';
import { writeMovie } from '@/lib/load-test/db';

export async function POST(_request: NextRequest) {
  try {
    await writeMovie('Yasoob', 1);
    return NextResponse.json({ message: 'Successfully wrote movie' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error writing movie:', message);
    return NextResponse.json(
      { error: 'Failed to write movie', details: message },
      { status: 500 }
    );
  }
}

