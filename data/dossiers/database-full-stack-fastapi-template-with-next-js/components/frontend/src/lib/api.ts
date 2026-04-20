const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || ""

export function getAccessToken() {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem("access_token")
}

export function setAccessToken(token: string) {
  if (typeof window === "undefined") return
  window.localStorage.setItem("access_token", token)
}

export function clearAccessToken() {
  if (typeof window === "undefined") return
  window.localStorage.removeItem("access_token")
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const token = getAccessToken()
  const headers = new Headers(init.headers)

  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json")
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `API request failed with status ${response.status}`)
  }

  return response
}
