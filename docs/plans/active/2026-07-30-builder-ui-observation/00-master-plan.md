---
status: active
owner: unassigned
created: 2026-07-30
topic: Builder-UI-städning från en live prod-observation 2026-07-30 — menykonsolidering, statusytor under generering, chattytans layout/ikonspråk och block-galleriets miniatyrer
source: Observationssession (/logg-internet, observatörspersona) på https://sajtmaskin.vercel.app/ 2026-07-30 14:14–14:31, prompt om blåbärsplockning i Norrland. Nio noteringar (N1–N9) från ägaren, kodverifierade mot working tree samma dag. Råanteckningar i den gitignorerade `.cursor/logg-internet/runs/2026-07-30_1414.md`
---

# Builder-UI från prod-observation 2026-07-30

Nio observationer från en riktig genereringskörning i prod. Allt är **UI/UX i
buildern** — ingen pipeline-, DB- eller env-ändring. Sprängradien är liten, men
tre av raderna rör ytor som bär **status användaren måste se** (blockerare,
laddningsläge, demoläge), och där är regeln: flytta signalen, göm den aldrig.

## Uppgiftsfiler

| # | Fil | Noteringar | Beroende |
|---|---|---|---|
| 01 | [`01-meny-konsolidering.md`](01-meny-konsolidering.md) | N1, N2, N3 | fristående |
| 02 | [`02-status-under-generering.md`](02-status-under-generering.md) | N4, N6 | fristående, störst |
| 03 | [`03-chattyta-och-ikonsprak.md`](03-chattyta-och-ikonsprak.md) | N5, N7, N9 | bör tas i **en** PR (gemensamt ikonspråk) |
| 04 | [`04-block-galleri-miniatyrer.md`](04-block-galleri-miniatyrer.md) | N8 | börjar med en mätning, inte kod |

Ingen fil delar kod med en annan. Kör dem parallellt i egna worktrees om flera
agenter jobbar samtidigt (se [`agent-worktree.mdc`](../../../../.cursor/rules/agent-worktree.mdc)).

## Ordning om en enda agent kör allt

1. **04** först — den börjar med en mätning som avgör om det ens finns en bugg.
2. **01** — mekanisk, låg risk, ger snabb effekt.
3. **03** — layout + ikonspråk, medelrisk (tester låser texter).
4. **02** — störst, och den enda som kan behöva nya SSE-event.

## Ägarfrågor — alla besvarade 2026-07-31

**Inget ägarbeslut blockerar längre.** Besluten står i sin egen fil; tabellen är
index.

| # | Fråga | Beslut | Detalj |
|---|---|---|---|
| Ö1 | Modellväljaren: flytta eller duplicera? | **Flytta helt in** i Inställningar. Ingen genväg och ingen kompakt etikett kvar i headern | [01](01-meny-konsolidering.md) |
| Ö2 | "Ladda ner som ZIP" under GitHub? | **Nej — ZIP och importvalet ligger kvar platt.** Bara *export* hamnar under GitHub-subben | [01](01-meny-konsolidering.md) |
| Ö3 | Omfattar den centrerade boxen hela nedre bandet? | **Nej — bara chatten centreras.** Lansering-panelen behandlas separat, se nedan | [03](03-chattyta-och-ikonsprak.md) |
| Ö4 | Vad skulle meningen om "Bygg integrationer" ha blivit? | **Det var en fråga om vad knappen gör, inte ett krav** — besvarad 2026-07-31. Två copy-krav föll ut: knappen ska säga vilken av sina två vägar den tar och vad den kostar (Ö4a). Förslagsrundans dubbeldebitering (Ö4b) är loggad i backloggen, inte här | [03](03-chattyta-och-ikonsprak.md) |
| Ö5 | Får "Rensa preview" tas bort? | **Nej — knappen behålls**, men görs ikon-only. Kodverifierat att automatisk städning inte täcker fallet | [03](03-chattyta-och-ikonsprak.md) |

**Ö6 tillkom när Ö3 besvarades:** ägaren vill att Lansering-/blockerar-panelen tas bort eller görs mer anonym, och delegerade beslutet. Avgjort — se [03 § Del F](03-chattyta-och-ikonsprak.md#del-f--lansering-panelen-blir-diskret-ö6).

## Gemensamma spelregler för alla fyra filerna

- **Göm aldrig status för att få snyggare layout.** Blockerare, "Bygger …",
  demoläge och laddningsläge måste finnas kvar i någon synlig form. Flera av
  ytorna nedan bär sådan signal i dag, ofta med en kodkommentar som förklarar
  varför — läs kommentaren innan du flyttar något.
- **Visa aldrig en fas som inte mäts.** Repo:t har redan en fas-indikator som
  gissar utifrån väggklocka (`RepairProgressIndicator`). Bygg inte en till.
  En barometer som inte speglar riktiga event är false-green mot användaren.
- **Radbrytningar i kod driftar.** Alla rad-referenser är verifierade
  2026-07-30 mot working tree. Sök på strängen om raden inte stämmer.
- **A11y följer med.** Byts text mot ikon: `aria-label` bär namnet, `title`
  blir tooltip. Uppdatera tester i samma ändring.

## Verifiering (gäller alla filer)

```powershell
npm run typecheck
npx vitest run src/components/builder
npm run lint
```

Riktade tester per fil står i respektive dokument. Ingen av ändringarna rör DB,
env eller pipeline, så `db:schema-drift` och dossier-validering behövs inte.

## Ursprung

Sessionen kördes som observatör: ägaren pekade på element i prod och beskrev
önskat läge, agenten kodverifierade och antecknade utan att ändra något.
Råanteckningarna (N1–N9 med DOM-sökvägar och skärmbilder) ligger i
`.cursor/logg-internet/runs/2026-07-30_1414.md` — gitignorerad, stage den aldrig.
