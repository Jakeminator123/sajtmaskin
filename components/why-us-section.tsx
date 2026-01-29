'use client'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { 
  ShieldCheck, 
  Zap, 
  Award, 
  Users, 
  PackageCheck,
  HeartHandshake,
  ArrowRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

const reasons = [
  {
    icon: Award,
    title: 'Endast Äkta Produkter',
    description: 'Vi är officiella återförsäljare. Varje produkt är 100% äkta med full garanti från tillverkaren.',
    highlight: '100% Äkta',
  },
  {
    icon: PackageCheck,
    title: 'Noggrant Handplockat',
    description: 'Vi testar och väljer varje produkt själva. Om den inte håller våra standarder, säljer vi den inte.',
    highlight: 'Testat & Godkänt',
  },
  {
    icon: Zap,
    title: 'Blixtsnabb Leverans',
    description: 'De flesta beställningar skickas samma dag. Leverans inom 1-3 arbetsdagar i hela Sverige.',
    highlight: '1-3 Dagar',
  },
  {
    icon: ShieldCheck,
    title: 'Trygg E-handel',
    description: 'Säkra betalningar med Klarna, Swish och kort. 30 dagars öppet köp på alla produkter.',
    highlight: '30 Dagar Öppet Köp',
  },
  {
    icon: Users,
    title: 'Personlig Service',
    description: 'Vårt team består av träningsentusiaster som förstår dina behov och kan ge riktiga råd.',
    highlight: 'Expertrådgivning',
  },
  {
    icon: HeartHandshake,
    title: 'Svenskt & Lokalt',
    description: 'Ett svenskt företag med svenska priser, svensk kundtjänst och snabb support på ditt språk.',
    highlight: '100% Svenskt',
  },
]

export function WhyUsSection() {
  return (
    <section className="relative py-24 md:py-32 overflow-hidden bg-muted/30">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-dot-pattern opacity-50" />
      
      <div className="container mx-auto px-4 relative">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4 bg-accent/10 text-accent border-accent/20">
              Varför Training Ground?
            </Badge>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4 text-balance">
              Sex Anledningar att Välja Oss
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Vi är inte bara ännu en webbutik. Vi är träningsentusiaster som byggt 
              den butik vi själva alltid saknade.
            </p>
          </div>

          {/* Reasons grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {reasons.map((reason, index) => {
              const Icon = reason.icon
              return (
                <Card 
                  key={index} 
                  className="group relative p-6 bg-card/80 backdrop-blur-sm border-border/50 hover:border-accent/50 hover:shadow-xl hover:shadow-accent/5 transition-all duration-300 hover:-translate-y-1 overflow-hidden"
                >
                  {/* Hover gradient */}
                  <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  
                  <div className="relative">
                    {/* Icon */}
                    <div className="mb-4 inline-flex p-3 rounded-xl bg-accent/10 text-accent group-hover:bg-accent group-hover:text-accent-foreground transition-colors duration-300">
                      <Icon className="w-6 h-6" />
                    </div>

                    {/* Highlight badge */}
                    <Badge variant="outline" className="absolute top-0 right-0 text-xs border-accent/30 text-accent">
                      {reason.highlight}
                    </Badge>

                    {/* Content */}
                    <h3 className="text-lg font-semibold mb-2">{reason.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {reason.description}
                    </p>
                  </div>
                </Card>
              )
            })}
          </div>

          {/* CTA */}
          <div className="mt-16 text-center">
            <Link href="/about">
              <Button size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground shadow-lg hover:shadow-accent/25 transition-all hover:scale-105">
                Läs Mer Om Oss
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
