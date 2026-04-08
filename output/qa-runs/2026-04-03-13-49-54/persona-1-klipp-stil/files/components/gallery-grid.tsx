"use client";
import Image from "next/image";
import { cn } from "@/lib/utils";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { GalleryItem } from "@/lib/site";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ImageIcon from "@/components/image-icon";

type GalleryGridProps = {
  items: GalleryItem[];
};

export function GalleryGrid({ items }: GalleryGridProps) {
  const [activeCategory, setActiveCategory] = useState("Alla");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const categories = useMemo(() => ["Alla", ...Array.from(new Set(items.map((item) => item.category)))], [items]);

  const filteredItems = useMemo(() => {
    if (activeCategory === "Alla") {
      return items;
    }

    return items.filter((item) => item.category === activeCategory);
  }, [activeCategory, items]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (filteredItems.length === 0) {
      setOpen(false);
      setActiveIndex(null);
      return;
    }

    if (activeIndex === null || activeIndex >= filteredItems.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, filteredItems, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setActiveIndex((current) => {
          if (current === null) return 0;
          return (current + 1) % filteredItems.length;
        });
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setActiveIndex((current) => {
          if (current === null) return 0;
          return (current - 1 + filteredItems.length) % filteredItems.length;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [filteredItems.length, open]);

  const activeItem = activeIndex !== null ? filteredItems[activeIndex] : null;

  const showPrevious = () => {
    setActiveIndex((current) => {
      if (current === null) return 0;
      return (current - 1 + filteredItems.length) % filteredItems.length;
    });
  };

  const showNext = () => {
    setActiveIndex((current) => {
      if (current === null) return 0;
      return (current + 1) % filteredItems.length;
    });
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-3" role="tablist" aria-label="Filtrera galleriet">
            {categories.map((category) => {
              const active = category === activeCategory;

              return (
                <button
                  key={category}
                  type="button"
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm transition-all duration-200",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:border-primary/20 hover:bg-secondary",
                  )}
                  onClick={() => setActiveCategory(category)}
                  role="tab"
                  aria-selected={active}
                >
                  {category}
                </button>
              );
            })}
          </div>
          <p aria-live="polite" className="text-sm text-muted-foreground">
            Visar {filteredItems.length} bilder i kategorin {activeCategory.toLowerCase()}.
          </p>
        </div>

        {filteredItems.length === 0 ? (
          <Card className="rounded-[2rem] border-dashed bg-card/70 p-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-primary">
              <ImageIcon className="h-6 w-6" />
            </div>
            <h3 className="mt-5 text-2xl font-semibold">Inga bilder i den här kategorin ännu</h3>
            <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-muted-foreground">
              Kika gärna på Alla för att se fler resultat från salongen. Vi fyller på galleriet löpande med nya klippningar,
              färgningar och stylingar.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {filteredItems.map((item, index) => (
              <button
                key={`${item.title}-${item.category}`}
                type="button"
                onClick={() => {
                  setActiveIndex(index);
                  setOpen(true);
                }}
                className="group text-left"
              >
                <Card className="overflow-hidden rounded-[1.75rem] border-border/70 bg-card/90 transition-all duration-200 hover:-translate-y-1 hover:border-primary/20 hover:shadow-md">
                  <div className="relative aspect-[4/5] overflow-hidden">
                    <Image
                      src={item.image}
                      alt={item.alt}
                      fill
                      sizes="(min-width: 768px) 33vw, 50vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  </div>
                  <div className="space-y-2 p-4">
                    <Badge variant="secondary" className="rounded-full">
                      {item.category}
                    </Badge>
                    <h3 className="text-lg font-semibold tracking-tight">{item.title}</h3>
                    <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
                  </div>
                </Card>
              </button>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            setActiveIndex(null);
          }
        }}
      >
        <DialogContent className="max-w-5xl overflow-hidden rounded-[2rem] border-border/80 bg-card p-0">
          {activeItem ? (
            <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
              <div className="relative aspect-[4/5] bg-muted">
                <Image
                  src={activeItem.image}
                  alt={activeItem.alt}
                  fill
                  sizes="(min-width: 1024px) 55vw, 100vw"
                  className="object-cover"
                />
                {filteredItems.length > 1 ? (
                  <>
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full"
                      onClick={showPrevious}
                      aria-label="Visa föregående bild"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full"
                      onClick={showNext}
                      aria-label="Visa nästa bild"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                  </>
                ) : null}
              </div>

              <div className="flex flex-col p-6 sm:p-8">
                <DialogHeader className="space-y-4 text-left">
                  <Badge className="w-fit rounded-full">{activeItem.category}</Badge>
                  <DialogTitle className="text-3xl font-semibold tracking-tight">{activeItem.title}</DialogTitle>
                  <DialogDescription className="text-base leading-7 text-muted-foreground">
                    {activeItem.description}
                  </DialogDescription>
                </DialogHeader>

                <div className="mt-8 rounded-[1.5rem] border bg-secondary/45 p-5">
                  <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Tips från salongen</p>
                  <p className="mt-3 text-sm leading-7 text-foreground">
                    Resultat anpassas alltid efter hårkvalitet, utgångsläge och hur mycket underhåll du vill lägga hemma.
                    Är du osäker på vad som passar dig bäst hjälper vi dig gärna innan bokning.
                  </p>
                </div>

                <div className="mt-auto flex items-center justify-between gap-4 pt-8">
                  <p className="text-sm text-muted-foreground">
                    Bild {activeIndex !== null ? activeIndex + 1 : 0} av {filteredItems.length}
                  </p>
                  <DialogClose asChild>
                    <Button variant="outline" className="rounded-full">
                      Stäng
                    </Button>
                  </DialogClose>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default GalleryGrid;