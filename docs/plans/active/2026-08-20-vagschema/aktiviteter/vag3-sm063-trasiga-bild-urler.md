# Våg 3 — `SM-063`: genererade sajter pekar på bilder som inte finns

Backlograd: `SM-063` (Aktiv kö, P2, öppen bug)
Beror på: inget. Blockerar: inget.
Ägda filer: `src/lib/gen/validation/project-sanity.ts`,
`src/lib/utils/image-validator.ts`,
`src/app/api/engine/chats/[chatId]/validate-images/route.ts`.

## Det verifierade fyndet

Postchecken rapporterar `broken_image` (`complete && naturalWidth <= 0`) och
`http_error` 404 på samma chat. Generatorn skriver alltså `src`-attribut mot
assets som aldrig materialiseras. I dumpen `d42ca2fd`: 4 `images` + 2
`broken_image`. Signaturer `51fd32dbcccb`, `b541c288de0e`, `3f22d3bd605d`.

Detektionen finns och fungerar — men backloggens radankare har glidit:
`broken_image` ligger nu på `product-postcheck.ts:362-370` och `http_error` på
`:646-648`.

Det viktiga fyndet är **var luckan sitter**. Den befintliga bildvalideringen ser
inte det här fallet:

```
src/lib/utils/image-validator.ts:204-205
function isExternalImageUrl(url: string): boolean {
  if (!url || url.startsWith("data:") || url.startsWith("/") || url.startsWith(".")) return false;
```

Den hanterar bara `http(s)`-URL:er: HEAD/GET-kontroll, Unsplash-sökning för
Unsplash-hostar, annars byte till `/api/placeholder?...`
(`:324-326`, `:525-536`). Den **byter** URL, den droppar aldrig `src`. Anropas
från `POST .../validate-images` (`route.ts:49-53`, `autoFix` default `true`) via
`runPostGenerationChecks` (`src/lib/hooks/chat/post-checks.ts:367-372`).

Rot-relativa påhittade assets — `/images/hero-sky.jpg` och liknande, som är just
det `SM-063` beskriver — fångas i stället av
`collectDanglingStaticAssetReferences`
(`src/lib/gen/validation/project-sanity.ts:342-371`). Den **varnar bara**:
`severity === "warning"`, `valid === true` (test `project-sanity.test.ts:141-159`).
Ingen skriver om något.

Backloggens ägarformulering («bildvalideringen i autofix-kedjan») pekar alltså på
`/validate-images`-steget, som per konstruktion aldrig tittar på rot-relativa
paths. Det finns ingen fixer i `src/lib/gen/autofix/` för saknade assets;
`media-alias-fixer.ts` hanterar bara läckta `{{MEDIA_n}}`/`{{URL_n}}`.

## Uppgiften

Låt ett rot-relativt `src` som inte finns i projektet bli åtgärdat i stället för
bara varnat.

1. Använd `collectDanglingStaticAssetReferences` som källa — den vet redan vilka
   referenser som är dinglande. Bygg inte en andra detektor.
2. Byt referensen mot scaffoldens placeholder-väg (samma
   `/api/placeholder`-mönster som `image-validator` redan använder för döda
   externa URL:er) eller droppa `src`. Välj **en** och motivera i PR-bodyn.
   Placeholder är att föredra: en `img` utan `src` ger nya postcheck-fynd.
3. Koppla in det i en väg som faktiskt körs på genererade sajter. Enklast är att
   låta `/validate-images`-steget även ta emot de rot-relativa fynden, så
   autofix-punkten blir en och inte två.

## Gränser

- Ändra **inte** postcheckens detektion eller severity. Fyndet är rätt; det är
  åtgärden som saknas.
- Rör inte `isExternalImageUrl`-semantiken för externa URL:er. Den vägen fungerar.
- Bygg ingen ny crawl, ingen ny nätverksrunda och ingen bildgenerering.
- Rör inte `media-alias-fixer.ts` — det är en annan klass av problem.
- Lägg ingen ny UI-yta som visar «bild ersatt». Loggkategorin räcker.

## Klart när

- Ett test: ett genererat projekt med `<img src="/images/hero-sky.jpg">` och
  ingen sådan fil → referensen är omskriven till placeholder (eller borttagen)
  efter autofix-steget.
- Ett test: en `src` som **finns** i projektet lämnas orörd.
- Externa URL:er beter sig oförändrat; befintliga `image-validator`-tester gröna.
- `npm run typecheck` +
  `npx vitest run src/lib/gen/validation src/lib/utils src/lib/hooks/chat` gröna.

## Agentprompt

> Du är Builder i Sajtmaskin. Utgå från origin/master. Läs
> `docs/plans/active/2026-08-20-vagschema/00-master-plan.md` (agentkontraktet)
> och sedan den här filen.
>
> Uppgift: `SM-063`. Genererade sajter pekar på rot-relativa bilder som aldrig
> materialiseras; postchecken rapporterar `broken_image` + 404.
> `collectDanglingStaticAssetReferences` upptäcker dem redan men bara varnar, och
> `image-validator` tittar per konstruktion enbart på externa `http(s)`-URL:er.
> Låt de dinglande rot-relativa referenserna faktiskt åtgärdas — helst genom att
> byta till scaffoldens placeholder i det befintliga `/validate-images`-steget.
>
> Ändra inte postcheckens detektion eller severity, inte semantiken för externa
> URL:er, och bygg ingen ny detektor, crawl eller UI-yta.
>
> Verifiering: `npm run typecheck`,
> `npx vitest run src/lib/gen/validation src/lib/utils src/lib/hooks/chat`.
>
> EN PR mot master, inte draft. Bugbot-pass på egen diff, sign-off-kommentar
> innan `merge:ready`. Du mergar inte. Rör inte `BUG-SWARM-BACKLOG.md`.
