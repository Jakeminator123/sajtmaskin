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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative max-h-[85vh] max-w-[90vw]">
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-10 rounded-full bg-background p-1.5 shadow-lg text-muted-foreground hover:text-foreground"
          aria-label="Stäng"
        >
          <X className="h-4 w-4" />
        </button>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={title}
            className="max-h-[85vh] w-auto rounded-lg shadow-2xl"
          />
        ) : (
          <div className="flex h-64 w-96 items-center justify-center rounded-lg bg-card">
            <p className="text-sm text-muted-foreground">Ingen bild tillgänglig.</p>
          </div>
        )}
      </div>
    </div>
  );
}
