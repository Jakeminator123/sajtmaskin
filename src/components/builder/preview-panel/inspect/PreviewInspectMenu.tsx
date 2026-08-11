"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Image as ImageIcon, Loader2, MessageSquarePlus, Code2, Trash2, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { InspectAction, InspectElementActions } from "@/lib/builder/inspect-element-actions";

const MENU_WIDTH = 232;
const MENU_MARGIN = 8;
const EDITOR_WIDTH = 320;

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * Placerar en flytande yta inom previewytan. Går den utanför kanten flyttas
 * den in i stället för att klippas bort.
 */
function anchorStyle(params: {
  x: number;
  y: number;
  width: number;
  height: number;
  bounds: { width: number; height: number };
}) {
  const { x, y, width, height, bounds } = params;
  const maxLeft = Math.max(MENU_MARGIN, bounds.width - width - MENU_MARGIN);
  const maxTop = Math.max(MENU_MARGIN, bounds.height - height - MENU_MARGIN);
  return {
    left: clamp(x, MENU_MARGIN, maxLeft),
    top: clamp(y, MENU_MARGIN, maxTop),
  };
}

type MenuItemProps = {
  icon: React.ReactNode;
  label: string;
  action: InspectAction<unknown> | { available: true };
  onSelect: () => void;
  disabled?: boolean;
};

function MenuItem({ icon, label, action, onSelect, disabled = false }: MenuItemProps) {
  const reason = action.available ? null : action.reason;
  const isDisabled = disabled || !action.available;
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      title={reason ?? label}
      className={cn(
        "flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-[13px] transition-colors",
        isDisabled
          ? "text-muted-foreground/60 cursor-not-allowed"
          : "text-foreground hover:bg-accent",
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0">
        <span className="block leading-tight">{label}</span>
        {reason ? (
          <span className="text-muted-foreground/80 block text-[11px] leading-tight">
            {reason}
          </span>
        ) : null}
      </span>
    </button>
  );
}

interface PreviewInspectMenuProps {
  /** Klickpunkt i previewytans koordinater. */
  point: { x: number; y: number };
  bounds: { width: number; height: number };
  /** Taggen som klickades, för menyns rubrik. */
  tag: string;
  actions: InspectElementActions;
  busy: boolean;
  canShowInCode: boolean;
  onEditText: () => void;
  onReplaceImage: () => void;
  onDeleteElement: () => void;
  onSendPointToChat: () => void;
  onShowInCode: () => void;
  onClose: () => void;
}

/**
 * Elementmenyn vid muspekaren. Åtgärder som inte går att utföra visas gråade
 * med en kort orsak — en gråad rad är ärligare än en som tystnar.
 */
export function PreviewInspectMenu({
  point,
  bounds,
  tag,
  actions,
  busy,
  canShowInCode,
  onEditText,
  onReplaceImage,
  onDeleteElement,
  onSendPointToChat,
  onShowInCode,
  onClose,
}: PreviewInspectMenuProps) {
  const labelId = useId();
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const position = anchorStyle({
    x: point.x + 4,
    y: point.y + 4,
    width: MENU_WIDTH,
    height: 210,
    bounds,
  });

  return (
    <div
      role="menu"
      aria-labelledby={labelId}
      // Previewramen fokuserar iframen vid varje mousedown i ytan. Utan stoppet
      // tappar menyn och textrutan fokus i samma klick som de öppnas.
      onMouseDown={(event) => event.stopPropagation()}
      style={{ ...position, width: MENU_WIDTH }}
      className="border-border bg-popover absolute z-40 rounded-md border p-1 shadow-xl"
    >
      <div
        id={labelId}
        className="text-muted-foreground flex items-center justify-between gap-2 px-2 py-1 text-[11px]"
      >
        <span className="truncate">Valt: {tag}</span>
        {busy ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : null}
      </div>
      <MenuItem
        icon={<Type className="h-3.5 w-3.5" />}
        label="Ändra texten"
        action={actions.editText}
        disabled={busy}
        onSelect={onEditText}
      />
      <MenuItem
        icon={<ImageIcon className="h-3.5 w-3.5" />}
        label="Byt bild"
        action={actions.replaceImage}
        disabled={busy}
        onSelect={onReplaceImage}
      />
      <MenuItem
        icon={<Trash2 className="h-3.5 w-3.5" />}
        label="Ta bort elementet"
        action={actions.deleteElement}
        disabled={busy}
        onSelect={onDeleteElement}
      />
      <div className="bg-border my-1 h-px" />
      <MenuItem
        icon={<MessageSquarePlus className="h-3.5 w-3.5" />}
        label="Skicka punkt till chatten"
        action={{ available: true }}
        disabled={busy}
        onSelect={onSendPointToChat}
      />
      <MenuItem
        icon={<Code2 className="h-3.5 w-3.5" />}
        label="Visa i koden"
        action={
          canShowInCode
            ? { available: true }
            : { available: false, reason: "Vi hittade inte elementet i sidans kod." }
        }
        disabled={busy}
        onSelect={onShowInCode}
      />
    </div>
  );
}

interface PreviewInspectTextEditorProps {
  /** Elementets rect i previewytans koordinater (följer med vid scroll). */
  rect: { x: number; y: number; width: number; height: number };
  bounds: { width: number; height: number };
  initialValue: string;
  busy: boolean;
  error: string | null;
  onSave: (next: string) => void;
  onCancel: () => void;
}

/**
 * Redigeringsrutan ligger OVANPÅ iframen, inte i kodvyn. Den positioneras via
 * elementets rect (som bron uppdaterar vid scroll) i stället för klickpunkten.
 */
export function PreviewInspectTextEditor({
  rect,
  bounds,
  initialValue,
  busy,
  error,
  onSave,
  onCancel,
}: PreviewInspectTextEditorProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fieldId = useId();

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel]);

  const width = Math.max(EDITOR_WIDTH, Math.min(rect.width, bounds.width - MENU_MARGIN * 2));
  const position = anchorStyle({
    x: rect.x,
    y: rect.y + rect.height + 6,
    width,
    height: 150,
    bounds,
  });

  return (
    <div
      onMouseDown={(event) => event.stopPropagation()}
      style={{ ...position, width }}
      className="border-border bg-popover absolute z-40 rounded-md border p-2 shadow-xl"
    >
      <label htmlFor={fieldId} className="text-muted-foreground mb-1 block text-[11px]">
        Ändra texten
      </label>
      <textarea
        id={fieldId}
        ref={inputRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            onSave(value);
          }
        }}
        rows={2}
        className="border-input bg-background text-foreground focus:border-primary w-full resize-y rounded border px-2 py-1 text-[13px] focus:outline-none"
      />
      {error ? <p className="mt-1 text-[11px] text-red-400">{error}</p> : null}
      <div className="mt-2 flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          Avbryt
        </Button>
        <Button size="sm" onClick={() => onSave(value)} disabled={busy || value === initialValue}>
          {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
          Spara
        </Button>
      </div>
    </div>
  );
}

interface PreviewInspectRegionMenuProps {
  /** Nedre högra hörnet av rektangeln, i previewytans koordinater. */
  point: { x: number; y: number };
  bounds: { width: number; height: number };
  labels: string[];
  onSendToChat: () => void;
  /** Skickar en bild av den markerade ytan. Utelämnas när bildfångst är av. */
  onSendImageToChat?: () => void;
  imagePending?: boolean;
  onClose: () => void;
}

/**
 * Panelen efter en uppdragen rektangel.
 *
 * Två åtgärder, för de beskriver olika saker: punkterna ger modellen vilka
 * element som ligger i ytan (och var i koden de bor), bilden ger den hur ytan
 * faktiskt ser ut. Det senare är det enda sättet att fråga om något man kan se
 * men inte namnge — "varför ser det här hoptryckt ut?".
 *
 * Bild-av-ytan var skjuten av ägarbeslut Ö10b (2026-07-26); beslutet är omvänt
 * 2026-08-01 på ägarens begäran.
 */
export function PreviewInspectRegionMenu({
  point,
  bounds,
  labels,
  onSendToChat,
  onSendImageToChat,
  imagePending = false,
  onClose,
}: PreviewInspectRegionMenuProps) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const position = anchorStyle({
    x: point.x + 4,
    y: point.y + 4,
    width: MENU_WIDTH,
    height: 140,
    bounds,
  });

  return (
    <div
      onMouseDown={(event) => event.stopPropagation()}
      style={{ ...position, width: MENU_WIDTH }}
      className="border-border bg-popover absolute z-40 rounded-md border p-2 shadow-xl"
    >
      <p className="text-foreground text-[12px] font-medium">
        {labels.length} element markerade
      </p>
      {labels.length > 0 ? (
        <ul className="text-muted-foreground mt-1 max-h-24 space-y-0.5 overflow-y-auto text-[11px]">
          {labels.slice(0, 8).map((label, index) => (
            <li key={`${index}-${label}`} className="truncate">
              {label}
            </li>
          ))}
          {labels.length > 8 ? <li>…och {labels.length - 8} till</li> : null}
        </ul>
      ) : (
        <p className="text-muted-foreground mt-1 text-[11px]">
          Dra en ruta över det du vill markera.
        </p>
      )}
      <div className="mt-2 flex flex-col gap-1.5">
        {onSendImageToChat ? (
          <Button
            size="sm"
            className="w-full"
            onClick={onSendImageToChat}
            disabled={imagePending}
          >
            {imagePending ? "Tar bild…" : "Skicka bild av ytan"}
          </Button>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            Stäng
          </Button>
          <Button
            size="sm"
            variant={onSendImageToChat ? "outline" : "default"}
            onClick={onSendToChat}
            disabled={labels.length === 0}
          >
            Skicka elementen
          </Button>
        </div>
      </div>
    </div>
  );
}
