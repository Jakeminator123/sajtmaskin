"use client"

import Link from "next/link"
import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { MinimalFooter } from "@/components/layout/minimal-footer"

const faqs = [
  {
    q: "Behöver jag kunna programmera?",
    a: "Nej. Berätta om ditt företag så sköter AI:n resten. Under huven används React och Next.js, men du behöver aldrig röra kod.",
  },
  {
    q: "Vilken teknik byggs mina sidor med?",
    a: "React 19, Next.js 16, TypeScript och Tailwind CSS — hög prestanda, bra SEO och en kodbas som går att vidareutveckla.",
  },
  {
    q: "Hur snabbt kan jag få en färdig sajt?",
    a: "Första utkastet genereras på sekunder. Förfina och publicera samma dag.",
  },
  {
    q: "Kan jag använda min egna domän?",
    a: "Ja. Koppla din domän med automatisk SSL.",
  },
  {
    q: "Är det GDPR-anpassat?",
    a: "Ja. Plattformen är byggd med GDPR i åtanke.",
  },
  {
    q: "Kan jag byta plan när som helst?",
    a: "Ja. Credits du redan köpt ligger kvar.",
  },
]

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-b border-border/30 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 py-4 text-left"
      >
        <span className="text-sm font-medium text-foreground">{q}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div className={`overflow-hidden transition-all duration-200 ${open ? "max-h-40 pb-4 opacity-100" : "max-h-0 opacity-0"}`}>
        <p className="text-sm leading-relaxed text-muted-foreground">{a}</p>
      </div>
    </div>
  )
}

export default function FAQPage() {
  return (
    <>
      <main className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-2xl px-6 py-16">
          <Link
            href="/"
            className="mb-8 inline-block text-sm text-muted-foreground hover:text-foreground"
          >
            &larr; Tillbaka
          </Link>

          <h1 className="mb-2 text-2xl font-semibold tracking-tight">Vanliga frågor</h1>
          <p className="mb-8 text-sm text-muted-foreground">Svar på det vanligaste om Sajtmaskin.</p>

          <div>
            {faqs.map((faq) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>
      </main>
      <MinimalFooter />
    </>
  )
}
