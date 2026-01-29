'use client'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { 
  X, 
  Check,
  TrendingUp,
  ShoppingBag,
  Clock,
  Frown,
  Smile,
  ArrowRight
} from 'lucide-react'

const oldWayProblems = [
  { icon: Frown, text: 'Långsamma leveranstider (7-14 dagar)' },
  { icon: X, text: 'Osäkerhet kring produkters äkthet' },
  { icon: Clock, text: 'Dålig eller obefintlig kundservice' },
  { icon: ShoppingBag, text: 'Begränsat urval av storlekar' },
]

const newWaySolutions = [
  { icon: Smile, text: 'Leverans inom 1-3 arbetsdagar' },
  { icon: Check, text: '100% äkta produkter med garanti' },
  { icon: Check, text: 'Personlig service från experter' },
  { icon: Check, text: 'Brett utbud av alla storlekar' },
]

export function WhyNewEcommerce() {
  return (
    <section className="relative py-24 md:py-32 overflow-hidden">
      {/* Gradient line top */}
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4 bg-accent/10 text-accent border-accent/20">
              <TrendingUp className="w-3 h-3 mr-1" />
              Vår Vision
            </Badge>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4 text-balance">
              Varför Behövdes en Ny E-handel?
            </h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Maxemilian Dejene såg problemen med svensk sporthandel online och bestämde sig 
              för att göra något åt saken. Här är vad som skiljer oss från mängden.
            </p>
          </div>

          {/* Comparison */}
          <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
            {/* Old way */}
            <Card className="relative p-8 bg-destructive/5 border-destructive/20 overflow-hidden">
              {/* Strikethrough decoration */}
              <div className="absolute top-1/2 left-0 right-0 h-px bg-destructive/30 -rotate-12 transform" />
              
              <div className="relative">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-lg bg-destructive/10">
                    <X className="w-5 h-5 text-destructive" />
                  </div>
                  <h3 className="text-xl font-bold text-destructive">Det Gamla Sättet</h3>
                </div>
                
                <ul className="space-y-4">
                  {oldWayProblems.map((problem, index) => {
                    const Icon = problem.icon
                    return (
                      <li key={index} className="flex items-start gap-3">
                        <div className="mt-0.5 p-1 rounded bg-destructive/10">
                          <Icon className="w-4 h-4 text-destructive" />
                        </div>
                        <span className="text-muted-foreground line-through decoration-destructive/50">
                          {problem.text}
                        </span>
                      </li>
                    )
                  })}
                </ul>

                <div className="mt-8 p-4 rounded-lg bg-background/50 border border-border">
                  <p className="text-sm text-muted-foreground italic">
                    "Jag beställde skor som tog tre veckor att komma, och när de väl kom var 
                    de inte ens äkta. Det var droppen." — Anonym kund
                  </p>
                </div>
              </div>
            </Card>

            {/* New way */}
            <Card className="relative p-8 bg-accent/5 border-accent/20 overflow-hidden">
              {/* Glow effect */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-accent/10 rounded-full blur-3xl" />
              
              <div className="relative">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-lg bg-accent/10">
                    <Check className="w-5 h-5 text-accent" />
                  </div>
                  <h3 className="text-xl font-bold text-accent">Training Ground-Sättet</h3>
                </div>
                
                <ul className="space-y-4">
                  {newWaySolutions.map((solution, index) => {
                    const Icon = solution.icon
                    return (
                      <li key={index} className="flex items-start gap-3">
                        <div className="mt-0.5 p-1 rounded bg-accent/10">
                          <Icon className="w-4 h-4 text-accent" />
                        </div>
                        <span className="font-medium">
                          {solution.text}
                        </span>
                      </li>
                    )
                  })}
                </ul>

                <div className="mt-8 p-4 rounded-lg bg-accent/10 border border-accent/20">
                  <p className="text-sm font-medium">
                    "Vi gör det enkelt att få tag på premium träningsutrustning. Punkt slut."
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    — Maxemilian Dejene, Grundare
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* Bottom message */}
          <div className="mt-16 text-center">
            <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-card border border-border shadow-sm">
              <span className="text-sm text-muted-foreground">Redo att uppleva skillnaden?</span>
              <ArrowRight className="w-4 h-4 text-accent" />
              <span className="text-sm font-semibold text-accent">Börja handla nu</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
