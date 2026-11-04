"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { usePathname } from "next/navigation";
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
import { readActiveBuilderChatId } from "@/lib/openclaw/builder-target";
import {
  hydrateOpenClawPowersForChat,
  persistOpenClawPowersForActiveChat,
} from "@/lib/openclaw/persist-openclaw-powers";
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

/**
 * Klasser per yta. Kontrollen renderas både i builderns komposer
 * (`ChatInterface`) och i panelens topprad (`OpenClawChatPanel`). Panelen
 * behåller exakt dagens klasser; buildern följer komposerns verktygsknappar
 * (h-8, rounded-lg, border-border/70, bg-background/80, text-[11px]) och
 * builderns vanliga dropdown-meny.
 */
const POWERS_CONTROL_CLASSES = {
  panel: {
    wrapper:
      "flex max-w-full shrink-0 cursor-pointer items-center rounded-xl border transition-colors",
    wrapperActive: "border-fuchsia-400/40 bg-fuchsia-400/10",
    wrapperIdle: "border-border/70 bg-background/50",
    toggle:
      "focus-visible:ring-ring flex h-8 items-center gap-1.5 rounded-l-xl pr-1.5 pl-2.5 text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
    toggleOn: "text-fuchsia-300 hover:text-fuchsia-200",
    toggleOff: "text-muted-foreground hover:text-foreground",
    icon: "h-3.5 w-3.5",
    count:
      "flex size-4 items-center justify-center rounded-full bg-fuchsia-400/15 text-[10px] leading-none font-semibold",
    chevron:
      "text-muted-foreground hover:text-foreground focus-visible:ring-ring flex h-8 items-center rounded-r-xl border-l border-current/10 px-2 transition-colors focus-visible:ring-2 focus-visible:outline-none",
    menu: "w-72 border-white/10 bg-slate-950/95 text-slate-100",
    menuLabel: "text-[11px] tracking-[0.16em] text-slate-400 uppercase",
    menuSeparator: "bg-white/10",
    menuItem: "items-start focus:bg-white/10 focus:text-white",
    menuItemDescription: "text-[11px] leading-4 text-slate-400",
    menuNote: "px-2 py-1.5 text-[11px] leading-4 text-slate-400",
  },
  builder: {
    wrapper:
      "flex h-8 max-w-full shrink-0 cursor-pointer items-stretch rounded-lg border transition-colors",
    wrapperActive: "border-primary/50 bg-primary/10",
    wrapperIdle: "border-border/70 bg-background/80",
    toggle:
      "focus-visible:ring-ring flex items-center gap-1.5 rounded-l-md pr-1.5 pl-2.5 text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
    toggleOn: "text-primary hover:bg-accent hover:text-foreground",
    toggleOff: "text-muted-foreground hover:bg-accent hover:text-foreground",
    icon: "size-3",
    count:
      "bg-primary text-primary-foreground flex size-4 items-center justify-center rounded-full text-[10px] leading-none font-semibold tabular-nums",
    chevron:
      "text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring border-border/70 flex items-center rounded-r-md border-l px-2 transition-colors focus-visible:ring-2 focus-visible:outline-none",
    menu: "w-72",
    menuLabel: undefined,
    menuSeparator: undefined,
    // Beskrivningen ärver radens färg, så den förblir läsbar även på
    // menyns accentfärgade fokusrad.
    menuItem: "items-start",
    menuItemDescription: "text-[11px] leading-4 opacity-70",
    menuNote: "text-muted-foreground px-2 py-1.5 text-[11px] leading-4",
  },
} as const;

export function OpenClawPowersControl() {
  const editEnabled = useOpenClawStore((s) => s.editEnabled);
  const powersOn = useOpenClawStore((s) => s.powersOn);
  const grantedPowers = useOpenClawStore((s) => s.grantedPowers);
  const setPowersOn = useOpenClawStore((s) => s.setPowersOn);
  const setEditEnabled = useOpenClawStore((s) => s.setEditEnabled);
  const toggleGrantedPower = useOpenClawStore((s) => s.toggleGrantedPower);
  // Scope-bytet i `OpenClawChat` nollar grantet; en hydrering som hann före
  // bytet måste göras om, därför följer effekten även `scopeKey`.
  const scopeKey = useOpenClawStore((s) => s.scopeKey);
  const powers = useOpenClawPowers();
  const [builderChatId, setBuilderChatId] = useState<string | null>(null);
  // Panelen renderas aldrig under /builder (`OpenClawChat`), så samma yttest
  // som där väljer builderns stil här; utan den syns panelens klasser.
  const isBuilderSurface = usePathname()?.startsWith("/builder") ?? false;
  const classes = POWERS_CONTROL_CLASSES[isBuilderSurface ? "builder" : "panel"];

  useEffect(() => {
    const sync = () => setBuilderChatId(readActiveBuilderChatId());
    sync();
    window.addEventListener("sajtmaskin:context-updated", sync);
    return () => window.removeEventListener("sajtmaskin:context-updated", sync);
  }, []);

  useEffect(() => {
    if (!builderChatId || !editEnabled) return;
    if (!scopeKey.endsWith(`::${builderChatId}`)) return;
    void hydrateOpenClawPowersForChat(builderChatId);
  }, [builderChatId, editEnabled, scopeKey]);

  if (!editEnabled) return null;

  const activeCount =
    Number(powers.armedAutonomy) + Number(powers.quickEdit) + Number(powers.liveReview);

  const handleToggle = (event: MouseEvent<HTMLElement>) => {
    // Portaled menu items are React children of this wrapper, not DOM
    // descendants. A bubbled click from the list must not flip the switch.
    if (!event.currentTarget.contains(event.target as Node)) return;
    const next = !powersOn;
    setPowersOn(next);
    void persistOpenClawPowersForActiveChat();
    // Pressing ON grants authority, so that is the moment to re-check the env
    // gate. A stale-true answer flips editEnabled off, which withdraws the
    // grant (store) and unmounts this control.
    if (next) void revalidateEditGateOnPress(setEditEnabled);
  };

  return (
    <div
      className={cn(
        classes.wrapper,
        activeCount > 0 ? classes.wrapperActive : classes.wrapperIdle,
      )}
      onClick={handleToggle}
    >
      <button
        type="button"
        aria-pressed={powersOn}
        className={cn(classes.toggle, powersOn ? classes.toggleOn : classes.toggleOff)}
        aria-label={powersOn ? "Stäng av extra befogenheter" : "Slå på extra befogenheter"}
        title={
          powersOn
            ? "Extra befogenheter är på — välj vilka i listan"
            : "Extra befogenheter är av — Sajtagenten guidar bara"
        }
      >
        {powersOn ? <ShieldCheck className={classes.icon} /> : <Shield className={classes.icon} />}
        <span>Befogenheter</span>
        {activeCount > 0 ? (
          <span className={classes.count}>{activeCount}</span>
        ) : null}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={classes.chevron}
          aria-label="Välj extra befogenheter"
          title="Välj extra befogenheter"
          onClick={(event) => event.stopPropagation()}
        >
          <ChevronDown className="h-3 w-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className={classes.menu}
          onClick={(event) => event.stopPropagation()}
        >
          <DropdownMenuLabel className={classes.menuLabel}>
            Extra befogenheter
          </DropdownMenuLabel>
          <DropdownMenuSeparator className={classes.menuSeparator} />
          {OPENCLAW_POWER_IDS.map((id) => (
            <DropdownMenuCheckboxItem
              key={id}
              checked={grantedPowers.includes(id)}
              disabled={!powersOn}
              // Keep the menu open: picking two powers should not cost two trips.
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={() => {
                toggleGrantedPower(id);
                void persistOpenClawPowersForActiveChat();
              }}
              className={classes.menuItem}
            >
              <span className="flex flex-col gap-0.5">
                <span className="text-xs font-medium">{OPENCLAW_POWER_META[id].label}</span>
                <span className={classes.menuItemDescription}>
                  {OPENCLAW_POWER_META[id].description}
                </span>
              </span>
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator className={classes.menuSeparator} />
          <p className={classes.menuNote}>
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
