"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { createProject, deleteProject } from "@/lib/project-client"
import { resolveLandingRouteTarget } from "@/components/landing-v2/route-target"
import { categories, siteTypes } from "@/components/landing-v2/landing-chat-data"
import { use3DTilt, useHonestCounter, useRotatingText } from "@/components/landing-v2/landing-hooks"

export interface ChatAreaProps {
  selectedCategory?: string | null
  onSelectedCategoryChange?: (id: string | null) => void
  expandedContent?: ReactNode
  heroPrefix?: ReactNode
  auditUrl?: string
  onAuditUrlChange?: (url: string) => void
  onAuditSubmit?: () => void
}

/** Return shape of `useLandingController` — for prop typing in split components (type-only imports). */
export type LandingController = ReturnType<typeof useLandingController>

export function useLandingController({
  selectedCategory: controlledCategory,
  onSelectedCategoryChange,
  auditUrl,
  onAuditUrlChange,
  onAuditSubmit,
}: ChatAreaProps = {}) {
  const router = useRouter()
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false)
  const [internalCategory, setInternalCategory] = useState<string | null>("fritext")
  const selectedCategory = controlledCategory !== undefined ? controlledCategory : internalCategory
  const [inputValue, setInputValue] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const websitesCounter = useHonestCounter(
    2480,
    41,
    "41 sajter live just nu. Varje ny version ger oss bättre signaler om vad som faktiskt konverterar.",
  )
  const usersCounter = useHonestCounter(
    850,
    28,
    "28 företagare kör redan skarpt. Nästa våg handlar om fler bokningar, fler leads och bättre uppföljning.",
  )
  const rotatingType = useRotatingText(siteTypes)
  const headlineTilt = use3DTilt(10)

  const preloadHowItWorksScene = useCallback(() => {
    void import("./how-it-works-scene")
  }, [])

  const pickCategory = useCallback(
    (id: string | null) => {
      if (onSelectedCategoryChange) {
        onSelectedCategoryChange(id)
      } else {
        setInternalCategory(id)
      }
    },
    [onSelectedCategoryChange],
  )

  const activeCategory = categories.find((c) => c.id === selectedCategory)
  const isAuditMode = selectedCategory === "audit"
  const currentAuditUrl = auditUrl ?? inputValue

  const handleAuditUrlChange = useCallback(
    (value: string) => {
      if (onAuditUrlChange) {
        onAuditUrlChange(value)
        return
      }
      setInputValue(value)
    },
    [onAuditUrlChange],
  )

  useEffect(() => {
    if (isAuditMode && showVoiceRecorder) {
      setShowVoiceRecorder(false)
    }
  }, [isAuditMode, showVoiceRecorder])

  const startBuild = useCallback(
    async (categoryOverride?: string | null, promptOverride?: string) => {
      if (isSubmitting) return

      const targetCategory = categoryOverride ?? selectedCategory
      const prompt = (promptOverride ?? inputValue).trim()
      const routeTarget = resolveLandingRouteTarget(targetCategory)

      setIsSubmitting(true)

      // Track the just-created project so we can roll it back if a later step
      // (prompt-save) fails — otherwise a failed submit leaves an orphan project
      // behind on the user's dashboard (#26). Cleared once we're about to navigate.
      let createdProjectId: string | null = null

      try {
        const categoryLabel = categories.find((category) => category.id === targetCategory)?.label ?? "Sajt"
        const project = await createProject(
          `${categoryLabel} - ${new Date().toLocaleDateString("sv-SE")}`,
          routeTarget.buildMethod,
          prompt ? prompt.slice(0, 100) : undefined,
        )
        createdProjectId = project.id

        const params = new URLSearchParams()
        params.set("project", project.id)
        params.set("buildMethod", routeTarget.buildMethod)
        params.set("buildIntent", routeTarget.buildIntent)
        if (routeTarget.source) {
          params.set("source", routeTarget.source)
        }

        if (prompt.length > 0) {
          const response = await fetch("/api/prompts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt,
              source: routeTarget.source ?? routeTarget.buildMethod,
              projectId: project.id,
            }),
          })

          const data = (await response.json().catch(() => null)) as
            | {
                success?: boolean
                promptId?: string
                error?: string
              }
            | null

          if (!response.ok || !data?.promptId) {
            throw new Error(data?.error || "Kunde inte spara prompten")
          }

          params.set("promptId", data.promptId)
        }

        // Reached the navigation step — the project is now in use, so don't roll
        // it back if router.push were to throw.
        createdProjectId = null
        router.push(`/builder?${params.toString()}`)
      } catch (error) {
        console.error("[LandingV2] Failed to start builder flow:", error)
        // Roll back the orphaned project created above (best-effort) so a failed
        // submit doesn't leave an empty project behind (#26).
        if (createdProjectId) {
          void deleteProject(createdProjectId).catch((cleanupErr) => {
            console.error("[LandingV2] Failed to roll back orphan project:", cleanupErr)
          })
        }
        toast.error(error instanceof Error ? error.message : "Kunde inte starta buildern")
      } finally {
        setIsSubmitting(false)
      }
    },
    [inputValue, isSubmitting, router, selectedCategory],
  )

  const submitPrimaryInput = useCallback(() => {
    if (isAuditMode && onAuditSubmit) {
      onAuditSubmit()
      return
    }
    void startBuild()
  }, [isAuditMode, onAuditSubmit, startBuild])

  return {
    router,
    showVoiceRecorder,
    setShowVoiceRecorder,
    selectedCategory,
    pickCategory,
    inputValue,
    setInputValue,
    isSubmitting,
    websitesCounter,
    usersCounter,
    rotatingType,
    headlineTilt,
    preloadHowItWorksScene,
    activeCategory,
    isAuditMode,
    currentAuditUrl,
    handleAuditUrlChange,
    startBuild,
    submitPrimaryInput,
  }
}
