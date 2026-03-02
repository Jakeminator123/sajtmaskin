"use client";

import { Code2, Hash, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  filterJsxElementRegistry,
  type JsxElementRegistryItem,
} from "@/lib/builder/jsx-element-registry";
import { cn } from "@/lib/utils";

interface ElementRegistryProps {
  items: JsxElementRegistryItem[];
  onSelect: (item: JsxElementRegistryItem) => void;
  selectedId?: string | null;
  isLoading?: boolean;
  error?: string | null;
}

function rowLabel(item: JsxElementRegistryItem): string {
  if (item.text) return item.text;
  if (item.idAttribute) return `#${item.idAttribute}`;
  if (item.className) return `.${item.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".")}`;
  return `<${item.tag}>`;
}

export function ElementRegistry({
  items,
  onSelect,
  selectedId,
  isLoading,
  error,
}: ElementRegistryProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => filterJsxElementRegistry(items, query), [items, query]);

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-border border-b px-4 py-3">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="mt-2 h-3 w-16" />
        </div>
        <div className="border-border border-b p-2">
          <Skeleton className="h-8 w-full rounded-md" />
        </div>
        <div className="space-y-1 p-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-start gap-2 rounded-md px-2 py-2">
              <Skeleton className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="min-w-0 flex-1 space-y-1">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-2.5 w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-4">
        <p className="text-center text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-border border-b px-4 py-3">
        <h3 className="font-semibold">Element</h3>
        <p className="text-muted-foreground mt-1 text-xs">{filtered.length} träffar</p>
      </div>

      <div className="border-border border-b p-2">
        <label className="relative block">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Sök tagg, text, klass eller fil..."
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-md border pr-2 pl-7 text-xs outline-none focus-visible:ring-[3px]"
          />
        </label>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="text-muted-foreground flex h-full items-center justify-center px-3 text-center text-xs">
            Inga element matchar sökningen.
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((item) => {
              const isSelected = item.id === selectedId;
              return (
                <Button
                  key={item.id}
                  type="button"
                  variant="ghost"
                  onClick={() => onSelect(item)}
                  className={cn(
                    "h-auto w-full justify-start px-2 py-2 text-left",
                    isSelected && "bg-primary/10 text-primary",
                  )}
                >
                  <span className="mr-2 mt-0.5 shrink-0">
                    <Code2 className="text-muted-foreground h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="block truncate text-xs font-medium">
                      {`<${item.tag}>`} {rowLabel(item)}
                    </span>
                    <span className="text-muted-foreground block truncate text-[11px]">
                      {item.filePath}
                    </span>
                    <span className="text-muted-foreground inline-flex items-center gap-1 text-[10px]">
                      <Hash className="h-3 w-3" />
                      rad {item.lineNumber}
                    </span>
                  </span>
                </Button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
