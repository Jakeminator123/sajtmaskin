"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

import { ArrowUpRight } from "lucide-react";


import {
import { Button } from "@/components/ui/button"
import GalleryItem from "@/components/gallery-item"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

export type GalleryItem = {
  id: string;
  category: string;
  title: string;
  note: string;
  image: string;
  alt: string;
};

type GalleryGridProps = {
  items: GalleryItem[];
  filters: string[];
};

export function GalleryGrid({ items, filters }: GalleryGridProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("Alla");
  const [activeItem, setActiveItem] = useState<GalleryItem | null>(null);

  const filteredItems = useMemo(() => {
    if (selectedCategory === "Alla") {
      return items;
    }

    return items.filter((item) => item.category === selectedCategory);
  }, [items, selectedCategory]);

  return (
    <>
      <div className="space-y-8">
        <div className="flex flex-wrap gap-3">
          {filters.map((filter) => (
            <Button
              key={filter}
              type="button"
              variant={selectedCategory === filter ? "default" : "outline"}
              className="rounded-full transition-all duration-200 active:scale-95"
              onClick={() => setSelectedCategory(filter)}
              aria-pressed={selectedCategory === filter}
            >
              {filter}
            </Button>
          ))}
        </div>

        {filteredItems.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6">
            {filteredItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveItem(item)}
                className="group overflow-hidden rounded-[1.75rem] border border-border/70 bg-card text-left transition-all duration-200 hover:-translate-y-1 hover:border-accent/30 hover:shadow-lg"
                aria-label={`Öppna bild: ${item.title}`}
              >
                <div className="relative aspect-[4/5] overflow-hidden">
                  <Image
                    src={item.image}
                    alt={item.alt}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    sizes="(max-width: 768px) 50vw, 33vw"
                  />
                </div>
                <div className="flex items-start justify-between gap-4 p-4">
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.note}</p>
                  </div>
                  <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="section-shell p-8 text-center">
            <p className="text-lg font-medium">Fler bilder kommer snart – fråga oss gärna vid besök.</p>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              Vi fyller löpande på galleriet med nya resultat från salongen. Har du något särskilt du vill se är du varmt välkommen att kontakta oss.
            </p>
          </div>
        )}
      </div>

      <Dialog open={Boolean(activeItem)} onOpenChange={(open) => !open && setActiveItem(null)}>
        {activeItem ? (
          <DialogContent className="max-w-4xl overflow-hidden border-border/70 bg-background p-0">
            <div className="grid gap-0 md:grid-cols-[1.1fr_0.9fr]">
              <div className="relative min-h-[320px] bg-muted">
                <Image
                  src={activeItem.image}
                  alt={activeItem.alt}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 60vw"
                />
              </div>
              <div className="flex flex-col justify-center p-6 sm:p-8">
                <DialogTitle className="text-2xl font-semibold">{activeItem.title}</DialogTitle>
                <DialogDescription className="mt-3 text-base leading-7 text-muted-foreground">
                  {activeItem.note} Den här bilden visar ett exempel på hur vi arbetar med form, nyans och finish för att resultatet ska kännas naturligt och hållbart.
                </DialogDescription>
                <div className="mt-6 inline-flex w-fit rounded-full bg-secondary/25 px-4 py-2 text-sm font-medium text-foreground">
                  Kategori: {activeItem.category}
                </div>
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}

export default GalleryGrid;
