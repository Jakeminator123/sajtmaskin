# Våg 2 — Next-HMR-kontraktet kan aldrig fånga en drift i CI

Skuldrad (inte Aktiv kö): testskuld, residual efter `SM-062` / `#1064`.
Beror på: inget. Blockerar: inget.
Ägda filer: `preview-host/scripts/test-preview-proxy-contract.mjs`,
`preview-host/package.json`, `.github/workflows/ci.yml`.

## Det verifierade fyndet

`#1064` fixade symptomet: Next 16.3 döpte om HMR-sökvägen till `/_next/hmr` och
preview-proxyn plus postchecken matchar nu både det nya och de äldre
webpack/turbopack-namnen. Fixen är korrekt.

Bevakningen finns däremot inte. Kontraktstestet som läser **installerade** Next
och bevisar att sökvägen fortfarande stämmer skippar sig självt när `next` inte
kan resolvas:

```
preview-host/scripts/test-preview-proxy-contract.mjs:21-31
function assertInstalledNextViewerContract() {
  try {
    require.resolve("next/package.json");
  } catch (error) {
    if (error?.code === "MODULE_NOT_FOUND") {
      // `preview-host-guards` intentionally installs only this standalone
      // package. ...
      console.log("  SKIP  installed Next source contract (standalone preview-host)");
      return;
```

HMR-assertionen ligger efter den returnen (`:64-68`).
`preview-host/package.json:19-22` har bara `acorn` och `http-proxy` — ingen
`next`. CI-jobbet `preview-host-guards` (`.github/workflows/ci.yml:413-421`) kör
`npm install` i `preview-host` och sedan `npm run test:guards`; inget steg
installerar Next. Root-jobbet `quality` har Next men kör inte
`test:proxy-contract`.

Skippen är alltså inte «ibland» — den är **alltid** i CI. Nästa Next-major kan
byta sökvägen igen och ingen grind ser det. Det som fortfarande körs är
host-matchern `isHmrPath("/chat_1/_next/hmr?id=abc")`
(`test-runtime-guards.mjs:498-499`), vilket bara testar vår egen regex mot vår
egen förväntan — inte mot Next.

## Uppgiften

Ge kontraktet ett CI-fönster, utan att göra `preview-host` beroende av Next i
runtime.

Välj **en** väg och motivera den i PR-bodyn:

1. **Kör kontraktet i root-jobbet.** `quality` har redan `next` installerat via
   `npm ci`. Lägg ett steg som kör `preview-host`s `test:proxy-contract` från
   repo-roten där `require.resolve("next/package.json")` lyckas.
2. **Egen smal lane.** Ett litet CI-jobb som installerar `preview-host`-deps
   **plus** `next` (samma version som roten deklarerar) och kör kontraktet.

Väg 1 är billigare och lägger inte till en andra Next-installation. Oavsett väg:
skippen ska bli **omöjlig** i CI, inte bara osannolik. Låt gärna skriptet kunna
köras i ett strikt läge (flagga eller env) där en saknad `next` är ett fel i
stället för en skip — då kan CI kräva den varianten medan lokal
standalone-körning behåller skippen.

## Gränser

- Lägg **inte** `next` som runtime-dependency i `preview-host/package.json`.
  Poängen med den standalone-paketeringen är att preview-VM:en är liten.
- Ändra inte HMR-matchningen eller proxyn. `#1064` är rätt.
- Bygg inget nytt workflow-lager: en `.github/workflows/ci.yml` finns, håll dig i
  den.
- Gör inte det nya steget till en required check i GitHub-rulesetet. Det är
  ägarens beslut — nämn i PR-bodyn om du tycker att det borde bli det.

## Klart när

- CI kör HMR-kontraktet mot en faktiskt installerad Next, och en medvetet felaktig
  förväntan i skriptet får jobbet att fela (visa det: kör en gång med en trasig
  regex lokalt och rapportera utfallet).
- Skippen finns kvar för lokal standalone-körning, men kan inte inträffa tyst i
  CI.
- `preview-host/package.json` har fortfarande bara sina två runtime-deps.
- `npm run typecheck` grön; `cd preview-host; npm run test:guards` grön.

## Agentprompt

> Du är Builder i Sajtmaskin. Utgå från origin/master. Läs
> `docs/plans/active/2026-08-20-vagschema/00-master-plan.md` (agentkontraktet)
> och sedan den här filen.
>
> Uppgift: `preview-host/scripts/test-preview-proxy-contract.mjs` hoppar över
> Next-källkontraktet (inklusive `/_next/hmr`-assertionen) när `next` inte kan
> resolvas, och `preview-host` har inte Next som beroende. I CI skippas det
> därför alltid — bevakningsfönstret finns inte. Ge kontraktet en CI-lane, helst
> genom att köra det i root-jobbet där `npm ci` redan installerat Next.
>
> Lägg inte `next` som runtime-dependency i `preview-host/package.json`. Ändra
> inte HMR-matchningen eller proxyn. Gör inte steget till required check — nämn
> det som förslag i stället.
>
> Verifiering: `npm run typecheck`, `cd preview-host; npm run test:guards`, plus
> ett bevis att jobbet failar när förväntan är fel.
>
> EN PR mot master, inte draft. Bugbot-pass på egen diff, sign-off-kommentar
> innan `merge:ready`. Du mergar inte. Rör inte `BUG-SWARM-BACKLOG.md`.
