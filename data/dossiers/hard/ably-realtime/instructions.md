# When to use

- Use for realtime features powered by Ably: chat, notifications, activity feeds, live dashboards, collaborative rooms, or presence.
- Use when browser clients should authenticate through a server token route instead of receiving a raw Ably API key.
- Best fit for Next.js App Router projects that can add an API route at `/api/ably/auth`.

# How to integrate

- Install `ably` and set server-only `ABLY_API_KEY` from the Ably dashboard.
- Add the token auth route at `app/api/ably/auth/route.ts`; never expose the API key with `NEXT_PUBLIC_`.
- Use `getAblyClient()` from client components to share one Ably Realtime connection.
- Optionally wrap a feature subtree with `AblyClientProvider` to initialize and close the shared connection.
- Subscribe to scoped channels such as `org:{orgId}:notifications` or `room:{roomId}` and unsubscribe on cleanup.
- Publish authoritative events from server routes, server actions, jobs, or trusted backend code.
- Replace the per-visitor anonymous `clientId` in the auth route's `resolveClientId()` with a stable authenticated user id when the app has auth.

# UX rules

- Show connection states for important realtime surfaces: connecting, connected, retrying, and unavailable.
- Combine live subscriptions with an initial history or data fetch so first render is useful.
- Use optimistic UI only when eventual correction is acceptable.
- Namespace channels by feature and resource id.
- For presence, use stable user identifiers and leave presence on unmount.

# Avoid

- Do not ship `ABLY_API_KEY` to the browser.
- Do not create a new Ably Realtime client on every render.
- Do not use one global channel for unrelated product areas.
- Do not let untrusted clients publish authorization-critical events unless Ably channel capabilities explicitly allow it.
- Do not forget to unsubscribe listeners and leave presence during cleanup.

# Verification

- Start the app with `ABLY_API_KEY` set.
- Request `/api/ably/auth`; it should return an Ably token request JSON payload, not the raw API key.
- With `ABLY_API_KEY` unset OR a preview placeholder (values containing `placeholder`/`not_real`): the route returns `503 { error: "realtime-not-configured" }` — never a raw 500 and never a real Ably call with a fabricated key. Realtime surfaces should render their "unavailable" connection state (see UX rules) as the discreet not-configured fallback.
- Render a client component that calls `getAblyClient()` and subscribes to a test channel.
- Publish a test event from trusted server-side code and confirm the browser updates without refresh.
- For presence, open two tabs with different user ids and confirm enter/leave events update.
- Check browser network output to confirm auth goes through `/api/ably/auth` and no secret key is bundled.