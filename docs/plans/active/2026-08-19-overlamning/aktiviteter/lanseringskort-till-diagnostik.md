# Lanseringskortet → Versionsdiagnostik

Våg 1 · Cloud · Fynd `P1-UI1` · Tar bort yta, lägger inte till

## Målet

Ägaren har sagt att Lanseringskortet ska bort. Fynden det visar finns redan i
`VersionDiagnosticsDialog`. Master monterar fortfarande kortet, och
`resolveChatCollapseStatusText` målar fortfarande publiceringsspärrar i den
nedfällda chattraden.

Det här är den ovanliga sortens ändring under MVP-bias: en **borttagen** yta,
inte en ny. Bygg inget nytt.

## Det finns ett påbörjat försök — läs det, återta det inte rakt av

Branchen `origin/wip/chat-readiness-to-diagnostics` (`fac7d720a`) innehåller ett
komplett men ofullbordat försök: 12 filer, 306 tillagda rader. Det låg
ocommitterat i en worktree i sex timmar och committades bara för att inte gå
förlorat.

**Basen är `d96acd5c7`, 44 commits bakom master.** `ChatInterface.tsx` och
`BuilderHeader.tsx` ändrades kraftigt samma dag — bland annat av
[#1038](https://github.com/Jakeminator123/sajtmaskin/pull/1038) (Prompt-assist)
och [#1048](https://github.com/Jakeminator123/sajtmaskin/pull/1048). En rak
cherry-pick river sannolikt de ändringarna.

Gör så här: läs `git diff d96acd5c7 fac7d720a` som **underlag**, börja från
färsk `origin/master` och skriv om ändringen där. Ta med det som fortfarande är
riktigt, lämna det som master redan löst.

## Vad diffen innehåller

| Del | Bedömning |
|---|---|
| Avmontera `LaunchReadinessCard` ur `shell-content.tsx` | Kärnan. Ta med |
| Ta bort `deployBlocker` ur `chat-collapse-status.ts` | Kärnan. Ta med |
| Byt OpenClaw-tipsens ytnamn till «Visa diagnostik på en version» | Följdändring. Ta med |
| Lyfta ut GitHub koppla/frånkoppla ur versionspanelen | **Orelaterat.** Eget beslut, egen PR |

Fjärde raden är scope-glidning från den ursprungliga sessionen. Ta inte med den
utan att fråga ägaren.

## Ankare

- `src/app/builder/builder-shell-content/shell-content.tsx:307-311`
- `src/lib/builder/chat-collapse-status.ts:76-99`
- `src/components/builder/readiness/LaunchReadinessCard.tsx`

## Verifiering

```powershell
npm run typecheck
npm run lint
npx vitest run src/lib/builder src/components/builder
```

Tester i `chat-collapse-status.test.ts` och kring `LaunchReadinessCard` måste
följa med. Radera inte komponentfilen i samma PR om tester hänger kvar i den —
avmontera först, städa i en andra PR.

## Gör inte

- Lägg inte till någon ny statusyta, badge, pill eller toast som ersättning.
- Ta inte med GitHub-kopplingsändringen.
- Rör inte `chat-readiness.ts` som datakälla — bara vem som renderar den.
