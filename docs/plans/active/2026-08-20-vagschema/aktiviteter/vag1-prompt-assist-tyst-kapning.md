# Våg 1 — Prompt-assist kapar ett färdigt utkast tyst

Backlograd: `SM-065`
Beror på: inget. Blockerar: inget.
Ägda filer: `src/lib/builder/prompt-assist-pre-send.ts`, `src/app/api/ai/prompt-assist/route.ts` + deras tester.

## Det verifierade fyndet

`#1053` gjorde två av tre saker rätt. Routen sätter nu
`PROMPT_REWRITE_MAX_OUTPUT_TOKENS = 3_072`, och en modell som slår i tokentaket
ger fail-closed: `finishReason === "length"` → HTTP 502 `rewrite_output_limit`
(`route.ts:55-65`).

Det tredje fallet är kvar. En modell som avslutar **normalt** men skriver mer än
`PROMPT_REWRITE_MAX_CHARS` (8 000) får sin text skuren och returnerad som en
lyckad omskrivning:

```
src/lib/builder/prompt-assist-pre-send.ts:65-75
function clampRewriteText(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= PROMPT_REWRITE_MAX_CHARS) return trimmed;
  ...
  return trimmed.slice(0, end).trimEnd();
}
```

`parsePromptAssistResponse` använder den för både JSON-`.text` och rå prosa, och
routen svarar 200 så länge den klippta strängen är icke-tom. Användaren får
tillbaka ett utkast som slutar mitt i en tanke, utan att något säger att det
kapats. Det är samma klass som resten av kön: systemet får misslyckas, men aldrig
ljuga.

Testlåset `prompt-assist-pre-send.test.ts:63-70` («clamps oversized rewrites»)
låser dagens beteende och ska ändras med fixen.

## Uppgiften

Gör det tredje fallet lika ärligt som de andra två. En omskrivning som inte får
plats ska **inte** skrivas tillbaka i rutan som om den var färdig.

Två godtagbara utfall — välj ett och motivera det i PR-bodyn:

1. **Fail closed som tokentaket.** Överskrider den rensade texten taket: svara
   502 med en egen stabil `errorCode` (skild från `rewrite_output_limit` så
   loggarna kan skilja fallen). Klienten behåller användarens originalutkast.
2. **Ärlig kapning.** Returnera 200 men bär med en explicit flagga
   (t.ex. `truncated: true`) som klienten visar, och kapa på en meningsgräns.

Alternativ 1 är enklare att bevisa och matchar det som redan gäller för
tokentaket. Väljer du 2 måste klientytan faktiskt visa flaggan — annars är det
samma tysta kapning med extra steg, och då är det ingen fix.

## Gränser

- Ändra inte `PROMPT_ASSIST_DRAFT_MAX_CHARS`-kontraktet för **indata** (zod i
  `route.ts:21`). Det är en annan grind och den fungerar.
- Höj inte `PROMPT_REWRITE_MAX_OUTPUT_TOKENS`. Kostnadstaket är avsiktligt.
- Ingen ny UI-yta. Väljer du alternativ 2: återanvänd befintlig toast/felyta i
  chattinputen, lägg inte till en ny badge eller statusrad (MVP-biasen).
- Rör inte Deep Brief-vägen (`/api/ai/brief`). Prompt-assist är knappen bredvid
  Plan, inte Deep Brief.

## Klart när

- Ett test låser att en normal-avslutad output över taket **inte** returneras som
  en tyst lyckad omskrivning.
- Det befintliga clamp-testet är ersatt, inte bara borttaget.
- `finishReason === "length"` beter sig oförändrat (502) och har kvar sitt test.
- `npm run typecheck` + `npx vitest run src/lib/builder src/app/api/ai` gröna.

## Agentprompt

> Du är Builder i Sajtmaskin. Utgå från origin/master. Läs
> `docs/plans/active/2026-08-20-vagschema/00-master-plan.md` (agentkontraktet)
> och sedan den här filen.
>
> Uppgift: Prompt-assist-routen returnerar i dag en tyst kapad omskrivning med
> HTTP 200 när modellen avslutar normalt men skriver mer än 8 000 tecken. Gör det
> fallet ärligt — antingen fail closed som tokentaket redan är, eller en explicit
> flagga som klienten faktiskt visar. Motivera valet i PR-bodyn.
>
> Rör inte indatataket, tokentaket eller Deep Brief-vägen. Lägg ingen ny UI-yta.
> Ersätt det befintliga clamp-testet med ett som låter det nya beteendet.
>
> Verifiering: `npm run typecheck`,
> `npx vitest run src/lib/builder src/app/api/ai`.
>
> EN PR mot master, inte draft. Bugbot-pass på egen diff, så många omgångar som
> behövs; sign-off-kommentar innan `merge:ready`. Du mergar inte. Rör inte
> `BUG-SWARM-BACKLOG.md`.
