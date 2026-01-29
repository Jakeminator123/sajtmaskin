'use client'

import React from "react"

import { useState } from 'react'
import Image from 'next/image'
import { Heart, ShoppingBag, Eye, Star, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface ProductCardProps {
  id: number
  name: string
  brand: string
  price: number
  originalPrice?: number
  image: string
  isNew?: boolean
  inStock?: boolean
  rating?: number
}

export function ProductCard({
  name,
  brand,
  price,
  originalPrice,
  image,
  isNew = false,
  inStock = true,
  rating = 4.5,
}: ProductCardProps) {
  const [isWishlisted, setIsWishlisted] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [addedToCart, setAddedToCart] = useState(false)

  const discount = originalPrice ? Math.round((1 - price / originalPrice) * 100) : 0

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault()
    setAddedToCart(true)
    setTimeout(() => setAddedToCart(false), 2000)
  }

  return (
    <div 
      className="group relative gradient-border hover-lift rounded-xl overflow-hidden"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="bg-card rounded-xl overflow-hidden">
        {/* Product Image */}
        <div className="relative aspect-[4/5] overflow-hidden bg-secondary/30">
          <Image
            src={image || "/placeholder.svg"}
            alt={name}
            fill
            className={`object-cover transition-all duration-700 ${isHovered ? 'scale-110' : 'scale-100'}`}
          />

          {/* Gradient overlay on hover */}
          <div className={`absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-0'}`} />

          {/* Badges */}
          <div className="absolute top-3 left-3 flex flex-col gap-2">
            {isNew && (
              <Badge className="bg-accent text-accent-foreground text-[10px] font-bold uppercase tracking-wider px-2 py-1 glow-accent-sm">
                Nyhet
              </Badge>
            )}
            {discount > 0 && (
              <Badge variant="destructive" className="text-[10px] font-bold uppercase tracking-wider px-2 py-1">
                -{discount}%
              </Badge>
            )}
          </div>

          {/* Quick Actions */}
          <div className={`absolute top-3 right-3 flex flex-col gap-2 transition-all duration-300 ${isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}`}>
            <button
              onClick={(e) => {
                e.preventDefault()
                setIsWishlisted(!isWishlisted)
              }}
              className={`p-2.5 rounded-full backdrop-blur-md transition-all duration-300 ${
                isWishlisted 
                  ? 'bg-accent text-accent-foreground' 
                  : 'bg-background/80 hover:bg-accent/20'
              }`}
              aria-label="Lägg till i önskelista"
            >
              <Heart
                className={`h-4 w-4 transition-all ${isWishlisted ? 'fill-current scale-110' : ''}`}
              />
            </button>
            <button
              className="p-2.5 rounded-full bg-background/80 backdrop-blur-md hover:bg-accent/20 transition-all duration-300"
              aria-label="Snabbvy"
            >
              <Eye className="h-4 w-4" />
            </button>
          </div>

          {/* Out of Stock Overlay */}
          {!inStock && (
            <div className="absolute inset-0 bg-background/90 backdrop-blur-sm flex items-center justify-center">
              <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Slutsåld</span>
            </div>
          )}

          {/* Add to Cart - Slide up on hover */}
          <div className={`absolute bottom-0 left-0 right-0 p-4 transition-all duration-300 ${isHovered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <Button 
              className={`w-full font-bold h-12 transition-all duration-300 ${
                addedToCart 
                  ? 'bg-green-500 hover:bg-green-500' 
                  : 'bg-foreground hover:bg-foreground/90 text-background'
              }`}
              disabled={!inStock}
              onClick={handleAddToCart}
            >
              {addedToCart ? (
                <>
                  <Check className="h-5 w-5 mr-2" />
                  Tillagd!
                </>
              ) : (
                <>
                  <ShoppingBag className="h-5 w-5 mr-2" />
                  Lägg i varukorg
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Product Info */}
        <div className="p-4 space-y-3">
          {/* Brand */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-accent font-bold uppercase tracking-[0.15em]">{brand}</span>
            <div className="flex items-center gap-1">
              <Star className="w-3 h-3 fill-accent text-accent" />
              <span className="text-xs text-muted-foreground">{rating}</span>
            </div>
          </div>
          
          {/* Name */}
          <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-accent transition-colors duration-300 leading-tight">
            {name}
          </h3>
          
          {/* Price */}
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-black">{price.toLocaleString()} kr</span>
            {originalPrice && (
              <span className="text-sm text-muted-foreground line-through">
                {originalPrice.toLocaleString()} kr
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
