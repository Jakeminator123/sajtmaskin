'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import {
  Search,
  ShoppingBag,
  User,
  Menu,
  Heart,
  X,
  ChevronRight,
} from 'lucide-react'

const navLinks = [
  { name: 'Shop', href: '/#shop' },
  { name: 'Varumärken', href: '/#brands' },
  { name: 'Om Oss', href: '/about' },
  { name: 'Kontakt', href: '/about#contact' },
]

export function Header() {
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [cartCount] = useState(2)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
      scrolled 
        ? 'bg-background/90 backdrop-blur-xl border-b border-border/50 py-3' 
        : 'bg-transparent py-5'
    }`}>
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between gap-8">
          {/* Logo */}
          <Link href="/" className="group flex items-center gap-3 shrink-0">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center font-black text-accent-foreground text-lg group-hover:scale-110 transition-transform duration-300">
                TG
              </div>
              <div className="absolute inset-0 rounded-xl bg-accent/50 blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </div>
            <div className="hidden sm:flex flex-col -space-y-1">
              <span className="text-sm font-black tracking-tight">TRAINING GROUND</span>
              <span className="text-[10px] text-muted-foreground tracking-[0.3em]">SWEDEN</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                className="relative px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group"
              >
                {link.name}
                <span className="absolute bottom-0 left-4 right-4 h-px bg-accent scale-x-0 group-hover:scale-x-100 transition-transform duration-300" />
              </Link>
            ))}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-1">
            {/* Search */}
            <div className="relative">
              {isSearchOpen ? (
                <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-2 animate-in slide-in-from-right-4 duration-200">
                  <Input
                    type="search"
                    placeholder="Sök produkter..."
                    className="w-64 h-10 bg-card border-border/50 focus:border-accent pr-10"
                    autoFocus
                  />
                  <button
                    onClick={() => setIsSearchOpen(false)}
                    className="absolute right-3 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-xl hover:bg-accent/10"
                  onClick={() => setIsSearchOpen(true)}
                >
                  <Search className="h-4 w-4" />
                  <span className="sr-only">Sök</span>
                </Button>
              )}
            </div>

            {/* Wishlist */}
            <Button variant="ghost" size="icon" className="hidden sm:flex h-10 w-10 rounded-xl hover:bg-accent/10">
              <Heart className="h-4 w-4" />
              <span className="sr-only">Önskelista</span>
            </Button>

            {/* User Account */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-accent/10">
                  <User className="h-4 w-4" />
                  <span className="sr-only">Konto</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-card/95 backdrop-blur-xl border-border/50">
                <DropdownMenuItem className="cursor-pointer">
                  <span>Logga in</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer">
                  <span>Skapa konto</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-border/50" />
                <DropdownMenuItem className="cursor-pointer">
                  <span>Mina ordrar</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer">
                  <span>Önskelista</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Cart */}
            <Button variant="ghost" size="icon" className="relative h-10 w-10 rounded-xl hover:bg-accent/10 group">
              <ShoppingBag className="h-4 w-4" />
              {cartCount > 0 && (
                <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-[10px] font-bold bg-accent text-accent-foreground border-2 border-background group-hover:scale-110 transition-transform">
                  {cartCount}
                </Badge>
              )}
              <span className="sr-only">Varukorg</span>
            </Button>

            {/* Mobile Menu */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden h-10 w-10 rounded-xl hover:bg-accent/10">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Meny</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full max-w-sm bg-background/95 backdrop-blur-xl border-border/50 p-0">
                <div className="flex flex-col h-full">
                  {/* Mobile Search */}
                  <div className="p-6 border-b border-border/30">
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="search"
                        placeholder="Sök produkter..."
                        className="pl-11 h-12 bg-card border-border/50 rounded-xl"
                      />
                    </div>
                  </div>

                  {/* Mobile Navigation */}
                  <nav className="flex-1 p-6">
                    <div className="space-y-1">
                      {navLinks.map((link) => (
                        <Link
                          key={link.name}
                          href={link.href}
                          className="flex items-center justify-between py-4 text-lg font-semibold hover:text-accent transition-colors border-b border-border/20"
                        >
                          {link.name}
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </Link>
                      ))}
                    </div>
                  </nav>

                  {/* Mobile Actions */}
                  <div className="p-6 border-t border-border/30 space-y-3">
                    <Button className="w-full h-12 bg-accent hover:bg-accent/90 text-accent-foreground font-bold rounded-xl">
                      Logga in
                    </Button>
                    <Button variant="outline" className="w-full h-12 border-border/50 font-semibold rounded-xl bg-transparent">
                      Skapa konto
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  )
}
