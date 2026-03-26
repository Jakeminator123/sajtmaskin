# PLAN 4 — Preview, sandbox, användarsajt-integrationer (K-018)

**Sammanhang (allt kvar):** [`../MASTER-ALLT-KVAR.md`](../MASTER-ALLT-KVAR.md) § 2.

**Kanonisk kritik-rad:** [`kritik-consolidated-open-items.md`](../kritik-consolidated-open-items.md) **K-018**  
**Handoff (detaljer, faser, pseudokod, fillista):** [`INPUT_GPT.txt`](../../../../INPUT_GPT.txt) i repots **rot**  
**Arkitektur-bakgrund:** [`docs/architecture/preview-and-sandbox-flow.md`](../../../architecture/preview-and-sandbox-flow.md)

---

## Syfte

Höja **preview-fidelity** för **användarnas genererade** sajter: `npm run dev`-klass i sandbox, **samma upplevelse i `iframe`**, och **förutsägbar** hantering när genererad kod vill ha **integrationer** (API-nycklar, auth, DB, m.m.) — utan att användaren drunknar i intern plattformsinformation.

**Produktintent (kanonisk):** [`../MASTER-ALLT-KVAR.md`](../MASTER-ALLT-KVAR.md) § 0–2 + [`.j_to_agent/fidelity.txt`](../../../../.j_to_agent/fidelity.txt). Kort: **sandbox/runtime först**, shim **sista** fallback; **preflight** + **`npm run dev`** + **`npm run build`** är **tre** skilda lager; SQLite / preview-mail / demo-auth / lätta Redis-ersättare i Fas 3 enligt MASTER.

---

## UI-princip: en signal yta per «vem är kunden?»

**Problem idag (riktning att motverka):** Byggaren visar ofta **för många** och **blandade** signaler — interna Sajtmaskin-concerns och användarens egna projektbehov i samma hop.

**Produktregel:**

- **Användaren ska bara se det som rör *hennes/hans genererade sajt***: egna integrationer, egna env-behov, preview-läge (shim / runtime / build-status) för **det projektet**.
- **Sajtmaskins interna integrationer** (plattforms-`registry`, vilka providers *Sajtmaskin* använder, intern diagnostik, «allt vi har listat någonstans») ska **inte** exponeras i samma yta som om det vore användarens uppgift att förstå dem.

**Konsekvens för implementation:** När SSE/stream eller inställningspaneler utökas: **separera** «platform health / dev-only» från «ditt projekts preview & integrationer». Färre etiketter, tydligare **en** primär status för preview — inte en röra av alla möjliga integrationstyper från repot.

---

## Faser (samma som `INPUT_GPT.txt` § 12)

| Fas | Innehåll | Mål |
|-----|----------|-----|
| **1** | Placeholder-env + `projectEnvVars` → **`.env.local` i sandbox** (genererad sajt), `npm install`, `npm run dev`; **`npm run build`** som separat verifieringsstatus | **2026-03-26:** merge + `.env.local`; **`npm run build`** efter dev i own-engine sandbox + SSE `prodBuildVerified` + previewpanel + progress. **Kvar:** shim↔runtime produktprioritet, tydligare shim vs runtime i samma banderoll. |
| **2** | Session-varm sandbox (`chatId`↔sandbox), idle ~30 min, hard cap ~2 h, heartbeat, cleanup | Mindre kallstart, kontrollerad kostnad |
| **3** | Adapters / degraded preview (SQLite/no-op mail/optional Redis/auth preview-läge) | Nivå 3-integrationer från `INPUT_GPT.txt` § 5–6 |
| **4** | GitHub som **export**, inte primär persistence | Senare; se `INPUT_GPT.txt` § 9 |

**SCOPE-påminnelse:** All `.env.local` / `dev` / `build` i handoffen avser **den genererade sajtens** filer i sandbox — **inte** Sajtmaskin-monorepots egna env-filer (`INPUT_GPT.txt` inledning).

---

## Acceptans (iteration 1 — efter Fas 1)

Funktionellt (jmf. `INPUT_GPT.txt` § 14):

- [x] Genererad sajt får **materialiserad `.env.local`** i sandbox enligt merge-ordning i handoffen § 7.
- [ ] Preview startar **oftare** när integrationer krävs (placeholders + projekt-env) — *delvis; behöver produktmätning*.
- [x] **Byggverifiering** (`npm run build`) rapporteras **separat** från «dev körs» (SSE + previewpanel).

UX:

- [ ] Användaren ser **tydlig** skillnad: snabb shim ↔ runtime preview ↔ build OK / build fail (dev kan ändå köra) — **utan** att blanda in Sajtmaskins fulla interna integrationslista. *(Build-fail vs OK: ja i previewpanel; shim vs runtime: oförändrat.)*
- [ ] **Sandbox = avsedd iframe-default (tier 2); shim = fallback:** om sandbox **inte** går igenom ska **tydlig logg + användar-synlig signal** finnas (inte tyst shim). Se [`docs/architecture/preview-fidelity-tiers.md`](../../../architecture/preview-fidelity-tiers.md) § «Produktprioritet».
- [ ] Färre falska fel p.g.a. saknade env i sandbox.

---

## Primära filer (från handoff § 11)

`src/lib/gen/sandbox-preview.ts`, `src/lib/providers/own-engine/generation-stream.ts`, `src/lib/ai-models/load-generated-site-placeholders.ts`, ev. `src/lib/mcp/runtime-url.ts`, `src/lib/gen/pre-generation-contracts.ts`. **Nya:** t.ex. `build-generated-site-env.ts`, `sandbox-session-store.ts` (se `INPUT_GPT.txt` § 10–11).

---

## Relation till övriga `PLAN-*`

| Plan | Skillnad |
|------|----------|
| **PLAN-KRITIK-OPEN** | K-007 (deploy), K-009 (SSE-scope), **K-019** (standard-UX + promptkedja) — **inte** samma som sandbox-env; K-018 **implementeras här**. |
| **PLAN-DRIFT-VERIFICATION** | Smoke mot **Sajtmaskins** deploy-API, progress-hygien — **inte** genererad sajts sandbox. |
| **PLAN-REPO-SEPARATION-OPEN** | Dependency/städ — kan köras **parallellt** med doc-låg risk, undvik samma PR som tung `generation-stream`-refaktor. |
