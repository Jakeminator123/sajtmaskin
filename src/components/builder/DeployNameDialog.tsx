"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info, Loader2 } from "lucide-react";

type DeployNameDialogProps = {
  open: boolean;
  deployName: string;
  deployNameError: string | null;
  isDeploying: boolean;
  isSaving: boolean;
  onDeployNameChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeployNameDialog({
  open,
  deployName,
  deployNameError,
  isDeploying,
  isSaving,
  onDeployNameChange,
  onCancel,
  onConfirm,
}: DeployNameDialogProps) {
  const disabled = isDeploying || isSaving;

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Publicera</DialogTitle>
          <DialogDescription>
            Välj namn för din sajt.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Input
              value={deployName}
              onChange={(event) => onDeployNameChange(event.target.value)}
              placeholder="t.ex. palma-livsstil"
              disabled={disabled}
            />
            {deployNameError && <div className="text-xs text-red-400">{deployNameError}</div>}
          </div>
          <div className="flex items-center justify-between">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Info className="h-3 w-3" />
                    Kostnad
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs">
                  <p>20 credits för publicering. 10 credits/månad hosting.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onCancel} disabled={disabled}>
                Avbryt
              </Button>
              <Button size="sm" onClick={onConfirm} disabled={disabled}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publicera"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
