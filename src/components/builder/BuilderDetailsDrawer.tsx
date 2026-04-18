"use client";

import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  children: React.ReactNode;
  title?: string;
  description?: string;
  className?: string;
};

/**
 * Wraps the builder's right-column tooling (chat, plan, trace, feedback) in
 * a slide-over. Default builder view stays Apple-minimal — this drawer is
 * only opened when the user taps the disclosure pill or uses Cmd/Ctrl+K.
 */
export function BuilderDetailsDrawer({
  open,
  onOpenChange,
  children,
  title = "Detaljer",
  description = "Chat, planering och verktyg.",
  className,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "flex w-full flex-col gap-0 p-0 sm:max-w-md md:max-w-lg lg:max-w-xl",
          className,
        )}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
