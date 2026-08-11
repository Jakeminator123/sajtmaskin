"use client";

import { useMemo } from "react";
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";
import { resolveOpenClawPowers, type OpenClawPowers } from "@/lib/openclaw/powers";

/**
 * Effective OpenClaw powers for a component: the AND of the `OC_EDIT` env gate,
 * the chat's master toggle and the ticked powers. Selects primitives so a
 * component only re-renders when the resolved grant actually changes.
 */
export function useOpenClawPowers(): OpenClawPowers {
  const editEnabled = useOpenClawStore((s) => s.editEnabled);
  const powersOn = useOpenClawStore((s) => s.powersOn);
  const granted = useOpenClawStore((s) => s.grantedPowers);
  return useMemo(
    () => resolveOpenClawPowers({ editEnabled, powersOn, granted }),
    [editEnabled, powersOn, granted],
  );
}
