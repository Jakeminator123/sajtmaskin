# Slutföringsplan — hur mycket är kvar och i vilken ordning

**Syfte:** Svara på «hur mycket återstår?» och ge en **realistisk väg till «allt klart»** utan att låtsas att produktbeslut redan är tagna.

## Ungefärlig kvarvarande andel (grovt)

| Spår | Status | Kommentar |
|------|--------|-----------|
| **External-review remediation (1.txt–3.txt, W1–W5)** | **~100 %** | Avslutat per `REMEDIATION-EXIT` — inget mer i *det* spåret. |
| **Kritik-tabellen (K-rader)** | **4 öppna / ~11 teman** | Ungefär **⅓ av raderna** fortfarande `[ ]`, men de fyra är de **tyngsta** (deploy-policy, landningssignoff, SSE/own-engine utanför track, juridik/copy). |
| **Plan 17** | **8 öppna kryss** | Deferred v0/gateway + WS-5. **WS-6 klar 2026-03-26** (behåll D-ID, OpenClaw; Brave + Loopia optional). |

**Samlad bedömning:** Av *allt som historiskt körts* fram till remediation-exit är **execution-spåret i princip färdigt**. Det som återstår är **medvetet efterkvar** — ofta **dagar–veckor** per större punkt om man ska göra det ordentligt, inte «en eftermiddag».

Det går **inte** att på ett ansvarsfullt sätt «köra allt» i en agent-session utan att du först svarar på policy för **deploy auto-fix** (K-007), **landning klar** (K-008), **SSE-scope** (K-009), **juridisk copy** (K-014). **WS-6 är besvarad** (2026-03-26).

---

## Fas A — Beslut du måste ta (blockerar kod)

### Beslut tagna

- **WS-6 (2026-03-26):** **Behåll** D-ID (`/avatar`) och **OpenClaw**. **Brave Search** och **Loopia** **behålls som optional** — se Plan 17 § WS-6.

### Kvar

1. **K-007:** Ska auto-fix före deploy vara **strammare**, **oförändrat**, eller **tydligare opt-in/opt-out**?  
2. **K-008:** Är landningen **produktklar** eller ska raden omformuleras till tydliga återstående UI-punkter?  
3. **K-009:** Vilken **produkt-scope** gäller för own-engine SSE *utanför* avslutad W3-track?  
4. **K-014:** Godkänn footer/juridik-copy och ev. sidor — **text/länkar klara?**

---

## Fas B — Kod & städ (efter A, eller parallellt där ingen konflikt)

| Ordning | Innehåll | Plan |
|--------|----------|------|
| B1 | `ENV.md` + `config/env-policy.json` i synk med verkliga routes | Plan 17 WS-4 deferred |
| B2 | Rensa / dokumentera `AI_GATEWAY_*` + OIDC-referenser när policy är klar | Plan 17 WS-4 |
| B3 | v0 SDK / `V0_API_KEY` — antingen migrera bort eller **dokumentera permanent deferred** med datum | Plan 17 WS-2 |
| B4 | WS-5: `.gitignore`-scan, policy för `research/`, **försiktig** städ av `docs/old/` (inga massrader utan review) | Plan 17 WS-5 |

---

## Fas C — Drift & bevis

| Steg | Innehåll | Vem |
|------|----------|-----|
| C1 | `npm run typecheck` + `npx vitest run` före/efter varje batch | Agent |
| C2 | `npm run test:deploy-smoke:e2e` när `SAJTMASKIN_E2E_*` finns | Du / CI |
| C3 | Uppdatera `kritik-consolidated` + `external-review-remediation-progress` när något stängs | Agent |

---

## Definition av «helt klart»

- **K-007–K-014:** alla `[x]` med datum eller uttryckligen **nedprioriterade** med motivering i tabellen.  
- **Plan 17:** alla `[ ]` antingen bockade eller **N/A** med kort motivering; filen kan då flyttas till `archived/`.  
- **`queue/PLAN-*.md`:** avsnitt markerade klara eller borttagna.

---

## Koppling till körfilen

De **tre punkterna** i [`KORFIL.md`](./KORFIL.md) motsvarar fortfarande **tre parallella spår** (kritik / plan 17 / drift). Den här filen är **tidslinje + beslut** ovanpå samma sak.
