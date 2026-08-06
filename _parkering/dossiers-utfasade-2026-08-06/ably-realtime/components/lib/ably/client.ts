import * as Ably from 'ably'

let client: Ably.Realtime | null = null

export function getAblyClient() {
  if (client) return client

  client = new Ably.Realtime({
    authUrl: '/api/ably/auth',
    autoConnect: typeof window !== 'undefined',
  })

  return client
}

/**
 * Close the shared connection AND drop the singleton so the next
 * `getAblyClient()` call creates a fresh client. Always use this instead of
 * calling `client.close()` directly — a closed-but-cached instance would be
 * handed out to every later caller (e.g. after a React Strict Mode remount).
 */
export function closeAblyClient() {
  if (!client) return
  client.close()
  client = null
}
