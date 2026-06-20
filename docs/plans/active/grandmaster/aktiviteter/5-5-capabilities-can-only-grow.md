---
id: gm-akt-5-5-capabilities-can-only-grow
status: done
created: 2026-06-20
parent: gm-omrade-05-followup-och-preview-kontrakt
blocked_by: 5-1 (FollowUpContract på master) + 5-3 (#168 wire:ar orchestrate→input.followUpContract; #168 mergad 2026-06-20 → blocker uppfylld, bygg-redo)
risk: medium
owner_files:
  - src/lib/gen/orchestrate.ts
  - src/lib/gen/followup-capabilities.stability.test.ts
---

# 5-5 — Capabilities can-only-grow (tappa aldrig init-capabilities tyst)

> **Klar — mergad som [#174](https://github.com/Jakeminator123/sajtmaskin/pull/174) (`ca4a7974a`), 2026-06-20.** Implementerad som ren helper `enforceFollowUpCapabilityFloor` (floor-union *efter* `filterDossierCapabilitiesForPrompt`, det rekommenderade designvalet — ingen filter-omskrivning behövdes). clear-redesign **inte** undantaget. Drop-väg 2 (tom snapshot) lämnad som telemetri/backlog per nedan.

**Område 5** · Wave 2 · [nivå-2](../05-followup-och-preview-kontrakt.md) · bygger på **5-1** (`FollowUpContract`, mergad #165) **+ 5-3** (#168, mergad — ger `orchestrate` läsning av `input.followUpContract`).

## Mål
En follow-up får **aldrig tyst tappa** en capability som basversionen redan hade. `FollowUpContract.capabilities` (golv) ska gälla som **floor** i orchestrates capability-union — kan bara växa, aldrig krympa under basen. Smal PR: bara capability-listan, **inte** finalize (5-6), preview-session eller dossier-urvalets interna logik.

## Bakgrund (verifierat i kod mot master-HEAD)
Capability-unionen i `orchestrate.ts:761-792`:

```
mergedCapsRaw = brief.requestedCapabilities ∪ inferredCapabilityIds ∪ callerProvidedCapabilityIds
mergedCaps    = filterDossierCapabilitiesForPrompt(mergedCapsRaw, prompt, previewPolicy)   // :783-787
```

| Källa | Follow-up-beteende |
|---|---|
| `brief.requestedCapabilities` | brief = `buildFollowUpBriefFromSnapshot(snapshot)` → bär `requestedCapabilities` (`orchestration-snapshot.ts:264-266`), **men `null` om snapshot saknar usable `briefSummary`** (`:262`) |
| `inferredCapabilityIds` | härledd ur capabilities-arg |
| `callerProvidedCapabilityIds` | `input.requestedDossierCapabilities` (klient/`detectFollowUpCapabilities`) |

**Två tysta drop-vägar (det 5-5 ska täppa):**
1. **Prompt-filter drar bort basens capability.** `filterDossierCapabilitiesForPrompt` (`:783`) kan filtrera bort en capability vars nyckelord inte nämns i *detta* follow-up-meddelande → t.ex. en `contact-form`/`stripe-checkout` som init bad om försvinner ur dossier-urvalet bara för att användaren nu skrev "ändra färgen". Detta är huvudbuggen.
2. **Tom/trasig snapshot.** snapshot utan `briefSummary` → `brief=null` → `briefCapsArray=[]` → init-capabilities tappas helt.

**Viktig nyans (verifierad):** `FollowUpContract.capabilities` byggs ur `buildFollowUpBriefFromSnapshot(snapshot).requestedCapabilities` (`orchestration-snapshot.ts:409-415,430`). Den är alltså **samma snapshot-källa** som `briefCapsArray` — den är **inte** en oberoende persisterad lista. Därför:
- Mot **drop-väg 1** (filter) är kontrakts-golvet ett **äkta skydd**: golvet återinförs *efter* filtret.
- Mot **drop-väg 2** (tom snapshot) är golvet **lika tomt** som briefen → 5-5 löser bara det säkert om capabilities också persisteras pålitligt i snapshot vid finalize. **Behandla drop-väg 2 som upptäckt/telemetri i denna slice; om den kräver ändring i snapshot-byggandet → flagga som egen blocker (rör inte finalize här).**

## Steg (stabilitetstest FÖRST)
1. **`followup-capabilities.stability.test.ts` (skrivs först, ska faila innan fixen):**
   - Neutral follow-up: `contract.capabilities=["contact-form","stripe-checkout"]`, follow-up-prompt nämner ingen av dem → `mergedCaps ⊇ contract.capabilities` (filtret tappar dem **inte**).
   - Follow-up som lägger till ny capability (caller/inferred) → unionen växer (golv ∪ nya).
   - Regression: capability i `contract` men ej i färsk brief/caller → finns kvar i `mergedCaps`.
   - **clear-redesign**: golvet gäller fortfarande (can-only-grow — en omdesign tar inte bort en betald integration), nya tillåts.
   - Neutralvägs-paritet: tomt `contract`/init-väg → `mergedCaps` oförändrad (golv = no-op).
2. **Enforcement i `orchestrate` (follow-up-grenen):** efter `filterDossierCapabilitiesForPrompt`, **union:a tillbaka** `input.followUpContract?.capabilities` (normaliserade: trim + lowercase + dedup) så ett etablerat bas-capability aldrig kan filtreras bort. Bevara ordning brief → inferred → caller → **contract-floor**.
   - Telemetri: om golvet återinför minst en capability som filtret/briefen tappat → emit:a `followup_capabilities_floor_applied` (`incIngressEvent` i try/catch, **kasta aldrig**, bryt aldrig gen). Logga vilka.
3. **Edge:** saknat/tomt `followUpContract` → no-op (init orörd). Golvet gäller capability-**listan** som matar dossier-urvalet; rör inte filtrets interna regler.

## Acceptans / tester
- `followup-capabilities.stability.test.ts`: alla fall gröna; minst ett bevisar att prompt-filter inte tappar bas-capability; clear-redesign-fall bevisar att golvet gäller även där.
- Befintliga `orchestrate`-/dossier-tester gröna (justerade + dokumenterade om antagande ändras).
- `typecheck`/`lint` 0.
- **Beteende-neutralt** när briefen redan bär alla capabilities (golvet är då redundant).

## Guardrails
- **Smal:** bara capability-unionen/golvet. Inte finalize, inte preview-session, inte snapshot-persistens (drop-väg 2 = flagga, ej fixa här).
- **#168 mergad → bygg-redo** (läser `input.followUpContract` som #168 wire:ar in). Branch:a från färsk master. Eget worktree (`..\sajtmaskin-omr5-5`, branch `feat/omr5-capabilities-floor`), **draft-PR** (orchestrate = codegen-kärna → PR-mergaren `NEEDS_HUMAN` väntat).
- Builder-coexistence: rör inte preview/heartbeat.
- **Designfork att besluta i bygget:** floor-union *efter* filter (rekommenderat — minimal, korrigerande) vs exempt:a bas-capabilities *från* filtret. Om floor-union visar sig kollidera med varför `filterDossierCapabilitiesForPrompt` finns (t.ex. avsiktlig dossier-budget-kapning) → **flagga som blocker**, smyg inte in en filter-omskrivning. Kandidat för `/818-swarm-decide` om utfallet är oklart.
