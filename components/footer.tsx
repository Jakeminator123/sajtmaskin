'use client'

import React from "react"

import { useState } from 'react'
import Link from 'next/link'
import { Instagram, ArrowRight, MapPin, Mail, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const footerLinks = {
  shop: [
    { name: 'Löparskor', href: '#' },
    { name: 'Träningskläder', href: '#' },
    { name: 'Tillbehör', href: '#' },
    { name: 'Nyheter', href: '#' },
    { name: 'Rea', href: '#' },
  ],
  support: [
    { name: 'Kontakta oss', href: '/about#contact' },
    { name: 'Frakt & Leverans', href: '#' },
    { name: 'Returer', href: '#' },
    { name: 'Storleksguide', href: '#' },
    { name: 'FAQ', href: '#' },
  ],
  company: [
    { name: 'Om oss', href: '/about' },
    { name: 'Karriär', href: '#' },
    { name: 'Integritetspolicy', href: '#' },
    { name: 'Villkor', href: '#' },
  ],
}

export function Footer() {
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault()
    if (email) {
      setSubscribed(true)
      setTimeout(() => setSubscribed(false), 3000)
      setEmail('')
    }
  }

  return (
    <footer className="relative overflow-hidden border-t border-border/30">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-card/50 to-card" />
      
      <div className="container mx-auto px-4 relative">
        {/* Newsletter Section */}
        <div className="py-16 md:py-24 border-b border-border/30">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground mb-6">
              <span className="w-8 h-px bg-accent" />
              Nyhetsbrev
              <span className="w-8 h-px bg-accent" />
            </div>
            <h3 className="text-3xl md:text-4xl lg:text-5xl font-black mb-4">
              FÅ <span className="text-accent">10% RABATT</span>
            </h3>
            <p className="text-muted-foreground mb-8 text-lg">
              Prenumerera på vårt nyhetsbrev och få 10% rabatt på din första order
            </p>
            <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <Input
                type="email"
                placeholder="Din e-postadress"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-14 bg-card border-border/50 text-base px-5 rounded-xl focus:border-accent"
              />
              <Button 
                type="submit"
                className={`h-14 px-8 font-bold rounded-xl transition-all duration-300 ${
                  subscribed 
                    ? 'bg-green-500 hover:bg-green-500' 
                    : 'bg-accent hover:bg-accent/90 glow-accent-sm hover:glow-accent'
                } text-accent-foreground`}
              >
                {subscribed ? (
                  <>
                    <Check className="h-5 w-5 mr-2" />
                    Tack!
                  </>
                ) : (
                  <>
                    Prenumerera
                    <ArrowRight className="h-5 w-5 ml-2" />
                  </>
                )}
              </Button>
            </form>
          </div>
        </div>

        {/* Main Footer */}
        <div className="py-16 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-10 lg:gap-16">
          {/* Brand */}
          <div className="col-span-2 md:col-span-4 lg:col-span-1">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center font-black text-accent-foreground text-lg">
                TG
              </div>
              <div className="flex flex-col -space-y-1">
                <span className="text-sm font-black tracking-tight">TRAINING GROUND</span>
                <span className="text-[10px] text-muted-foreground tracking-[0.3em]">SWEDEN</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              Din svenska destination för premium träningskläder och sportskor.
            </p>
            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-3">
                <MapPin className="w-4 h-4 text-accent shrink-0" />
                <span>Ballonggatan 7, 169 71 Solna</span>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-accent shrink-0" />
                <span>info@trainingground.se</span>
              </div>
            </div>
          </div>

          {/* Shop */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground mb-6">Shop</h4>
            <ul className="space-y-4">
              {footerLinks.shop.map((link) => (
                <li key={link.name}>
                  <Link href={link.href} className="text-sm text-foreground/70 hover:text-accent transition-colors line-animate">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground mb-6">Support</h4>
            <ul className="space-y-4">
              {footerLinks.support.map((link) => (
                <li key={link.name}>
                  <Link href={link.href} className="text-sm text-foreground/70 hover:text-accent transition-colors line-animate">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground mb-6">Företag</h4>
            <ul className="space-y-4">
              {footerLinks.company.map((link) => (
                <li key={link.name}>
                  <Link href={link.href} className="text-sm text-foreground/70 hover:text-accent transition-colors line-animate">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Social & Payment */}
          <div className="col-span-2 md:col-span-1">
            <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground mb-6">Följ oss</h4>
            <div className="flex gap-3 mb-8">
              {['Instagram', 'TikTok', 'YouTube'].map((social) => (
                <button 
                  key={social}
                  className="w-10 h-10 rounded-xl border border-border/50 flex items-center justify-center hover:border-accent hover:bg-accent/10 transition-all duration-300 group"
                >
                  <Instagram className="w-4 h-4 group-hover:text-accent transition-colors" />
                </button>
              ))}
            </div>
            
            <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground mb-4">Betalning</h4>
            <div className="flex flex-wrap gap-2">
              {['Klarna', 'Swish', 'Visa', 'MC'].map((method) => (
                <div key={method} className="px-3 py-2 rounded-lg bg-card border border-border/30 text-xs font-semibold">
                  {method}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="py-8 border-t border-border/30 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-center md:text-left">
            <p className="text-sm text-muted-foreground">© 2024 Training Ground AB. Org.nr: 559548-5441</p>
          </div>
          <div className="flex gap-6 text-xs text-muted-foreground">
            <Link href="#" className="hover:text-accent transition-colors">Integritet</Link>
            <Link href="#" className="hover:text-accent transition-colors">Villkor</Link>
            <Link href="#" className="hover:text-accent transition-colors">Cookies</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
