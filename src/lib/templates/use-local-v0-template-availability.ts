"use client";

import { useEffect, useState } from "react";

const availabilityCache = new Map<string, boolean>();

export function resetLocalV0TemplateAvailabilityCacheForTests() {
  availabilityCache.clear();
}

function normalizeTemplateIds(templateIds: string[]): string[] {
  return [...new Set(templateIds.map((id) => id.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function buildAvailableIdSet(templateIds: string[]): Set<string> {
  return new Set(templateIds.filter((id) => availabilityCache.get(id) === true));
}

function setsEqual(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

export function useLocalV0TemplateAvailability(templateIds: string[]) {
  const normalizedIds = normalizeTemplateIds(templateIds);
  const cacheKey = normalizedIds.join("|");
  const [availableIds, setAvailableIds] = useState<Set<string>>(() =>
    buildAvailableIdSet(normalizedIds),
  );

  useEffect(() => {
    const next = buildAvailableIdSet(normalizedIds);
    setAvailableIds((prev) => (setsEqual(prev, next) ? prev : next));
  }, [cacheKey]);

  useEffect(() => {
    const missingIds = normalizedIds.filter((id) => !availabilityCache.has(id));
    if (missingIds.length === 0) return;

    let cancelled = false;

    const run = async () => {
      try {
        const response = await fetch("/api/templates/local-v0-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: missingIds }),
        });
        const data = (await response.json().catch(() => null)) as
          | { success?: boolean; availableIds?: string[] }
          | null;
        if (cancelled || !response.ok || !data?.success) return;

        const nextAvailable = new Set(
          Array.isArray(data.availableIds)
            ? data.availableIds
                .map((id) => (typeof id === "string" ? id.trim() : ""))
                .filter(Boolean)
            : [],
        );

        for (const id of missingIds) {
          availabilityCache.set(id, nextAvailable.has(id));
        }

        if (!cancelled) {
          const next = buildAvailableIdSet(normalizedIds);
          setAvailableIds((prev) => (setsEqual(prev, next) ? prev : next));
        }
      } catch {
        // Keep UI quiet if local-status lookup fails; templates still work.
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  return availableIds;
}
