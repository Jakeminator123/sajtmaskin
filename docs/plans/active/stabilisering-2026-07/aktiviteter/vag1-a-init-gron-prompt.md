# Agent-prompt — Våg 1-A: "Init blir grön" (A1+A2+A3, smarthet 9/10)

Kopieras rakt in i en builder-agent (cloud/grind). Reserverar `src/lib/gen/autofix/**` och `src/lib/gen/verify/**` under vågen — W2-A (repair-robusthet) startar först efter denna mergats.

---

Du är builder-agent i repot Jakeminator123/sajtmaskin (Next.js/TypeScript, LLM-sajtgenerator "own-engine"). Utgå från senaste `origin/master`, skapa branch `fix/stabilisering-vag1-init-gron`, leverera EN PR mot master. Detta är kärnpipeline (Normalize/verifier) med hög regressionsrisk — små verifierbara steg.

MISSION: Prod-sessionen 2026-07-03 (chat `cc10e7de`, 8 versioner) visade att EN felklass gör initversioner röda: modellen refererar symboler den inte importerar + skriver `<HTMLFormElement/>` som JSX. Tre av åtta versioner blockerades på `undefined-jsx-symbol` (DOM-varianten) och F3-bygget (v8) föll på `Cannot find name 'Stripe'/'Resend'/'toast'` + `<Badge>/<Button>` utan import — trots att `dom-builtin-jsx-fixer`, `ts2304-known-import-fixer` och deterministic import pre-fix (#372) alla finns i master. Ditt jobb: rotorsaka varför de inte träffade, stäng luckorna, bevisa med regressionstester byggda på prod-filerna.

LÄS FÖRST: `AGENTS.md`, `docs/architecture/code-map.md`, `docs/architecture/llm-pipeline.md`, `docs/contracts/fixer-registry.md`, `BUG-SWARM-BACKLOG.md` (rader M#jsx1, M#imp1, LucideIcon-raden). Evidens: `docs/plans/active/stort-framsteg/2026-07-03_slutrapport.md` (§3 rotorsak, §5b llm-fixer-timeout). Fil-fixturer: användarens lokala export `version-4a29c7b4.zip` innehåller v8-filträdet — be ägaren om filerna `components/contact-form.tsx`, `components/future-gear-shop.tsx`, `app/api/checkout/route.ts`, `app/api/contact/route.ts`, `app/page.tsx` om zip saknas i din miljö; annars återskapa minimala fixturer från slutrapportens fynd-lista.

NULÄGE (kodverifierat mot master 06351d53 — lokalisera via symbolnamn, radnummer kan glida):

- `dom-builtin-jsx-fixer.ts` (`<HTMLFormElement>` → `<form>`) körs i Normalize-pipeline steg 5.5 (`pipeline.ts` ~1150) OCH som pre-fix i `verifier-phase.ts` (~126–134, `applyDeterministicDomJsxFix`). ÄNDÅ blockerade `undefined-jsx-symbol` med `<HTMLFormElement/>` i prod v1/v5/v8. DOM-varianten exkluderas medvetet från import-repair (`parseUndefinedJsxSymbolFinding` i `verifier-pass.ts` ~428–444 returnerar null för DOM-detaljer) — det är rätt design (import kan inte lösa det), men då MÅSTE dom-fixen träffa före verifiern.
- `ts2304-known-import-fixer.ts`: har `Stripe` (server-route-gated, default-import), `toast`→sonner, Clerk-server-symboler, shadcn/lucide — men SAKNAR `Resend`. LucideIcon-raden i backloggen: fixern saknar `kind: "type-named"`/`import type`-emission.
- `dep-completer.ts` skannar bara BEFINTLIGA import-rader → lägger deps men aldrig import-satser (by design, ska inte ändras).
- Tier-3-gate: `resolveKnownImport` returnerar null för tier-3-moduler om inte `allowTier3` (fidelity3). v8 VAR fidelity3 — om Stripe-importen ändå inte lades är frågan om diagnostikvägen ens kördes med rätt flagga, eller om warm-tsc-diagnostiken saknades.

UPPGIFTER:

1. ROTORSAKA `<HTMLFormElement/>`-missen (M#jsx1).
   - Skriv först ett failing-test: kör prod-innehållet (contact-form.tsx med `<HTMLFormElement />`) genom HELA finalize-flödets normalize+verifier-väg (inte bara fixern isolerat) och visa var det slinker igenom. Misstankar att pröva: körordning (verifier ser en annan content-sträng än den fixade), regex-miss (självstängande vs öppen tagg, generics, whitespace), fil som inte ingår i det normaliserade settet.
   - Laga rotorsaken i den ägare som brister. Skapa INTE en ny fixer — `dom-builtin-jsx-fixer` är ägaren.
   - Utöka `KNOWN_HTML_INTERFACE_TO_TAG` med de vanligaste DOM-interfacen om luckan är mappnings-baserad (HTMLFormElement finns redan — verifiera med testet).

2. `Resend` + LucideIcon i known-import-mappningen (A2a+b).
   - `Resend` → `resolveKnownImportRaw` i `ts2304-known-import-fixer.ts`, named import från `"resend"`, server-route-gated exakt som `Stripe` (klientkomponenter ska inte få Node-SDK:n). `resend` ska redan finnas i `KNOWN_PACKAGES` i dep-completer — verifiera.
   - LucideIcon: emit `import type { LucideIcon } from "lucide-react"` (ny `kind: "type-named"` eller minsta motsvarande mekanism). Rör inte den blinda gissaren — endast diagnostikvägen.

3. v8-EVAL: hela filträdet genom deterministisk repair (A2c).
   - Ny eval-/regressionstest (mönster: fas 6-eval-sviten): mata v8-fixturerna med de fem kända fynden genom `runDeterministicImportRepair` med `allowTier3=true` + fidelity3-kontext. Förväntat efter fix: 0 kvarvarande TS2304 för Stripe/Resend/toast/Badge/Button och 0 `undefined-jsx-symbol`.
   - Om Badge/Button-fallet kräver shadcn∩lucide-disambiguering: följ befintlig `classifyShadcnLucideCollisionUsage`-mekanik.

4. ROTORSAKA varför diagnostikvägen inte träffade v8 i prod (A2d + A3/M#imp1).
   - Läs `repair-loop.ts` (~495–512: deterministisk repair före LLM) och `validate-and-fix.ts` (fas 1-flödet #363): kördes warm-tsc med diagnostik när v8 failade? Var `allowTier3` trådad från previewPolicy? Instrumentera med telemetri-FÄLT på befintliga events (ingen ny loggyta): vilka TS-koder sågs, vilka namn resolvade/inte, varför (tier3-gate? okänt namn? ingen diagnostik?).
   - Dokumentera utfallet i PR-body: antingen "lucka X stängd" eller "prod-gapet var Y, kräver Z" — M#imp1 och M#jsx1 i backloggen uppdateras (bocka av eller omklassa med ny evidens).

STOPPREGLER (ärvda från kontrollflödet):
- Inga nya `runLlmFixer`/`runLlmRepairGate`-callsites. Ingen ny fixer om befintlig ägare kan förbättras.
- Ingen ny regex-importkirurgi utan parser/tsc-kvitto; import-mutationer valideras (parse + dedupe).
- `RENDER_RISK_TS_CODES`, F3-gaten, promote-guarden, verifier-policyn (`fast-path.ts`/`policy.ts`) rörs inte.
- Tier-3-gaten får INTE luckras: `Resend`/`Stripe` ska förbli F2-blockerade (`allowTier3=false` → null).
- Unicode-regex-regeln gäller (`node scripts/dev/check-unicode-regex.mjs` om du rör regex).

SOPA FRAMFÖR EGEN DÖRR: uppdatera `docs/contracts/fixer-registry.md` + `docs/schemas/quality-gate.md` i samma PR (ersätt, stapla inte); bocka av/omklassa backlog-rader du stänger.

TESTER & VERIFIERING:
- Failing-test-först för punkt 1 (visa gapet, sedan grönt).
- v8-eval enligt punkt 3.
- Utökade `dom-builtin-jsx-fixer.test.ts`, `ts2304-known-import-fixer`-tester (Resend server vs client, LucideIcon type-import), `deterministic-import-repair.test.ts`.
- `npm run typecheck` → 0 fel · `npm run lint` → 0 fel · `npx vitest run` på `src/lib/gen/autofix/` + `src/lib/gen/verify/` + `src/lib/gen/stream/finalize-version/` → grönt.

PR-KRAV:
- Titel: `fix(normalize): stabilisering våg 1 — init-grön (HTMLFormElement determinism + known-import-luckor + v8-eval)`
- Body: rotorsaksanalys per gap (1 och 4), vilka felklasser som stängs, backlog-rader som bockas, verifieringsutfall, bug-postcheck dokumenterad (bugbot-subagent readonly-pass eller strukturerad manuell diff-review) med triage per fynd.
- Committa aldrig `.env*`, `.vercel/`, zip-filer eller secrets. Skapa inga filer under `docs/plans/`.

DEFINITION OF DONE:
- [ ] Failing-test reproducerar prod-missen; grönt efter fix; `<HTMLFormElement/>` kan inte nå verifiern som blockerande fynd
- [ ] `Resend` (server-gated) + LucideIcon type-import i diagnostikvägen; tier-3-gate intakt
- [ ] v8-eval: 0 still-failing på known-set
- [ ] Rotorsak till prod-gapet dokumenterad + telemetri-fält på plats
- [ ] M#jsx1/M#imp1/LucideIcon-raden uppdaterade i backloggen
- [ ] Docs synkade; typecheck/lint/vitest gröna; bug-postcheck dokumenterad i PR
