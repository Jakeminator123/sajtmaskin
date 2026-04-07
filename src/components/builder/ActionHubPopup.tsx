"use client";

import {
  ACTION_HUB_CATEGORIES,
  type ActionHubCategory,
  type ActionHubItem,
  type ActionHubItemAction,
} from "@/lib/builder/action-hub-items";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface ActionHubPopupProps {
  onAction: (action: ActionHubItemAction) => void;
  onClose: () => void;
}

export function ActionHubPopup(props: ActionHubPopupProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(<HubInner {...props} />, document.body);
}

function HubInner({ onAction, onClose }: ActionHubPopupProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const visibleCategories = activeCategory
    ? ACTION_HUB_CATEGORIES.filter((c) => c.id === activeCategory)
    : ACTION_HUB_CATEGORIES;

  const handleItemClick = useCallback(
    (item: ActionHubItem) => {
      onAction(item.action);
      onClose();
    },
    [onAction, onClose],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[99999] flex flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border/30 px-6 py-4">
        <h2 className="text-lg font-medium text-foreground">Vad vill du göra?</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Stäng"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-border/30 px-6 py-2">
        <CategoryTab
          label="Alla"
          active={activeCategory === null}
          onClick={() => setActiveCategory(null)}
        />
        {ACTION_HUB_CATEGORIES.map((cat) => (
          <CategoryTab
            key={cat.id}
            label={cat.label}
            active={activeCategory === cat.id}
            onClick={() => setActiveCategory(cat.id)}
          />
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl space-y-8">
          {visibleCategories.map((category) => (
            <CategorySection
              key={category.id}
              category={category}
              onItemClick={handleItemClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function CategoryTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function CategorySection({
  category,
  onItemClick,
}: {
  category: ActionHubCategory;
  onItemClick: (item: ActionHubItem) => void;
}) {
  return (
    <div>
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {category.label}
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {category.items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onItemClick(item)}
            className="flex flex-col items-center gap-2 rounded-xl border border-border/40 bg-card p-4 transition-all hover:border-border hover:shadow-sm active:scale-[0.98]"
          >
            <item.icon className="h-6 w-6 text-muted-foreground" />
            <span className="text-center text-sm text-foreground/80">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
