"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { homepageCreditFaq } from "@/components/landing-v2/landing-chat-data"

export function LandingPricingExplainer() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <div className="mx-auto mt-12 max-w-3xl">
      <p className="mb-4 text-center text-sm text-muted-foreground">
        1 kr = 1 credit. Credits används till olika saker, så vi lovar inte ett fast antal sidor
        eller texter per credit.
      </p>
      <div className="space-y-2">
        {homepageCreditFaq.map((item, index) => {
          const open = openIndex === index
          const answerId = `homepage-credit-faq-${index}`
          return (
            <div
              key={item.q}
              className="overflow-hidden rounded-2xl border border-border/20 bg-card/35"
            >
              <button
                type="button"
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                aria-expanded={open}
                aria-controls={answerId}
                onClick={() => setOpenIndex(open ? null : index)}
              >
                <span className="text-sm font-medium text-foreground">{item.q}</span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                />
              </button>
              <div
                id={answerId}
                role="region"
                hidden={!open}
                className={open ? "block" : "hidden"}
              >
                <p className="px-5 pb-4 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
