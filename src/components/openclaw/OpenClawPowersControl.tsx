"use client";

import type { MouseEvent } from "react";
import { ChevronDown, Shield, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";
import { OPENCLAW_POWER_IDS, OPENCLAW_POWER_META } from "@/lib/openclaw/powers";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOpenClawPowers } from "./useOpenClawPowers";

/**
 * "Extra befogenheter" control for the OpenClaw chat header.
 *
 * Renders ONLY when the server reports `OC_EDIT` on — on a deployment without
 * it there is nothing to grant, so showing a dead switch would just promise
 * something the env forbids.
 *
 * Two hit targets on the same pill: the wrapper (shield + padding) presses
 * the master toggle, the chevron opens the list of powers and stops the click
 * from reaching the wrapper. Menu clicks are portaled and also stopped, so
 * picking a power cannot flip the switch. Both gates are visible at once,
 * and neither alone changes behaviour: pressing the shield with nothing
 * ticked grants nothing.
 */
/**
 * Re-validate the env gate at the moment the user presses the shield. The
 * mount-time health check is the panel's only other read and the panel stays
 * mounted for the whole session, so without this an `OC_EDIT` that was turned
 * off server-side would keep offering powers until a reload. Revokes only on a
 * DEFINITIVE `editEnabled: false` answer — a network blip proves nothing and
 * must not kill a legitimately enabled control for the rest of the session.
 */
async function revalidateEditGateOnPress(setEditEnabled: (v: boolean) => void) {
  try {
    const res = await fetch("/api/openclaw/health");
    if (!res.ok) return;
    const data = (await res.json().catch(() => null)) as { editEnabled?: boolean } | null;
    if (data && data.editEnabled !== true) setEditEnabled(false);
  } catch {
    // Transient failure — the mount-time check stays the authority.
  }
}

export function OpenClawPowersControl() {
  const editEnabled = useOpenClawStore((s) => s.editEnabled);
  const powersOn = useOpenClawStore((s) => s.powersOn);
  const grantedPowers = useOpenClawStore((s) => s.grantedPowers);
  const setPowersOn = useOpenClawStore((s) => s.setPowersOn);
  const setEditEnabled = useOpenClawStore((s) => s.setEditEnabled);
  const toggleGrantedPower = useOpenClawStore((s) => s.toggleGrantedPower);
  const powers = useOpenClawPowers();

  if (!editEnabled) return null;

  const activeCount =
    Number(powers.armedAutonomy) + Number(powers.quickEdit) + Number(powers.liveReview);

  const handleToggle = (event: MouseEvent<HTMLElement>) => {
    // Portaled menu items are React children of this wrapper, not DOM
    // descendants. A bubbled click from the list must not flip the switch.
    if (!event.currentTarget.contains(event.target as Node)) return;
    const next = !powersOn;
    setPowersOn(next);
    // Pressing ON grants authority, so that is the moment to re-check the env
    // gate. A stale-true answer flips editEnabled off, which withdraws the
    // grant (store) and unmounts this control.
    if (next) void revalidateEditGateOnPress(setEditEnabled);
  };

  return (
    <div
      className={cn(
        "flex cursor-pointer items-center rounded-full border transition-colors",
        activeCount > 0
          ? "border-fuchsia-400/40 bg-fuchsia-400/10"
          : "border-white/10 bg-transparent",
      )}
      onClick={handleToggle}
    >
      <button
        type="button"
        aria-pressed={powersOn}
        className={cn(
          "flex items-center gap-1 rounded-l-full py-1 pr-1 pl-2 transition-colors",
          powersOn ? "text-fuchsia-200 hover:text-fuchsia-100" : "text-slate-300 hover:text-white",
        )}
        aria-label={
          powersOn ? "Stäng av extra befogenheter" : "Slå på extra befogenheter"
        }
        title={
          powersOn
            ? "Extra befogenheter är på — välj vilka i listan"
            : "Extra befogenheter är av — Sajtagenten guidar bara"
        }
      >
        {powersOn ? <ShieldCheck className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
        {activeCount > 0 ? (
          <span className="text-[10px] leading-none font-semibold">{activeCount}</span>
        ) : null}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="rounded-r-full py-1 pr-2 pl-1 text-slate-300 transition-colors hover:text-white"
          aria-label="Välj extra befogenheter"
          title="Välj extra befogenheter"
          onClick={(event) => event.stopPropagation()}
        >
          <ChevronDown className="h-3 w-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-72 border-white/10 bg-slate-950/95 text-slate-100"
          onClick={(event) => event.stopPropagation()}
        >
          <DropdownMenuLabel className="text-[11px] tracking-[0.16em] text-slate-400 uppercase">
            Extra befogenheter
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-white/10" />
          {OPENCLAW_POWER_IDS.map((id) => (
            <DropdownMenuCheckboxItem
              key={id}
              checked={grantedPowers.includes(id)}
              disabled={!powersOn}
              // Keep the menu open: picking two powers should not cost two trips.
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={() => toggleGrantedPower(id)}
              className="items-start focus:bg-white/10 focus:text-white"
            >
              <span className="flex flex-col gap-0.5">
                <span className="text-xs font-medium">{OPENCLAW_POWER_META[id].label}</span>
                <span className="text-[11px] leading-4 text-slate-400">
                  {OPENCLAW_POWER_META[id].description}
                </span>
              </span>
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator className="bg-white/10" />
          <p className="px-2 py-1.5 text-[11px] leading-4 text-slate-400">
            {powersOn
              ? activeCount > 0
                ? "Aktivt. Sajtagenten agerar alltid genom builderns vanliga flöde."
                : "Knappen är intryckt, men ingen befogenhet är vald — inget extra händer."
              : "Tryck in sköldknappen först. Utan den guidar Sajtagenten bara, precis som vanligt."}
          </p>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
