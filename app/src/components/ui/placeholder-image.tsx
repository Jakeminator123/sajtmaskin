"use client";

import Image from "next/image";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

/**
 * Placeholder Image Component
 *
 * Uses Lorem Picsum for random placeholder images.
 * No API key needed!
 *
 * Options:
 * - Random image (different each time)
 * - Seeded image (same image for same seed)
 * - Grayscale option
 * - Blur option
 */

interface PlaceholderImageProps {
  width: number;
  height: number;
  seed?: string; // Use seed for consistent image
  grayscale?: boolean;
  blur?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  className?: string;
  alt?: string;
}

export function PlaceholderImage({
  width,
  height,
  seed,
  grayscale = false,
  blur,
  className,
  alt = "Placeholder image",
}: PlaceholderImageProps) {
  const imageUrl = useMemo(() => {
    let url = seed
      ? `https://picsum.photos/seed/${encodeURIComponent(
          seed
        )}/${width}/${height}`
      : `https://picsum.photos/${width}/${height}`;

    const params: string[] = [];
    if (grayscale) params.push("grayscale");
    if (blur) params.push(`blur=${blur}`);

    if (params.length > 0) {
      url += `?${params.join("&")}`;
    }

    return url;
  }, [width, height, seed, grayscale, blur]);

  return (
    <Image
      src={imageUrl}
      alt={alt}
      width={width}
      height={height}
      className={cn("object-cover", className)}
      unoptimized // External URL
    />
  );
}

/**
 * Multiple placeholder images with different seeds
 * Great for galleries, grids, etc.
 */
interface PlaceholderGalleryProps {
  count: number;
  width: number;
  height: number;
  baseSeed?: string;
  grayscale?: boolean;
  className?: string;
  imageClassName?: string;
}

export function PlaceholderGallery({
  count,
  width,
  height,
  baseSeed = "gallery",
  grayscale = false,
  className,
  imageClassName,
}: PlaceholderGalleryProps) {
  const images = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      seed: `${baseSeed}-${i}`,
      id: i,
    }));
  }, [count, baseSeed]);

  return (
    <div className={cn("grid gap-2", className)}>
      {images.map((img) => (
        <PlaceholderImage
          key={img.id}
          seed={img.seed}
          width={width}
          height={height}
          grayscale={grayscale}
          className={imageClassName}
          alt={`Placeholder ${img.id + 1}`}
        />
      ))}
    </div>
  );
}
