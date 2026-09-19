# B — import- och publiceringsinstall: sammanhängande paketträd

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)
Status: inte startad.
Typ: **verify/export-kontrakt**, inte «lägg `--force` på Vercel».

## Problemet (observation)

Importerad v0-mall (`edit_kind=imported_repo`, template `ONoAgsMmNOt`) bar i
både v1 och v2:

| paket | sparad |
|---|---|
| `next` | `14.2.25` |
| `react` / `react-dom` | `^19` |
| `@types/react` / `@types/react-dom` | `^18` |

npm på Vercel valde React 19.3.0. Next 14.2.25 kräver `react@^18.2.0`.
`npm install` dog med ERESOLVE innan `next build`.

Fly-previewen såg samma konflikt, föll till `--legacy-peer-deps` och startade.
Det är förbikoppling, inte kompatibilitet.

`build-exportable-project.ts` har `verbatimRepo` för importerade repon: mallens
egna versioner bevaras. Vanliga scaffold-normaliseringar för *nygenererade*
sajter räddar alltså inte den här vägen.

Ett observerat projekt räcker inte för att kalla felet unikt. Samma
mallklass kan hamna här igen.

## Redan på plats

- Verbatim-export för imported repo (medvetet).
- Preview-host fallback till legacy-peer-deps (medvetet, för att visa något).
- Deploy-pre-fixer la till saknade deps och markerade `page.tsx` client —
  rörde inte React/Next-paret (runtime 15:09:53Z).

## Gör

### B1 — detektera inkompatibelt träd

Vid import *och* före publicering: fånga åtminstone Next-major vs React-major
(peer som npm sen ERESOLVE:ar). Signaturen från incidenten är
`next@14` + `react@^19`. Lås testdata mot den `package.json`:en.

### B2 — preview-success ≠ publish-ready

Om runtime bara startade efter `--legacy-peer-deps` (eller motsvarande
förbikoppling) är det en **quality-warning som blockerar publicering**, inte
ett grönt kvitto. Användaren ska se att preview kan ljuga om install.

### B3 — sammanhängande träd, sedan strict install

Välj *en* sammanhängande resolution (bumpa Next-linjen *eller* pinna React 18
*eller* avvisa importen) efter att resterande peers i samma `package.json`
kartlagts. Inte `--force`. Inte bara sänka `react` och hoppas.

Verifiera med en install **utan** `--legacy-peer-deps` i samma anda som
Vercel-bygget. Preview-fallback får finnas kvar för visning, men den får
inte vara publiceringsgrinden.

Behåll verbatim-kontraktet som default för importerade filer. Undantaget är
just detect + antingen avvisa, eller en explicit, testad träd-reparation som
användaren kan se.

## Inte B

- Göra legacy-peer-deps till Vercel-default.
- Byta Sajtmaskins egen Next/React-baseline i onödan.
- Påstå att v2-follow-up:en skapade konflikten — den fanns i v1.
