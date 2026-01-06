"use client";

import Image from "next/image";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

/**
 * DiceBear Avatar Component
 *
 * Generates unique avatars using the DiceBear API.
 * No API key needed - just pass a seed!
 *
 * Styles available:
 * - avataaars: Cartoon-style people
 * - bottts: Cute robots
 * - fun-emoji: Fun emoji faces
 * - lorelei: Line art portraits
 * - notionists: Notion-style avatars
 * - open-peeps: Hand-drawn people
 * - personas: Geometric people
 * - pixel-art: Retro pixel avatars
 * - initials: Simple initials (great for logos)
 * - shapes: Abstract geometric shapes
 * - identicon: GitHub-style identicons
 */

export type AvatarStyle =
  | "avataaars"
  | "bottts"
  | "fun-emoji"
  | "lorelei"
  | "notionists"
  | "open-peeps"
  | "personas"
  | "pixel-art"
  | "initials"
  | "shapes"
  | "identicon";

interface AvatarDiceBearProps {
  seed: string;
  style?: AvatarStyle;
  size?: number;
  className?: string;
  backgroundColor?: string;
  rounded?: boolean;
  alt?: string;
}

export function AvatarDiceBear({
  seed,
  style = "avataaars",
  size = 40,
  className,
  backgroundColor,
  rounded = false,
  alt,
}: AvatarDiceBearProps) {
  const avatarUrl = useMemo(() => {
    const params = new URLSearchParams({
      seed: seed,
      size: size.toString(),
    });

    if (backgroundColor) {
      // Remove # if present
      params.append("backgroundColor", backgroundColor.replace("#", ""));
    }

    if (rounded) {
      params.append("radius", "50");
    }

    return `https://api.dicebear.com/9.x/${style}/svg?${params.toString()}`;
  }, [seed, style, size, backgroundColor, rounded]);

  return (
    <Image
      src={avatarUrl}
      alt={alt || `Avatar for ${seed}`}
      width={size}
      height={size}
      className={cn("flex-shrink-0", className)}
      unoptimized // External URL requires unoptimized
    />
  );
}

/**
 * Generate a simple initials-based logo/avatar
 * Great for company logos or user initials
 */
interface InitialsAvatarProps {
  text: string;
  size?: number;
  className?: string;
  backgroundColor?: string;
  textColor?: string;
}

export function InitialsAvatar({
  text,
  size = 40,
  className,
  backgroundColor = "0d9488", // teal-600
  textColor = "ffffff",
}: InitialsAvatarProps) {
  const avatarUrl = useMemo(() => {
    const params = new URLSearchParams({
      seed: text,
      size: size.toString(),
      backgroundColor: backgroundColor.replace("#", ""),
      textColor: textColor.replace("#", ""),
    });

    return `https://api.dicebear.com/9.x/initials/svg?${params.toString()}`;
  }, [text, size, backgroundColor, textColor]);

  return (
    <Image
      src={avatarUrl}
      alt={`Initials: ${text}`}
      width={size}
      height={size}
      className={cn("flex-shrink-0", className)}
      unoptimized
    />
  );
}

/**
 * Generate a random avatar style based on seed
 * Useful when you want variety but consistency per user
 */
const ALL_STYLES: AvatarStyle[] = [
  "avataaars",
  "bottts",
  "fun-emoji",
  "lorelei",
  "notionists",
  "open-peeps",
  "personas",
  "pixel-art",
];

export function RandomStyleAvatar({
  seed,
  size = 40,
  className,
  backgroundColor,
}: Omit<AvatarDiceBearProps, "style">) {
  const style = useMemo(() => {
    // Generate consistent style based on seed
    const hash = seed
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return ALL_STYLES[hash % ALL_STYLES.length];
  }, [seed]);

  return (
    <AvatarDiceBear
      seed={seed}
      style={style}
      size={size}
      className={className}
      backgroundColor={backgroundColor}
    />
  );
}
