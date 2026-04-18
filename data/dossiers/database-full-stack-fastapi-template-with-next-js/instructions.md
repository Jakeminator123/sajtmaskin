# When to use

Use this dossier when the site has a **separate FastAPI backend** and a **Next.js frontend** that must:

- authenticate users with FastAPI's token endpoint
- store and send a bearer token from the browser
- fetch the current user from FastAPI
- call backend REST endpoints from React components

This is a good fit for app-shell, dashboard, internal tools, and SaaS products. It is usually **not** needed for content-only sites.

# How to integrate

## 1) Configure the backend base URL

Add a public base URL for the FastAPI API:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

Use the deployed FastAPI origin in production.

## 2) Add a small API wrapper

Use a shared fetch helper that automatically sends the bearer token:

```ts
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || ""

export function getAccessToken() {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem("access_token")
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  const token = getAccessToken()

  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json")
  }

  if (token) headers.set("Authorization", `Bearer ${token}`)

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  })

  if (!response.ok) throw new Error(`API error: ${response.status}`)
  return response
}
```

If your project already includes a generated OpenAPI client from the FastAPI backend, prefer that client and centralize token injection there.

## 3) Implement the auth hook

FastAPI's common token route expects `application/x-www-form-urlencoded` credentials. Keep that detail exact.

```ts
"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

export function isLoggedIn() {
  return typeof window !== "undefined" && !!localStorage.getItem("access_token")
}

export function useAuth() {
  const queryClient = useQueryClient()

  const currentUser = useQuery({
    queryKey: ["currentUser"],
    queryFn: async () => {
      const response = await apiFetch("/api/v1/users/me")
      return response.json()
    },
    enabled: isLoggedIn(),
    retry: false,
  })

  const loginMutation = useMutation({
    mutationFn: async ({ username, password }: { username: string; password: string }) => {
      const body = new URLSearchParams()
      body.set("username", username)
      body.set("password", password)

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/v1/login/access-token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      })

      if (!response.ok) throw new Error("Invalid credentials")
      const data = await response.json()
      localStorage.setItem("access_token", data.access_token)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["currentUser"] }),
  })

  const logout = async () => {
    localStorage.removeItem("access_token")
    await queryClient.removeQueries({ queryKey: ["currentUser"] })
  }

  return { currentUser, loginMutation, logout }
}
```

## 4) Protect app pages in the client

For routes that require auth, gate rendering until the user query resolves.

```tsx
"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import useAuth, { isLoggedIn } from "@/components/frontend/src/hooks/useAuth"

export default function ProtectedPage() {
  const router = useRouter()
  const { userQuery } = useAuth()

  useEffect(() => {
    if (!isLoggedIn()) router.replace("/login")
  }, [router])

  if (!isLoggedIn()) return null
  if (userQuery.isLoading) return <div>Loading...</div>
  if (userQuery.isError) return <div>Session expired</div>

  return <div>Protected content</div>
}
```

## 5) Wrap the app with React Query

The auth hook depends on TanStack Query.

```tsx
"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
```

Mount this provider near the root layout.

## 6) Call FastAPI endpoints from UI code

Use the same wrapper for authenticated data access:

```ts
const response = await apiFetch("/api/v1/items/")
const items = await response.json()
```

For POST/PUT/PATCH:

```ts
await apiFetch("/api/v1/items/", {
  method: "POST",
  body: JSON.stringify({ title: "New item" }),
})
```

# UX rules

- Always provide explicit login, logout, and session-expired states.
- Redirect unauthenticated users away from protected app pages.
- Show a loading state while `currentUser` is being resolved.
- Keep auth errors human-readable: invalid credentials, expired session, network error.
- Do not render private dashboard content before auth is confirmed.
- For signup flows, send users to login or auto-login them consistently; do not mix patterns.

# Avoid

- Do not use cookies and localStorage token auth at the same time unless you intentionally support both.
- Do not call `localStorage` during server rendering.
- Do not send JSON to FastAPI's OAuth password token endpoint; it expects form-encoded fields.
- Do not hardcode `http://localhost:8000` in components; always use `NEXT_PUBLIC_API_BASE_URL`.
- Do not keep template-specific imports like `@/client`, `@tanstack/react-router`, or custom toast hooks unless those modules already exist in the target scaffold.
- Do not assume every FastAPI app exposes the exact same route names; verify the backend's OpenAPI schema or router paths.

# Verification

1. Start the FastAPI backend and the Next.js frontend.
2. Confirm the frontend can read `NEXT_PUBLIC_API_BASE_URL`.
3. Submit valid credentials to the FastAPI login endpoint and verify an `access_token` is stored in localStorage.
4. Reload the page and verify `/api/v1/users/me` succeeds with the `Authorization: Bearer <token>` header.
5. Visit a protected route while logged out and verify redirect to `/login`.
6. Click logout and verify the token is removed and protected data no longer renders.
7. Test an invalid or expired token and verify the UI shows a recoverable auth error instead of a blank page.
