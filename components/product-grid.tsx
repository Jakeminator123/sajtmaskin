'use client'

import { useState } from 'react'
import { ProductCard } from './product-card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SlidersHorizontal, ArrowRight, X, Grid3X3, LayoutGrid } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

const products = [
  { id: 1, name: 'Pro Runner Elite X1', brand: 'Nike', price: 1299, image: '/product-1.jpg', isNew: true, rating: 4.8 },
  { id: 2, name: 'Performance Training Tee', brand: 'Adidas', price: 449, originalPrice: 599, image: '/product-2.jpg', rating: 4.5 },
  { id: 3, name: 'Flex Motion Leggings', brand: 'Under Armour', price: 799, image: '/product-3.jpg', rating: 4.7 },
  { id: 4, name: 'Court Vision Trainer', brand: 'Puma', price: 999, image: '/product-4.jpg', isNew: true, rating: 4.6 },
  { id: 5, name: 'Ultraboost 24', brand: 'Adidas', price: 1899, image: '/product-1.jpg', rating: 4.9 },
  { id: 6, name: 'Tech Compression Shirt', brand: 'Nike', price: 599, image: '/product-2.jpg', inStock: false, rating: 4.4 },
  { id: 7, name: 'Power Flex Tights', brand: 'Reebok', price: 699, originalPrice: 899, image: '/product-3.jpg', rating: 4.3 },
  { id: 8, name: 'Speed Lite Runner', brand: 'New Balance', price: 1199, image: '/product-4.jpg', rating: 4.7 },
]

const brands = ['Nike', 'Adidas', 'Puma', 'Under Armour', 'Reebok', 'New Balance']
const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL']

function FilterSidebar({ isMobile = false }: { isMobile?: boolean }) {
  const [priceRange, setPriceRange] = useState([0, 2000])
  const [selectedBrands, setSelectedBrands] = useState<string[]>([])

  const toggleBrand = (brand: string) => {
    setSelectedBrands(prev => 
      prev.includes(brand) 
        ? prev.filter(b => b !== brand)
        : [...prev, brand]
    )
  }

  return (
    <div className="space-y-10">
      {/* Brands */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground mb-5">Varumärken</h3>
        <div className="space-y-4">
          {brands.map((brand) => (
            <div key={brand} className="flex items-center space-x-3 group cursor-pointer" onClick={() => toggleBrand(brand)}>
              <Checkbox 
                id={`brand-${brand}-${isMobile ? 'mobile' : 'desktop'}`} 
                checked={selectedBrands.includes(brand)}
                className="border-border/50 data-[state=checked]:bg-accent data-[state=checked]:border-accent"
              />
              <label 
                htmlFor={`brand-${brand}-${isMobile ? 'mobile' : 'desktop'}`} 
                className="text-sm cursor-pointer group-hover:text-accent transition-colors"
              >
                {brand}
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Sizes */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground mb-5">Storlek</h3>
        <div className="flex flex-wrap gap-2">
          {sizes.map((size) => (
            <button
              key={size}
              className="w-11 h-11 rounded-xl border border-border/50 hover:border-accent hover:bg-accent/10 text-sm font-semibold transition-all duration-300 focus:border-accent focus:bg-accent/20"
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      {/* Price Range */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground mb-5">Pris</h3>
        <Slider 
          value={priceRange} 
          onValueChange={setPriceRange} 
          max={2000} 
          step={100} 
          className="mb-4"
        />
        <div className="flex justify-between items-center">
          <div className="px-3 py-1.5 rounded-lg bg-card border border-border/30 text-sm font-semibold">
            {priceRange[0]} kr
          </div>
          <div className="w-4 h-px bg-border/50" />
          <div className="px-3 py-1.5 rounded-lg bg-card border border-border/30 text-sm font-semibold">
            {priceRange[1]} kr
          </div>
        </div>
      </div>

      {/* Active Filters */}
      {selectedBrands.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground mb-4">Aktiva filter</h3>
          <div className="flex flex-wrap gap-2">
            {selectedBrands.map((brand) => (
              <button
                key={brand}
                onClick={() => toggleBrand(brand)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/20 text-accent text-xs font-semibold hover:bg-accent/30 transition-colors"
              >
                {brand}
                <X className="w-3 h-3" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function ProductGrid() {
  const [gridSize, setGridSize] = useState<'small' | 'large'>('large')

  return (
    <section id="shop" className="py-24 md:py-32 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-card/30 to-background" />
      <div className="absolute inset-0 bg-grid-pattern opacity-20" />

      <div className="container mx-auto px-4 relative">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <div className="inline-flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground mb-4">
              <span className="w-12 h-px bg-accent" />
              Produkter
            </div>
            <h2 className="text-4xl md:text-6xl font-black tracking-tight">
              GEAR <span className="text-accent">UP</span>
            </h2>
            <p className="text-muted-foreground mt-2">{products.length} produkter</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Grid toggle */}
            <div className="hidden md:flex items-center gap-1 p-1 rounded-xl bg-card border border-border/30">
              <button 
                onClick={() => setGridSize('large')}
                className={`p-2 rounded-lg transition-colors ${gridSize === 'large' ? 'bg-accent/20 text-accent' : 'hover:bg-accent/10'}`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setGridSize('small')}
                className={`p-2 rounded-lg transition-colors ${gridSize === 'small' ? 'bg-accent/20 text-accent' : 'hover:bg-accent/10'}`}
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
            </div>

            <Select defaultValue="featured">
              <SelectTrigger className="w-[180px] h-11 bg-card border-border/30 rounded-xl font-semibold">
                <SelectValue placeholder="Sortera" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border/30">
                <SelectItem value="featured">Populärast</SelectItem>
                <SelectItem value="price-low">Pris: Lågt-Högt</SelectItem>
                <SelectItem value="price-high">Pris: Högt-Lågt</SelectItem>
                <SelectItem value="newest">Nyast</SelectItem>
              </SelectContent>
            </Select>

            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="lg:hidden h-11 w-11 border-border/30 bg-card rounded-xl">
                  <SlidersHorizontal className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80 bg-background/95 backdrop-blur-xl border-border/30">
                <SheetHeader>
                  <SheetTitle className="text-left text-lg font-black">Filter</SheetTitle>
                </SheetHeader>
                <div className="mt-8">
                  <FilterSidebar isMobile={true} />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        <div className="flex gap-12">
          {/* Desktop Filter Sidebar */}
          <aside className="hidden lg:block w-64 flex-shrink-0">
            <div className="sticky top-28">
              <FilterSidebar />
            </div>
          </aside>

          {/* Product Grid */}
          <div className="flex-1">
            <div className={`grid gap-5 md:gap-6 ${
              gridSize === 'large' 
                ? 'grid-cols-2 md:grid-cols-2 xl:grid-cols-3' 
                : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4'
            }`}>
              {products.map((product) => (
                <ProductCard key={product.id} {...product} />
              ))}
            </div>

            <div className="mt-16 text-center">
              <Button 
                size="lg"
                variant="outline" 
                className="h-14 px-10 border-border/30 hover:border-accent hover:bg-accent/5 font-bold uppercase tracking-wider bg-transparent rounded-xl group"
              >
                Visa fler produkter
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
