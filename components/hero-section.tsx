'use client'

import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowRight, Zap, Shield, Truck } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

export function HeroSection() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 100
      const y = ((e.clientY - rect.top) / rect.height) * 100
      container.style.setProperty('--mouse-x', `${x}%`)
      container.style.setProperty('--mouse-y', `${y}%`)
    }

    container.addEventListener('mousemove', handleMouseMove)
    return () => container.removeEventListener('mousemove', handleMouseMove)
  }, [])

  return (
    <section 
      ref={containerRef}
      className="relative min-h-screen flex items-center overflow-hidden noise-overlay"
    >
      {/* Background Image */}
      <div className="absolute inset-0">
        <Image
          src="/hero-athletic.jpg"
          alt="Premium athletic wear"
          fill
          className="object-cover scale-105"
          priority
        />
        {/* Multi-layer gradient */}
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/95 to-background/60" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-transparent" />
      </div>

      {/* Spotlight effect */}
      <div className="absolute inset-0 spotlight pointer-events-none" />

      {/* Animated orbs */}
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-pulse-glow" />
      <div className="absolute bottom-1/4 left-1/3 w-64 h-64 bg-accent/5 rounded-full blur-2xl animate-float-slow" />

      {/* Grid overlay */}
      <div className="absolute inset-0 bg-grid-pattern opacity-30" />

      {/* Content */}
      <div className="container relative mx-auto px-4 py-32">
        <div className="max-w-3xl stagger-children">
          {/* Badge */}
          <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-secondary/80 backdrop-blur-sm border border-border/50 text-sm mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
            </span>
            <span className="text-muted-foreground">Officiell svensk återförsäljare</span>
            <span className="hidden sm:inline text-muted-foreground">|</span>
            <span className="hidden sm:inline font-semibold">100% Äkta produkter</span>
          </div>

          {/* Headline */}
          <h1 className="text-6xl md:text-8xl lg:text-9xl font-black tracking-tighter leading-[0.85] mb-8">
            <span className="block">GEAR</span>
            <span className="block">
              <span className="text-accent text-glow">UP.</span>
            </span>
          </h1>

          {/* Description */}
          <p className="text-xl md:text-2xl text-muted-foreground max-w-xl mb-10 leading-relaxed font-light">
            Premium träningskläder och sportskor från världens 
            <span className="text-foreground font-medium"> ledande varumärken.</span>
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-3 mb-10">
            {[
              { icon: Shield, text: '100% Äkta' },
              { icon: Truck, text: '1-3 dagars leverans' },
              { icon: Zap, text: 'Fri frakt över 499 kr' },
            ].map((item) => (
              <div 
                key={item.text}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-card/50 backdrop-blur-sm border border-border/50 text-sm hover:border-accent/50 hover:bg-accent/5 transition-all duration-300 cursor-default"
              >
                <item.icon className="w-4 h-4 text-accent" />
                <span>{item.text}</span>
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/#shop">
              <Button 
                size="lg" 
                className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold h-14 px-10 text-base glow-accent-sm hover:glow-accent transition-all duration-300 group"
              >
                SHOPPA NU
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Link href="/about">
              <Button 
                size="lg" 
                variant="outline" 
                className="h-14 px-10 text-base border-border/60 hover:border-accent/50 hover:bg-accent/5 bg-transparent font-semibold transition-all duration-300"
              >
                VÅR HISTORIA
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats bar */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-border/30">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 py-8">
              {[
                { value: '500+', label: 'Produkter' },
                { value: '15+', label: 'Varumärken' },
                { value: '1-3', label: 'Dagars leverans', accent: true },
                { value: '30', label: 'Dagars öppet köp' },
              ].map((stat) => (
                <div key={stat.label} className="text-center border-r border-border/30 last:border-0 py-2">
                  <div className={`text-3xl md:text-4xl font-black ${stat.accent ? 'text-accent text-glow' : ''}`}>
                    {stat.value}
                  </div>
                  <div className="text-xs md:text-sm text-muted-foreground mt-1 uppercase tracking-wider">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-32 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3">
        <div className="w-6 h-10 rounded-full border-2 border-muted-foreground/30 flex justify-center pt-2">
          <div className="w-1 h-2 rounded-full bg-accent animate-bounce" />
        </div>
      </div>
    </section>
  )
}
