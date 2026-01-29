'use client'

import { useEffect, useState } from 'react'

export function AnimatedBackground() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-muted/20" />
      
      {/* Animated gradient mesh */}
      <div className="absolute inset-0">
        {/* Primary cool gradient orb - top right */}
        <div 
          className="absolute -top-[20%] -right-[10%] w-[60vw] h-[60vw] max-w-[800px] max-h-[800px] rounded-full animate-float-slow"
          style={{
            background: 'radial-gradient(circle, oklch(0.75 0.19 25 / 0.08) 0%, transparent 70%)',
            animationDelay: '0s',
          }}
        />
        
        {/* Secondary cool gradient orb - bottom left */}
        <div 
          className="absolute -bottom-[15%] -left-[15%] w-[50vw] h-[50vw] max-w-[700px] max-h-[700px] rounded-full animate-float"
          style={{
            background: 'radial-gradient(circle, oklch(0.5 0.15 260 / 0.06) 0%, transparent 70%)',
            animationDelay: '3s',
          }}
        />
        
        {/* Tertiary accent orb - center */}
        <div 
          className="absolute top-[30%] left-[40%] w-[40vw] h-[40vw] max-w-[500px] max-h-[500px] rounded-full animate-pulse-glow"
          style={{
            background: 'radial-gradient(circle, oklch(0.75 0.19 25 / 0.04) 0%, transparent 60%)',
            animationDelay: '6s',
          }}
        />

        {/* Subtle blue accent - top left */}
        <div 
          className="absolute top-[10%] left-[5%] w-[30vw] h-[30vw] max-w-[400px] max-h-[400px] rounded-full animate-float-gentle"
          style={{
            background: 'radial-gradient(circle, oklch(0.6 0.12 230 / 0.05) 0%, transparent 70%)',
            animationDelay: '2s',
          }}
        />
      </div>

      {/* Noise texture overlay */}
      <div 
        className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 bg-grid-pattern opacity-40" />
      
      {/* Diagonal lines */}
      <div className="absolute inset-0 bg-diagonal-lines opacity-30" />

      {/* Top gradient fade for header */}
      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-background to-transparent" />
    </div>
  )
}
