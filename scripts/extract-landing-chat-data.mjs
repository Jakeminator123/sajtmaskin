import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const chatArea = path.join(root, "src/components/landing-v2/chat-area.tsx")
const outPath = path.join(root, "src/components/landing-v2/landing-chat-data.ts")
const lines = fs.readFileSync(chatArea, "utf8").split(/\r?\n/)
// 1-based 138–746 → 0-based 137..745 inclusive → slice(137, 746)
const body = lines.slice(137, 746).join("\n").replace(/^\s*\/\* ─+ DATA ─+ \*\/\s*\n/, "")

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
