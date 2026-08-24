# D4 — `selected-sections` för alla nio hard-dossiers

Beror på: [D3](D3-harddossierintegration.md) bör vara mergad först, så du inte
ändrar läge och renderare i samma diff.

## Problemet

Sju av nio hard-dossiers kör `compact`. Deras `instructions.md` når därför **aldrig**
byggmodellen — bara manifestets `summary`, `envVars[].purpose`, `dependencies` och
`exposes`. Det betyder att de do-och-do-not-regler som är skrivna i
`instructions.md` inte påverkar genereringen alls för de sju.

| Läge i dag          | Dossiers                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `selected-sections` | `postgres-drizzle`, `supabase-auth`                                                                                             |
| `compact`           | `clerk-auth`, `mailchimp-newsletter`, `openai-chat`, `resend-contact-form`, `sanity-cms`, `stripe-checkout`, `vercel-analytics` |

## Uppgiften

Sätt `promptInstructionMode: "selected-sections"` på de sju, och se till att deras
`instructions.md` faktiskt har de rubriker läget plockar ur:
`When to use`, `How to integrate`, `Avoid`.

Det andra ledet är det egentliga arbetet. Läget faller tillbaka till `compact` när
inga rubriker går att extrahera — det finns ett test för det
(`falls back to compact when selected-sections has no extractable headings`). Att
bara byta läge i manifestet ger alltså **ingen effekt** för en dossier vars
`instructions.md` saknar rubrikerna. Kontrollera var och en.

## Gränser — läs 480-beslutet först

`SELECTED_SECTION_CHAR_CAP = 480` i
`src/lib/gen/system-prompt/sections/dossiers.ts` **ska inte ändras här.** Beslut
2026-08-19, registrerat i
[`docs/decisions/README.md`](../../../../decisions/README.md): taket gäller per rubrik
och inte som delad pott, för att en lång «When to use»/«How to integrate» annars
svälter ut «Avoid» — do-not-reglerna (Codex #254 P2). Att höja eller ta bort taket
«så att mer text når modellen» återinför starvation.

Detta är den fällan aktiviteten är känsligast för: när sju dossiers till får läget
kommer du att se text kapas, och det kommer att kännas som en bugg. Det är det
inte. Tycker du att 480 är fel siffra — skriv det som ett förslag i PR-bodyn med
mätning, och låt ägaren avgöra. Ändra det inte.

Flera **soft**-dossiers kör också `selected-sections` och träffar samma tak, så en
ändring av siffran har bredare yta än de nio hard.

Skriv om `instructions.md` så att det viktigaste ligger **först** under varje
rubrik i stället för att slåss mot taket. Det är den tillåtna vägen till mer signal.

## Klart när

- Alla nio hard har `selected-sections`.
- Varje av de sju nya har verifierbart extraherbara `When to use` / `How to integrate` / `Avoid` — inte bara fältet satt.
- Ett test visar att ingen av de nio faller tillbaka till `compact`.
- `SELECTED_SECTION_CHAR_CAP` är oförändrad.
- Hela verifieringslistan i [styrdokumentet](../00-master-plan.md#verifiering-per-ändring) är grön.

## Agentprompt

> Du arbetar i Sajtmaskin. Läs först `AGENTS.md`,
> `docs/contracts/dossier-system.md`, `docs/llm/dossier-selection-flow.md` och
> `.cursor/rules/workflow.mdc`. Läs sedan
> `docs/plans/active/2026-08-19-dossier-forenkling/00-master-plan.md` och den här
> filen.
>
> Uppgift: ge alla nio hard-dossiers `promptInstructionMode: "selected-sections"`.
> Sju kör `compact` i dag (`clerk-auth`, `mailchimp-newsletter`, `openai-chat`,
> `resend-contact-form`, `sanity-cms`, `stripe-checkout`, `vercel-analytics`).
>
> Det räcker inte att sätta fältet: läget faller tillbaka till `compact` när
> `instructions.md` saknar de rubriker som plockas ut (`When to use`,
> `How to integrate`, `Avoid`). Kontrollera och komplettera varje fil, och lås med
> ett test att ingen av de nio faller tillbaka.
>
> **Ändra inte `SELECTED_SECTION_CHAR_CAP = 480`.** Det är ett fattat beslut
> (2026-08-19, `docs/decisions/README.md`): taket är per rubrik för att «Avoid» inte
> ska svältas ut av en lång «How to integrate». Du kommer att se text kapas när sju
> dossiers till får läget — det är avsiktligt, inte en bugg. Vill du mer signal:
> skriv om `instructions.md` så det viktigaste kommer först under varje rubrik.
> Tycker du att siffran är fel: föreslå det i PR-bodyn med mätning, ändra det inte.
>
> Verifiering (allt måste vara grönt): `npm run dossiers:validate-all`,
> `npm run dossiers:capability-map:write`, `npm run docs:generate`,
> `npm run docs:check`, `npm run docs:links`, `npm run typecheck`,
> `npx vitest run src/lib/gen/dossiers`.
>
> Följ `.agents/skills/pr-workflow/SKILL.md`: kör `npm run verify:pr`, därefter
> ett oberoende readonly Sol-pass på slutdiffen. Lämna EN draft-PR mot `master`.
> **Merga inte.**
