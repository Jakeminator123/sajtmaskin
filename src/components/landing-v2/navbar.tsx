"use client";

import { useEffect, useState } from "react";
import { AnimatedLogo } from "./animated-logo";
import { HeaderActions } from "@/components/layout/header-actions";

interface NavbarProps {
  onLoginClick?: () => void;
  onRegisterClick?: () => void;
}

export function Navbar({ onLoginClick, onRegisterClick }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const el = document.querySelector("[data-scroll-container]");
      if (el) setScrolled(el.scrollTop > 20);
    };
    const el = document.querySelector("[data-scroll-container]");
    el?.addEventListener("scroll", handleScroll, { passive: true });
    return () => el?.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-6 py-3.5 transition-all duration-300 ${
        scrolled
          ? "border-b border-border/40 bg-background/80 backdrop-blur-xl"
          : "bg-transparent"
      }`}
    >
      <AnimatedLogo />

      <HeaderActions onLoginClick={onLoginClick} onRegisterClick={onRegisterClick} />
    </nav>
  );
}
