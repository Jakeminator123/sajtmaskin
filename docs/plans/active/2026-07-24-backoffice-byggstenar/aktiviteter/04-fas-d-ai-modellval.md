---
status: active
owner: unassigned
created: 2026-07-24
topic: Backoffice Fas D — AI-modellval för wizard-persona och byggblocks-kuration via manifestet
source: config/ai_models/manifest.json + backoffice/wizard_support.py + scripts/dossiers/curate-from-reference.ts + ägar-/coachbeslut 2026-07-24
---

# Etapp 5–6 — Fas D: AI-modellval (förslaget GODKÄNT 2026-07-28)

Master-plan: [`../00-master-plan.md`](../00-master-plan.md).
**Körs sist**, efter Fas B och C. Detta är den enda etappen som ändrar faktiskt
beteende (vilken modell som anropas), inte bara yta — därför krävde förslaget
nedan ett godkännande innan kod.

**Beslut 2026-07-28: förslaget godkänns som det står — tre separata
workload-poster, inga sammanslagningar.** (Beslut av agent på ägarens
delegation; vänd det fritt, men skriv om detta stycke då.)

Två saker beslutet uttryckligen säger nej till:

- **Slå inte ihop `..._persona` och `..._guide`.** De har olika krav: personan
  behöver vision (stillbild + kodutdrag), guiden är ren text. En gemensam post
  tvingar en billig Q&A att köras på en vision-modell och gör vision-gatingen
  meningslös — olika modellbehov är själva skälet att ha två workloads.
- **Låt inte wizarden läsa `analyze_presentation_vision`.** Fällan som beskrivs
  nedan är hela poängen med att registrera egna poster; genvägen skulle koppla
  två orelaterade features till samma modellbeslut.

Fallback-stycket längst ned gäller därmed inte längre som väg framåt — det står
kvar bara som förklaring till varför en dokumenterad hårdkodning vore sämre.

## Problem

| Yta | Hårdkodat idag |
|---|---|
| `backoffice/wizard_support.py` | `WIZARD_MODEL_CHOICES = ("gpt-4o", "gpt-5.4-mini", "gpt-5.5")` |
| `backoffice/pages/scaffold_wizard.py` (`_render_guide`) | `model="gpt-4o"` |
| `scripts/dossiers/curate-from-reference.ts` (~rad 238) | `model: "gpt-4o-mini"` |

Manifestet `config/ai_models/manifest.json` är den kanoniska ägaren av modellval,
men ingen av dessa ytor läser det.

**Fällan att undvika:** workloaden `analyze_presentation_vision` har
`defaultModel: "gpt-4o"` men `codeEntry: src/app/api/analyze-presentation/route.ts`
— den tillhör en **annan feature** (kroppsspråksanalys). Låt inte backoffice-wizarden
läsa den; då ärver wizarden en annan funktions modellbeslut och båda ändras av
misstag när någon rör den ena.

## Förslaget (godkänt 2026-07-28, steg 5)

Registrera **egna** workload-poster i `config/ai_models/manifest.json` så manifestet
förblir ägare:

| Föreslaget `id` | Roll | `codeEntry` | Föreslagen `defaultModel` |
|---|---|---|---|
| `backoffice_scaffold_wizard_persona` | Persona som läser mall (stillbild + kodutdrag) och skriver variant-/scaffold-utkast | `backoffice/wizard_support.py`, `backoffice/pages/scaffold_wizard.py` | **`gpt-4o`** (vision-kapabel, repo-beprövad) — med `gpt-5.5` som operatörsval i UI:t |
| `backoffice_scaffold_wizard_guide` | Kort Q&A-guide i wizard-stegen (ren text) | `backoffice/pages/scaffold_wizard.py` | **`gpt-5.4-mini`** (billig, ingen vision behövs) |
| `backoffice_dossier_curation` | AI-utkast till byggblocks-manifest ur ett template-reference-repo | `scripts/dossiers/curate-from-reference.ts` | **`gpt-5.5`** (uppgradering från `gpt-4o-mini`, som är legacy) |

Fält som ska sättas per post (mönster från befintliga poster):
`id`, `title`, `description`, `invocation: "openai_chat_completions"`,
`provider: "openai_direct"`, `codeEntry[]`, `authEnv: ["OPENAI_API_KEY"]`,
`defaultModel`.

**Att kontrollera innan kod:**

1. Tillåter `config/ai_models/manifest.schema.json` nya `workloads`-poster utan
   schemaändring? (Sannolikt ja — verifiera, ändra inte schemat i onödan.)
2. Finns någon paritetstest/validator som räknar eller listar workloads
   (`backoffice/test_validate_manifest.py`, `npm run docs:generate` →
   `docs/generated/models.generated.md`)? Uppdatera projektionen i samma PR.
3. `npm run docs:check` måste vara grön efteråt.

**Förkastat alternativ (behållet som varning):** att låta dagens tuple i
`wizard_support.py` stå kvar med en kommentar om varför den inte läser
manifestet. Det bevarar två sanningar om modellval och lämnar nästa agent med en
kommentar i stället för ett kontrakt — vilket är just hur `analyze_presentation_vision`-
fällan uppstår. Egna poster valdes i stället.

## Genomförande (steg 6, efter godkännande)

1. `wizard_support.resolve_model_choices(repo_root)` läser de nya posterna ur
   manifestet; `WIZARD_MODEL_CHOICES` blir dokumenterad fallback när manifestet
   saknas/är trasigt (backoffice ska inte krascha på en manifestfil).
2. **Vision-gating behålls:** bilder (`image_url`) skickas bara när valt modell-id
   kommer från en post som är märkt vision-kapabel; annars text + ärlig notis i UI:t.
3. `_render_guide` slutar hårdkoda `"gpt-4o"` → modell från manifestet, med väljare
   i teknik-expandern.
4. Skärp `_OUTPUT_CONTRACT`/personorna så utkasten oftare klarar wizardens
   checklista direkt (konkreta `signaturePatterns`, inga generiska fraser).
   **Ändra inte schema eller validering** — bara promptinnehållet.
5. `scripts/dossiers/curate-from-reference.ts`: `--model=<id>` med manifest-default;
   okänt id → fel **innan** LLM-anropet. Backoffice skickar operatörens val.
   Kör `npm run typecheck` + `npm run lint` eftersom TS rörs.

## Tester

* Ny `backoffice/test_wizard_support_models.py`: manifest-driven lista, fallback när
  manifestet saknas/är trasigt, och att vision-gating stänger av bildskickning för
  icke-vision-modeller.
* Om `curate-from-reference.ts` får `--model`: ett litet vitest-fall för
  argumentparsningen (okänt id → fel före nätanrop).

## Verifiering

```bash
npm run backoffice:test
npm run docs:check          # models.generated.md speglar manifestet
npm run typecheck && npm run lint   # om curate-from-reference.ts rörs
```

## Acceptans

* Ingen backoffice-yta hårdkodar längre ett modell-id (utom dokumenterad fallback).
* Wizarden ärver **inte** `analyze_presentation_vision`.
* Vision-gating kvar; ingen ändring i schema eller validering.
* Utkasten blir konkretare utan att någon skrivväg kringgår checklistan.
