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

/**
 * A preview/F2 environment seeds ABLY_API_KEY with a non-empty stub (e.g.
 * `ably_api_key_placeholder_preview_not_real`), so a mere-presence check would
 * call Ably with a fabricated key and surface a raw 500 to the visitor. Any
 * placeholder-marked value counts as NOT configured and takes the calm 503
 * path instead. Mirrors the stub vocabulary (`placeholder` / `not_real` /
 * `dummy`) used by the sibling dossiers.
 */
function isPlaceholderValue(value: string | undefined | null): boolean {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) return true
  return /placeholder|not[_-]?a?[_-]?real|dummy|changeme|^your[_-]/i.test(trimmed)
}

export async function GET() {
  const apiKey = process.env.ABLY_API_KEY

  // `!apiKey` kept alongside the placeholder check for type narrowing.
  if (!apiKey || isPlaceholderValue(apiKey)) {
    return NextResponse.json(
      { error: 'realtime-not-configured' },
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
