# B5 — sluta svälja shadcnblocks-fel tyst

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)
Status: inte startad.

## Problemet

`SHADCNBLOCKS_API_KEY` är en betald nyckel som används **automatiskt** i varje
generering — men om anropet misslyckas byter systemet tyst till en gissning, och
ingenting loggar skillnaden.

Verifierat:

- `src/lib/gen/orchestrate/resolve-base.ts:225-231` kör
  `resolveShadcnUiRecipes({ capabilities, prompt, maxRecipes: 3 })` med
  `.catch(() => [])`. Kedjan körs på **varje** request, init som uppföljning —
  sedan B8 finns ingen gren som tömmer listan i förväg.
- `src/lib/gen/data/shadcn-ui-recipes.ts:171` och `:248` har `} catch {` utan
  loggning — ett misslyckat registry-anrop blir noll recept eller ett recept utan
  källkod.
- Renderingen i `src/lib/gen/system-prompt/sections/brief-visual-media.ts:472-481`
  skickar max tre recept och skiljer inte på «recept med verklig Pro-källkod» och
  «recept med bara metadata».
- Add-panelen (Block/Bläddra/Beskriv) har **kod-default av**
  (`src/lib/builder/add-panel-feature.ts`, `src/lib/shadcn/describe-feature.ts`),
  men Vercel-env sätter `1` i production, preview och development
  (CLI-verifierat 2026-08-18, se [`docs/ENV.md`](../../../../ENV.md)). Nyckeln
  arbetar alltså oavsett om ytan är synlig — och den syns inte i loggarna.

Nettoeffekten är att ingen vet hur mycket den betalda tjänsten bidrar. Det är inte
ett buggat flöde — det är ett omätbart flöde.

## Uppgift

Gör utfallet mätbart, utan att ändra urvalet.

Krav:

- Ersätt de tysta `catch`-blocken med ett devLog/telemetri-event som skiljer minst
  tre utfall: `pro_source_loaded`, `metadata_fallback`, `fetch_failed`. Ett fel som
  inte får stoppa genereringen ska fortfarande inte stoppa den — men det ska syna.
- Fyll `origin` och `reachedPrompt` för UI Recipes i B3:s källkvitto. Utan det blir
  eventet en rad i en logg ingen läser.
- Visa aggregatet i den befintliga Backoffice-sidan
  `backoffice/pages/llm_flode_telemetry.py` (samma mönster som övriga
  `st.subheader`-sektioner). Ingen ny sida.
- **Ägarbeslut 2026-08-19 — samma utfall ska också synas här**, inte bara i
  Backoffice:
  1. `scripts/db/dump-logs.mjs` — läsbar i `--kinds=telemetry` (`meta`) och/eller
     `--kinds=errors` (kategori för `fetch_failed`). Ingen ny kind om en
     befintlig räcker. `/logg` kör redan de kindsen.
  2. [`.cursor/commands/logg.md`](../../../../../.cursor/commands/logg.md) +
     [`.cursor/skills/logg/SKILL.md`](../../../../../.cursor/skills/logg/SKILL.md)
     — rapporten ska kunna svara «Pro-källkod / metadata-gissning / hämtning
     misslyckades» för körningen.
  3. Befintlig `/admin`-yta: [`/admin/loggar`](../../../../../src/app/admin/loggar/page.tsx)
     (körningsloggar) — inte en ny adminsektion. `/admin/genereringar` är
     billing och ska inte bära det här.
- Kontrollera att flaggläget i [`docs/ENV.md`](../../../../ENV.md) fortfarande
  stämmer när mätningen görs — både `NEXT_PUBLIC_SAJTMASKIN_ADD_PANEL` och
  `SHADCNBLOCKS_API_KEY` står där som CLI-verifierade satta i alla
  Vercel-miljöer (2026-08-18). Har det driftat: uppdatera raden. Någon ny
  beskrivning av flaggan behövs inte.
- Kör ett riktigt smoketest mot ett känt block (t.ex. `hero1`) och kryssa av de två
  öppna live-testerna som `docs/plans/active/2026-08-14-block-browse-shadcnblocks.md`
  lämnade ogjorda. Är de gjorda kan planfilen vävas in i `avklarat/README.md`.

## Vad som INTE ingår

- Ändra inte `maxRecipes: 3` och inte urvalsordningen mellan officiella och
  community-recept. Det är ett separat beslut.
- Slå inte på Add-panelen som del av den här punkten — det är en produktändring
  som kräver ägarens OK (`mvp-scope-freeze.mdc`).
- Skicka aldrig nyckeln till klienten. Item-proxyn
  (`src/app/api/shadcn/community/item/route.ts`) returnerar redan Pro-källkod till
  inloggade användare; **utöka inte** den ytan här. Åtkomstnivån på den proxade
  Pro-källkoden hör till backloggen som ett eget licens-/behörighetsärende, inte
  till den här punkten.
- Ingen ny env-flagga.

## Verifiering

- `npm run typecheck` + `src/lib/gen/data/shadcn-ui-recipes.test.ts`,
  `src/lib/shadcn/community-registry-fetch.test.ts`.
- Ett test som visar att ett trasigt registry-svar ger `fetch_failed` i loggen och
  fortfarande **inte** kraschar genereringen.
- Live-smoketest: en generering där ett Pro-block träffar, kontrollerad mot
  källkvittot.
- `npm run docs:check` + `docs:links` efter ENV-raden.

## Klart när

Loggen kan svara på hur många av de senaste genereringarna som fick riktig
Pro-källkod, och `docs/ENV.md` säger sant om vilka ytor som är påslagna i
production.
