# Sajtmaskin – Byggplaner

Skapad: 2026-03-02
Validerad mot kodbasen samma datum.

## Översikt

Dessa planer bygger på en fullständig kodbasanalys och validering av
varje punkt mot faktisk källkod. Checkboxar (`- [ ]`) spårar progress.

| Plan | Fokus | Prioritet |
|------|-------|-----------|
| [01 – Städ & stabilitet](01-cleanup-stability.md) | Toast, docs, dead code | Hög |
| [02 – Arkitektur](02-architecture.md) | Middleware, streaming, AC-schema | Hög |
| [03 – Produktion & kvalitet](03-production-quality.md) | Tester, felövervakning, analytics | Medium |
| [04 – shadcn-komponenter](04-shadcn-components.md) | Saknade UI-komponenter | Medium |
| [05 – AC-schema completion](05-ac-schema-completion.md) | Ofullständiga AC-items | Hög |

## Principer

- Varje plan är oberoende och kan köras i valfri ordning
- Varje punkt har en **Validering**-sektion som visar exakt vad som hittades i koden
- Planer uppdateras när items bockas av
- Språk: Svenska för beskrivning, engelska för kod/filer/kommandon
