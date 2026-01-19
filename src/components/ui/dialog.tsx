"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface DialogProps {
  open: boolean;
  children: ReactNode;
}

interface DialogContentProps {
  children: ReactNode;
  className?: string;
  showCloseButton?: boolean;
}

interface DialogHeaderProps {
  children: ReactNode;
  className?: string;
}

interface DialogTitleProps {
  children: ReactNode;
  className?: string;
}

interface DialogDescriptionProps {
  children: ReactNode;
  className?: string;
}

export function Dialog({ open, children }: DialogProps) {
  if (!open) return null;
  return <>{children}</>;
}

export function DialogContent({
  children,
  className = "",
  showCloseButton,
}: DialogContentProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Don't close if user is typing in an input field
        const target = e.target as HTMLElement;
        const isInput =
          target.tagName === "INPUT" || target.tagName === "TEXTAREA";
        const isContentEditable = target.isContentEditable;

        if (isInput || isContentEditable) {
          return;
        }

        e.preventDefault();
        e.stopPropagation();
        const event = new CustomEvent("dialog-close");
        window.dispatchEvent(event);
      }
    };
    // Use capture phase to handle before other handlers
    document.addEventListener("keydown", handleEscape, true);
    return () => document.removeEventListener("keydown", handleEscape, true);
  }, []);

  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => {
          const event = new CustomEvent("dialog-close");
          window.dispatchEvent(event);
        }}
      />
      <div
        ref={dialogRef}
        className={`relative z-10 w-full max-w-lg mx-4 bg-gray-900 border border-gray-800 shadow-xl rounded-lg ${className}`}
        role="dialog"
        aria-modal="true"
      >
        {children}
        {showCloseButton ? (
          <button
            type="button"
            onClick={() => {
              const event = new CustomEvent("dialog-close");
              window.dispatchEvent(event);
            }}
            className="absolute right-3 top-3 text-gray-400 hover:text-gray-200"
            aria-label="Close"
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function DialogHeader({ children, className = "" }: DialogHeaderProps) {
  return <div className={`p-6 pb-4 ${className}`}>{children}</div>;
}

export function DialogTitle({ children, className = "" }: DialogTitleProps) {
  return (
    <h2 className={`text-lg font-semibold text-white ${className}`}>
      {children}
    </h2>
  );
}

export function DialogDescription({
  children,
  className = "",
}: DialogDescriptionProps) {
  return <p className={`mt-1 text-sm text-gray-400 ${className}`}>{children}</p>;
}
