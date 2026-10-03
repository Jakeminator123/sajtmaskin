# Dependency-policy

Kanonisk policy för hur beroende-uppdateringar (dependency updates) hanteras i Sajtmaskin. Styr både Dependabot-konfigurationen ([`.github/dependabot.yml`](../.github/dependabot.yml)) och den manuella uppgraderingsrutinen.

Kärnprincip: **uttryckligt allowlistade, innehållsvaliderade patchar får använda
GitHubs native auto-merge och väntar där på samma required checks som andra
PR:ar. Allt annat tas manuellt, en domän åt gången.**

## Riskklasser

| Klass               | Hantering                                                                                                                                      | Merge                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Patch** (`x.y.Z`) | Grupperas av Dependabot i små PR:ar. Bara paket i [`config/dependabot-automerge.json`](../config/dependabot-automerge.json) kan kvalificera. | Native auto-merge efter semantisk manifest-/lockvalidering och alla branch rules; övriga patchar är manuella. |
| **Minor** (`x.Y.z`) | Små PR:ar, review-light. Låg-risk-paket grupperas (`npm-low-risk-minor`); övriga minors kommer som individuella PR:ar.                         | Kan få snabb review men aldrig en separat auto-merge-väg.                                       |
| **Major** (`X.y.z`) | **Alltid manuellt.** Dependabot version updates ignorerar majors (`ignore` på `version-update:semver-major`).                                  | Separat branch/PR, läs migration/changelog, kör riktat lokalt och invänta tung GitHub-profil.   |
| **Security**        | Security updates är undantagna från `ignore`-reglerna och kommer alltid fram, även för majors.                                                 | Samma grindar, men prioriterad handläggning.                                                    |

### protected-path-ändringar

En dependency-PR som (utöver lockfilen/`package.json`) rör runtime-kontrakt anses
inte längre vara ren och får tung GitHub-profil. Protected paths inkluderar
bl.a. `src/lib/db`, `src/lib/auth`, `src/lib/tenant`, `src/lib/gen`,
`src/lib/providers`, `src/lib/integrations`, `src/lib/logging`, `src/app/api`,
CI-filer, `migrations/**` och `env*`.

## Core-paket — kräver alltid manuell PR

Följande paket går aldrig i låg-riskspåret. De tas i egen domän-PR med migrationsläsning:

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

Dessa är exkluderade i `npm-low-risk-minor`-gruppen och finns inte i auto-merge-allowlisten ([`.github/workflows/dependabot-automerge.yml`](../.github/workflows/dependabot-automerge.yml)).

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

Dessa kan **aldrig** klassas som låg risk — **inte ens en patch**. En version-bump kräver att pinnen i `KNOWN_PACKAGES` (och för `lucide-react` även `project-scaffold.ts` + `node scripts/dev/generate-lucide-icons.mjs`) uppdateras i **samma commit** som `package.json`. Kontraktet som skyddar detta är parity-testet [`src/lib/gen/export/project-scaffold-baseline-parity.test.ts`](../src/lib/gen/export/project-scaffold-baseline-parity.test.ts): en osynkad bump gör testet rött i CI.

Därför finns samma paket inte i auto-merge-allowlisten — en Dependabot-patch på ett baseline-pinnat paket tas manuellt. Bakgrund: PR #399 (`@react-three/fiber` 9.6.0→9.6.1, patch) föll på just detta parity-test.

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
4. Kör planen och de lokala kontroller som träffad domän kräver; kör inte hela
   `test:ci` eller `build` lokalt slentrianmässigt:
   ```bash
   npm run verify:pr -- --plan
   npm run typecheck
   # välj relevanta validators ur planen, exempelvis:
   npm run scaffolds:validate
   npm run dossiers:validate-all
   ```
5. Före merge ska den tunga GitHub-profilen för aktuell head-SHA vara grön,
   inklusive `test:ci` i `quality` och det separata `build`-jobbet, följt av
   review. Aldrig major i samma PR som config-/annan städning.

## Auto-merge-kontrakt

[`dependabot-automerge.yml`](../.github/workflows/dependabot-automerge.yml) kör
endast betrodd default-branch-kod via `pull_request_target`. PR-head checkas
aldrig ut med skrivtoken eller produktionshemligheter. Controllern aktiverar
bara GitHubs native auto-merge när allt nedan är bevisat:

- basen är `preview`, avsändaren är Dependabot och uppdateringen är en patch;
- alla paket är direkta npm-beroenden i den uttryckliga allowlisten;
- bara `package.json` och `package-lock.json` har ändrats;
- manifestet ändrar endast tillåtna patchversioner;
- lockändringar ligger i de tillåtna paketens beroendeträd, kommer från npm-
  registret och introducerar ingen install-script-markering.

Vid osäkerhet, draft, major/minor, core-/baselinepaket, scriptändring eller
blandad koddiff stängs eventuell auto-merge av. GitHub
väntar sedan på strict/up-to-date required checks. Mergepushen startar samma
`push`-CI och deployment som en manuell GitHub-merge. Själva mergebegäran
använder `DEPENDABOT_AUTOMERGE_TOKEN` (fine-grained PAT eller GitHub App-token),
inte workflowets `GITHUB_TOKEN`, eftersom GitHub annars undertrycker följande
Actions-event. Tokenvärdet lagras med samma namn i både Actions secrets och
Dependabot secrets: mänskligt utlösta events läser det förra och Dependabot-
utlösta events det senare. Saknad secret är fail-closed och controllern gör
inga skrivningar.
