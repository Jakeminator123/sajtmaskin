import fs from "node:fs"
import path from "node:path"

/**
 * Historiskt: extraherade landningsdata från en monolitisk `chat-area.tsx`.
 * Efter refaktor ligger all data i `landing-chat-data.ts` — gamla radnummer (137–746)
 * pekar nu på 3D-mesh-kod och skulle förstöra utdata om skriptet kördes blindly.
 *
 * Om du återinför ett extraherbart block: uppdatera START/END-rader eller lägg
 * markörkommentarer i källfilen och justera logiken här.
 */
const root = process.cwd()
const chatArea = path.join(root, "src/components/landing-v2/chat-area.tsx")
const outPath = path.join(root, "src/components/landing-v2/landing-chat-data.ts")
const lines = fs.readFileSync(chatArea, "utf8").split(/\r?\n/)
// 1-based 138–746 → 0-based slice(137, 746)
const body = lines.slice(137, 746).join("\n").replace(/^\s*\/\* ─+ DATA ─+ \*\/\s*\n/, "")

if (!/\bexport const categories\b/.test(body)) {
  console.error(
    "[extract-landing-chat-data] Avbryter: rad 137–746 i chat-area.tsx innehåller inte längre `export const categories`.",
  )
  console.error(
    "Landningsdata underhålls i landing-chat-data.ts. Uppdatera skriptet om du flyttar ett nytt extraherbart block.",
  )
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
