import { NextResponse } from 'next/server'
import Ably from 'ably'

/**
 * Resolve the Ably clientId for the requesting browser.
 *
 * When the host app has authentication, replace the fallback below with the
 * signed-in user's stable id (from the auth session) so presence and message
 * attribution survive reconnects. Without auth, every visitor gets a unique
 * anonymous id — never a shared fixed one, which would make every browser
 * appear as the same presence member.
 */
function resolveClientId(): string {
  return `anonymous-${crypto.randomUUID()}`
}

export async function GET() {
  const apiKey = process.env.ABLY_API_KEY

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Realtime is not configured (missing ABLY_API_KEY)' },
      { status: 503 }
    )
  }

  const client = new Ably.Rest(apiKey)

  try {
    const tokenRequest = await client.auth.createTokenRequest({
      clientId: resolveClientId(),
    })

    return NextResponse.json(tokenRequest)
  } catch {
    return NextResponse.json(
      { error: 'Failed to create Ably token request' },
      { status: 500 }
    )
  }
}
