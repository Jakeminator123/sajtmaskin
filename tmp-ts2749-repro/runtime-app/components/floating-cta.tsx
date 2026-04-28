"use client";
import { Button } from "@/components/ui/button"
import Link from "next/link"

import { useEffect, useState } from "react";

import { Gamepad as Gamepad2, MapPin } from "lucide-react";



export default function FloatingCta() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 420);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`pointer-events-none fixed inset-x-3 bottom-4 z-40 mx-auto w-auto max-w-md transition-all duration-300 sm:inset-x-auto sm:right-6 sm:left-auto ${
        visible
          ? "translate-y-0 opacity-100"
          : "translate-y-6 opacity-0 motion-reduce:translate-y-0"
      }`}
      aria-hidden={!visible}
    >
      <div className="pointer-events-auto surface-panel rounded-full p-2 shadow-lg">
        <div className="flex items-center gap-2">
          <Button asChild className="rounded-full px-5 active:scale-95">
            <a href="#kontakt">
              <MapPin className="mr-2 h-4 w-4" />
              Besök oss
            </a>
          </Button>
          <Button
            asChild
            variant="outline"
            className="rounded-full bg-card/90 px-5 active:scale-95"
          >
            <Link href="/spel">
              <Gamepad2 className="mr-2 h-4 w-4" />
              Spela
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}