import fs from "node:fs"
import path from "node:path"

const MARKER_START = "SAJTMASKIN_LANDING_DATA_EXTRACT_START"
const MARKER_END = "SAJTMASKIN_LANDING_DATA_EXTRACT_END"

/**
 * Historiskt: extraherade landningsdata från en monolitisk `chat-area.tsx`.
 * Nu är källan `landing-chat-data.ts` — skriptet gör inget i normalfallet.
 *
 * - Om `chat-area.tsx` innehåller markörkommentarer START/END: extrahera däremellan.
 * - Annars: legacy slice 137–746 om det fortfarande innehåller `export const categories`.
 * - Annars: om `landing-chat-data.ts` redan har `export const categories`, avsluta 0 (no-op).
 */
const root = process.cwd()
const chatAreaPath = path.join(root, "src/components/landing-v2/chat-area.tsx")
const outPath = path.join(root, "src/components/landing-v2/landing-chat-data.ts")

function readUtf8(p) {
  return fs.readFileSync(p, "utf8")
}

function hasCategoriesExport(src) {
  return /\bexport const categories\b/.test(src)
}

const chatSrc = readUtf8(chatAreaPath)
const dataSrc = fs.existsSync(outPath) ? readUtf8(outPath) : ""

const markerRe = new RegExp(
  `\\/\\*\\s*${MARKER_START}\\s*\\*\\/([\\s\\S]*?)\\/\\*\\s*${MARKER_END}\\s*\\*\\/`,
  "m",
)
const markerMatch = chatSrc.match(markerRe)

let body = null

if (markerMatch) {
  body = markerMatch[1].trim().replace(/^\s*\/\* ─+ DATA ─+ \*\/\s*\n/, "")
} else {
  const lines = chatSrc.split(/\r?\n/)
  const legacy = lines.slice(137, 746).join("\n").replace(/^\s*\/\* ─+ DATA ─+ \*\/\s*\n/, "")
  if (hasCategoriesExport(legacy)) {
    body = legacy
  }
}

if (!body) {
  if (hasCategoriesExport(dataSrc)) {
    console.log(
      "[extract-landing-chat-data] Inget extraherbart block i chat-area.tsx (inga markörer / legacy-slice tom).",
    )
    console.log(
      "Landningsdata finns redan i landing-chat-data.ts — avslutar utan ändring (no-op).",
    )
    process.exit(0)
  }
  console.error(
    "[extract-landing-chat-data] Avbryter: varken markörblock, legacy-radslice med `export const categories`, eller befintlig landing-chat-data.ts hittades.",
  )
  console.error(
    "Lägg /* SAJTMASKIN_LANDING_DATA_EXTRACT_START */ … /* SAJTMASKIN_LANDING_DATA_EXTRACT_END */ runt data i chat-area.tsx, eller återställ landing-chat-data.ts.",
  )
  process.exit(1)
}

if (!hasCategoriesExport(body)) {
  console.error("[extract-landing-chat-data] Extraherat innehåll saknar `export const categories`.")
  process.exit(1)
}

const header = `"use client"

import type { LucideIcon } from "lucide-react"
import {
  Activity,
  Braces,
  Code2,
  CreditCard,
  Database,
  FileSearch,
  Gauge,
  GitBranch,
  Layers,
  MessageCircleQuestion,
  MessageSquare,
  Palette,
  Rocket,
  Send,
  Server,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wind,
  Zap,
} from "lucide-react"

`

fs.writeFileSync(outPath, `${header}${body}\n`)
console.log("Wrote", outPath, fs.statSync(outPath).size)
