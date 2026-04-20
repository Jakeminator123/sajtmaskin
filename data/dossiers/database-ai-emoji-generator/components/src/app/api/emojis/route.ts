import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const limit = Number(searchParams.get("limit") || 20)
  const cursor = searchParams.get("cursor")

  return NextResponse.json(
    {
      items: [],
      nextCursor: null,
      limit,
      cursor,
    },
    { status: 200 }
  )
}
