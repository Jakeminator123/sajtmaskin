# When to use

Use Ably when a Next.js app needs low-latency realtime features such as:

- live notifications
- chat or activity feeds
- collaborative presence (who is online / in a room)
- pub/sub updates for dashboards
- message history replay

This dossier is for App Router projects that should connect from browser components using Ably token auth, not a hardcoded public API key.

# How to integrate

## 1) Install and configure environment variables

Required env var:

```env
ABLY_API_KEY=your-app-id.key-id:secret
```

Keep `ABLY_API_KEY` server-only. Do not expose it with `NEXT_PUBLIC_`.

## 2) Add the auth route

Create a route handler at `app/api/ably/auth/route.ts` (or move the provided file into your app root if your codebase does not use `components/app/...` as a staging area):

```ts
import { NextResponse } from 'next/server'
import Ably from 'ably'

export async function GET() {
  const apiKey = process.env.ABLY_API_KEY

  if (!apiKey) {
    return NextResponse.json({ error: 'Missing ABLY_API_KEY' }, { status: 500 })
  }

  const client = new Ably.Rest(apiKey)
  const tokenRequest = await client.auth.createTokenRequest({
    clientId: 'anonymous-user',
  })

  return NextResponse.json(tokenRequest)
}
```

If your app has authenticated users, replace `anonymous-user` with a stable user id from your auth system.

## 3) Initialize the browser client with `authUrl`

```ts
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
```

Use a singleton. Do not create a new `Realtime` client on every render.

## 4) Wrap the app or feature subtree in a client provider

```tsx
'use client'

import { PropsWithChildren, useEffect } from 'react'
import { getAblyClient } from './ably-client'

export default function AblyClientProvider({ children }: PropsWithChildren) {
  useEffect(() => {
    const client = getAblyClient()
    return () => client.close()
  }, [])

  return children
}
```

Place it high enough in the tree that all realtime components can access the same connection.

## 5) Subscribe to a channel from a client component

```tsx
'use client'

import { useEffect, useState } from 'react'
import { getAblyClient } from '@/app/ably-client'

export function LiveCounter() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const client = getAblyClient()
    const channel = client.channels.get('dashboard:updates')

    const onMessage = (message: { name: string; data: { count: number } }) => {
      if (message.name === 'counter.updated') {
        setCount(message.data.count)
      }
    }

    channel.subscribe(onMessage)

    return () => {
      channel.unsubscribe(onMessage)
    }
  }, [])

  return <div>Count: {count}</div>
}
```

## 6) Publish from a server route or server action

Publishing is usually safer from the server when events are authoritative.

```ts
import Ably from 'ably'

const client = new Ably.Rest(process.env.ABLY_API_KEY!)

export async function publishCounterUpdate(count: number) {
  const channel = client.channels.get('dashboard:updates')
  await channel.publish('counter.updated', { count })
}
```

## 7) Presence example

```tsx
'use client'

import { useEffect, useState } from 'react'
import { getAblyClient } from '@/app/ably-client'

export function RoomPresence({ roomId, userId }: { roomId: string; userId: string }) {
  const [members, setMembers] = useState<string[]>([])

  useEffect(() => {
    const client = getAblyClient()
    const channel = client.channels.get(`room:${roomId}`)

    async function setup() {
      await channel.presence.enter({ userId })
      const current = await channel.presence.get()
      setMembers(current.map((member) => String(member.clientId)))
    }

    const refresh = async () => {
      const current = await channel.presence.get()
      setMembers(current.map((member) => String(member.clientId)))
    }

    setup()
    channel.presence.subscribe('enter', refresh)
    channel.presence.subscribe('leave', refresh)

    return () => {
      channel.presence.unsubscribe('enter', refresh)
      channel.presence.unsubscribe('leave', refresh)
      channel.presence.leave()
    }
  }, [roomId, userId])

  return <div>Online: {members.join(', ')}</div>
}
```

# UX rules

- Treat connection state as part of the UI: show connecting, connected, and retry states for critical realtime surfaces.
- Use optimistic UI only when the user can tolerate eventual correction.
- For chat/activity feeds, combine live updates with history fetch so first render is not empty.
- Scope channels clearly, e.g. `org:{orgId}:notifications` or `room:{roomId}`.
- Use stable `clientId` values for authenticated users so presence and permissions make sense.
- Clean up subscriptions on unmount to avoid duplicate listeners after navigation.

# Avoid

- Do not expose `ABLY_API_KEY` to the client.
- Do not create a new Ably client inside every component or render path.
- Do not publish sensitive or authorization-critical events directly from untrusted clients unless channel capabilities explicitly allow it.
- Do not use one global channel for unrelated product areas; namespace channels by feature and resource id.
- Do not forget to unsubscribe and leave presence on cleanup.
- Do not rely on demo layout, header, theme, or branded UI from the original starter; keep only the integration wiring.

# Verification

1. Set `ABLY_API_KEY` and start the app.
2. Open `/api/ably/auth` in the browser or via curl; it should return a token request JSON payload, not your raw API key.
3. Render a client component that subscribes to a known channel.
4. Publish a test event from a server route, server action, or a one-off script.
5. Confirm the client updates without a page refresh.
6. If using presence, open two tabs with different user ids and confirm enter/leave events are reflected.
7. Check the browser devtools/network panel to confirm auth requests go to `/api/ably/auth` and no secret key is shipped to the client.
