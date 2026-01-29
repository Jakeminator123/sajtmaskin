'use client'

import { Truck, RotateCcw, ShieldCheck, Headphones, CreditCard } from 'lucide-react'

const features = [
  {
    icon: Truck,
    title: 'Fri Frakt',
    description: 'Över 499 kr',
  },
  {
    icon: RotateCcw,
    title: '30 Dagar',
    description: 'Öppet köp',
  },
  {
    icon: ShieldCheck,
    title: '100% Äkta',
    description: 'Garanterat',
  },
  {
    icon: CreditCard,
    title: 'Klarna & Swish',
    description: 'Säker betalning',
  },
  {
    icon: Headphones,
    title: 'Support',
    description: 'Vardagar 9-17',
  },
]

export function TrustSection() {
  return (
    <section className="relative py-0 overflow-hidden">
      {/* Accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent" />
      
      <div className="bg-card/80 backdrop-blur-sm border-y border-border/30">
        <div className="container mx-auto px-4">
          <div className="flex overflow-x-auto scrollbar-hide py-6 -mx-4 px-4 md:mx-0 md:px-0">
            <div className="flex items-center gap-8 md:gap-12 mx-auto">
              {features.map((feature, index) => {
                const Icon = feature.icon
                return (
                  <div
                    key={feature.title}
                    className="flex items-center gap-4 shrink-0 group cursor-default"
                  >
                    {index > 0 && (
                      <div className="hidden md:block w-px h-8 bg-border/50 -ml-4 md:-ml-6" />
                    )}
                    <div className="relative">
                      <div className="p-3 rounded-xl bg-accent/10 group-hover:bg-accent/20 transition-all duration-300 group-hover:scale-110">
                        <Icon className="h-5 w-5 text-accent" />
                      </div>
                      {/* Glow effect on hover */}
                      <div className="absolute inset-0 rounded-xl bg-accent/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    </div>
                    <div className="text-left">
                      <span className="font-bold text-sm block">{feature.title}</span>
                      <span className="text-xs text-muted-foreground">{feature.description}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
      
      {/* Bottom accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
    </section>
  )
}
