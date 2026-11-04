"use client";

import { createContext, useContext } from "react";

/**
 * Var Sajtagentens rader och kort renderas. `panel` = den flytande mörka
 * panelen på landnings- och kampanjsidor; `builder` = builderns gemensamma
 * chatt, som följer builderns tematokens och shadcn-komponenter.
 *
 * Styr bara markup och klasser, aldrig beteende: handlers, effekter och
 * villkor för vilka kort som visas är desamma i båda lägena.
 */
export type OpenClawAppearance = "panel" | "builder";

const OpenClawAppearanceContext = createContext<OpenClawAppearance>("panel");

/**
 * `OpenClawMessage` sätter värdet från sin `appearance`-prop så att korten
 * under raden ärver det. Utan provider gäller panelen, precis som förut.
 */
export const OpenClawAppearanceProvider = OpenClawAppearanceContext.Provider;

export function useOpenClawAppearance(): OpenClawAppearance {
  return useContext(OpenClawAppearanceContext);
}
