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
export function PreviewModal({
  isOpen,
  onClose,
  imageUrl,
  title,
}: PreviewModalProps) {
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
      <div className="relative w-[90vw] max-w-4xl bg-black border border-gray-800 shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <h3 className="text-white font-semibold truncate">{title}</h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            aria-label="Stäng preview"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 bg-black/80 flex items-center justify-center min-h-[60vh]">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={title}
              className="max-h-[70vh] w-auto rounded border border-gray-800 shadow-xl"
            />
          ) : (
            <p className="text-gray-400 text-sm text-center">
              Ingen förhandsbild finns ännu för den här mallen.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
