# Agent-prompt — Fas 2: riskScore ersätter fixCount>5 (smarthet 7/10)

Kopieras rakt in i en cloud-agent. Merge-ordning i vågen: **0 → 4 → 1 → 2** (denna mergas SIST och rebasar över Fas 1 vid konflikt i `fixer-registry.ts`).

---

Du är builder-agent i repot Jakeminator123/sajtmaskin (Next.js/TypeScript, LLM-sajtgenerator "own-engine"). Utgå från senaste `origin/master`, skapa branch `feat/kontrollflode-fas2-riskscore`, leverera EN PR mot master.

MISSION: LLM-verifiern stängs idag av när den behövs som mest. Policyn "många mekaniska fixar ⇒ skippa verifiern" mäter volym, inte risk. Prod-data 14 d: deterministisk autofix ingriper i 114/115 körningar med median 18 fixar (tröskeln är 5!), 58/115 ligger över tröskeln, och verifiern — enda kontrollen som fångar 3D/JSX-strukturfel före gaten — skippas i 69 % av körningarna (41 pga heavy load). Många SÄKRA fixar är normalflöde; en RISKABEL fix är signal. Byt volym mot risk.

LÄS FÖRST: `AGENTS.md`, `docs/architecture/code-map.md`, `docs/schemas/quality-gate.md`, `docs/contracts/fixer-registry.md`. Radnummer nedan är från master 2026-07-02 — lokalisera via symbolnamn. Om ett påstående inte stämmer mot koden: följ koden och notera avvikelsen i PR-beskrivningen. OBS: Fas 1-agenten (parallell) ändrar `validate-and-fix.ts` och en registry-entry — håll dig borta från dess ytor (se reserverade filer).

NULÄGE (kodverifierat):
- Tröskeln: `src/lib/gen/stream/finalize-version/pre-phases.ts` ~rad 193: `autoFixHeavyLoad = autoFixFixCount > 5`; fixCount räknas från ETT `runAutoFix`-pass (~rad 179–190); devLog `autofix.heavy_load` ~rad 210–219.
- Skip-beslutet: `src/lib/gen/stream/finalize-version/fast-path.ts` ~rad 302–313: `verifierSkippedByHeavyLoad = autoFixHeavyLoad && verifierPolicy.run`; verifier körs med `enabled: verifierPolicy.run && !verifierSkippedByHeavyLoad`.
- Grundpolicyn: `resolveVerifierPassPolicy` (`.../verifier-phase`-området, `policy.ts` ~rad 36–73) beslutar körning utifrån deep path, repair pass, env och BuildSpec-signaler; heavy-load-overriden ligger efteråt i fast-path.
- Telemetri: `autofix_heavy_load`-varning skrivs till `engine_version_error_logs` via `persist-side-effects.ts` ~rad 190–208; verifier-skip-reason `"autofix_heavy_load"` går in i finalize-telemetrin.
- Registryt: `FIXER_REGISTRY` i `src/lib/gen/autofix/fixer-registry.ts` (~rad 81 och framåt, 53 entries; `FIXER_REGISTRY_SIZE` ~rad 703).

UPPGIFTER:

1. Riskklass per fixer.
   - Lägg fältet `risk: "safe" | "risky"` i registry-entryn (typ + alla 53 entries). Klassificeringsguide:
     - safe: use-client-markering, escape-/citat-fixar, font-fixar, kända biblioteks-importtillägg, React/same-module-dedupe, url-/asset-expand, metadata-småfixar.
     - risky: JSX-tag-mutationer (jsx-checker-familjen), cross-file-stubbar, merge-omskrivningar, dep-versionsbumpar, regex-import-kirurgi (import-validator), allt som muterar struktur över filgränser.
   - Bedöm varje fixer mot dess faktiska implementation/kommentarer, inte bara namnet. Lista klassificeringen i PR-body. Vid genuin tvekan: `risky` (konservativt).
   - Ändra INTE ordningen på entries (minimerar rebase-konflikt mot Fas 1).

2. Ersätt heavy-load-policyn med risk-policy.
   - `pre-phases.ts`: ersätt `autoFixHeavyLoad` med en risk-summering av det körda passets fixar: `{ safeFixCount, riskyFixCount, riskyFixerIds }` (fix-listan från `runAutoFix`-resultatet bär fixer-id:n — verifiera formen i `pipeline.ts`).
   - `fast-path.ts`: ersätt `verifierSkippedByHeavyLoad`. Ny regel: när `verifierPolicy.run` är sann körs verifiern ALLTID om `riskyFixCount > 0`; den får skippas endast om `riskyFixCount === 0`. Undantag: om BuildSpec/capabilities indikerar 3D (`visual-3d`/`needs3D` — hitta den kanoniska signalen i BuildSpec/policy-ytan) skippas verifiern ALDRIG via denna väg, även vid enbart säkra fixar.
   - Fall där `verifierPolicy.run` är falsk (light path, repair pass etc.) lämnas orörda — vi tvingar inte på verifiern nya vägar i denna fas; notera ev. framtida övervägande i PR-body.

3. Telemetri byts, inte staplas.
   - Sluta skriva `autofix_heavy_load`-eventet och ta bort tröskelkonstanten helt. Skriv i stället ett `autofix_risk`-event (kategori `autofix`) med `{ safeFixCount, riskyFixCount, riskyFixerIds }` på samma ställe i `persist-side-effects.ts`.
   - Verifier-skip-reason: ersätt `"autofix_heavy_load"` med t.ex. `"safe_fixes_only"`; run-forced-reason vid risky: `"risky_fixes"`. Uppdatera finalize-telemetrins fält konsekvent.
   - Läsare: uppdatera `scripts/db/control-stats.mjs` (och ev. backoffice-sidor) så nya eventet räknas; historiska `autofix_heavy_load`-rader ska fortsatt räknas i historiska fönster (mappa gammalt→nytt i läsaren, skriv aldrig gammalt).

4. Docs-synk i samma PR: verifier-policyavsnittet i `docs/schemas/quality-gate.md` + en rad i `docs/architecture/glossary.md` (safe/risky fixar). Ersätt gammal text om heavy-load-tröskeln.

STOPPREGLER:
- Rör INTE `validate-and-fix.ts`, `deterministic-import-repair.ts`, `ts2304-known-import-fixer.ts`, `react-import-consolidated.ts`, `import-validator.ts` (Fas 1 äger dem). I `fixer-registry.ts`: endast typ + `risk`-fält per entry — inga andra metadataändringar.
- Rör inte `persist-telemetry.ts`:s dossier-/deploy-fält (Fas 0) eller preview/restore-ytor (Fas 4).
- `resolveVerifierPassPolicy`:s övriga beslut (deep path, repair pass, env) ändras inte.
- F3-gate, promote-guard, `RENDER_RISK_TS_CODES` rörs inte. Inga nya `runLlmFixer`-callsites.

SOPA FRAMFÖR EGEN DÖRR: `autoFixHeavyLoad`, tröskelkonstanten, `verifierSkippedByHeavyLoad` och alla referenser (inkl. tester som asserterar dem) bort i samma PR. Inga parallella policies.

TESTER & VERIFIERING:
- Policy-tester: (a) 24 safe-fixar, 0 risky → verifier skippas (reason `safe_fixes_only`); (b) 3 safe + 1 risky (t.ex. cross-file stub) → verifier körs (reason `risky_fixes`); (c) 3D-capability + enbart safe → verifier körs; (d) `verifierPolicy.run === false` → oförändrat beteende.
- Telemetri-test: `autofix_risk`-eventets form; inget `autofix_heavy_load` skrivs.
- Uppdatera tester som refererar heavy-load (`finalize-version.test.ts` m.fl. — grep först).
- `npm run typecheck` → 0 fel · `npm run lint` → 0 fel · `npx vitest run` på berörda testfiler → grönt.

PR-KRAV:
- Titel: `feat(autofix): fas 2 kontrollflöde - riskScore ersätter fixCount-heavy-load för verifier-policy`
- Body: klassificeringstabell (53 fixers → safe/risky med enradsmotiv), policyregeln, telemetri-mappning gammal→ny, verifieringsutfall, bug-postcheck dokumenterad (bugbot-subagent readonly-pass, annars strukturerad manuell diff-review) med triage av varje fynd.
- Committa aldrig `.env*`, `.vercel/` eller secrets. Skapa inga filer under `docs/plans/`.

DEFINITION OF DONE:
- [ ] Alla 53 fixers riskklassade; typ uppdaterad
- [ ] Verifier-skip styrs av risk (safe-only ⇒ får skippas; risky ⇒ körs; 3D ⇒ aldrig skip via denna väg)
- [ ] Heavy-load-tröskel + event + skip-reason helt borta; `autofix_risk` ersätter
- [ ] control-stats/backoffice läser nytt event, historik mappas
- [ ] Docs synkade; typecheck/lint/vitest gröna; bug-postcheck dokumenterad i PR
