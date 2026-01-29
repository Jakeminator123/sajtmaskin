"use client";

import { X } from "lucide-react";

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string | null;
  title: string;
}

/**
 * PreviewModal
 * ------------
 * Endast en statisk bildvisning som förstorar befintlig preview.
 */
export function PreviewModal({ isOpen, onClose, imageUrl, title }: PreviewModalProps) {
  if (!isOpen) return null;

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="relative w-[90vw] max-w-4xl border border-gray-800 bg-black shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
          <h3 className="truncate font-semibold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
            aria-label="Stäng preview"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-[60vh] items-center justify-center bg-black/80 p-4">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={title}
              className="max-h-[70vh] w-auto rounded border border-gray-800 shadow-xl"
            />
          ) : (
            <p className="text-center text-sm text-gray-400">
              Ingen förhandsbild finns ännu för den här mallen.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
