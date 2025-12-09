"use client";

import Image from "next/image";
import { X } from "lucide-react";

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl?: string | null;
  templateName: string;
}

export function PreviewModal({
  isOpen,
  onClose,
  imageUrl,
  templateName,
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
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
          <h3 className="text-base font-semibold text-white truncate">
            {templateName}
          </h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            aria-label="Stäng förhandsvisning"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative bg-black">
          {imageUrl ? (
            <div className="relative w-full h-[70vh]">
              <Image
                src={imageUrl}
                alt={`Förhandsbild: ${templateName}`}
                fill
                className="object-contain"
                sizes="(max-width: 640px) 90vw, 70vw"
                priority
              />
            </div>
          ) : (
            <div className="flex h-[70vh] items-center justify-center text-gray-500">
              <p>Ingen bild finns tillgänglig.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
