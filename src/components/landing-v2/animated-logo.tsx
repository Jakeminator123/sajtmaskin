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
        className="h-7 w-auto object-contain transition-opacity hover:opacity-80"
        priority
      />
    </Link>
  );
}
