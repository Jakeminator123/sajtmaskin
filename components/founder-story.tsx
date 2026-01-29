'use client'

import { Button } from '@/components/ui/button'
import { ArrowRight, Quote, MapPin, Calendar } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

export function FounderStory() {
  return (
    <section className="py-24 md:py-32 relative overflow-hidden border-t border-border/30">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-transparent" />
      <div className="absolute top-1/2 right-0 w-[600px] h-[600px] bg-accent/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      
      <div className="container mx-auto px-4 relative">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-center max-w-7xl mx-auto">
          {/* Image Side */}
          <div className="relative order-2 lg:order-1">
            {/* Main image */}
            <div className="relative aspect-[3/4] rounded-3xl overflow-hidden">
              <Image
                src="/founder.jpg"
                alt="Training Ground AB grundare"
                fill
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
              
              {/* Name overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-8">
                <div className="inline-flex items-center gap-3 text-white">
                  <div className="w-12 h-px bg-accent" />
                  <span className="text-sm font-bold uppercase tracking-[0.2em]">Grundare & VD</span>
                </div>
                <h3 className="text-2xl md:text-3xl font-bold text-white mt-2">
                  M. Dejene
                </h3>
              </div>
            </div>
            
            {/* Floating info cards */}
            <div className="absolute -top-4 -right-4 md:top-8 md:-right-8 gradient-border rounded-2xl overflow-hidden animate-float-gentle">
              <div className="bg-card p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <div className="text-2xl font-black">2024</div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">Grundat</div>
                </div>
              </div>
            </div>
            
            <div className="absolute -bottom-4 -left-4 md:bottom-32 md:-left-8 gradient-border rounded-2xl overflow-hidden animate-float-slow">
              <div className="bg-card p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <div className="text-lg font-black">Solna</div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">Sverige</div>
                </div>
              </div>
            </div>
          </div>

          {/* Content Side */}
          <div className="space-y-8 order-1 lg:order-2">
            <div className="inline-flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
              <span className="w-12 h-px bg-accent" />
              Vår Historia
            </div>
            
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight leading-[1.1]">
              BYGGT AV<br />
              <span className="text-accent text-glow">PASSION.</span>
            </h2>

            {/* Quote */}
            <div className="relative pl-8 border-l-2 border-accent/50">
              <Quote className="absolute -left-4 top-0 w-8 h-8 text-accent/30 fill-accent/10" />
              <blockquote className="text-xl md:text-2xl text-muted-foreground font-light leading-relaxed italic">
                "Vi tröttnade på långa leveranstider och osäkerhet kring äkthet. 
                Så vi byggde den butik vi alltid önskade fanns."
              </blockquote>
            </div>

            <p className="text-muted-foreground leading-relaxed text-lg">
              Training Ground AB grundades med tre enkla löften: <span className="text-foreground font-semibold">äkta produkter</span>, 
              <span className="text-foreground font-semibold"> snabb leverans</span> och <span className="text-foreground font-semibold">service i världsklass</span>. 
              Som aktiva idrottare förstår vi vikten av rätt utrustning.
            </p>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-8 py-8 border-y border-border/30">
              {[
                { value: '500+', label: 'Produkter' },
                { value: '15+', label: 'Varumärken' },
                { value: '100%', label: 'Äkta', accent: true },
              ].map((stat) => (
                <div key={stat.label}>
                  <div className={`text-3xl md:text-4xl font-black ${stat.accent ? 'text-accent' : ''}`}>
                    {stat.value}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1 uppercase tracking-wider">{stat.label}</div>
                </div>
              ))}
            </div>

            <Link href="/about">
              <Button 
                size="lg"
                variant="outline" 
                className="h-14 px-8 border-border/50 hover:border-accent hover:bg-accent/5 font-bold uppercase tracking-wider bg-transparent group"
              >
                Läs mer om oss
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
