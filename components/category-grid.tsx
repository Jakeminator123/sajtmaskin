'use client'

import Image from 'next/image'
import { ArrowUpRight } from 'lucide-react'

const categories = [
  {
    name: 'Löparskor',
    image: '/category-running.jpg',
    href: '#running',
    count: '150+',
    description: 'Performance footwear',
  },
  {
    name: 'Träningskläder',
    image: '/category-training.jpg',
    href: '#training',
    count: '200+',
    description: 'Athletic apparel',
  },
  {
    name: 'Tillbehör',
    image: '/category-accessories.jpg',
    href: '#accessories',
    count: '75+',
    description: 'Gear & equipment',
  },
  {
    name: 'Outdoor',
    image: '/category-running.jpg',
    href: '#outdoor',
    count: '100+',
    description: 'Trail & nature',
  },
]

export function CategoryGrid() {
  return (
    <section className="py-24 md:py-32 relative overflow-hidden">
      {/* Background elements */}
      <div className="absolute inset-0 bg-grid-pattern opacity-20" />
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
      
      <div className="container mx-auto px-4 relative">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-16">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
              <span className="w-12 h-px bg-accent" />
              Utforska
            </div>
            <h2 className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tight">
              KATE<span className="text-accent">GORIER.</span>
            </h2>
          </div>
          <a 
            href="#all-categories" 
            className="group flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-accent transition-colors line-animate"
          >
            Visa alla kategorier
            <ArrowUpRight className="h-4 w-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </a>
        </div>

        {/* Category Grid - Bento style */}
        <div className="grid grid-cols-12 gap-4 md:gap-6">
          {categories.map((category, index) => {
            const sizes = [
              'col-span-12 md:col-span-7 row-span-2',
              'col-span-6 md:col-span-5',
              'col-span-6 md:col-span-5',
              'col-span-12 md:col-span-7',
            ]
            const aspectRatios = [
              'aspect-[4/3] md:aspect-auto md:h-full',
              'aspect-square',
              'aspect-square',
              'aspect-[2/1]',
            ]

            return (
              <a
                key={category.name}
                href={category.href}
                className={`group relative overflow-hidden rounded-2xl ${sizes[index]}`}
              >
                <div className={`relative w-full h-full ${aspectRatios[index]} min-h-[200px]`}>
                  <Image
                    src={category.image || "/placeholder.svg"}
                    alt={category.name}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  
                  {/* Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent opacity-80 group-hover:opacity-90 transition-opacity duration-500" />
                  
                  {/* Accent line */}
                  <div className="absolute bottom-0 left-0 w-0 h-1 bg-accent group-hover:w-full transition-all duration-500" />
                  
                  {/* Content */}
                  <div className="absolute inset-0 p-6 md:p-8 flex flex-col justify-end">
                    <div className="space-y-2">
                      <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent">
                        {category.count} produkter
                      </span>
                      <h3 className={`font-black tracking-tight text-white ${index === 0 ? 'text-3xl md:text-5xl' : 'text-xl md:text-2xl'}`}>
                        {category.name}
                      </h3>
                      <p className="text-sm text-white/60 font-light">
                        {category.description}
                      </p>
                    </div>
                    
                    {/* Arrow */}
                    <div className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:scale-110">
                      <ArrowUpRight className="h-5 w-5 text-white" />
                    </div>
                  </div>
                </div>
              </a>
            )
          })}
        </div>
      </div>
    </section>
  )
}
