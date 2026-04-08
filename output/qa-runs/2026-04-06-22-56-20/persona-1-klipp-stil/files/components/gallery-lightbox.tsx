"use client";
import { cn } from "@/lib/utils";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";

import { ChevronLeft, ChevronRight } from "lucide-react";


import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

import type { GalleryItem } from "@/lib/site-data";
import { Button } from "@/components/ui/button"

type GalleryLightboxProps = {
  items: GalleryItem[];
};

export function GalleryLightbox({ items }: GalleryLightboxProps) {
  const [activeCategory, setActiveCategory] = useState<string>("Alla");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const categories = useMemo(
    () => ["Alla", ...Array.from(new Set(items.map((item) => item.category)))],
    [items],
  );

  const filteredItems = useMemo(() => {
    if (activeCategory === "Alla") {
      return items;
    }

    return items.filter((item) => item.category === activeCategory);
  }, [activeCategory, items]);

  const activeItem =
    selectedIndex === null ? null : filteredItems[selectedIndex] ?? null;

  useEffect(() => {
    setSelectedIndex(null);
  }, [activeCategory]);

  useEffect(() => {
    if (selectedIndex === null || filteredItems.length === 0) {
      return;
    }

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        setSelectedIndex((current) => {
          if (current === null) return null;
          return (current + 1) % filteredItems.length;
        });
      }

      if (event.key === "ArrowLeft") {
        setSelectedIndex((current) => {
          if (current === null) return null;
          return (current - 1 + filteredItems.length) % filteredItems.length;
        });
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [filteredItems.length, selectedIndex]);

  const goToPrevious = () => {
    setSelectedIndex((current) => {
      if (current === null) return null;
      return (current - 1 + filteredItems.length) % filteredItems.length;
    });
  };

  const goToNext = () => {
    setSelectedIndex((current) => {
      if (current === null) return null;
      return (current + 1) % filteredItems.length;
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-3">
        {categories.map((category) => (
          <Button
            key={category}
            type="button"
            variant={activeCategory === category ? "default" : "outline"}
            onClick={() => setActiveCategory(category)}
            className={cn(
              "rounded-full transition-all duration-200 active:scale-95",
              activeCategory === category && "shadow-sm",
            )}
          >
            {category}
          </Button>
        ))}
      </div>

      <p aria-live="polite" className="sr-only">
        {`Visar ${filteredItems.length} bilder i kategorin ${activeCategory.toLowerCase()}.`}
      </p>

      {filteredItems.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-border bg-card p-10 text-center">
          <p className="text-lg font-medium">Inga bilder hittades</p>
          <p className="mt-2 text-muted-foreground">
            Välj en annan kategori för att se fler resultat från salongen.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((item, index) => (
            <button
              key={`${item.title}-${item.category}`}
              type="button"
              onClick={() => setSelectedIndex(index)}
              className="group overflow-hidden rounded-[2rem] border border-border bg-card text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Öppna bild: ${item.title}`}
            >
              <div className="relative aspect-[4/5] overflow-hidden">
                <Image
                  src={item.image}
                  alt={item.alt}
                  fill
                  sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
              <div className="space-y-2 p-5">
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
                  {item.category}
                </p>
                <h3 className="text-2xl font-semibold tracking-tight">
                  {item.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog
        open={selectedIndex !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedIndex(null);
        }}
      >
        <DialogContent className="max-w-5xl overflow-hidden border-border bg-background p-0">
          {activeItem ? (
            <div className="grid gap-0 md:grid-cols-[1.2fr_0.8fr]">
              <div className="relative min-h-[320px] bg-muted">
                <Image
                  src={activeItem.image}
                  alt={activeItem.alt}
                  fill
                  sizes="(min-width: 768px) 60vw, 100vw"
                  className="object-cover"
                />
              </div>

              <div className="flex flex-col justify-between p-6 sm:p-8">
                <div className="space-y-4">
                  <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
                    {activeItem.category}
                  </p>
                  <DialogTitle className="text-3xl font-semibold tracking-tight">
                    {activeItem.title}
                  </DialogTitle>
                  <DialogDescription className="text-base leading-relaxed text-muted-foreground">
                    {activeItem.description}
                  </DialogDescription>
                </div>

                <div className="mt-8 flex items-center justify-between gap-4">
                  <p className="text-sm text-muted-foreground">
                    Bild {selectedIndex !== null ? selectedIndex + 1 : 0} av{" "}
                    {filteredItems.length}
                  </p>
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={goToPrevious}
                      className="rounded-full"
                      aria-label="Föregående bild"
                      disabled={filteredItems.length < 2}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={goToNext}
                      className="rounded-full"
                      aria-label="Nästa bild"
                      disabled={filteredItems.length < 2}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default GalleryLightbox;
