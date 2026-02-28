"use client";

import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getAllV0Categories,
  getTemplateImageUrl,
  getTemplatesByCategory,
  type CategoryInfo,
  type Template,
} from "@/lib/templates/template-data";

interface TemplatePickerProps {
  open: boolean;
  onClose: () => void;
  onSelectTemplate: (templateId: string) => void;
  hasChat?: boolean;
  isBusy?: boolean;
}

export function TemplatePicker({
  open,
  onClose,
  onSelectTemplate,
  hasChat = false,
  isBusy = false,
}: TemplatePickerProps) {
  const templateCategories = useMemo(() => getAllV0Categories(), []);

  const [templateCategory, setTemplateCategory] = useState<string>(() => {
    const cats = getAllV0Categories();
    return cats[0]?.id ?? "website-templates";
  });
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);

  const templateItems = useMemo(
    () => getTemplatesByCategory(templateCategory),
    [templateCategory],
  );

  useEffect(() => {
    if (templateItems.length > 0) {
      setSelectedTemplate(templateItems[0]);
    } else {
      setSelectedTemplate(null);
    }
  }, [templateItems]);

  const canStartTemplate = Boolean(selectedTemplate) && !isBusy;

  const handleConfirm = () => {
    if (!selectedTemplate) return;
    onSelectTemplate(selectedTemplate.id);
    onClose();
  };

  return (
    <Dialog open={open}>
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,1100px)] max-w-5xl flex-col overflow-hidden rounded-2xl border-border/50 bg-background/95 p-0 shadow-2xl backdrop-blur-xl">
        <div className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-brand-teal/50 to-transparent" />
          <DialogHeader className="px-6 pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-brand-teal/20 via-brand-blue/15 to-brand-teal/10 ring-1 ring-brand-teal/20">
                  <LayoutGrid className="h-5 w-5 text-brand-teal" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">
                    Välj mall
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Starta från en mall om du inte har någon chat ännu.
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
          <div className="flex w-full flex-col border-b border-border/50 md:w-[280px] md:border-r md:border-b-0">
            <div className="space-y-2 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Kategorier
              </div>
              <div className="space-y-1">
                {templateCategories.map((category: CategoryInfo) => {
                  const isActive = category.id === templateCategory;
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setTemplateCategory(category.id)}
                      className={`w-full rounded-md px-3 py-2 text-left text-xs font-medium transition-colors ${
                        isActive
                          ? "bg-brand-blue/10 text-brand-blue"
                          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      }`}
                    >
                      {category.title}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col bg-muted/10">
            <div className="border-b border-border/50 px-6 py-3">
              <h3 className="truncate text-base font-semibold text-foreground">
                {templateCategories.find((cat) => cat.id === templateCategory)?.title || "Mallar"}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {templateCategories.find((cat) => cat.id === templateCategory)?.description ||
                  "Välj en mall att starta från."}
              </p>
            </div>
            <div className="scrollbar-thin flex-1 overflow-y-auto p-5">
              {hasChat && (
                <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-100/80">
                  Om du startar från en mall skapas en ny chat.
                </div>
              )}
              {templateItems.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Inga mallar hittades i kategorin.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {templateItems.slice(0, 12).map((template) => {
                    const isSelected = selectedTemplate?.id === template.id;
                    return (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => setSelectedTemplate(template)}
                        className={`group overflow-hidden rounded-xl border text-left transition-all ${
                          isSelected
                            ? "border-brand-teal/40 bg-brand-teal/10"
                            : "border-border/60 hover:border-brand-teal/30 hover:bg-muted/40"
                        }`}
                      >
                        <div className="aspect-16/10 w-full overflow-hidden bg-muted/30">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={getTemplateImageUrl(template)}
                            alt={template.title}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                            loading="lazy"
                          />
                        </div>
                        <div className="p-3">
                          <div className="text-sm font-medium text-foreground">
                            {template.title}
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {template.category}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {templateItems.length > 12 && (
                <div className="mt-4 text-[11px] text-muted-foreground">
                  Visar 12 av {templateItems.length} mallar.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border/50 bg-muted/20 px-6 py-3.5">
          <div className="text-xs text-muted-foreground">
            {selectedTemplate && (
              <>
                Vald mall:{" "}
                <span className="font-medium text-foreground">{selectedTemplate.title}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Avbryt
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={!canStartTemplate}
              className="bg-brand-blue hover:bg-brand-blue/90 text-white shadow-sm shadow-brand-blue/20"
            >
              Starta mall
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
