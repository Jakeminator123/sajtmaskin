import { draftMode } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  const slug = searchParams.get('slug') || '/blog'

  if (!token || token !== process.env.NOTION_TOKEN) {
    return NextResponse.json({ message: 'not authorized' }, { status: 401 })
  }

  const draft = await draftMode()
  draft.enable()

  return NextResponse.redirect(new URL(slug, req.url), 307)
}
