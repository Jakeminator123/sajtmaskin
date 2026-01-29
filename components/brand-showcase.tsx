'use client'

const brands = [
  'NIKE',
  'ADIDAS', 
  'PUMA',
  'UNDER ARMOUR',
  'NEW BALANCE',
  'ASICS',
  'SALOMON',
  'HOKA',
  'ON',
  'REEBOK',
]

export function BrandShowcase() {
  return (
    <section id="brands" className="py-24 md:py-32 relative overflow-hidden border-t border-border/30">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-card/50 to-transparent" />
      
      <div className="container mx-auto px-4 relative">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="inline-flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground mb-6">
            <span className="w-8 h-px bg-accent" />
            Officiell Återförsäljare
            <span className="w-8 h-px bg-accent" />
          </div>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight">
            VÅRA <span className="text-accent">VARUMÄRKEN</span>
          </h2>
        </div>

        {/* Infinite scroll marquee */}
        <div className="relative">
          {/* Fade edges */}
          <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
          
          {/* First row */}
          <div className="flex overflow-hidden mb-6">
            <div className="flex animate-marquee">
              {[...brands, ...brands].map((brand, i) => (
                <div
                  key={`${brand}-${i}`}
                  className="group flex items-center justify-center h-24 md:h-32 px-12 md:px-16 mx-3 rounded-2xl border border-border/30 bg-card/50 hover:border-accent/50 hover:bg-card transition-all duration-500 cursor-pointer shrink-0"
                >
                  <span className="text-2xl md:text-3xl font-black text-muted-foreground/50 group-hover:text-foreground transition-all duration-300 tracking-tighter whitespace-nowrap">
                    {brand}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Second row - reverse direction */}
          <div className="flex overflow-hidden">
            <div className="flex animate-marquee" style={{ animationDirection: 'reverse', animationDuration: '35s' }}>
              {[...brands.slice().reverse(), ...brands.slice().reverse()].map((brand, i) => (
                <div
                  key={`${brand}-rev-${i}`}
                  className="group flex items-center justify-center h-24 md:h-32 px-12 md:px-16 mx-3 rounded-2xl border border-border/30 bg-card/50 hover:border-accent/50 hover:bg-card transition-all duration-500 cursor-pointer shrink-0"
                >
                  <span className="text-2xl md:text-3xl font-black text-muted-foreground/50 group-hover:text-foreground transition-all duration-300 tracking-tighter whitespace-nowrap">
                    {brand}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-16">
          <p className="text-muted-foreground mb-2">
            Alla produkter är <span className="text-foreground font-semibold">100% autentiska</span> och kommer direkt från officiella distributörer.
          </p>
        </div>
      </div>
    </section>
  )
}
