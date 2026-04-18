import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { searchRecords } from '../../../lib/search'

const querySchema = z.object({
  q: z.string().min(1),
})

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    q: request.nextUrl.searchParams.get('q') ?? '',
  })

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Missing or invalid q parameter' },
      { status: 400 }
    )
  }

  const results = await searchRecords({
    table: 'content',
    query: parsed.data.q,
    columns: ['title', 'description'],
    limit: 20,
  })

  return NextResponse.json(results)
}
