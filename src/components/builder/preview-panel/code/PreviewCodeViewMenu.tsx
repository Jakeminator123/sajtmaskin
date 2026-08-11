"use client";

import { Check, ChevronDown, Code2, FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PreviewViewMode } from "../preview-panel-types";

/**
 * "Kod"-menyn: byter previewytan mot kodvyn eller elementregistret. Medvetet
 * INTE en Radix DropdownMenu — repot kan inte driva Radix pointer-event-flöden
 * i jsdom (se SeoOptInPanel.test.tsx), och kodvy-testerna behöver menyrader som
 * svarar på syntetiska klick. Menyn portaleras till body med fixed position så
 * ingen scroll-container kan klippa den.
 */
export function PreviewCodeViewMenu(props: {
  viewMode: PreviewViewMode;
  canShowCode: boolean;
  isViewSwitchPending: boolean;
  onToggleCode: () => void;
  onToggleElementRegistry: () => void;
  iconOnly?: boolean;
}) {
  const {
    viewMode,
    canShowCode,
    isViewSwitchPending,
    onToggleCode,
    onToggleElementRegistry,
    iconOnly = false,
  } = props;
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);

  const handleToggleMenu = () => {
    if (!open) {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) {
        setPosition({
          top: rect.bottom + 4,
          right: Math.max(0, window.innerWidth - rect.right),
        });
      }
    }
    setOpen((prev) => !prev);
  };

  // Positionen fångas en gång vid öppning, så scroll eller resize skulle lämna
  // menyn frikopplad från triggern. Stäng i stället — användaren öppnar om.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const title = canShowCode ? "Kod — Kodvy eller Elementregister" : "Ingen kod tillgänglig än";

  return (
    <div className="relative">
      <Button
        ref={triggerRef}
        variant="ghost"
        size="sm"
        onClick={handleToggleMenu}
        disabled={!canShowCode || isViewSwitchPending}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={iconOnly ? "Kod" : undefined}
        title={title}
        className={cn(
          iconOnly ? "h-8 w-8 p-0" : undefined,
          viewMode !== "preview" && "bg-muted text-foreground",
        )}
      >
        <Code2 className="h-4 w-4" />
        {iconOnly ? null : (
          <>
            Kod
            <ChevronDown className="ml-1 h-3.5 w-3.5" />
          </>
        )}
      </Button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <>
              <button
                type="button"
                aria-hidden="true"
                tabIndex={-1}
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setOpen(false)}
              />
              <div
                role="menu"
                aria-label="Kodvyer"
                onKeyDown={(event) => {
                  if (event.key === "Escape") setOpen(false);
                }}
                style={{ position: "fixed", top: position.top, right: position.right }}
                className="border-border bg-popover z-50 min-w-44 rounded-md border p-1 shadow-md"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onToggleCode();
                  }}
                  className="hover:bg-muted flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
                >
                  <FileText className="h-4 w-4" />
                  <span className="flex-1 text-left">Kodvy</span>
                  {viewMode === "code" ? <Check className="h-4 w-4 text-emerald-500" /> : null}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onToggleElementRegistry();
                  }}
                  className="hover:bg-muted flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
                >
                  <Code2 className="h-4 w-4" />
                  <span className="flex-1 text-left">Elementregister</span>
                  {viewMode === "registry" ? <Check className="h-4 w-4 text-emerald-500" /> : null}
                </button>
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
