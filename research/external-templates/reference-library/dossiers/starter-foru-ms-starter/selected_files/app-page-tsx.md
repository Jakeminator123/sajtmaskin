# app/page.tsx

Reason: Useful structural reference

```text
"use client"

import { useEffect, useState } from "react"
import { ForumHeader } from "@/components/forum-header"
import { ThreadCard } from "@/components/thread-card"
import { CreateThreadDialog } from "@/components/create-thread-dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { ForumAPI } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import { Loader2 } from "lucide-react"

export default function HomePage() {
  const { user } = useAuth()
  const [threads, setThreads] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [filter, setFilter] = useState("latest")
  const [nextCursor, setNextCursor] = useState<string | null>(null)

  const loadThreads = async (cursor?: string, append: boolean = false) => {
    if (append) {
      setIsLoadingMore(true)
    } else {
      setIsLoading(true)
    }
    try {
      const data = await ForumAPI.getThreads({ filter, limit: 7, ...(cursor && { cursor }) })
      const newThreads = data.threads || []
      if (append) {
        setThreads(prev => [...prev, ...newThreads])
      } else {
        setThreads(newThreads)
      }
      setNextCursor(data.nextThreadCursor || null)
    } catch (error) {
      console.error("Failed to load threads:", error)
    } finally {
      setIsLoading(false)
      setIsLoadingMore(false)
    }
  }

  const handleLoadMore = () => {
    if (nextCursor) {
      loadThreads(nextCursor, true)
    }
  }

  useEffect(() => {
    setNextCursor(null)
    loadThreads(undefined, false)
  }, [filter])

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          <ForumHeader />

          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">Customer Support/Community Forum</h1>
              <p className="text-muted-foreground">
                A modern, privacy-focused forum solution for customer support and community building.
              </p>
            </div>
            {user && <CreateThreadDialog onSuccess={() => loadThreads(undefined, false)} />}
          </div

// ... truncated
```
