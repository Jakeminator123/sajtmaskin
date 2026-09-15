# HANDOFF — kundens adress och portal (2026-09-15)

SHA-bunden körorder för nästa agent. Inte en andra masterplan.
Aktiveringsgrindar öppnas inte. `preview` delar prod-DB.

Verifierat live med `gh` 2026-09-15 (preview-tip via `git fetch origin preview`
+ `gh pr view`).

## Ägarskap

- **Enda mergeägaren** är Jakobs lokala Cursor-session (den som gav detta
  uppdrag). Portalagenten mergar inte.
- Varje merge kräver ett **separat uttryckligt mandat** från Jakob. Utan det:
  ingen `gh pr merge`, ingen ready-markering, ingen merge-label.
- Integrera ny `origin/preview` med **vanlig merge**. Ingen rebase, ingen
  force-push, inga hook-/CI-bypasser, ingen direktpush till `preview`.
- Rör inte huvudcheckouten `C:\Users\jakem\dev\projects\sajtmaskin`.

## Revisioner

- Datum: 2026-09-15
- `origin/preview`-tip: `5f7d6a9b68c497b4e5746a27a8a19d04fd75487c`
  (#1372 squash-mergad). Kör inte om det steget.
- DNS-owner: [runbooken](../../../runbooks/branded-user-urls.md)
- Plan: [00-master-plan.md](00-master-plan.md)
- A1-leverans (två testhosts/HTTPS till två projekt) är **inte** klar.
  HTTPS är **inte** driftklart. Tabellen nedan är historisk mätning, inte
  aktivering.
- PSL: avvakta. Ingen ansökan. Se runbooken.

## Historisk DNS-mätning (2026-09-15 03:49 CEST)

Read-only underlag. Resolver: `80.58.61.254`
(`254.red-80-58-61.staticip.rima-tde.net`). NS: `ns01.one.com` /
`ns02.one.com` (auktoritativ `ns01` = `195.206.121.10`). Verktyg:
`Resolve-DnsName`, `nslookup`. Ingen wildcard för `*.sites.sajtmaskin.se`.

| Värdnamn | Läge 2026-09-15 03:49 CEST |
| --- | --- |
| `sajtmaskin.se` | A TTL 3600 → `76.76.21.21`. HTTPS HEAD `200`, `Server: Vercel`. |
| `www.sajtmaskin.se` | CNAME TTL 3600 → `98a450bd71e44b00.vercel-dns-016.com`. |
| `preview.sajtmaskin.se` | CNAME TTL 3600 → samma mål. HTTPS HEAD `302` → följd `200`. |
| `sites.sajtmaskin.se` | NXDOMAIN (rekursiv + `ns01`) |
| `pilot-a1-test.sites.sajtmaskin.se` | NXDOMAIN. Wildcard saknas. |

Äldre mätning 2026-08-24 finns kvar i runbooken. Påstå inte att A1 eller
`sites.*` fungerar.

## Denna PR (#1380)

[#1380](https://github.com/Jakeminator123/sajtmaskin/pull/1380) är
**dokumentation** (runbook + denna HANDOFF). Den är inget runtimeberoende
som måste vänta på de andra portal-PR:erna. Mergas bara efter separat
uttryckligt mandat från Jakob.

## Levererat på preview

| Del | PR |
| --- | --- |
| Planunderlag | #1357 |
| C1 sajtvy | #1358 |
| C3 etapp 1 | #1359 |
| A2 | #1360 / #1365 / #1366 |
| D1 | #1361 / #1364 |
| B1 | #1367 |
| Kostnadsfri bolagsprofil-ingest | #1372 (squash, `5f7d6a9b…`) |

## Öppna portal-drafts (live `gh` 2026-09-15)

Inte full D2 / A3 / A4. Ingen aktivering.

| PR | Gren | Head | Base | Läge | Kvar |
| --- | --- | --- | --- | --- | --- |
| [#1369](https://github.com/Jakeminator123/sajtmaskin/pull/1369) A3-prep | `feat/address-contract-a3` | `6f56177107e0b52633a5130778289a6a28dbcf21` | `5f7d6a9b68c497b4e5746a27a8a19d04fd75487c` | draft, `mergeable_state: clean`. Har redan integrerat #1372 med **vanlig merge**. | Fortfarande draft. Inte full A3. Ready/merge bara efter separat mandat. |
| [#1378](https://github.com/Jakeminator123/sajtmaskin/pull/1378) C2-observation | `codex/hosting-c2-domain-observation` | `e7d13c25b14f391fafc40f9049ebf7af4fc722a8` | `cccd4b11fdec61e2e5aeb6482a62cf09d5125957` | draft, `mergeable_state: clean` | Integrera färsk `origin/preview` med **vanlig merge** när Jakob ger mandat. DNS-visningsfynd triagerat false positive i [comment 5673130478](https://github.com/Jakeminator123/sajtmaskin/pull/1378#issuecomment-5673130478). |
| [#1379](https://github.com/Jakeminator123/sajtmaskin/pull/1379) D2-fence | `codex/hosting-d2-checkout-boundary` | `fdf3145a8f377473ff0fd78ebc9b0ba7f13810f2` | `cccd4b11fdec61e2e5aeb6482a62cf09d5125957` | draft, `mergeable_state: clean` | Samma: vanlig merge av `origin/preview`, ingen rebase. Bugbot 503/refund triagerat som känt pre-activation-tak i [comment 5673431391](https://github.com/Jakeminator123/sajtmaskin/pull/1379#issuecomment-5673431391). |
| [#1381](https://github.com/Jakeminator123/sajtmaskin/pull/1381) D2 gated offer | `feat/hosting-d2-offer-gate` | `2e3922dc34946177e7e0d0b204df0971bb3a24dc` | `e398d2b3c3bb7531436ae8f1befd44e0bea60e56` | draft. Body-validering (F6) på denna head. Endpointen förblir stängd. | Vanlig merge av `origin/preview` när Jakob ger mandat. Worktree `C:\Users\jakem\dev\projects\sajtmaskin-hosting-d2-offer`. |
| [#1382](https://github.com/Jakeminator123/sajtmaskin/pull/1382) A3 HTTPS-helper | `feat/hosting-a3-https-proof` | `794d43a90dea88f8882405a0ddd449239eeeeb0f` | `e398d2b3c3bb7531436ae8f1befd44e0bea60e56` | draft, `mergeable_state: clean`. Fristående `proveCanonicalHttps`. Inte inkopplad i deploy-POST. | Vanlig merge av `origin/preview` när Jakob ger mandat. Worktree `C:\Users\jakem\dev\projects\sajtmaskin-hosting-a3-https`. Bevisar inte att HTTPS är driftklart. |

## Parkering — inte portalagentens körordning

De här PR:erna ska synas i kön, men de är **parkerade**. Portalagenten
integrerar, rättar eller mergar dem inte.

| Spår | PR | Läge | Order |
| --- | --- | --- | --- |
| Kostnadsfri wizard-prefill | [#1374](https://github.com/Jakeminator123/sajtmaskin/pull/1374) `feat/kostnadsfri-wizard-prefill` | draft mot `preview` (`5f7d6a9b…`). `mergeable_state: dirty`. Annan agent integrerar preview och rättar taxonomifynd. | **Rör inte.** |
| Buggdrafts | [#1375](https://github.com/Jakeminator123/sajtmaskin/pull/1375) SM-085/086 · [#1376](https://github.com/Jakeminator123/sajtmaskin/pull/1376) SM-013 · [#1377](https://github.com/Jakeminator123/sajtmaskin/pull/1377) SM-089 | öppna drafts mot `preview` | Parkerade. Inte portalspåret. Merge bara efter separat mandat från Jakob. |
| Dependabot mot `preview` | [#1349](https://github.com/Jakeminator123/sajtmaskin/pull/1349) · [#1350](https://github.com/Jakeminator123/sajtmaskin/pull/1350) · [#1351](https://github.com/Jakeminator123/sajtmaskin/pull/1351) · [#1352](https://github.com/Jakeminator123/sajtmaskin/pull/1352) · [#1353](https://github.com/Jakeminator123/sajtmaskin/pull/1353) | öppna, inte draft | Parkerade. Inte portalspåret. Merge bara efter separat mandat från Jakob. |

## Worktrees — radera inte hosting-ytorna

| Yta | Gren / PR |
| --- | --- |
| `C:\Users\jakem\dev\projects\sajtmaskin-codex-hosting` | #1369 / `feat/address-contract-a3` |
| `C:\Users\jakem\dev\projects\sajtmaskin-codex-c2` | #1378 / `codex/hosting-c2-domain-observation` |
| `C:\Users\jakem\dev\projects\sajtmaskin-codex-d2` | #1379 / `codex/hosting-d2-checkout-boundary` |
| `C:\Users\jakem\dev\projects\sajtmaskin-hosting-d2-offer` | #1381 / `feat/hosting-d2-offer-gate` |
| `C:\Users\jakem\dev\projects\sajtmaskin-hosting-a3-https` | #1382 / `feat/hosting-a3-https-proof` |
| `C:\Users\jakem\dev\projects\sajtmaskin-hosting-a1-dns` | #1380 / `docs/hosting-a1-dns-underlag` |

Ingen skarp DNS-/alias-/Vercel-/abonnemangs-/pilot-skrivning.
