"use client";

import { Slot } from "@radix-ui/react-slot";
import { Children, isValidElement, useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils/utils";

interface DialogProps {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
}

interface DialogTriggerProps {
  children: ReactNode;
  asChild?: boolean;
  onClick?: () => void;
  className?: string;
  type?: "button" | "submit" | "reset";
}

interface DialogContentProps {
  children: ReactNode;
  className?: string;
  showCloseButton?: boolean;
  onClose?: () => void;
}

interface DialogHeaderProps {
  children: ReactNode;
  className?: string;
}

interface DialogTitleProps {
  children: ReactNode;
  className?: string;
  id?: string;
}

interface DialogDescriptionProps {
  children: ReactNode;
  className?: string;
  id?: string;
}

export function Dialog({ open, onClose, children }: DialogProps) {
  if (!open) return null;
  return <>{children}</>;
}

export function DialogTrigger({
  children,
  asChild = false,
  className,
  type = "button",
  ...props
}: DialogTriggerProps) {
  const Comp = asChild ? Slot : "button";
  const mergedProps = {
    className,
    ...(asChild ? props : { type, ...props }),
  };
  return <Comp {...mergedProps}>{children}</Comp>;
}

export function DialogContent({ children, className = "", showCloseButton, onClose }: DialogContentProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const fallbackTitleId = useId();
  const fallbackDescriptionId = useId();
  const hasSlot = (node: ReactNode, slot: string): boolean => {
    const items = Children.toArray(node);
    for (const item of items) {
      if (!isValidElement(item)) continue;
      if (slot === "dialog-title" && item.type === DialogTitle) return true;
      if (slot === "dialog-description" && item.type === DialogDescription) return true;
      const props = item.props as { children?: ReactNode; "data-slot"?: string };
      if (props["data-slot"] === slot) return true;
      if (props.children && hasSlot(props.children, slot)) return true;
    }
    return false;
  };
  const hasTitle = hasSlot(children, "dialog-title");
  const hasDescription = hasSlot(children, "dialog-description");
  const ariaLabelledBy = hasTitle ? undefined : fallbackTitleId;
  const ariaDescribedBy = hasDescription ? undefined : fallbackDescriptionId;

  const requestClose = useCallback(() => {
    if (onClose) {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const target = e.target as HTMLElement;
        const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
        const isContentEditable = target.isContentEditable;

        if (isInput || isContentEditable) {
          return;
        }

        e.preventDefault();
        e.stopPropagation();
        requestClose();
      }
    };
    document.addEventListener("keydown", handleEscape, true);
    return () => document.removeEventListener("keydown", handleEscape, true);
  }, [requestClose]);

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
        onClick={requestClose}
      />
      <div
        ref={dialogRef}
        className={cn("relative z-10 mx-4 w-full max-w-lg rounded-lg border border-gray-800 bg-gray-900 shadow-xl", className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
      >
        {!hasTitle ? (
          <DialogTitle className="sr-only" id={fallbackTitleId}>
            Dialog
          </DialogTitle>
        ) : null}
        {!hasDescription ? (
          <DialogDescription className="sr-only" id={fallbackDescriptionId}>
            Dialog content
          </DialogDescription>
        ) : null}
        {children}
        {showCloseButton ? (
          <button
            type="button"
            onClick={requestClose}
            className="absolute top-3 right-3 text-gray-400 hover:text-gray-200"
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
  return <div className={cn("p-6 pb-4", className)}>{children}</div>;
}

export function DialogTitle({ children, className = "", id }: DialogTitleProps) {
  return (
    <h2 data-slot="dialog-title" id={id} className={cn("text-lg font-semibold text-white", className)}>
      {children}
    </h2>
  );
}

export function DialogDescription({ children, className = "", id }: DialogDescriptionProps) {
  return (
    <p data-slot="dialog-description" id={id} className={cn("mt-1 text-sm text-gray-400", className)}>
      {children}
    </p>
  );
}
