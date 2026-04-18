# Builder Information Architecture Review

Granskar hela builderns IA: hur ytor grupperas, vilken yta äger vilken funktion, när saker flyttar mellan ytor (chat ↔ drawer ↔ header ↔ preview-chrome). Mål: en lugn, förutsägbar karta där varje funktion har EN självklar plats.

**Trigger:** Användaren säger "IA review", "information architecture", "skill IA" eller liknande.

## Instruktion

Starta **8 parallella subagenter** (`subagent_type: "explore"`, `readonly: true`). Varje agent granskar sin yta, läser relevant kod, och skriver EN `.txt`-rapport till `reviews/`.

**REGLER:**
- READ-ONLY — inga kodändringar.
- Varje rapport: max 40 rader. Lista först "Nuvarande IA" (kort), sedan "Föreslagen IA", sedan "Brott/motsägelser hittade".
- Perspektiv: "Apples sajt är en enda tankegång. Varje sida har EN roll. Inget löst brödras bland sektioner."

## Subagenter

### Agent 1 — Zon-karta (top, left, center, right, bottom)
- **Fil:** `reviews/ia-01-zone-map.txt`
- **Fokus:** Rita ASCII-karta över nuvarande builder-zoner och vilka funktioner varje zon äger. Föreslå renare zonindelning: top=identitet + publicera, center=preview, right=chat/details, bottom=status. Lista avvikelser.

### Agent 2 — Ansvarsfördelning mellan header, drawer och chat
- **Fil:** `reviews/ia-02-responsibility-split.txt`
- **Fokus:** Vilken yta äger "projekt-inställningar"? "Sidor/rutter"? "Brief/intake"? "Publicera"? Finns dubblering? Föreslå EN hemmaplats per kategori och när den får spegla sig (t.ex. publicera-knapp i header + sheet).

### Agent 3 — Progressiv avslöjning: default → hover → klick → drawer
- **Fil:** `reviews/ia-03-progressive-disclosure.txt`
- **Fokus:** Definiera vad som ska synas i fyra lager: lager 0 (alltid), lager 1 (hover/focus), lager 2 (klick = inline menu), lager 3 (drawer/sheet). Placera 15 typiska funktioner (regen, deploy, env, inspector, etc.) i rätt lager.

### Agent 4 — Tomma och laddande tillstånd
- **Fil:** `reviews/ia-04-empty-loading.txt`
- **Scope:** `PreviewPanelEmptyState.tsx`, `GenerationProgress.tsx`, chatens tomma tillstånd.
- **Fokus:** Vilka empty-states finns? Är de informativa på Apple-vis (1 rubrik, 1 mening, max 1 CTA)? Föreslå copy + layout per empty state.

### Agent 5 — Inmatning → resultat-koppling
- **Fil:** `reviews/ia-05-input-to-result.txt`
- **Fokus:** När användaren säger något i chatten, var manifesteras resultatet (preview, fil-diff, notis i status, chat-bubbla)? Finns otydliga loopar? Rita en "input → processing → feedback → artifact"-karta.

### Agent 6 — Navigerbarhet mellan rutter, versioner, filer
- **Fil:** `reviews/ia-06-navigability.txt`
- **Fokus:** Hur byter man mellan rutter? Versioner? Filer? Är varje switcher på sin plats? Föreslå konsekvent mönster: segmented control för 2–4 val, dropdown för >4.

### Agent 7 — Fel- och återhämtnings-IA
- **Fil:** `reviews/ia-07-errors-recovery.txt`
- **Fokus:** När något går fel (generation fail, preview crash, deploy reject) — vart tar felet vägen? Toast, chatbubbla, overlay? Föreslå EN policy och tydliga återhämtningsvägar ("Försök igen", "Rapportera", "Ångra senaste").

### Agent 8 — Sammanfattning: en-sides IA-karta
- **Fil:** `reviews/ia-08-one-page-map.txt`
- **Fokus:** Slå ihop ovan till en enda karta. Lista alla builder-ytor (max 12), deras ägare, innehåll, synlighet, och inre ordning. Detta dokument ska fungera som master-referens för kommande designbeslut.
