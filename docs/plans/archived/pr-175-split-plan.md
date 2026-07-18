---
status: archived
owner: unassigned
created: 2026-06-24
archived: 2026-07-09
archived_note: "PR #175 stängd (CLOSED, ej mergad). De två fristående lågrisk-cherry-picksen (P1 next/font-weight-fix, P2 bild-materializer) lyftes som öppna punkter till docs/plans/active/README.md. Planen behålls i archived som bärare av den större studio-port-arkitekturbeslutet (§4/§6, P3–P8). Flyttad active→archived 2026-07-09."
topic: PR #175 (collab/chgenberg) decision + split plan
source_pr: https://github.com/Jakeminator123/sajtmaskin/pull/175
---

> Status: Archived
> Not current architecture.
> Do not use as runtime guidance.
> Replaced by: [Active plans](../active/README.md)

# PR #175 — beslutsplan: dela upp, ersätt eller stäng

## Status 2026-07-08 (verifierat)

PR #175 är **stängd** (`state: CLOSED`, ej mergad) — rekommendationen i planen är
alltså genomförd på PR-nivå. Men de två fristående lågrisk-cherry-picksen
nedan (P1, P2) är **fortfarande inte gjorda**:

- **P1 (font-weight-fix):** finns overifierat på commit `e933d2fe9` ("fix(gen):
  injicera obligatorisk weight för icke-variabla next/font-typsnitt",
  Christopher Genberg, 2026-06-20) — **inte** en ancestor till `master`. Fixen
  är fortfarande relevant (fristående, testtäckt) och väntar bara på att bli
  en egen liten PR mot dagens master.
- **P2 (bild-materializer):** ingen matchande commit hittad i historiken —
  fortfarande overifierat om den ens gjordes på en branch.

Resten av planen (P3–P8, arkitekturbesluten i §6) är oförändrad — inget
tyder på att `src/viewser/**`-studion eller BFF-routarna migrerats in separat.

## TL;DR (beslut)

**Stäng inte in #175 som ett block.** Den är `CONFLICTING`, 200 filer,
+42 636 / −524, 30+ commits och blandar fem orelaterade spår
(marketing-sajt, `src/viewser/**`-studio, BFF-route-shims, motor-ändringar,
dev-tooling). Rekommenderat: **C + B** — stäng monster-PR:n och återför värdet
som en serie små, granskbara PR:er. Bara de fristående motor-vinsterna
(next/font-weight-fix, uppladdade-bilder-i-materializern) är värda att rädda
först; resten beror på om `src/viewser/**`-studion ska bli en riktig produktyta
eller inte — det är ett **arkitekturbeslut** (se §6) som måste tas innan
UI-porten tas in.

| Alternativ | Bedömning |
|---|---|
| A. Rebasa + dela hela #175 | Avrådes. Rebas mot dagens master ger stora konflikter i fast-path/preview/route-tabs/credits, och PR:n innehåller binärer + dev-tooling som inte hör hemma i en feature-merge. |
| **B. Ersätt med små PR:er** | **Ja, för det mesta.** Plocka isär per spår nedan, var och en mot dagens master. |
| **C. Stäng + cherry-picka selektivt** | **Ja, börja här.** Cherry-picka de 2 fristående motor-fixarna direkt; stäng sedan #175 och öppna nya små PR:er för resten. |

Säkerhet: ~80 %. Verifierat mot #175:s commit-lista och fil-API (200 filer),
inte mot en faktisk rebas/konfliktkörning.

## 1. Fakta om #175

- Branch `collab/chgenberg` → base `master`. `mergeable: CONFLICTING`.
- 200 filer, +42 636 / −524. Innehåller två `merge: dra in Jakobs master`-commits
  → base-SHA är gammal och har drivit isär från dagens master.
- Stora binärer ligger i diffen: `public/Bilder/*.webp` (22 st), `public/*.mp4`
  (4 st), `public/hero-poster.webp`, `public/sajtbyggaren_logo.png`. De blåser
  upp repo-historiken och hör inte hemma i en kod-PR.
- Egen UI-kit-dubblett: `src/viewser/components/ui/*` (button/card/dialog/…)
  parallellt med repots `src/components/ui/*` (shadcn). Terminologi/arkitektur-
  krock (se `.cursor/rules/terminology.mdc`, scaffold/preview-ägarskap).

## 2. Del-inventering (vad #175 faktiskt innehåller)

| # | Del | Nyckelfiler | ~Storlek | Koppling till motorn | Relevans mot dagens master |
|---|---|---|---|---|---|
| P1 | **next/font weight-fix** | `src/lib/gen/autofix/rules/font-import-fixer.ts(+test)`, `src/lib/gen/data/google-font-registry.ts` | ~125 | Mekanisk autofix (FAS 2) | Hög — fristående buggfix, sannolikt fortfarande relevant |
| P2 | **Uppladdade bilder i materializern** | `src/lib/gen/post-process/image-materializer.ts(+test)`, `src/lib/gen/stream/finalize-version/fast-path.ts`, `finalize-version.test.ts` | ~140 | Codegen post-process + finalize | Medel — värdefull, men fast-path krockar med fast-edit-lane |
| P3 | **Marketing-sajt (root + /for/[yrke] + legal)** | `src/app/page.tsx`, `src/app/{om-oss,kontakt,produkt,cookies,...}/page.tsx`, `src/app/for/[yrke]/page.tsx`, `src/viewser/marketing/**`, `src/viewser/components/marketing/**`, `public/**` (binärer) | ~2 000 + binärer | Låg (ren frontend) | Beror på produktbeslut — byter repots `/` |
| P4 | **Studio/builder-UI-port** | `src/app/studio/page.tsx`, `src/viewser/studio-*.tsx`, `src/viewser/components/builder/**` (inkl. `floating-chat.tsx` 2 829 rader), `src/viewser/components/discovery-wizard/**`, `src/viewser/components/inspector|preview-inspector-*`, `src/viewser/components/ui/**`, `src/viewser/lib/**` | ~25 000 | Hög (parallell builder mot samma motor) | Osäker — stort arkitekturbeslut (§6) |
| P5 | **BFF / route-shims** | `src/app/api/prompt/route.ts` (401), `src/app/api/preview/[siteId]/route.ts` (224), `src/app/api/{runs,chat,scrape-site,sni-search,discovery-options,upload-asset}/route.ts` | ~1 000 | Hög — bryggar viewser→motorn | Krockar med preview-session/route-tabs/model-routing |
| P6 | **Gäst-limits dev/preview** | `src/lib/credits/server.ts`, `src/lib/project-cleanup.ts` | ~24 | Medel | Kontroversiell — sänker abuse-skydd på preview; granska separat |
| P7 | **Dev-tooling + kostnadsskydd** | `.cursor/rules/llm-cost-safety.mdc`, `scripts/dev/openclaw-autocode.sh`, `scripts/openclaw-sajtmaskin.sh`, `.gitignore` | ~200 | Ingen (lokal dev) | Låg risk — men `llm-cost-safety.mdc` är `alwaysApply`; granska ordval |
| P8 | **OpenClaw-UI-koppling** | `src/components/openclaw/OpenClawChatLazy.tsx`, `src/components/layout/cookie-banner.tsx` | ~40 | Låg | Beror på P4 |

## 3. Konfliktkarta mot nyare master

| #175-del | Krockar med (mergad master) | Varför |
|---|---|---|
| P2 fast-path | `#223` fast-edit-lane / quick-edit + preview-patch-lane | Båda rör `finalize-version/fast-path.ts`; base-SHA är före #223 |
| P5 `/api/preview/[siteId]` | `#224/#225` preview-route-tabs + preview-session-kontrakt | Olika preview-startvägar; risk för två sanningar för previewURL |
| P5 `/api/prompt` reliability-ladder (pro+brief→pro→max) | `#226/#227` model-routing (GPT-5.5/Opus 4.8) + generator-tokenbudget | Egen modellstege vs manifest-driven phase-routing — får inte bli en andra modellväljare |
| P1 font-import-fixer | ev. senare ändringar i samma fixer/registry | Smal yta, men verifiera mot dagens fil |
| P6 credits | ev. senare credits/limit-ändringar | Liten, men policykänslig |
| P4 `src/viewser/components/ui/**` | repots shadcn `src/components/ui/**` + #233/#234 (new-york-v4, version-glue) | Dubblerad UI-kit; bör återanvända befintlig, inte forka |

## 4. Rekommenderad split (ordning för 2–4 nya agenter)

> Var och en mot **dagens** `master`, egen liten branch, egen PR. Cherry-picka
> hellre per-fil/per-hunk än att rebasa hela #175.

### PR-175a — next/font weight-fix (cherry-pick P1)
- **Scope:** injicera obligatorisk `weight` för icke-variabla `next/font` som saknar den; variabla typsnitt orörda.
- **Risk:** låg. Fristående, AST/registry-baserad, testtäckt.
- **Filer:** `src/lib/gen/autofix/rules/font-import-fixer.ts(+test)`, `src/lib/gen/data/google-font-registry.ts`.
- **Verifiering:** `npx vitest run src/lib/gen/autofix/rules/font-import-fixer.test.ts`, `npm run typecheck`.
- **Env/flag:** ingen.

### PR-175b — uppladdade bilder i materializern (cherry-pick P2)
- **Scope:** låt finalize plocka `![alt](url)` ur originalprompten och mata image-materializern (de första platshållarna) i st.f. Unsplash.
- **Risk:** medel — `fast-path.ts` har sannolikt drivit isär; lös konflikt mot dagens finalize.
- **Filer:** `image-materializer.ts(+test)`, `finalize-version/fast-path.ts`, `finalize-version.test.ts`.
- **Verifiering:** `npx vitest run src/lib/gen/post-process/image-materializer.test.ts src/lib/gen/stream/finalize-version.test.ts`, `npm run typecheck`.
- **Env/flag:** kräver befintlig blob/remotePatterns; ingen ny env.

### PR-175c — dev-tooling + kostnadsskydd (P7), trimmad
- **Scope:** bara `scripts/**`-launchers + `.gitignore`-rader. **Lyft ut** `llm-cost-safety.mdc` till egen liten PR (det är `alwaysApply` och påverkar alla agenter — egen review).
- **Risk:** låg (men regel-PR:n granskas för ordval/terminologi).
- **Env/flag:** ingen.

### PR-175d — gäst-limits dev/preview (P6)
- **Scope:** höj/öppna gäst-gränser **endast** på lokal dev + `VERCEL_ENV=preview`; prod (master) oförändrad.
- **Risk:** medel (policy). Måste bevisa att produktion behåller abuse-taket.
- **Filer:** `src/lib/credits/server.ts`, `src/lib/project-cleanup.ts`.
- **Verifiering:** riktade tester + manuell kontroll av `VERCEL_ENV`-grenar.
- **Env/flag:** `SAJTMASKIN_DEV_GUEST_LIMIT` (opt-out).

### PR-175e — marketing-sajt (P3) — KRÄVER produktbeslut
- **Scope:** byt repots `/` till gatufilm-hero + legal-sidor + `/for/[yrke]`.
- **Risk:** hög (byter publik startsida). **Binärer ut ur git** — lägg `public/*.mp4`/`*.webp` i Blob/extern host, inte i repo-historiken.
- **Env/flag:** ev. feature-flag för att toggla ny vs gammal `/`.

### PR-175f… — studio/builder-UI (P4) + BFF (P5) — KRÄVER arkitekturbeslut (§6)
- **Scope:** delas vidare i: (1) `src/viewser/lib/**` + studio-backend brief, (2) discovery-wizard, (3) builder-shell + floating-chat, (4) inspector/preview-overlay, (5) BFF-routes (en route per PR).
- **Risk:** hög. Får inte införa parallell modellväljare (P5 vs phase-routing) eller andra previewURL-sanning (P5 vs preview-session-kontrakt) eller forkad UI-kit (P4 vs shadcn).
- **Env/flag:** trolig feature-flag bakom `/studio`.

## 5. Vad som bör kastas/stängas, inte räddas

- **Monster-PR:n #175 själv:** stäng efter att P1–P2 cherry-pickats. Den är inte
  en dagsfix och blir bara svårare att rebasa ju längre master rör sig.
- **`public/**`-binärerna i diffen:** ta inte in i git-historiken — flytta till
  Blob/extern host.
- **`src/viewser/components/ui/**`-dubbletten:** kasta; återanvänd repots
  `src/components/ui/**` (shadcn) när P4 portas.
- **`merge: dra in Jakobs master`-commits:** följer inte med i cherry-picks —
  bygg nya branches direkt på dagens master.

## 6. Arkitekturbeslut som måste tas före P4/P5

1. **Ska `src/viewser/**`-studion bli en riktig andra produktyta**, eller ska
   dess idéer migreras in i den befintliga `src/app/builder/**` + `src/components/builder/**`?
   En andra parallell builder mot samma motor dubblar underhåll och
   terminologi.
2. **Previews:** P5:s `/api/preview/[siteId]` måste underordna sig
   preview-session-kontraktet (en previewURL-sanning), inte konkurrera.
3. **Modellval:** P5:s reliability-ladder måste gå via manifest/phase-routing,
   inte vara en andra modellväljare.
4. **UI-kit:** en shadcn-kit för hela repot (knyter an till #233/#234).

Tills dessa är besvarade: ta in P1–P2 (+ ev. P3/P6/P7 efter egen review), och
håll P4/P5 utanför master.

## 7. Föreslagen process

1. Cherry-picka P1 → PR-175a, P2 → PR-175b (mot dagens master).
2. Öppna PR-175c/d/e efter behov, var för sig.
3. Stäng #175 med en kommentar som länkar de nya PR:erna + denna plan.
4. Ta arkitekturbesluten i §6 innan P4/P5 påbörjas; dela då P4/P5 enligt §4.
