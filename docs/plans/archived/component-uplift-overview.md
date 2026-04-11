# Component uplift — P14, P15, P16 overview

Kontextdokument för det sammankopplade arbetsspåret P14–P16. Förklarar bakgrund, beslut och hur planerna relaterar till befintlig arkitektur.

## Bakgrund

En intern review identifierade att scaffolds håller god råkvalitet (~7.5/10) men att systemet underanvänder dem. Specifikt:

1. **Capability-detektion stannar vid prompt-hints.** `capability-inference.ts` vet att en prompt behöver carousel/charts/motion, men kopplingen till faktisk dep- och komponentinjektion saknas. LLM:en informeras via text, men dependencies och komponentfiler garanteras inte.

2. **Scaffolds är allt-eller-inget.** Det finns inget mellanlager för att lägga på funktionspaket (carousel, charts, forms, motion) ovanpå ett valt scaffold. En portfolio-sajt med karusell och kontaktformulär får bara portfolio-scaffoldet — karusell- och formmönster lämnas helt åt LLM:en.

3. **Vissa promptkategorier saknar scaffold.** Dokumentation/knowledge-base och formulärtunga flöden (bokning, survey, quiz) landar på generiska scaffolds som inte speglar deras struktur.

4. **shadcn/ui är underutnyttjat som komponentlager.** Projektet har redan en komplett `shadcn-components.ts`-registrymapp (227+ exports), whitelistade `@/components/ui/`-imports i sanity, baseline deps i `project-scaffold.ts`, och en statisk prompt som listar tillgängliga shadcn-komponenter. Men kopplingen är passiv — systemet *tillåter* shadcn men *driver* inte aktivt vilka komponenter som ska användas baserat på capabilities.

## Beslut och principer

Dessa beslut gäller för alla tre planerna och utgår från `docs/architecture/component-library-policy.md`:

| Princip | Beslut |
|---------|--------|
| **Scaffolds äger struktur** | Routing, layout, base files, `globals.css`, `package.json` — detta ändras inte |
| **shadcn/ui äger widgets** | Carousel, Chart, Form, DataTable, Command, Sidebar, Calendar, Toast, Sheet — on-demand UI-delar |
| **Capabilities driver injektion** | `inferCapabilities()` → `resolveCapabilityPacks()` → proaktiva deps + berikad prompt |
| **Enhancement packs, inte nya scaffolds** | Funktionslager (motion, carousel, chart, form, data-table, 3d, command, feedback) läggs ovanpå scaffolds — inte som ersättning |
| **Tunga deps är feature-gated** | `framer-motion`, R3F-stack, `recharts`, `@tanstack/react-table` installeras bara vid tydlig promptsignal |
| **DaisyUI: utred som optional mode** | Ej default; inkompatibelt med `@theme inline` utan migration |
| **Flowbite: inspiration/fallback** | Inte förstaval givet befintlig shadcn/radix/tailwind-stack |

## Tre planer, ett spår

```
P14: capability → dep/komponent-injektion
 ↓
P15: enhancement packs (modulära funktionspaket ovanpå scaffolds)
 ↓
P16: nya scaffold-shells (docs-knowledge, form-workflow)
```

### P14 — Formalisera capability → dep-injektion
**Prioritet: hög.** Den enskilt viktigaste bryggan. Kopplar capability-flaggor till proaktiv dep-injektion i `package.json` och berikad komponentkontext i prompten. Utan P14 fortsätter systemet att *berätta* för LLM:en vad den ska använda utan att *garantera* att det finns.

**Nyckelfiländring:** ny `resolveCapabilityPacks()` i `capability-inference.ts` (eller `capability-packs.ts`), konsumerad av `orchestrate.ts` och `project-scaffold.ts`.

### P15 — Enhancement packs
**Prioritet: medel-hög.** Bygger på P14. Lägger till konkret prompt-guidance med mönster och kodexempel per funktionsområde (motion, carousel, chart, form, data-table, 3d, command, feedback). Gör att LLM:en inte bara vet *vilka* bibliotek som finns, utan *hur* de ska användas med bästa mönster.

**Nyckelfiländring:** ny `enhancement-packs.ts`, ny prompt-sektion `## Enhancement Packs` i `buildDynamicContext`.

### P16 — Nya scaffold-shells
**Prioritet: medel.** Fyller två tydliga luckor: `docs-knowledge` (dokumentation/help-center/changelog) och `form-workflow` (bokning/survey/quiz/kalkylator). Dessa promptkategorier landade tidigare på generiska scaffolds.

**Nyckelfiländring:** nya manifests + utökad `ScaffoldFamily` union + matcher-keywords.

## Hur detta hänger med befintligt system

| Befintlig komponent | Roll i P14–P16 |
|---------------------|----------------|
| `capability-inference.ts` | Bas — flaggorna driver allt; P14 utökar med pack-resolving |
| `buildCapabilityHints()` | Behålls — prompt-hints är fortfarande värdefulla som textkontext |
| `dep-completer.ts` | Behålls — reaktiv scanning är backup; P14 lägger till proaktiv injektion |
| `project-scaffold.ts` BASELINE | Utökas — capability-driven deps mergas i `mergePackageJsonWithBaseline` |
| `shadcn-components.ts` | Referensdata — packs pekar på dessa nycklar |
| `serialize.ts` | Behålls — scaffold-serialisering fortsätter som idag; packs är separat lager |
| `matcher.ts` | Utökas i P16 — nya keywords för docs-knowledge och form-workflow |
| `config/prompt-static/03-shadcn-ui-components.md` | Behålls — statisk grund; packs berikar dynamiskt |

## Förväntad effekt

- **Färre saknade dependencies** i genererade projekt (proaktiv vs enbart reaktiv)
- **Bättre komponentkvalitet** — LLM:en får mönster och exempel, inte bara namn
- **Moduläritet** — carousel + chart kan läggas på vilken sajt som helst, inte bara specifika scaffolds
- **Bredare prompt-täckning** — dokumentation och formulärflöden får egna startpunkter

## Risker

| Risk | Mitigation |
|------|-----------|
| Ökad prompt-storlek | Enhancement packs respekterar `BuildSpec.tokenBudgets`; läggs bara till vid aktiv capability |
| Dep-konflikter | Packs använder samma versioner som `KNOWN_PACKAGES` och baseline; test enforcar paritet |
| Komplexitet i orchestration | Tydlig separation: scaffold-sektion + pack-sektion; inte interleaved |
| LLM:en ignorerar pack-guidance | Prompt-hints + enriched context + proaktiva deps = tre lager säkerhet |

## Relaterade dokument

- [`docs/architecture/component-library-policy.md`](../../architecture/component-library-policy.md) — ägarmodell scaffolds vs shadcn vs capability-gated deps
- [`docs/schemas/orchestration-signal-contract.md`](../../schemas/orchestration-signal-contract.md) — hur signaler flödar genom pipelinen
- `src/lib/gen/capability-inference.ts` — capability-detektion
- `src/lib/gen/data/shadcn-components.ts` — shadcn-registrykarta
- `src/lib/gen/project-scaffold.ts` — baseline deps
