---
status: active
owner: unassigned
created: 2026-07-30
topic: Samla builderns headerkontroller under "Mer → Inställningar" (Tema, Modell, Scaffold) och gruppera GitHub-valen i en egen undermeny
source: Observationssession 2026-07-30, noteringar N1–N3. Kodverifierat samma dag mot working tree
---

# 01 — Menykonsolidering i builder-headern

Ägaren vill ha färre lösa kontroller i headern. Tre spridda ytor ska samlas
under **Mer → Inställningar**, och import/export-valen ska grupperas.

Del av [`00-master-plan.md`](00-master-plan.md).

## Målbild

**Rättad 2026-07-31: Tema ingår inte längre här.** PR #680 flyttade
temaväljaren till Byggval-reglagen i preview-panelens välkomstläge i stället
(ägarbeslut) — se `src/components/builder/ChatInterface.tsx` (kommentaren vid
"Avancerat"-popovern) och `src/components/builder/preview-panel/PreviewPanelInitControls.tsx`.
Steg 1 nedan är därmed överspelat och ska inte göras.

```text
… Mer
├── Projekt
│   └── Spara projekt
├── Inställningar
│   ├── Scaffold          (flyttad: låg tidigare som egen sub direkt i Mer)
│   ├── Byggmodell        (flyttad: låg som egen knapp i headern)
│   └── Generering / Inmatning / Instruktioner   (befintliga, oförändrade)
└── Importera och exportera
    ├── Importera (GitHub eller ZIP)   (platt — hanterar båda källorna, Ö2)
    ├── GitHub
    │   └── Exportera till GitHub
    └── Ladda ner som ZIP              (platt, Ö2)
```

## Utgångsläge (kodverifierat 2026-07-30)

| Yta | Fil | Rad |
|---|---|---|
| `Modell: <profil>`-knapp + meny | `src/components/builder/BuilderHeader.tsx` | 275–331 (trigger 280–288, innehåll 296–330) |
| `Scaffold: <namn>` (`DropdownMenuSub`) | `src/components/builder/BuilderHeader.tsx` | 379–418 |
| `Inställningar` (`DropdownMenuSub`) | `src/components/builder/BuilderHeader.tsx` | 420–628 |
| Import/ZIP/export-items | `src/components/builder/BuilderHeader.tsx` | 631–667 |
| `Tema: <värde>` i "Avancerat"-popovern | `src/components/builder/ChatInterface.tsx` | ~763–801 |

## Steg

### Steg 1 — ÖVERSPELAT (N1), gör inte detta

**PR #680 flyttade redan temaväljaren** — men till Byggval-reglagen i
preview-panelens välkomstläge (`PreviewPanelInitControls.tsx`), inte till
headerns Inställningar som denna plan ursprungligen föreslog. Ägarbeslut
2026-07-31, dokumenterat i en kodkommentar vid "Avancerat"-popovern i
`ChatInterface.tsx`. Bygg inte en tema-sub under Inställningar.

Kvarstående delfråga från samma steg (fortfarande relevant): "Avancerat"-
popovern i `ChatInterface.tsx` innehöll tidigare både tema och "Plan"-knappen.
Efter #680:s flytt är temat borta och popovern bär bara "Plan" kvar — bedöm om
den enda-knapps-popovern är meningslöst tunn och förenkla i så fall
(motsvarande "ta bort en tom popover" i andemening, om än inte bokstavligen
tom).

### Steg 2 — Scaffold blir sub-sub under Inställningar (N1)

1. Flytta hela `DropdownMenuSub`-blocket 379–418 in i `Inställningar`-subbens
   content, ovanför de befintliga grupperna.
2. Behåll `disabled={isConfigLocked}` på sub-triggern.
3. Uppdatera `aria-label`/`title` på **Mer**-knappen (rad 345–346 nämner
   "scaffold, inställningar" som separata ting).

### Steg 3 — Modellväljaren flyttas in (N2)

**Ö1 besvarad 2026-07-31: flytta helt in.** Ingen genväg och ingen kompakt
etikett kvar i headern — ägaren accepterar att vald byggprofil syns först ett
klick in. Punkt 3 nedan är därmed avgjord, men **punkt 2 gäller oförändrat**:
`assistStatusSummary` får inte försvinna med triggern.

1. Flytta menyinnehållet 296–330 (label "Byggmodell", hjälp-tooltip,
   `DropdownMenuRadioGroup` över `MODEL_TIER_OPTIONS`) till en `DropdownMenuSub`
   under `Inställningar`.
2. **Rädda tooltip-innehållet.** Dagens trigger-tooltip (rad 290–293) bär två
   saker: vald byggmodell **och** `assistStatusSummary` (prompt-assist-status).
   Försvinner triggern försvinner den enda ytan där assist-statusen syns.
   Lägg den som en `DropdownMenuLabel` eller hjälprad inne i den nya subben.
3. Headern tappar den enda synliga indikatorn på vald profil. **Accepterat**
   (Ö1) — bygg ingen ersättningsetikett.
4. Behåll `disabled={isConfigLocked}`.

### Steg 4 — GitHub-gruppen (N3)

1. Skapa en `DropdownMenuSub` med etiketten **GitHub** under labeln
   "Importera och exportera".
2. Flytta in importsteget (632–641) och exportsteget (658–667).
3. **Namnkrocken är avgjord (Ö2, 2026-07-31): importvalet ligger kvar platt.**
   "Importera (GitHub eller ZIP)" hanterar båda källorna, så det får inte gömmas
   under en GitHub-rubrik — då blir ZIP-importen oåtkomlig för den som letar
   efter den. Under GitHub-subben ligger alltså **bara export**.
4. **"Ladda ner som ZIP" (642–657) ligger också kvar platt** (Ö2). ZIP-vägarna
   hör ihop med varandra, inte med GitHub.
5. Behåll varje items egen spärr (`isBusy`, `!chatId || !activeVersionId`) —
   flytta dem inte upp till sub-triggern, då tappas per-item-logiken.

## Risker

| Risk | Hantering |
|---|---|
| Tre nivåers nästlade Radix-menyer blir trånga på små skärmar | Testa på ≤768 px bredd; överväg `DropdownMenuSubContent` med smalare `w-*` eller att Inställningar öppnas som dialog i stället för sub på mobil |
| `assistStatusSummary` tappas tyst vid modellflytten | Steg 3 punkt 2 — verifiera att strängen fortfarande renderas någonstans |
| `isConfigLocked` glöms på en flyttad yta → konfiguration kan ändras mitt i en körning | Grep efter `isConfigLocked` i `BuilderHeader.tsx` efter ändringen och jämför antalet med före |

## Verifiering

```powershell
npm run typecheck
npx vitest run src/components/builder
npm run lint
```

Manuellt i buildern: öppna Mer → Inställningar och bekräfta att Scaffold och
Modell går att nå och att valen slår igenom på nästa generering. Verifiera att
allt är låst (gråat) medan en generering pågår.

## Klart när

- Headern har inga lösa Modell-/Scaffold-kontroller kvar.
- "Avancerat"-popovern innehåller inte en meningslös enda-knapps-popover
  (bedömt och åtgärdat 2026-07-31, se Steg 1 ovan — temat i sig lever redan i
  Byggval-reglagen sedan PR #680, inget kvar att göra med det här).
- GitHub-**exporten** ligger under en egen undermeny; import och ZIP är platta.
- `assistStatusSummary` syns fortfarande någonstans efter modellflytten.

Ö1 och Ö2 är besvarade (2026-07-31) och besluten står ovan — inget kvarvarande
ägarbeslut i denna fil.
