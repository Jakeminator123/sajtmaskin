"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { clearAccessToken, getAccessToken, setAccessToken, apiFetch } from "../lib/api"

type LoginInput = {
  username: string
  password: string
}

type RegisterInput = {
  email: string
  password: string
  full_name?: string
}

type User = {
  id: string | number
  email: string
  full_name?: string | null
  is_active?: boolean
  is_superuser?: boolean
}

export function isLoggedIn() {
  return typeof window !== "undefined" && !!getAccessToken()
}

export default function useAuth() {
  const queryClient = useQueryClient()

  const userQuery = useQuery<User | null>({
    queryKey: ["currentUser"],
    queryFn: async () => {
      const response = await apiFetch("/api/v1/users/me")
      return response.json()
    },
    enabled: isLoggedIn(),
    retry: false,
  })

  const loginMutation = useMutation({
    mutationFn: async (input: LoginInput) => {
      const body = new URLSearchParams()
      body.set("username", input.username)
      body.set("password", input.password)

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || ""}/api/v1/login/access-token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
        },
      )

      if (!response.ok) {
        throw new Error("Invalid credentials")
      }

      const data = await response.json()
      setAccessToken(data.access_token)
      return data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["currentUser"] })
    },
  })

  const signUpMutation = useMutation({
    mutationFn: async (input: RegisterInput) => {
      const response = await apiFetch("/api/v1/users/signup", {
        method: "POST",
        body: JSON.stringify(input),
      })
      return response.json()
    },
  })

  const logout = async () => {
    clearAccessToken()
    await queryClient.removeQueries({ queryKey: ["currentUser"] })
  }

  return {
    user: userQuery.data ?? null,
    userQuery,
    loginMutation,
    signUpMutation,
    logout,
  }
}
