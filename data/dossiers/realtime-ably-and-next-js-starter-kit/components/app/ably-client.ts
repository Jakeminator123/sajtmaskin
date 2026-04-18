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
