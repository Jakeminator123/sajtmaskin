"use client";

import { Fragment, useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { groupAgentLogItems } from "./agent-log-groups";
import type { AgentLogItem } from "./types";

export function AgentWorkLog({ items }: { items: readonly AgentLogItem[] }) {
  const logGroups = useMemo(() => groupAgentLogItems(items), [items]);
  return (
    <section aria-label="Arbetslogg" className="space-y-2">
      <h3 className="text-foreground text-sm font-medium">Arbetslogg</h3>
      {/* Uppgifter («Körmodell: …») som tabell, steg som tidslinje — i
          loggens egen ordning (`agent-log-groups.ts`). Förut var allt
          en enda lång lista med «nyckel: värde» som löptext. */}
      <ol className="space-y-2.5 text-sm">
        {logGroups.map((group, index) =>
          group.kind === "facts" ? (
            <li key={index}>
              <dl
                className="border-border/60 bg-muted/20 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 rounded-lg border px-3 py-2.5 text-xs"
                data-testid="agent-log-facts"
              >
                {group.facts.map((fact, factIndex) => (
                  <Fragment key={factIndex}>
                    <dt className="text-muted-foreground">{fact.key}</dt>
                    <dd className="text-foreground min-w-0 font-medium wrap-break-word">
                      {fact.value}
                    </dd>
                  </Fragment>
                ))}
              </dl>
            </li>
          ) : (
            <li
              key={index}
              className={cn(
                "border-border ml-1 border-l pl-4 wrap-break-word",
                group.item.failed ? "text-destructive" : "text-muted-foreground",
              )}
              data-testid="agent-log-step"
            >
              {group.item.failed && (
                <AlertTriangle
                  className="mr-1.5 inline size-3.5"
                  aria-label="Steget misslyckades"
                />
              )}
              {group.item.label}
              {group.item.detail && (
                <Collapsible className="mt-1">
                  <CollapsibleTrigger className="hover:text-foreground text-xs underline underline-offset-4">
                    Visa underlag
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 max-h-64 overflow-auto text-xs leading-relaxed whitespace-pre-wrap">
                    {group.item.detail}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </li>
          ),
        )}
      </ol>
    </section>
  );
}
