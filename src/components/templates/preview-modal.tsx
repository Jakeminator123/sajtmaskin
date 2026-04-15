"use client";

import { X } from "lucide-react";

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string | null;
  title: string;
}

export function PreviewModal({ isOpen, onClose, imageUrl, title }: PreviewModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background/85 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label="Stäng"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(4rem,env(safe-area-inset-top))] sm:px-8">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className="max-h-[min(78vh,880px)] w-auto max-w-[min(100%,calc(100vw-2rem))] rounded-2xl object-contain shadow-2xl ring-1 ring-border"
          />
        ) : (
          <div className="flex h-64 max-w-md flex-1 items-center justify-center rounded-2xl border border-border bg-card ring-1 ring-border">
            <p className="text-sm text-muted-foreground">Ingen bild.</p>
          </div>
        )}
        <p className="mt-5 max-w-2xl px-2 text-center text-sm font-semibold tracking-tight text-foreground sm:mt-6 sm:text-base">
          {title}
        </p>
      </div>
    </div>
  );
}
