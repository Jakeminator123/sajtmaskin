"use client";

import Image from "next/image";
import Link from "next/link";

export function AnimatedLogo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center select-none ${className}`}
      aria-label="SajtMaskin"
    >
      <Image
        src="/images/sajtmaskin-logo.png"
        alt="SajtMaskin"
        width={148}
        height={56}
        className="h-6 w-auto object-contain transition-opacity duration-200 hover:opacity-80 md:h-7"
        priority
      />
    </Link>
  );
}
