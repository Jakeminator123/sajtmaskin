"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import MiniSearch from "minisearch";

export interface SiteSearchItem {
  /** Unique id (e.g. the href). */
  id: string;
  /** Result heading, e.g. page or product name. */
  title: string;
  /** Optional one-line detail shown under the title. */
  description?: string;
  /** Navigation target for the result. */
  href: string;
  /** Optional extra search terms (synonyms, categories). */
  keywords?: string[];
}

export interface SiteSearchProps {
  /** Everything searchable on the site: pages, products, articles, FAQs. */
  items: SiteSearchItem[];
  placeholder?: string;
  /** Accessible label for the search field. */
  label?: string;
  emptyText?: string;
  /** Max results shown while typing. */
  maxResults?: number;
  className?: string;
}

/**
 * Local site search: MiniSearch index built in the browser over the items the
 * caller provides. Fuzzy + prefix matching so typos still hit. No backend, no
 * keys — fully functional in preview and production alike. Rendered as an
 * accessible combobox: arrow keys move through results, Enter navigates,
 * Escape closes.
 */
export function SiteSearch({
  items,
  placeholder = "Sök på sajten …",
  label = "Sök på sajten",
  emptyText = "Inga träffar.",
  maxResults = 8,
  className,
}: SiteSearchProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement | null>(null);
  // Unique per instance: two SiteSearch widgets on one page (e.g. desktop +
  // mobile header) must not share listbox/option ids or their aria-controls /
  // aria-activedescendant references collide.
  const baseId = useId();

  const index = useMemo(() => {
    const mini = new MiniSearch<SiteSearchItem>({
      fields: ["title", "description", "keywords"],
      storeFields: ["title", "description", "href"],
      searchOptions: { prefix: true, fuzzy: 0.2, boost: { title: 2 } },
      extractField: (item, fieldName) => {
        const value = item[fieldName as keyof SiteSearchItem];
        return Array.isArray(value) ? value.join(" ") : ((value as string) ?? "");
      },
    });
    mini.addAll(items);
    return mini;
  }, [items]);

  const results = useMemo(() => {
    if (query.trim().length < 2) return [];
    return index.search(query).slice(0, maxResults) as unknown as Array<
      Pick<SiteSearchItem, "id" | "title" | "description" | "href">
    >;
  }, [index, query, maxResults]);

  // Close when clicking outside the widget.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function navigateTo(href: string) {
    setOpen(false);
    window.location.assign(href);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) {
      if (event.key === "Escape") setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? results.length - 1 : prev - 1));
    } else if (event.key === "Enter" && activeIndex >= 0 && results[activeIndex]) {
      event.preventDefault();
      navigateTo(results[activeIndex].href);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const listboxId = `site-search-results-${baseId}`;
  const optionId = (id: string) => `site-search-option-${baseId}-${id}`;
  const showList = open && query.trim().length >= 2;

  return (
    <div ref={rootRef} className={["relative w-full max-w-md", className ?? ""].join(" ").trim()}>
      <input
        type="search"
        role="combobox"
        aria-label={label}
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-activedescendant={
          activeIndex >= 0 && results[activeIndex]
            ? optionId(results[activeIndex].id)
            : undefined
        }
        autoComplete="off"
        placeholder={placeholder}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {showList && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={label}
          className="absolute z-50 mt-1 max-h-80 w-full overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {results.length === 0 && (
            <li
              role="option"
              aria-selected={false}
              aria-disabled="true"
              className="px-3 py-2 text-sm text-muted-foreground"
            >
              {emptyText}
            </li>
          )}
          {results.map((result, resultIndex) => (
            <li
              key={result.id}
              id={optionId(result.id)}
              role="option"
              aria-selected={resultIndex === activeIndex}
              className={[
                "cursor-pointer rounded-sm px-3 py-2 text-sm",
                resultIndex === activeIndex ? "bg-accent text-accent-foreground" : "",
              ]
                .join(" ")
                .trim()}
              onPointerEnter={() => setActiveIndex(resultIndex)}
              onPointerDown={(event) => {
                // pointerdown (not click) so the outside-close handler never
                // races the navigation.
                event.preventDefault();
                navigateTo(result.href);
              }}
            >
              <span className="block font-medium text-foreground">{result.title}</span>
              {result.description && (
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {result.description}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
