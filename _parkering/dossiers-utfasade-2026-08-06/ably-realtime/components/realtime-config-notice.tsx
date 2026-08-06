'use client'

import { useEffect, useState } from 'react'

interface RealtimeConfigNoticeProps {
  /** Short heading; defaults to a calm Swedish "not connected yet" title. */
  title?: string
  /** 1-2 calm sentences in the site's language explaining the next step. */
  message?: string
  className?: string
}

/**
 * Deterministic demo-mode notice for realtime surfaces (mock: visual).
 *
 * Probes the dossier's own auth route once on mount; when it answers
 * `503 realtime-not-configured` (ABLY_API_KEY missing or a preview
 * placeholder) the notice renders — otherwise it renders nothing. Place it
 * next to chat/notification/presence surfaces so an unconfigured integration
 * reads as "not set up yet", never as broken or silently simulated.
 *
 * Styling mirrors the sibling dossiers' IntegrationConfigNotice (neutral and
 * muted tokens, never error-red) but is self-contained so this dossier has no
 * cross-dossier file dependency.
 */
export function RealtimeConfigNotice({
  title = 'Realtid är inte kopplad ännu',
  message = 'Sidan visas i demoläge — inga meddelanden skickas mellan riktiga besökare förrän Ably är kopplat.',
  className,
}: RealtimeConfigNoticeProps) {
  const [notConfigured, setNotConfigured] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/ably/auth')
      .then((response) => {
        if (!cancelled && response.status === 503) setNotConfigured(true)
      })
      .catch(() => {
        // Network failure is not evidence of "not configured" — stay hidden.
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!notConfigured) return null

  return (
    <div
      role="note"
      className={[
        'rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground',
        className ?? '',
      ]
        .join(' ')
        .trim()}
    >
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1 leading-relaxed">{message}</p>
      <p className="mt-3">
        Miljövariabel som behövs:{' '}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
          ABLY_API_KEY
        </code>
      </p>
      <a
        href="https://ably.com/docs/getting-started/setup"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-block font-medium text-foreground underline underline-offset-2 hover:no-underline"
      >
        Läs mer
      </a>
    </div>
  )
}
