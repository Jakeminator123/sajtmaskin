# Dependency-policy

Kanonisk policy för hur beroende-uppdateringar (dependency updates) hanteras i Sajtmaskin. Styr både Dependabot-konfigurationen ([`.github/dependabot.yml`](../.github/dependabot.yml)) och den manuella uppgraderingsrutinen.

Kärnprincip: **små, säkra, isolerade PR:ar automatiseras — tunga/riskabla uppgraderingar tas manuellt, en domän åt gången, med review.**

## Riskklasser

| Klass | Hantering | Auto-merge |
|---|---|---|
| **Patch** (`x.y.Z`) | Grupperas av Dependabot i små PR:ar (`npm-production-patch`, `npm-development-patch`). | Kvalificerad för auto-merge **om** Dependabot är författare **och** CI är grön **och** inga protected-path-ändringar **och** paketet inte är ett core-paket (se nedan). |
| **Minor** (`x.Y.z`) | Små PR:ar, review-light. Låg-risk-paket grupperas (`npm-low-risk-minor`); övriga minors kommer som individuella PR:ar. | Endast om policyn uttryckligen tillåter det **och** alla checks är gröna. Default: manuell merge efter snabb review. |
| **Major** (`X.y.z`) | **Alltid manuellt.** Dependabot version updates ignorerar majors (`ignore` på `version-update:semver-major`). | Aldrig auto-merge. Separat branch/PR, läs migration/changelog, full verifiering. |
| **Security** | Security updates är undantagna från `ignore`-reglerna och kommer alltid fram, även för majors. | Behandlas efter samma klass-tabell (patch security kan auto-mergas; major security tas manuellt men prioriterat). |

### protected-path-ändringar

En dependency-PR som (utöver lockfilen/`package.json`) rör runtime-kontrakt anses inte längre vara ren och tas ur auto-merge-spåret. Protected paths inkluderar bl.a. `src/lib/db`, `src/lib/auth`, `src/lib/tenant`, `src/lib/gen`, `src/lib/providers`, `src/lib/integrations`, `src/lib/logging`, `src/app/api`, CI-filer, `migrations/**` och `env*`.

## Core-paket — kräver alltid manuell PR

Följande paket uppgraderas **aldrig** automatiskt (inte ens patch/minor via auto-merge). De tas manuellt i egen domän-PR med migrationsläsning:

```
ai
@ai-sdk/*
next
react
react-dom
typescript
tailwindcss
@tailwindcss/*
eslint
@eslint/*
@types/node
stripe
openai
recharts
```

Dessa är exkluderade i `npm-low-risk-minor`-gruppen och blockeras i auto-merge-workflow:et ([`.github/workflows/dependabot-safe-automerge.yml`](../.github/workflows/dependabot-safe-automerge.yml)).

## Baseline-pinnade paket — kräver alltid manuell PR

Vissa paket är **hårt pinnade på exakt `major.minor.patch`** i scaffold-baseline (`KNOWN_PACKAGES` i [`src/lib/gen/autofix/dep-completer.ts`](../src/lib/gen/autofix/dep-completer.ts) och `PACKAGE_JSON`-mallen i `src/lib/gen/export/project-scaffold.ts`). Genererade projekt måste få exakt den version som plattformen kör, annars kan vendored kod (t.ex. `three-fiber-canvas`-dossiern eller `lucide-react`-ikonallowlisten) importera en API som runtime-pinnen saknar → trasig användarbuild.

Följande paket är exakt-pinnade:

```
three
@react-three/fiber
@react-three/drei
@react-three/rapier
lucide-react
```

Dessa kan **aldrig** auto-mergas — **inte ens en patch**. En version-bump kräver att pinnen i `KNOWN_PACKAGES` (och för `lucide-react` även `project-scaffold.ts` + `node scripts/dev/generate-lucide-icons.mjs`) uppdateras i **samma commit** som `package.json`. Kontraktet som skyddar detta är parity-testet [`src/lib/gen/export/project-scaffold-baseline-parity.test.ts`](../src/lib/gen/export/project-scaffold-baseline-parity.test.ts): en osynkad bump gör testet rött i CI.

Därför är samma paket blockerade i `core_regex`-blocklistan i auto-merge-workflow:et — en Dependabot-patch på ett baseline-pinnat paket labelas aldrig som `dependabot-patch-safe` och tas manuellt. Bakgrund: PR #399 (`@react-three/fiber` 9.6.0→9.6.1, patch) föll på just detta parity-test.

Samma paket är dessutom **uteslutna ur Dependabots grupperingar** (`exclude-patterns` i `npm-production-patch` och `npm-low-risk-minor` i [`.github/dependabot.yml`](../.github/dependabot.yml)) så att deras bumpar kommer som **isolerade PR:ar** i stället för att dra en "ren" grupp-PR röd. Annars skapar Dependabot varje vecka en grupp-PR som alltid går rött på parity-testet — motsatsen till låg risk (t.ex. #401 där `lucide-react`-minorn låg i `npm-low-risk-minor`-gruppen).

## Manuell månadsrutin

En gång i månaden (eller vid behov), kör en riktad uppgraderingsomgång:

1. Inventera:
   ```bash
   npm outdated
   npm audit
   ```
2. Välj **en domän åt gången** — blanda inte domäner i samma PR:
   - **AI SDK** — `ai`, `@ai-sdk/*`, `openai`
   - **Next/React** — `next`, `react`, `react-dom`
   - **TS/ESLint** — `typescript`, `eslint`, `@eslint/*`, `@types/node`
   - **Styling** — `tailwindcss`, `@tailwindcss/*`
   - **Billing** — `stripe`
   - **Charts** — `recharts`
3. Egen branch + egen PR per domän. Läs relevant migration guide / changelog.
4. Full verifiering innan merge:
   ```bash
   npm run typecheck
   npm run test:ci
   npm run scaffolds:validate
   npm run dossiers:validate-all
   npm run build
   ```
5. Merge manuellt efter grön CI och review. Aldrig major i samma PR som config-/annan städning.

## Auto-merge — förutsättning (branch protection)

Auto-merge (`gh pr merge --auto`) är **säkert bara om** `master` kräver gröna status checks innan merge. Sedan 2026-07-08 har rulesetet **"Protect master"** både PR + 1 godkännande + code owner review **och required status checks** (`quality`, `backoffice-tests`, `schema-drift`). Auto-merge-åtgärden i workflow:et är ändå **avstängd som default** (bakom repo-variabeln `DEPENDABOT_AUTOMERGE_ENABLED`) — förutsättningen (required checks) är nu uppfylld, men själva på-slaget är ett separat medvetet val; i default-läge sätter workflow:et bara label/metadata på kvalificerade patch-PR:ar.

För att slå på auto-merge på riktigt:

1. ~~Lägg till **required status checks** (minst CI-jobben `quality`, `backoffice-tests`, `schema-drift`) i rulesetet "Protect master".~~ ✅ Gjort 2026-07-08.
2. **Innan** on-switchen är säker återstår två saker som `gh pr merge --auto` INTE gör själv:
   - **Bot-fynd-sweep/settling:** `--auto` mergar så fort review + required checks är uppfyllda, men Codex/VADE-fynd kan landa minuter efter grönt CI (se `pr-bot-findings-sweep.mdc`). Utan automatiserad sweep i workflow:et kan otriagerade sena fynd auto-mergas.
   - **Protected-path-filter:** klassificeraren kollar bara patch + core-paket-namn, inte "inga protected-path-ändringar" — en `github-actions`-patch (t.ex. `actions/checkout`) ändrar `.github/workflows/*` men passerar. Lägg ett changed-files/protected-path-filter först.
3. Sätt repo-variabeln `DEPENDABOT_AUTOMERGE_ENABLED = true` **först när** ovanstående är på plats.

Required checks stänger CI-verifierings-delen av false-green-risken, men on-switchen ska stå kvar **av** tills sweep- och protected-path-gaten finns (loggat i `BUG-SWARM-BACKLOG.md`).
