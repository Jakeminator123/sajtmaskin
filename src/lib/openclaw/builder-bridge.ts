/**
 * Builder-brygga: uttryckliga kommandon från Sajtagenten till buildern.
 *
 * Tidigare drev agenten buildern genom DOM:en — fyllde komposerns textarea
 * och klickade den riktiga send-knappen. Det band exekveringen till ett
 * synligt fält och skrev över användarens utkast. Bryggan låter builderns
 * skal registrera sina egna funktioner (den INLINDADE `sendMessage` som
 * binder armerad continuation, avbryt och ett upptagetläge), så ett
 * byggkommando går samma väg som ett klick på Skicka utan att gå via DOM:en.
 *
 * Modul-global registrering, en builder åt gången. Kort som kör utanför
 * buildern (landning, kampanj) hittar ingen brygga och faller tillbaka till
 * DOM-vägen i `text-field-actions.ts`.
 */

import type { MessageOptions, SendMessageOutcome } from "@/lib/hooks/chat/types";

export interface BuilderBridge {
  /** Aktiv builderchatt, eller null före första bygget. */
  getChatId(): string | null;
  /** Sant när buildern kan ta emot ett utskick just nu (ingen pågående tur). */
  canSend(): boolean;
  /** Samma `sendMessage` som komposern använder (inlindad av builderns skal). */
  sendMessage(message: string, options?: MessageOptions): Promise<SendMessageOutcome>;
  /** Avbryt pågående generering. */
  cancelGeneration(): void;
}

let activeBridge: BuilderBridge | null = null;

/** Registrera builderns brygga. Returnerar avregistrering för effektens cleanup. */
export function registerBuilderBridge(bridge: BuilderBridge): () => void {
  activeBridge = bridge;
  return () => {
    if (activeBridge === bridge) activeBridge = null;
  };
}

export function getBuilderBridge(): BuilderBridge | null {
  return activeBridge;
}

export function resetBuilderBridgeForTests(): void {
  activeBridge = null;
}

export interface WaitForBuilderSendOptions {
  /** Max antal försök innan vi ger upp. */
  maxAttempts?: number;
  /** Paus mellan försök i ms. */
  intervalMs?: number;
  /** Sant → avbryt väntan (komponenten avmonterad, mandat släppt …). */
  isCancelled?: () => boolean;
}

export type WaitForBuilderSendResult =
  | { ok: true; bridge: BuilderBridge }
  | { ok: false; reason: "no_bridge" | "busy" | "cancelled" };

/**
 * Vänta tills bryggan finns och buildern är ledig. Speglar den gamla
 * «vänta på att send-knappen blir aktiv»-slingan: komposerns `disabled`
 * härleds från upptagetläget, och samma läge styr `canSend()`.
 */
export async function waitForBuilderSend(
  options: WaitForBuilderSendOptions = {},
): Promise<WaitForBuilderSendResult> {
  const maxAttempts = options.maxAttempts ?? 25;
  const intervalMs = options.intervalMs ?? 100;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (options.isCancelled?.()) return { ok: false, reason: "cancelled" };
    const bridge = activeBridge;
    if (!bridge) return { ok: false, reason: "no_bridge" };
    if (bridge.canSend()) return { ok: true, bridge };
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  if (options.isCancelled?.()) return { ok: false, reason: "cancelled" };
  return { ok: false, reason: activeBridge ? "busy" : "no_bridge" };
}
