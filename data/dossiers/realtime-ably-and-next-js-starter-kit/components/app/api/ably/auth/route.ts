import { NextResponse } from 'next/server'
import Ably from 'ably'

export async function GET() {
  const apiKey = process.env.ABLY_API_KEY

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing ABLY_API_KEY' },
      { status: 500 }
    )
  }

  const client = new Ably.Rest(apiKey)

  try {
    const tokenRequest = await client.auth.createTokenRequest({
      clientId: 'anonymous-user',
    })

    return NextResponse.json(tokenRequest)
  } catch {
    return NextResponse.json(
      { error: 'Failed to create Ably token request' },
      { status: 500 }
    )
  }
}
