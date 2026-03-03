# Implementationer

Samlande mapp för implementationsplaner baserade på `LLM/ROADMAP-next.txt`.

## Körordning

Planerna är numrerade i prioritetsordning. Varje plan är en självständig MD-fil
med tillräcklig kontext för att en agent ska kunna köra den utan extra info.

| # | Fil | Område | Prio | Insats | Status |
|---|-----|--------|------|--------|--------|
| 1 | `01-F-rls-policies.md` | Supabase RLS-policies | HÖG | LÅG | [ ] |
| 2 | `02-B-brave-search.md` | Brave Search API-integration | HÖG | LÅG-MEDEL | [ ] |
| 3 | `03-A-design-system.md` | v0 Design System / Registry | HÖG | MEDEL | [ ] |
| 4 | `04-C-responses-api.md` | OpenAI Responses API-migration | MEDEL | MEDEL-HÖG | [ ] |
| 5 | `05-D-middleware.md` | Next.js Middleware (auth/rate) | MEDEL | MEDEL | [ ] |
| 6 | `06-E-embeddings.md` | Embeddings för template-sökning | LÅG-MEDEL | MEDEL | [ ] |

## Beroenden mellan planer

```
F (RLS)         ─ oberoende, kör först
B (Brave)       ─ oberoende
A (Design Sys)  ─ oberoende
C (Responses)   ─ bör köras efter B (Brave kan ersätta web_search i vissa routes)
D (Middleware)   ─ oberoende
E (Embeddings)  ─ bör köras efter B (kan kombinera med Brave-sök)
```

## Konventioner

- Status-markörer i varje plan: `[ ]` ej påbörjad, `[~]` pågår, `[x]` klart
- Varje plan refererar till exakta filer och radnummer i kodbasen
- Planen pekar tillbaka till `LLM/ROADMAP-next.txt` för övergripande kontext
- Agent som kör en plan uppdaterar statusen i denna README när den är klar

## Referensfiler

- `LLM/ROADMAP-next.txt` — övergripande roadmap
- `LLM/AC-schema.txt` — acceptance criteria
- `LLM/DEPS-STATUS.txt` — beroendeversioner
- `.cursor/rules/project-overview.mdc` — projektöversikt
