"use client";

import { useEffect, useMemo, useState } from "react";
import { Palette, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DESIGN_THEME_OPTIONS,
  THEME_PRESETS,
  type DesignTheme,
} from "@/lib/builder/theme-presets";

interface ThemePickerProps {
  open: boolean;
  onClose: () => void;
  currentTheme: DesignTheme;
  onSelectTheme: (theme: DesignTheme) => void;
  isBusy?: boolean;
}

export function ThemePicker({
  open,
  onClose,
  currentTheme,
  onSelectTheme,
  isBusy = false,
}: ThemePickerProps) {
  const [selectedTheme, setSelectedTheme] = useState<DesignTheme>(currentTheme);

  useEffect(() => {
    if (open) setSelectedTheme(currentTheme);
  }, [open, currentTheme]);

  const selectedThemeOption = useMemo(
    () => DESIGN_THEME_OPTIONS.find((option) => option.value === selectedTheme),
    [selectedTheme],
  );

  const selectedThemeColors =
    selectedTheme !== "off" && selectedTheme !== "custom"
      ? THEME_PRESETS[selectedTheme as keyof typeof THEME_PRESETS]
      : null;

  const canApplyTheme = !isBusy && selectedTheme !== currentTheme;

  const handleConfirm = async () => {
    await onSelectTheme(selectedTheme);
    onClose();
  };

  return (
    <Dialog open={open}>
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,900px)] max-w-4xl flex-col overflow-hidden rounded-2xl border-border/50 bg-background/95 p-0 shadow-2xl backdrop-blur-xl">
        <div className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-brand-teal/50 to-transparent" />
          <DialogHeader className="px-6 pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-brand-teal/20 via-brand-blue/15 to-brand-teal/10 ring-1 ring-brand-teal/20">
                  <Palette className="h-5 w-5 text-brand-teal" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">
                    Välj tema
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Välj ett tema som styr färgtokens i nästa generation.
                  </DialogDescription>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Stäng"
                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
        </div>

        <div className="flex min-h-0 flex-1 flex-col border-t border-border/50 md:flex-row">
          <div className="flex w-full flex-col border-b border-border/50 md:w-[320px] md:border-r md:border-b-0">
            <div className="space-y-2 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Teman
              </div>
              <div className="space-y-1">
                {DESIGN_THEME_OPTIONS.map((option) => {
                  const isActive = option.value === selectedTheme;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSelectedTheme(option.value)}
                      className={`w-full rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors ${
                        isActive
                          ? "border-brand-blue/30 bg-brand-blue/10 text-brand-blue"
                          : "border-border/60 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col bg-muted/10">
            <div className="border-b border-border/50 px-6 py-3">
              <h3 className="truncate text-base font-semibold text-foreground">
                {selectedThemeOption?.label || selectedTheme}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Temat styr design tokens som skickas till generationen (primary/secondary/accent).
              </p>
            </div>
            <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-5">
              {selectedThemeColors ? (
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-border/60 bg-card/60 p-3">
                    <div className="text-[11px] text-muted-foreground">Primary</div>
                    <div
                      className="mt-2 h-10 rounded-md border border-border/50"
                      style={{ backgroundColor: selectedThemeColors.primary }}
                    />
                    <div className="mt-2 break-all font-mono text-[10px] text-muted-foreground">
                      {selectedThemeColors.primary}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-card/60 p-3">
                    <div className="text-[11px] text-muted-foreground">Secondary</div>
                    <div
                      className="mt-2 h-10 rounded-md border border-border/50"
                      style={{ backgroundColor: selectedThemeColors.secondary }}
                    />
                    <div className="mt-2 break-all font-mono text-[10px] text-muted-foreground">
                      {selectedThemeColors.secondary}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-card/60 p-3">
                    <div className="text-[11px] text-muted-foreground">Accent</div>
                    <div
                      className="mt-2 h-10 rounded-md border border-border/50"
                      style={{ backgroundColor: selectedThemeColors.accent }}
                    />
                    <div className="mt-2 break-all font-mono text-[10px] text-muted-foreground">
                      {selectedThemeColors.accent}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-border/60 bg-card/60 p-4 text-sm text-muted-foreground">
                  Tema är avstängt. Då får modellen större frihet att välja färger.
                </div>
              )}

              <div className="rounded-xl border border-brand-blue/20 bg-brand-blue/5 p-4 text-[12px] leading-relaxed text-muted-foreground">
                AI-motorn fungerar bäst när tema/tokens är tydliga. Välj tema här, lägg sedan till
                komponenter via AI‑element eller UI‑element.
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/50 bg-muted/20 px-6 py-3.5">
          <Button variant="outline" size="sm" onClick={onClose}>
            Avbryt
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={!canApplyTheme}
            className="bg-brand-blue hover:bg-brand-blue/90 text-white shadow-sm shadow-brand-blue/20"
          >
            Använd tema
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
