"use client";
import Link from "next/link";
import { cn } from "@/lib/utils";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";


import { ArrowLeft, ArrowRight, X } from "lucide-react"



import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { galleryItems } from "@/lib/site-data";
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"


const filters = ["Alla", "Ringar", "Halsband", "Armband", "Örhängen"];

export function GalleryBrowser() {
  const [selectedFilter, setSelectedFilter] = useState("Alla");
  const [activeId, setActiveId] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    if (selectedFilter === "Alla") {
      return galleryItems;
    }

    return galleryItems.filter((item) => item.category === selectedFilter);
  }, [selectedFilter]);

  const activeIndex = filteredItems.findIndex((item) => item.id === activeId);
  const activeItem = activeIndex >= 0 ? filteredItems[activeIndex] : null;

  const goToSlide = (direction: "previous" | "next") => {
    if (!filteredItems.length || activeIndex === -1) {
      return;
    }

    const offset = direction === "next" ? 1 : -1;
    const nextIndex = (activeIndex + offset + filteredItems.length) % filteredItems.length;
    setActiveId(filteredItems[nextIndex].id);
  };

  useEffect(() => {
    if (!activeItem) {
      return;
    }

    const nextItem = filteredItems[(activeIndex + 1) % filteredItems.length];

    if (typeof window !== "undefined" && nextItem) {
      const img = new window.Image();
      img.src = nextItem.image;
    }
  }, [activeIndex, activeItem, filteredItems]);

  useEffect(() => {
    if (!activeItem) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        goToSlide("next");
      }

      if (event.key === "ArrowLeft") {
        goToSlide("previous");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeItem, activeIndex, filteredItems]);

  useEffect(() => {
    if (!activeId) {
      return;
    }

    const stillExists = filteredItems.some((item) => item.id === activeId);

    if (!stillExists) {
      setActiveId(null);
    }
  }, [activeId, filteredItems]);

  return (
    <>
      <div className="sticky top-20 z-20 -mx-4 mb-8 overflow-x-auto border-y border-border/70 bg-background/90 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-full lg:border lg:px-5">
        <div className="flex min-w-max gap-3">
          {filters.map((filter) => (
            <button
              key={filter}
              type="button"
              aria-pressed={selectedFilter === filter}
              onClick={() => setSelectedFilter(filter)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selectedFilter === filter
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border/70 bg-card text-foreground hover:bg-muted",
              )}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filteredItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveId(item.id)}
            className="group overflow-hidden rounded-[1.5rem] border border-border/70 bg-card/95 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Öppna bild för ${item.title}`}
          >
            <div className="relative overflow-hidden">
              <Image
                src={item.image}
                alt={item.alt}
                width={700}
                height={700}
                className="h-auto w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent p-4">
                <Badge className="rounded-full bg-background/90 text-foreground shadow-sm">
                  {item.category}
                </Badge>
              </div>
            </div>
            <div className="space-y-2 p-5">
              <h3 className="text-xl font-semibold tracking-tight">{item.title}</h3>
              <p className="text-sm leading-7 text-muted-foreground">
                {item.description}
              </p>
            </div>
          </button>
        ))}
      </div>

      <Dialog open={Boolean(activeItem)} onOpenChange={(open) => !open && setActiveId(null)}>
        {activeItem ? (
          <DialogContent className="max-w-5xl overflow-hidden rounded-[1.75rem] border-border/70 bg-background p-0">
            <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="soft-metal p-4">
                <Image
                  src={activeItem.image}
                  alt={activeItem.alt}
                  width={900}
                  height={900}
                  className="h-auto w-full rounded-[1.25rem] object-cover"
                />
              </div>

              <div className="flex flex-col justify-between p-6 sm:p-8">
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-3">
                      <Badge variant="secondary" className="rounded-full px-4 py-1.5">
                        {activeItem.category}
                      </Badge>
                      <div>
                        <DialogTitle className="text-3xl font-semibold tracking-tight">
                          {activeItem.title}
                        </DialogTitle>
                        <DialogDescription className="mt-2 text-base leading-7 text-muted-foreground">
                          {activeItem.material}
                        </DialogDescription>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="rounded-full"
                      onClick={() => setActiveId(null)}
                      aria-label="Stäng bildvisning"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <p className="text-base leading-8 text-muted-foreground">
                    {activeItem.description}
                  </p>

                  <div className="silver-panel p-5">
                    <p className="text-sm text-muted-foreground">Pris från</p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight">
                      {activeItem.price}
                    </p>
                  </div>
                </div>

                <div className="mt-8 space-y-4">
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="rounded-full"
                      onClick={() => goToSlide("previous")}
                      aria-label="Visa föregående bild"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="rounded-full"
                      onClick={() => goToSlide("next")}
                      aria-label="Visa nästa bild"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                    <p className="text-sm text-muted-foreground">
                      Bild {activeIndex + 1} av {filteredItems.length}
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button asChild className="rounded-full">
                      <Link href="/kontakt">Handla nu</Link>
                    </Button>
                    <Button asChild variant="outline" className="rounded-full">
                      <Link href="/priser">Se priser och paket</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}

export default GalleryBrowser;
