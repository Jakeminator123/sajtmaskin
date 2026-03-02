"use client"

import { Button } from "@/components/ui/button"
import { Menu, X } from "lucide-react"
import { useState, useEffect } from "react"
import { AnimatedLogo } from "@/components/animated-logo"

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      const el = document.querySelector("[data-scroll-container]")
      if (el) setScrolled(el.scrollTop > 20)
    }
    const el = document.querySelector("[data-scroll-container]")
    el?.addEventListener("scroll", handleScroll)
    return () => el?.removeEventListener("scroll", handleScroll)
  }, [])

  const navLinks = [
    { href: "#funktioner", label: "Funktioner" },
    { href: "#teknik", label: "Teknik" },
    { href: "#hur-det-fungerar", label: "Hur det fungerar" },
    { href: "#priser", label: "Priser" },
    { href: "#faq", label: "FAQ" },
  ]

  return (
    <nav
      className={`relative z-20 flex items-center justify-between px-6 py-3.5 border-b transition-all duration-300 ${
        scrolled
          ? "border-border/40 bg-background/80 backdrop-blur-xl"
          : "border-border/20 bg-background/30 backdrop-blur-md"
      }`}
    >
      <div className="flex items-center gap-1">
        <AnimatedLogo className="text-lg font-semibold text-foreground" />
        <span className="hidden sm:inline-flex text-[10px] font-medium uppercase tracking-wider text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full ml-1.5">
          Beta
        </span>
      </div>

      {/* Desktop nav */}
      <div className="hidden lg:flex items-center gap-1">
        {navLinks.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-lg hover:bg-secondary/40"
          >
            {link.label}
          </a>
        ))}
      </div>

      <div className="hidden lg:flex items-center gap-3">
        <Button
          variant="ghost"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Logga in
        </Button>
        <Button className="btn-3d btn-glow text-sm bg-primary text-primary-foreground hover:bg-primary/90 font-medium shadow-lg shadow-primary/20">
          Kom ig&aring;ng gratis
        </Button>
      </div>

      {/* Mobile hamburger */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden text-foreground"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={mobileOpen ? "St\u00e4ng meny" : "\u00d6ppna meny"}
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </Button>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="absolute top-full left-0 right-0 z-50 border-b border-border/30 bg-background/95 backdrop-blur-xl p-6 flex flex-col gap-1 lg:hidden animate-fade-up">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-3 rounded-lg hover:bg-secondary/40"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </a>
          ))}
          <div className="flex flex-col gap-2 pt-4 mt-2 border-t border-border/30">
            <Button
              variant="ghost"
              className="justify-start text-sm text-muted-foreground hover:text-foreground"
            >
              Logga in
            </Button>
            <Button className="btn-3d btn-glow text-sm bg-primary text-primary-foreground hover:bg-primary/90 font-medium">
              Kom ig&aring;ng gratis
            </Button>
          </div>
        </div>
      )}
    </nav>
  )
}
