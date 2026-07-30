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

```text
… Mer
├── Projekt
│   └── Spara projekt
├── Inställningar
│   ├── Scaffold          (flyttad: låg tidigare som egen sub direkt i Mer)
│   ├── Tema              (flyttad: låg i "Avancerat"-popovern vid chatinputen)
│   ├── Modell            (flyttad: låg som egen knapp i headern)
│   └── Generering / Inmatning / Instruktioner   (befintliga, oförändrade)
└── Importera och exportera
    ├── GitHub
    │   ├── Importera
    │   └── Exportera till GitHub
    └── Ladda ner som ZIP     ← se Ö2
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

### Steg 1 — Tema flyttas från chatinputen till headern (N1)

1. Läs tema-blocket i `ChatInterface.tsx` (~763–801) och kartlägg vilka props och
   vilket state temaväljaren behöver (värde, `onChange`, etiketter).
2. Lyft det state/prop-paret till samma ägare som redan matar `BuilderHeader`
   (följ hur `selectedModelTier` / `onSelectedModelTierChange` trådas — samma väg).
3. Rendera temaväljaren som `DropdownMenuSub` **inuti** `Inställningar`-subbens
   `DropdownMenuSubContent`.
4. Ta bort temaknappen ur "Avancerat"-popovern. Kontrollera att popovern har kvar
   meningsfullt innehåll (plan-delen) — är den tom efter flytten, ta bort hela
   popovern i stället för att lämna en tom knapp.
5. Sätt samma spärr som syskonen: `disabled={isConfigLocked}`.

### Steg 2 — Scaffold blir sub-sub under Inställningar (N1)

1. Flytta hela `DropdownMenuSub`-blocket 379–418 in i `Inställningar`-subbens
   content, ovanför de befintliga grupperna.
2. Behåll `disabled={isConfigLocked}` på sub-triggern.
3. Uppdatera `aria-label`/`title` på **Mer**-knappen (rad 345–346 nämner
   "scaffold, inställningar" som separata ting).

### Steg 3 — Modellväljaren flyttas in (N2)

**Läs Ö1 i masterplanen först** — flytt eller genväg är ett ägarbeslut.

1. Flytta menyinnehållet 296–330 (label "Byggmodell", hjälp-tooltip,
   `DropdownMenuRadioGroup` över `MODEL_TIER_OPTIONS`) till en `DropdownMenuSub`
   under `Inställningar`.
2. **Rädda tooltip-innehållet.** Dagens trigger-tooltip (rad 290–293) bär två
   saker: vald byggmodell **och** `assistStatusSummary` (prompt-assist-status).
   Försvinner triggern försvinner den enda ytan där assist-statusen syns.
   Lägg den som en `DropdownMenuLabel` eller hjälprad inne i den nya subben.
3. **Headern tappar den enda synliga indikatorn på vald profil.** Antingen
   behålls en kompakt etikett i headern, eller så accepteras att profilen syns
   först ett klick in. Beslut = Ö1.
4. Behåll `disabled={isConfigLocked}`.

### Steg 4 — GitHub-gruppen (N3)

1. Skapa en `DropdownMenuSub` med etiketten **GitHub** under labeln
   "Importera och exportera".
2. Flytta in importsteget (632–641) och exportsteget (658–667).
3. **Namnkrock:** importvalet heter "Importera (GitHub eller ZIP)" och hanterar
   båda källorna. Under en GitHub-rubrik blir det missvisande. Välj ett:
   - döp om till "Importera" inne i subben (enklast, men ZIP-importen göms under GitHub), eller
   - låt importvalet ligga kvar platt och ha **bara** export under GitHub.
   Lyft frågan till ägaren om du är osäker — det är en ren produktfråga.
4. "Ladda ner som ZIP" (642–657): se Ö2.
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

Manuellt i buildern: öppna Mer → Inställningar och bekräfta att Scaffold, Tema
och Modell går att nå och att valen slår igenom på nästa generering. Verifiera
att allt är låst (gråat) medan en generering pågår.

## Klart när

- Headern har inga lösa Modell-/Scaffold-kontroller kvar.
- "Avancerat"-popovern har ingen temaknapp (och är borttagen om den blev tom).
- GitHub-valen ligger under en gemensam undermeny.
- Ö1 och Ö2 är besvarade och besluten står i denna fil.
