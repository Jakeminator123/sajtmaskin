"use client";

import { useEffect, useRef } from "react";
import { Button } from "./button";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "default";
  isLoading?: boolean;
}

/**
 * A simple confirmation dialog component.
 * Replaces window.confirm() with a nicer UI.
 */
export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Bekräfta",
  cancelText = "Avbryt",
  variant = "danger",
  isLoading = false,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
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
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape, true);
    return () => document.removeEventListener("keydown", handleEscape, true);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      icon: "text-red-400",
      button: "bg-red-600 hover:bg-red-500",
    },
    warning: {
      icon: "text-brand-amber",
      button: "bg-brand-amber hover:bg-brand-amber/90",
    },
    default: {
      icon: "text-brand-teal",
      button: "bg-brand-teal hover:bg-brand-teal/90",
    },
  };

  const styles = variantStyles[variant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        className="relative z-10 w-full max-w-md mx-4 bg-gray-900 border border-gray-800 shadow-xl animate-in fade-in-0 zoom-in-95 duration-200"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby={description ? "dialog-description" : undefined}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 p-1 text-gray-500 hover:text-gray-300 transition-colors"
          aria-label="Stäng"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Content */}
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`p-2 bg-gray-800 ${styles.icon}`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h2
                id="dialog-title"
                className="text-lg font-semibold text-white"
              >
                {title}
              </h2>
              {description && (
                <p
                  id="dialog-description"
                  className="mt-2 text-sm text-gray-400"
                >
                  {description}
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex justify-end gap-3">
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={isLoading}
              className="text-gray-400 hover:text-white hover:bg-gray-800"
            >
              {cancelText}
            </Button>
            <Button
              onClick={() => {
                onConfirm();
              }}
              disabled={isLoading}
              className={styles.button}
            >
              {isLoading ? "Vänta..." : confirmText}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
