# Handoff: Autofix, validering och quality gates

**Mål:** Göra reparationskedjan **pålitlig**, **mätbar** och **sluten** — deterministiska fixar + LLM-fix + sandbox/quality gate — utan dolda fel och utan onödig dubbelarbete.

**Prioritet:** Hög — detta är steget mellan generation och sandbox (Fidelity 2).

**Kanoniska källor:**  
[`docs/architecture/preview-deploy.md`](../architecture/preview-deploy.md) · [`docs/architecture/builder-generation.md`](../architecture/builder-generation.md) · [`docs/handoffs/scaffold-sandbox-findings-och-llm-uppfoljning.md`](scaffold-sandbox-findings-och-llm-uppfoljning.md)

---

## 1. Nuvarande kedja (kort)

| Steg | Modul | Roll |
|------|--------|------|
| Deterministiska patchar på fil-lista | [`src/lib/gen/repair-generated-files.ts`](../../src/lib/gen/repair-generated-files.ts) | Font, lucide Link, metadata/client, `as const` |
| Preflight | [`src/lib/gen/stream/finalize-preflight.ts`](../../src/lib/gen/stream/finalize-preflight.ts) | `repairGeneratedFiles` → validate → LLM fixer → `runAutoFix` → preview/sanity/SEO |
| Autofix pipeline | [`src/lib/gen/autofix/pipeline.ts`](../../src/lib/gen/autofix/pipeline.ts) | Parsad CodeProject, många regler + `dep-completer` |
| Syntax-loop | [`src/lib/gen/autofix/validate-and-fix.ts`](../../src/lib/gen/autofix/validate-and-fix.ts) | Max 3 pass, LLM + autofix |
| Sandbox | [`src/lib/gen/sandbox-preview.ts`](../../src/lib/gen/sandbox-preview.ts) | `buildCompleteProject`, `npm install`, `npm run dev`, ev. build |
| Quality gate API | [`src/app/api/v0/chats/[chatId]/quality-gate/route.ts`](../../src/app/api/v0/chats/[chatId]/quality-gate/route.ts) | typecheck/build (se kod) |

---

## 2. Buggar och inkonsistenser att åtgärda

### 2.1 Dep-completer vs baseline (`zod`)

- [`src/lib/gen/autofix/dep-completer.ts`](../../src/lib/gen/autofix/dep-completer.ts): `KNOWN_PACKAGES` kan ha **`zod: ^3`** medan [`src/lib/gen/project-scaffold.ts`](../../src/lib/gen/project-scaffold.ts) pinnar **zod 4.x**.
- **Åtgärd:** Synka `KNOWN_PACKAGES` med faktiska pinnar i `PACKAGE_JSON` / kör `npm run baseline-deps:verify` som sanning.

### 2.2 `validate-and-fix` — outer catch

- Om pipelinen kastar ska resultat **inte** rapporteras som `hadErrors: false` med original innehåll utan loggning.
- **Åtgärd:** Logga exception, sätt `hadErrors: true` eller explicit `error: string`, dokumentera i returtyp.

### 2.3 LLM fixer — merge och “success”

- [`src/lib/gen/autofix/llm-fixer.ts`](../../src/lib/gen/autofix/llm-fixer.ts): success om *några* filer kom tillbaka — kan lämna trasiga filer kvar.
- **Åtgärd:** Jämför mot valideringsfel per path; kräv att alla rapporterade paths uppdaterats eller att felcount minskat enligt validate.

### 2.4 `pipeline.ts` header vs implementation

- Uppdatera filheader i [`src/lib/gen/autofix/pipeline.ts`](../../src/lib/gen/autofix/pipeline.ts) så den matchar **faktisk** ordning (font, metadata, cn, lucide, security, etc.).

### 2.5 Sandbox preview mode — doc vs kod

- [`src/lib/mcp/runtime-url.ts`](../../src/lib/mcp/runtime-url.ts): `resolveSandboxPreviewModeFromEnv()` — **justera docstring** så den stämmer med faktisk default (`dev_then_build` vs `dev_only` enligt nuvarande kod).
- **Beslut:** En policy, kod + kommentar + [`docs/ENV.md`](../ENV.md) uppdaterade.

### 2.6 Dubbel font-fix

- `repairGeneratedFiles` och `runAutoFix` kan båda köra font-relaterade fixar.
- **Åtgärd:** Antingen deduplicera (en gemensam “deterministic pass”) eller dokumentera varför två lager behövs (t.ex. före/efter merge) — helst **en** väg för samma regel.

---

## 3. Quality gate som sluten loop

**Nu:** Post-checks / klient kan anropa quality-gate.

**Mål:** Om typecheck **eller** build **eller** (framtida) lint misslyckas:

1. Samla **kommandoutdata** (sista N rader, t.ex. 500–2000, enligt interna felsökningsfynd).
2. Trigga **inriktad** repair (inte full regeneration): antingen befintlig autofix + LLM-fix med feltext som kontext.
3. **Cap:** max **2** repair-variationer per version; spara status på versionen.

**Filer:**  
[`src/app/api/v0/chats/[chatId]/quality-gate/route.ts`](../../src/app/api/v0/chats/[chatId]/quality-gate/route.ts) · [`src/lib/hooks/chat/post-checks`](../../src/lib/hooks/chat/) (sök `quality-gate`) · finalize som skapar version.

**SSE:** Ändra inte händelsenamn utan behov — se `builder-stream-contract`.

---

## 4. Sandbox disabled — synligt i UI

**Problem:** Om sandbox inte är konfigurerad stannar användaren på Tier-1 shim och kan tro att “motorn bara gör statiskt”.

**Åtgärder:**

- När API returnerar `sandbox_disabled` (eller motsvarande kod): **banner** i preview-panelen, inte bara dev-toast — se [`useBuilderPageController`](../../src/components/builder/) (sök `sandbox`).
- Persistera “sandbox otillgänglig” i builder-state så det överlever navigation.

---

## 5. Loggar för felsökning

- Vid `npm install` / build-fel i sandbox: **öka** sparad logggrad-gräns (truncate idag) så root cause syns utan manuell reproduktion.
- Lagra per **stage**: install, dev, build (om körs).

---

## 6. Design QA (stub / fas 2)

**Målbild (inte allt i första PR):** Efter `sandbox-ready`, valfritt: screenshot av `/` + nyckelroutes, heuristisk score (kontrast, tom yta, CTA-text). Under tröskel → “design patch” med **cap**.

**Stub:** Tom endpoint eller flagga `SAJTMASKIN_DESIGN_QA=0` default av.

---

## 7. Acceptanskriterier

- [ ] `zod` (och andra kärnlib) i dep-completer matchar baseline.
- [ ] `validate-and-fix` ljuger inte om fel vid exception.
- [ ] LLM fixer verifierar minskat fel mot tidigare validate (eller explicit partial).
- [ ] Sandbox preview mode dokumenterat = kod.
- [ ] Quality gate kan trigga capped repair med sparad logg.
- [ ] Sandbox disabled synlig för slutanvändare när relevant.

---

## 8. Tester

- Enhetstest för dep-completer version mot `PACKAGE_JSON`.
- Enhetstest för validate-and-fix felväg (mocka kast).
- Eventuellt integrationstest för quality-gate med mockad sandbox-feloutput.

---

## 9. Underhållskommandon

```bash
npm run baseline-deps:verify
```

---

*Handoff skapad för own-engine-upprustning. Se `kontrakt-forenkling-och-integrationer.md` och `llm-kedja-och-generationskvalitet.md`.*
