---
status: active
owner: unassigned
created: 2026-07-13
topic: Kanoniskt ownership-kontrakt för chatt-yta — en tidigare LLM-byggd chatbot-widget får inte konkurrera med en senare explicit `openai-chat`-dossier (adapt-eller-ersätt, aldrig två ytor/routes)
source: /logg-incidentanalys chat 747636c8 (2026-07-13) — files_json v5→v8 + engine_messages + orchestration_snapshot, prod-DB read-only
---

# Dossier/UI-ownership-kontrakt (chatt-yta)

## TL;DR

Incidenten i chat `747636c8` visar en **strukturell dossier-lucka**, inte en engångsbugg:
en LLM-byggd `components/chatbot-widget.tsx` skapades i F2 **innan** användaren la till
byggblocket `openai-chat`. När dossiern sen lades till injicerades den **inte** som ägare
av chatt-ytan — den LLM-byggda widgeten och dess egna `/api/ai-chat`-route levde kvar. Sidan
fick i praktiken två chatt-implementationer, och den LLM-byggda bar typrisken (TS2345) som
fällde F3-verifieringen. Förslaget: ett **adapt-eller-ersätt-kontrakt** så en vald
`ai-chat`-dossier alltid äger chatt-ytan, aldrig samexisterar med en konkurrerande.

Detta är **plan + regressionstest-spec, ingen implementation.** Ingen bred refaktor i
incidentarbetet.

## Bevis (denna incident)

Verifierat mot prod-DB (`engine_versions.files_json`, `engine_messages`, `orchestration_snapshot`):

| Tid (UTC) | Händelse | Bevis |
|---|---|---|
| 05:54 (v5) | LLM bygger `components/chatbot-widget.tsx` med egen `/api/ai-chat` | assistant-msg `3a4f9786`; filträd har både `chatbot-widget.tsx` och `app/api/ai-chat/route.ts` |
| 06:00 (v6) | Användaren: *"Lägg till byggblocket OpenAI Chat (id: openai-chat)"* | prompt_logs 06:00:47 + assistant-msg `9bc2fadf` |
| — | `openai-chat`-dossierns filer (`components/chat-panel.tsx`, verbatim `components/api/chat/route.ts`) **saknas** i v6/v7/v8 | filträd: ingen `chat-panel.tsx`, ingen `api/chat/route.ts` — bara `api/ai-chat/route.ts` (LLM-byggd) |
| 06:05 (v7) | F3-verify (integrations) faller: `chatbot-widget.tsx(187,66) TS2345` | `engine_versions` v7 `verification_state=failed` |

Dossiervalet i snapshot bekräftar att `openai-chat` var **avsett**: `contractIntegrations`
= `{ name: "OpenAI", status: "chosen", envVars: ["OPENAI_API_KEY"] }`, capability `ai-chat`.
Men dossierns **filer materialiserades aldrig** — den LLM-byggda widgeten ockuperade ytan.

Slutsats: dossiern valdes rätt på **capability-nivå**, men **injektionen ägde inte** den
redan existerande chatt-ytan. Det är luckan.

## Nuvarande beteende (kod)

- `openai-chat`-manifestet (`data/dossiers/hard/openai-chat/manifest.json`) deklarerar
  `components/chat-panel.tsx` (rewritable) + `components/api/chat/route.ts` (verbatim) och
  exposar `ChatPanel`.
- Vid en follow-up som lägger till dossiern på en graph som redan har en LLM-byggd chatt-yta
  finns **ingen regel** som säger: "adaptera den befintliga ytan till dossierns serverkontrakt,
  eller ersätt den med dossierns UI". Resultatet blev s-samexistens.
- `codeFidelity: "rewritable"` på `chat-panel.tsx` gör att LLM:en får omforma dossierns UI —
  men det förutsätter att dossierns UI först injiceras. Här injicerades det inte alls.

## Förslag (avgränsat ownership-kontrakt)

**Kärnregel:** när en `ai-chat`-dossier (eller generellt en dossier som `exposes` en UI-komponent
för en capability) väljs för en graph som redan har en icke-dossier chatt-yta, ska pipelinen
göra **exakt ett** av två, aldrig lämna två:

- **(A) Adaptera:** behåll befintlig UI men peka den mot dossierns **serverkontrakt**
  (dossierns route/protokoll), och ta bort den konkurrerande LLM-byggda routen. Bra när
  användaren gillar den befintliga designen.
- **(B) Ersätt:** injicera dossierns UI (`chat-panel.tsx`) som ägare och ta bort den
  LLM-byggda widgeten + dess route. Bra när dossierns UI är kanoniskt.

Aldrig (C) = två chatt-ytor / två routes samtidigt (dagens utfall).

**Var det naturligt hör hemma** (utan bred refaktor):
- `src/lib/gen/dossiers/select.ts` + injektions-/verbatim-policyn: när en vald dossier
  `exposes` en komponent vars capability redan har en befintlig yta, markera ytan som
  dossier-ägd (adapt/replace-beslut).
- Follow-up-kontraktet (`buildFollowUpContract` / system-prompt-kontraktsblocket): en explicit
  instruktion "en chatt-yta äger; ta bort konkurrenten" i stället för dagens tysta samexistens.

## Regressionstest (spec — sekvensen incidenten visar)

Lägg ett test som låser **just** incidentsekvensen: *F2 egen chatbot-widget → senare
OpenAI-koppling → F3*.

```text
Test: "ai-chat dossier tar över en tidigare LLM-byggd chatt-yta (adapt-eller-ersätt)"
  Given en graph vars files_json har en LLM-byggd components/chatbot-widget.tsx
        + app/api/ai-chat/route.ts (ingen dossier vald)
  When en follow-up väljer dossiern openai-chat (capability ai-chat)
  Then det resulterande filträdet har EN kanonisk chatt-yta:
        antingen (A) befintlig widget pekar på dossierns route (components/api/chat/route.ts)
                 och app/api/ai-chat/route.ts är borta,
        eller     (B) dossierns chat-panel.tsx äger ytan och chatbot-widget.tsx är borta,
        men ALDRIG både chatbot-widget.tsx (egen route) OCH dossier-routen samtidigt.
  And ingen komponent anropar en route som inte finns i filträdet.
```

Sannolik placering: `src/lib/gen/dossiers/*.test.ts` (injektion) eller ett
runner-tråd-test i stil med `runner-dossier-threading.test.ts`.

## Explicit icke-mål / avgränsning

- **Ingen bred refaktor** av dossier-selektion eller capability-systemet i incidentarbetet.
- Ingen ändring av `openai-chat`-manifestet i sig (dess `mock: canned` feature-runtime-fallback
  är korrekt och orelaterad).
- Inte en fix av verifier/RepairGate — den delen fungerade (v8 fixade TS2345, se incidentrapport).
- Kontraktet gäller först `ai-chat`; generalisering till andra UI-exposande dossiers är ett
  senare, separat pass.

## Koppling

- Backlog-rad: `BUG-SWARM-BACKLOG.md § Aktiv kö` → **M#dchat1** (P2).
- Relaterat (samma incident, andra plan): `2026-07-13-builder-runtime-robusthet.md` (D2 —
  widget-typkvalitet + verifier-täckning).
