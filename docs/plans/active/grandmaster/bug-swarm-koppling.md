---
id: gm-bug-swarm-koppling
status: scope
created: 2026-06-18
linear: null
parent: gm-00-master-plan
supersedes: null
---

# Bug-swarm → grandmaster: koppling och körordning

**Nivå 1:** [`00-master-plan.md`](00-master-plan.md)

**Syfte:** visa var de kvarvarande öppna raderna i [`BUG-SWARM-BACKLOG.md`](../../../../BUG-SWARM-BACKLOG.md) hör hemma i grandmaster-områdena, vad som redan är *beslutat*, och **när** varje kluster bör tas upp (per körordningen i master-planens §6).

> Detta är **ingen ny arbetsyta** — bara en karta. Raderna stängs när respektive område körs och låser sina `N#`/`G#`-rader med stabilitetstest.

## Redan beslutat (återbesluta inte)

Område 7 (false-green-härdning) har satt grundprincipen: **systemet får misslyckas, men aldrig ljuga.** Konkret:

- **Placeholder = degraded, aldrig grön.** Platshållarbild, stub-fil (tom ersättningsfil) eller saknad hard-dossier får aldrig signalera success.
- **Autofix vägrar dossier-stubbar** eller markerar dem blocker/degraded (N#1).
- **Event-bus är enda UI-status** (Område 6); legacy DB-statusresolver ersätts; `placeholder ≠ success`.

## Kopplingstabell

| Kluster | Backlog-rader | Plan-område | Wave / steg (§6) | Status |
|---|---|---|---|---|
| Degraded/placeholder-policy | N#1, G#17, G#22, G#35, G#49, G#51, U#29, U#72 | **7** False-green | Wave 3 / steg 6 (sist) | Beslutat: degraded, aldrig grön |
| F2 runtime-gate (Product Postcheck) | G#10, N#4, N#H3, R#6 | **7** False-green | Wave 3 / steg 6 | Riktning satt; blocking vs advisory = nivå-3 |
| F3 readiness / build-plan | G#20, G#22, G#56 | **5** Follow-up-kontrakt + **7** | Wave 2–3 / steg 5–6 | Grundproblem ägt (FollowUpContract, stale base → `409`) |
| Capability single-source | G#25, G#26, N#2 | **4** Prompter + **5** | Wave 2 / steg 5 | Konsolidering vald (`FollowUpContract.capabilities`) |
| Event-bus UI-status | N#6, G#32 | **6** Status & UI/UX | Wave 2 / steg 4 | Direkt ägt |
| Verifier-scope + recurring findings | G#33, N#5 | **4** Prompter (infogad lucka) | Wave 2 | Ny nivå-3-aktivitet när Område 4 körs |
| Regression-gate follow-up-budget | N#3 | **2** Stabilitetstester | Wave 1 / steg 1 | Stabilitets-lane äger |

## Utanför grandmaster-scope (separata spår)

Grandmaster äger gen-pipeline, kontrakt, status och false-green — **inte** env-policy-ytan, säkerhets-workern eller scraper-tuning. Dessa tas upp separat:

| Rad | Vad | Förslag |
|---|---|---|
| G#40 | Inspector SSRF (server-side request forgery): publik DNS som pekar på privat IP släpps igenom före `page.goto` | **Säkerhet — ta först**, egen liten PR |
| G#16 | `process.env` läses direkt i ~100 filer i stället för canonical `env.ts`-accessor | Bred env-refaktor, eget pass |
| G#18 | Dubbla env-docs (oklar canonical sanning) | Docs-konsolidering, eget pass |
| G#19 | Genererad `.env.local` kan vinna över user-env (precedence-ordning) | Env-build-beslut |
| G#38 | Publik PDF-parse 10MB input — ren CPU-/storlekspolicy | Produktbeslut |
| G#66 | Webscraper `MAX_PAGES=4` kan missa info på större sajter | Kostnads-/produktavvägning |

## Körordning (per master-planens §6)

```
Steg 1:  Område 2  Stabilitetstester      (gör resten tryggare)
Steg 2:  Område 3  Dokumentation & kartor (mindre agentförvirring)
Steg 3:  Område 1  Kontrakt & regler (light)
Steg 4:  Område 6  Status & UI/UX (event-bus)   ← snabb bugglättnad
Steg 5:  Område 5  Follow-up & preview-kontrakt (produktens hjärta)
Steg 6:  Område 7  False-green-härdning   ← störst kvalitet, sist
Löpande: Område 8  Cleanup & hygien (gemensamt)
```

Område 4 (prompter) är Wave 2 men inte separat sekvenserat i §6 — körs i samma våg som 5/6. Verifier-luckan (G#33/N#5) infogas där som nivå-3-aktivitet.

**Starta** enligt master-planens §9: `S1` test:stability-lane → `S2`/`S3`/`S4` → `D2` → `C1`/`C2`, sedan wave 2–3. Bug-swarm-raderna ovan stängs i takt med att deras område körs.
