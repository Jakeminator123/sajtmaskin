"use client";

/**
 * Sparad layout för Kuben (position, storlek, kortens rektanglar, läge).
 * Versionerad nyckel; läsning är SSR-säker, try/catch-skyddad och klämmer
 * värden; skrivning är debouncad och töms vid `pagehide`.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CUBE_FACE_IDS, type CubeFaceId } from "./cube-model";
import {
  CARD_LIMITS,
  CUBE_LIMITS,
  DEFAULT_FOLDED_CARDS,
  clampSize,
  type Rect,
  type SizeLimits,
} from "./card-layout";

export const CUBE_LAYOUT_STORAGE_KEY = "sajtmaskin:builder-cube:v1";
export const CUBE_LAYOUT_WRITE_DELAY_MS = 250;

export type CubeMode = "cube" | "cards";

export interface CubeLayoutState {
  mode: CubeMode;
  cube: Rect;
  /** Sparade kortrektanglar; saknas en sida används standardplaceringen. */
  cards: Partial<Record<CubeFaceId, Rect>>;
  folded: CubeFaceId[];
  /** Z-ordning, sista = överst. */
  order: CubeFaceId[];
}

export const DEFAULT_CUBE_RECT: Rect = { x: 24, y: 24, width: 400, height: 560 };

export function defaultCubeLayout(): CubeLayoutState {
  return {
    mode: "cube",
    cube: { ...DEFAULT_CUBE_RECT },
    cards: {},
    folded: [...DEFAULT_FOLDED_CARDS],
    order: [...CUBE_FACE_IDS],
  };
}

const MAX_COORD = 20_000;

function readRect(value: unknown, limits: SizeLimits): Rect | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const nums = [v.x, v.y, v.width, v.height];
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  const size = clampSize({ width: v.width as number, height: v.height as number }, limits);
  const coord = (n: number) => Math.round(Math.min(MAX_COORD, Math.max(0, n)));
  return { x: coord(v.x as number), y: coord(v.y as number), ...size };
}

function isFace(value: unknown): value is CubeFaceId {
  return typeof value === "string" && (CUBE_FACE_IDS as readonly string[]).includes(value);
}

/** Tolka och kläm sparad data. Okänt/korrupt → null (anroparen faller tillbaka). */
export function parseCubeLayout(raw: string | null | undefined): CubeLayoutState | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const base = defaultCubeLayout();
  const cube = readRect(d.cube, CUBE_LIMITS) ?? base.cube;
  const cards: CubeLayoutState["cards"] = {};
  if (d.cards && typeof d.cards === "object") {
    for (const [key, value] of Object.entries(d.cards as Record<string, unknown>)) {
      if (!isFace(key)) continue;
      const rect = readRect(value, CARD_LIMITS);
      if (rect) cards[key] = rect;
    }
  }
  const folded = Array.isArray(d.folded) ? [...new Set(d.folded.filter(isFace))] : [];
  const orderIn = Array.isArray(d.order) ? [...new Set(d.order.filter(isFace))] : [];
  const order = [...orderIn, ...CUBE_FACE_IDS.filter((f) => !orderIn.includes(f))];
  const mode: CubeMode = d.mode === "cards" ? "cards" : "cube";
  return { mode, cube, cards, folded, order };
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readCubeLayout(): CubeLayoutState | null {
  try {
    return parseCubeLayout(storage()?.getItem(CUBE_LAYOUT_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeCubeLayout(state: CubeLayoutState): void {
  try {
    storage()?.setItem(CUBE_LAYOUT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Fullt lager eller blockerad lagring: layouten gäller bara den här sessionen.
  }
}

export function clearCubeLayout(): void {
  try {
    storage()?.removeItem(CUBE_LAYOUT_STORAGE_KEY);
  } catch {
    // ignoreras, se ovan
  }
}

type Updater = CubeLayoutState | ((prev: CubeLayoutState) => CubeLayoutState);

/**
 * Kontrollerad layout med persistens. Första renderingen (även på servern)
 * använder standardvärden; sparad layout läses i en layouteffekt, alltså före
 * första bilden, så panelen inte ritas på standardplatsen och sedan hoppar.
 */
export function useCubeLayout() {
  const [layout, setLayoutState] = useState<CubeLayoutState>(defaultCubeLayout);
  const [hydrated, setHydrated] = useState(false);
  const pending = useRef<CubeLayoutState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current) writeCubeLayout(pending.current);
    pending.current = null;
  }, []);

  useLayoutEffect(() => {
    const saved = readCubeLayout();
    // Lagring kan bara läsas efter montering (SSR); en extra rendering är priset.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setLayoutState(saved);
    setHydrated(true);
  }, []);

  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  const dirty = useRef(false);
  const setLayout = useCallback((update: Updater) => {
    dirty.current = true;
    setLayoutState(update);
  }, []);

  // Debouncad skrivning efter varje användarändring (inte efter hydrering).
  useEffect(() => {
    if (!dirty.current) return;
    dirty.current = false;
    pending.current = layout;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, CUBE_LAYOUT_WRITE_DELAY_MS);
  }, [layout, flush]);

  const resetLayout = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
    clearCubeLayout();
    setLayoutState((prev) => ({ ...defaultCubeLayout(), mode: prev.mode }));
  }, []);

  return { layout, setLayout, resetLayout, hydrated };
}
