"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { SeoOptInPanel, type SeoFormValue } from "./SeoOptInPanel";

type DeployNameDialogProps = {
  open: boolean;
  deployName: string;
  deployNameError: string | null;
  isDeploying: boolean;
  isSaving: boolean;
  /**
   * Project id used by the SEO panel to read/seed persisted preferences.
   * Optional — if absent the SEO panel still renders but won't preload
   * a persisted value.
   */
  projectId?: string | null;
  onDeployNameChange: (value: string) => void;
  onCancel: () => void;
  /**
   * Called with the form values when the user clicks Publicera.
   * `seo` carries the (possibly opted-in) SEO preferences for this
   * deploy. The deploy handler is responsible for persisting them.
   */
  onConfirm: (payload: { seo: SeoFormValue }) => void;
};

export function DeployNameDialog({
  open,
  deployName,
  deployNameError,
  isDeploying,
  isSaving,
  projectId,
  onDeployNameChange,
  onCancel,
  onConfirm,
}: DeployNameDialogProps) {
  const disabled = isDeploying || isSaving;

  const [seoValue, setSeoValue] = useState<SeoFormValue>({
    optIn: false,
    siteUrl: "",
  });
  const [seoValid, setSeoValid] = useState<boolean>(true);

  // Reset form on (re)open so previous attempt doesn't leak across
  // sessions. The panel will re-seed from persisted preferences on
  // next mount.
  useEffect(() => {
    if (open) {
      setSeoValue({ optIn: false, siteUrl: "" });
      setSeoValid(true);
    }
  }, [open]);

  const canConfirm = !disabled && seoValid;

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Publicera till Vercel</DialogTitle>
          <DialogDescription>
            Namnet används i URL:en (namn.vercel.app) och normaliseras automatiskt.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Input
              value={deployName}
              onChange={(event) => onDeployNameChange(event.target.value)}
              placeholder="t.ex. palma-livsstil"
              disabled={disabled}
            />
            {deployNameError && <div className="text-xs text-red-400">{deployNameError}</div>}
            <p className="text-muted-foreground text-xs">
              Vercel har inga mappar. Använd gärna prefix för gruppering om du vill hålla ordning.
            </p>
          </div>
          <SeoOptInPanel
            projectId={projectId ?? null}
            value={seoValue}
            onChange={setSeoValue}
            onValidityChange={setSeoValid}
            disabled={disabled}
          />
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 space-y-1">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Kostnad:</span> 20 credits för publicering
            </p>
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Hosting:</span> 10 credits/månad för att hålla
              sajten live
            </p>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={onCancel} disabled={disabled}>
              Avbryt
            </Button>
            <Button
              onClick={() => onConfirm({ seo: seoValue })}
              disabled={!canConfirm}
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publicera"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
