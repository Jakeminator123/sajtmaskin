"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
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
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      } else if (event.key === "Tab") {
        event.preventDefault();
        closeButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === "undefined") return null;

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-2 backdrop-blur-sm sm:p-4"
      onClick={handleBackdropClick}
    >
      <div className="relative flex max-h-[calc(100dvh-1rem)] w-full max-w-4xl flex-col overflow-hidden border border-gray-800 bg-black shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
        <div className="flex shrink-0 items-center gap-3 border-b border-gray-800 px-4 py-3">
          <h3 id={titleId} className="min-w-0 flex-1 truncate font-semibold text-white">
            {title}
          </h3>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
            aria-label="Stäng preview"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex h-[min(72dvh,46rem)] min-h-0 items-center justify-center overflow-auto bg-black/80 p-2 sm:p-4">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={title}
              className="h-auto max-h-full w-auto max-w-full rounded border border-gray-800 object-contain shadow-xl"
            />
          ) : (
            <p className="text-center text-sm text-gray-400">
              Ingen förhandsbild finns ännu för den här templaten.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
