"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type PlacementConfirmDialogProps = {
  open: boolean;
  elementName: string;
  elementDescription?: string | null;
  placementLabel: string;
  onConfirm: (customization: string) => void | Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
};

export function PlacementConfirmDialog({
  open,
  elementName,
  elementDescription,
  placementLabel,
  onConfirm,
  onCancel,
  isSubmitting = false,
}: PlacementConfirmDialogProps) {
  const [customization, setCustomization] = useState("");

  useEffect(() => {
    if (open) {
      setCustomization("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onCancel(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Bekräfta placering</DialogTitle>
          <DialogDescription>
            Kontrollera vad som läggs till och var på sidan det ska placeras.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-6 pb-6">
          <div className="rounded border border-gray-800 bg-gray-950/60 p-3 text-sm">
            <div className="text-gray-400">Valt element</div>
            <div className="mt-1 font-medium text-white">{elementName}</div>
            {elementDescription ? (
              <div className="mt-1 text-xs text-gray-400">{elementDescription}</div>
            ) : null}
          </div>

          <div className="rounded border border-gray-800 bg-gray-950/60 p-3 text-sm">
            <div className="text-gray-400">Placering</div>
            <div className="mt-1 font-medium text-sky-300">{placementLabel}</div>
          </div>

          <div className="space-y-1">
            <label htmlFor="placement-customization" className="text-sm font-medium text-gray-200">
              Extra instruktion (valfritt)
            </label>
            <Textarea
              id="placement-customization"
              value={customization}
              onChange={(event) => setCustomization(event.target.value)}
              placeholder='T.ex. "Gor kalendern bla i stallet for gron och ge den rundade horn."'
              className="min-h-[110px]"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              Avbryt
            </Button>
            <Button type="button" onClick={() => void onConfirm(customization.trim())} disabled={isSubmitting}>
              {isSubmitting ? "Skickar..." : "Lägg till element"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
