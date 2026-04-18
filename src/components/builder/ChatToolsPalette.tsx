"use client";

import {
  Command as CommandRoot,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ChevronDown, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import {
  CHAT_TOOL_ACTIONS,
  CHAT_TOOL_GROUPS,
  isToolActionDisabled,
  type ToolAction,
  type ToolActionAvailability,
  type ToolActionId,
  type ToolGroupId,
} from "@/lib/builder/chat-tools";

type ChatToolsPaletteProps = {
  availability: ToolActionAvailability;
  disabled?: boolean;
  onSelect: (id: ToolActionId) => void;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function ChatToolsPalette({
  availability,
  disabled,
  onSelect,
  className,
  open: controlledOpen,
  onOpenChange,
}: ChatToolsPaletteProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (controlledOpen === undefined) setInternalOpen(next);
  };

  const grouped = useMemo(() => {
    const map = new Map<ToolGroupId, ToolAction[]>();
    for (const action of CHAT_TOOL_ACTIONS) {
      const list = map.get(action.group) ?? [];
      list.push(action);
      map.set(action.group, list);
    }
    return map;
  }, []);

  const handleSelect = (id: ToolActionId) => {
    onSelect(id);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label="Öppna verktyg"
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md border border-border/60 bg-background/60 px-2.5 text-[11px] font-medium text-muted-foreground",
            "transition-colors hover:border-border hover:bg-accent hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-0",
            "disabled:pointer-events-none disabled:opacity-40",
            className,
          )}
        >
          <Wrench className="size-3" strokeWidth={1.75} />
          <span>Verktyg</span>
          <ChevronDown
            className={cn(
              "size-3 transition-transform duration-150",
              open && "rotate-180",
            )}
            strokeWidth={1.75}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={6}
        collisionPadding={12}
        className="flex w-72 flex-col overflow-hidden p-0 max-h-[min(var(--radix-popover-content-available-height),520px)]"
      >
        <CommandRoot
          loop
          className="flex flex-1 flex-col overflow-hidden"
          filter={(value, search) => {
            if (!search) return 1;
            const haystack = value.toLowerCase();
            const needle = search.toLowerCase();
            if (haystack.includes(needle)) return 1;
            return 0;
          }}
        >
          <CommandInput placeholder="Sök verktyg…" autoFocus />
          <CommandList className="!max-h-none flex-1 overflow-y-auto overscroll-contain">
            <CommandEmpty>Inga träffar.</CommandEmpty>
            {CHAT_TOOL_GROUPS.map((group) => {
              const actions = grouped.get(group.id) ?? [];
              if (actions.length === 0) return null;
              return (
                <CommandGroup key={group.id} heading={group.label}>
                  {actions.map((action) => {
                    const Icon = action.icon;
                    const inactive = isToolActionDisabled(action, availability);
                    const searchValue = `${group.label} ${action.label} ${action.id}`;
                    return (
                      <CommandItem
                        key={action.id}
                        value={searchValue}
                        disabled={inactive}
                        onSelect={() => handleSelect(action.id)}
                        className={cn(
                          "gap-2 text-[13px]",
                          inactive && "opacity-40",
                        )}
                      >
                        <Icon
                          className="size-3.5 text-muted-foreground"
                          strokeWidth={1.5}
                        />
                        <span className="truncate">{action.label}</span>
                        {action.shortcut && (
                          <CommandShortcut>{action.shortcut}</CommandShortcut>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              );
            })}
          </CommandList>
        </CommandRoot>
      </PopoverContent>
    </Popover>
  );
}
