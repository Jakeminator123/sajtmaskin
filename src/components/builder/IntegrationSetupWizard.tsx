"use client";

import { ChevronDown, ChevronRight, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";

type IntegrationItem = {
  key: string;
  name: string;
  envVars: string[];
  setupGuide?: string;
  status: "configured" | "partial" | "missing";
  missingEnvVars: string[];
};

type BusinessPackItem = {
  id: string;
  label: string;
  description: string;
  envVars: string[];
  missingEnvVars: string[];
  verificationChecklist: string[];
  status: "configured" | "partial" | "missing";
};

export type IntegrationSetupWizardProps = {
  integrations: IntegrationItem[];
  businessPacks: BusinessPackItem[];
  onOpenEnvVars?: (envKeys?: string[]) => void;
  onClose?: () => void;
};

const ANALYTICS_KEYS = new Set([
  "google-analytics",
  "gtm",
  "plausible",
  "matomo",
  "posthog",
  "vercel-analytics",
]);

function categorizeIntegration(key: string) {
  if (ANALYTICS_KEYS.has(key)) return "analytics";
  return "other";
}

function StatusBadge({ status }: { status: IntegrationItem["status"] }) {
  const config = {
    configured: { label: "Konfigurerad", className: "border-green-500/40 bg-green-500/10 text-green-200" },
    partial: { label: "Delvis", className: "border-amber-500/40 bg-amber-500/10 text-amber-200" },
    missing: { label: "Saknas", className: "border-red-500/40 bg-red-500/10 text-red-200" },
  };
  const { label, className } = config[status];
  return (
    <Badge variant="outline" className={cn("text-[10px]", className)}>
      {label}
    </Badge>
  );
}

function IntegrationCard({
  item,
  onOpenEnvVars,
}: {
  item: IntegrationItem;
  onOpenEnvVars?: (envKeys?: string[]) => void;
}) {
  const configuredSet = new Set(
    item.envVars.filter((k) => !item.missingEnvVars.includes(k))
  );
  return (
    <Collapsible defaultOpen={item.status !== "configured"}>
      <div className="border-border rounded-md border bg-muted/50">
        <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-data-[state=open]:hidden" />
            <ChevronDown className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground group-data-[state=open]:block" />
            <span className="truncate text-xs font-medium text-foreground">{item.name}</span>
          </div>
          <StatusBadge status={item.status} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border/60 px-2.5 py-2">
            {item.setupGuide && (
              <div className="text-muted-foreground mb-2 text-[11px]">{item.setupGuide}</div>
            )}
            {item.envVars.length > 0 && (
              <div className="mb-2">
                <div className="text-muted-foreground mb-1 text-[10px] font-medium">
                  Miljövariabler:
                </div>
                <div className="flex flex-wrap gap-1">
                  {item.envVars.map((key) => {
                    const isConfigured = configuredSet.has(key);
                    return (
                      <span
                        key={key}
                        className={cn(
                          "rounded border px-1.5 py-0.5 text-[10px]",
                          isConfigured
                            ? "border-green-500/40 bg-green-500/10 text-green-200"
                            : "border-red-500/40 bg-red-500/10 text-red-200"
                        )}
                      >
                        {key}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            {item.envVars.length > 0 && onOpenEnvVars && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                onClick={() => onOpenEnvVars(item.missingEnvVars.length > 0 ? item.missingEnvVars : item.envVars)}
              >
                Öppna miljövariabler
              </Button>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function BusinessPackCard({
  pack,
  onOpenEnvVars,
  checkedItems,
  onCheckChange,
}: {
  pack: BusinessPackItem;
  onOpenEnvVars?: (envKeys?: string[]) => void;
  checkedItems: Record<string, boolean>;
  onCheckChange: (packId: string, index: number, checked: boolean) => void;
}) {
  const missingSet = new Set(pack.missingEnvVars);

  return (
    <Collapsible defaultOpen={pack.status !== "configured"}>
      <div className="border-border rounded-md border bg-muted/50">
        <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-data-[state=open]:hidden" />
            <ChevronDown className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground group-data-[state=open]:block" />
            <span className="truncate text-xs font-medium text-foreground">{pack.label}</span>
          </div>
          <StatusBadge status={pack.status} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border/60 px-2.5 py-2">
            <div className="text-muted-foreground mb-2 text-[11px]">{pack.description}</div>
            {pack.envVars.length > 0 && (
              <div className="mb-2">
                <div className="text-muted-foreground mb-1 text-[10px] font-medium">
                  Miljövariabler:
                </div>
                <div className="flex flex-wrap gap-1">
                  {pack.envVars.map((key) => {
                    const isConfigured = !missingSet.has(key);
                    return (
                      <span
                        key={key}
                        className={cn(
                          "rounded border px-1.5 py-0.5 text-[10px]",
                          isConfigured
                            ? "border-green-500/40 bg-green-500/10 text-green-200"
                            : "border-red-500/40 bg-red-500/10 text-red-200"
                        )}
                      >
                        {key}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            {pack.verificationChecklist.length > 0 && (
              <div className="mb-2">
                <div className="text-muted-foreground mb-1 text-[10px] font-medium">
                  Verifiera efter deploy:
                </div>
                <div className="space-y-1.5">
                  {pack.verificationChecklist.map((item, idx) => (
                    <label
                      key={`${pack.id}-${idx}`}
                      className="flex cursor-pointer items-start gap-2 text-[11px] text-foreground"
                    >
                      <Checkbox
                        checked={checkedItems[`${pack.id}:${idx}`] ?? false}
                        onCheckedChange={(checked) =>
                          onCheckChange(pack.id, idx, checked === true)
                        }
                        className="mt-0.5"
                      />
                      <span>{item}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {pack.envVars.length > 0 && onOpenEnvVars && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                onClick={() =>
                  onOpenEnvVars(
                    pack.missingEnvVars.length > 0 ? pack.missingEnvVars : pack.envVars
                  )
                }
              >
                Öppna miljövariabler
              </Button>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function IntegrationSetupWizard({
  integrations,
  businessPacks,
  onOpenEnvVars,
  onClose,
}: IntegrationSetupWizardProps) {
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({});

  const analyticsIntegrations = useMemo(
    () => integrations.filter((i) => categorizeIntegration(i.key) === "analytics"),
    [integrations],
  );
  const otherIntegrations = useMemo(
    () => integrations.filter((i) => categorizeIntegration(i.key) === "other"),
    [integrations],
  );

  const configuredCount = useMemo(
    () =>
      integrations.filter((i) => i.status === "configured").length +
      businessPacks.filter((p) => p.status === "configured").length,
    [integrations, businessPacks],
  );
  const totalCount = integrations.length + businessPacks.length;
  const progressValue = totalCount > 0 ? (configuredCount / totalCount) * 100 : 0;

  const handleCheckChange = (packId: string, index: number, checked: boolean) => {
    setChecklistState((prev) => ({
      ...prev,
      [`${packId}:${index}`]: checked,
    }));
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-2.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">Installationsguide</span>
        {onClose && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div>
        <div className="text-muted-foreground mb-1 flex items-center justify-between text-[11px]">
          <span>{configuredCount} av {totalCount} integrationer konfigurerade</span>
        </div>
        <Progress value={progressValue} className="h-1.5" />
      </div>

      <div className="max-h-[320px] space-y-3 overflow-y-auto">
        {analyticsIntegrations.length > 0 && (
          <div>
            <div className="text-muted-foreground mb-1.5 text-[11px] font-medium">
              Analytics & Tracking
            </div>
            <div className="space-y-1.5">
              {analyticsIntegrations.map((item) => (
                <IntegrationCard
                  key={item.key}
                  item={item}
                  onOpenEnvVars={onOpenEnvVars}
                />
              ))}
            </div>
          </div>
        )}

        {businessPacks.length > 0 && (
          <div>
            <div className="text-muted-foreground mb-1.5 text-[11px] font-medium">
              Affärsflöden
            </div>
            <div className="space-y-1.5">
              {businessPacks.map((pack) => (
                <BusinessPackCard
                  key={pack.id}
                  pack={pack}
                  onOpenEnvVars={onOpenEnvVars}
                  checkedItems={checklistState}
                  onCheckChange={handleCheckChange}
                />
              ))}
            </div>
          </div>
        )}

        {otherIntegrations.length > 0 && (
          <div>
            <div className="text-muted-foreground mb-1.5 text-[11px] font-medium">
              Övriga integrationer
            </div>
            <div className="space-y-1.5">
              {otherIntegrations.map((item) => (
                <IntegrationCard
                  key={item.key}
                  item={item}
                  onOpenEnvVars={onOpenEnvVars}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
