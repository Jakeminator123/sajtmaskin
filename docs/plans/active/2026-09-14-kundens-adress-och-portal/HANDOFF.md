# HANDOFF — kundens adress och portal (2026-09-15)

SHA-bunden lägesbild för nästa merge-/implementationsagent. Inte en andra
masterplan. Aktiveringsgrindar öppnas inte. `preview` delar prod-DB.

- Datum: 2026-09-15
- `origin/preview`-tip: `e398d2b3c3bb7531436ae8f1befd44e0bea60e56`
- DNS-owner: [runbooken](../../../runbooks/branded-user-urls.md) (mätt 2026-09-15)
- Plan: [00-master-plan.md](00-master-plan.md)
- A1-leverans (två testhosts/HTTPS till två projekt) är **inte** klar.
  `sites.sajtmaskin.se` och `pilot-a1-test.sites.sajtmaskin.se` är NXDOMAIN.
- PSL: avvakta. Ingen ansökan. Se runbooken.
- Huvudcheckout orörd: `feat/kostnadsfri-bolagsprofil` i
  `C:\Users\jakem\dev\projects\sajtmaskin`.

## Levererat på preview

| Del | PR |
| --- | --- |
| Planunderlag | #1357 |
| C1 sajtvy | #1358 |
| C3 etapp 1 | #1359 |
| A2 | #1360 / #1365 / #1366 |
| D1 | #1361 / #1364 |
| B1 | #1367 |

## Öppna hosting-drafts (live `gh` 2026-09-15)

| PR | Gren | Head | Base | Läge | Kvar |
| --- | --- | --- | --- | --- | --- |
| [#1369](https://github.com/Jakeminator123/sajtmaskin/pull/1369) A3-prep | `feat/address-contract-a3` | `4713069d7f81ad319b30fca64270390f71613e84` | `e398d2b3c3bb7531436ae8f1befd44e0bea60e56` | draft, `mergeable_state: clean`, draft-CI grön, Vercel `READY` (`dpl_2eUnqSwjQGdu2V1L5Lh1tEgKZNCg`), oberoende review PASS på samma head | ready → full CI → separat merge. **Inte** full A3. |
| [#1378](https://github.com/Jakeminator123/sajtmaskin/pull/1378) C2-observation | `codex/hosting-c2-domain-observation` | `e7d13c25b14f391fafc40f9049ebf7af4fc722a8` | `cccd4b11fdec61e2e5aeb6482a62cf09d5125957` | draft, `mergeable_state: clean` | Integrera ny preview-tip efter #1369-merge. DNS-visningsfynd triagerat false positive i [comment 5673130478](https://github.com/Jakeminator123/sajtmaskin/pull/1378#issuecomment-5673130478). |
| [#1379](https://github.com/Jakeminator123/sajtmaskin/pull/1379) D2-fence | `codex/hosting-d2-checkout-boundary` | `fdf3145a8f377473ff0fd78ebc9b0ba7f13810f2` | `cccd4b11fdec61e2e5aeb6482a62cf09d5125957` | draft, `mergeable_state: clean` | Integrera ny preview-tip efter #1369-merge. Bugbot 503/refund triagerat som känt pre-activation-tak i [comment 5673431391](https://github.com/Jakeminator123/sajtmaskin/pull/1379#issuecomment-5673431391). |

Mergeordning: **#1369 först**, därefter rebase #1378 + #1379 på ny preview-tip.

## Inte detta initiativ

#1372 / #1374 kostnadsfri. #1375 / #1376 / #1377 bugg-PR:er. Dependabot.

## Nästa implementationsskivor (öppna drafts)

Inte full D2 / A3 / A4. Ingen aktivering.

| PR | Gren | Head | Base | Vad |
| --- | --- | --- | --- | --- |
| [#1381](https://github.com/Jakeminator123/sajtmaskin/pull/1381) D2 gated offer | `feat/hosting-d2-offer-gate` | `432a2c685750fc976d3ce29ce67a551dde0dee33` | `e398d2b3c3bb7531436ae8f1befd44e0bea60e56` | Serverägt erbjudande + `POST /api/stripe/site-subscription/checkout` som alltid 503. Ingen Stripe-session, ingen DB-write. Worktree `C:\Users\jakem\dev\projects\sajtmaskin-hosting-d2-offer`. |
| [#1382](https://github.com/Jakeminator123/sajtmaskin/pull/1382) A3 HTTPS-helper | `feat/hosting-a3-https-proof` | `794d43a90dea88f8882405a0ddd449239eeeeb0f` | `e398d2b3c3bb7531436ae8f1befd44e0bea60e56` | Fristående `proveCanonicalHttps`. Inte importerad från deploy-POST. Worktree `C:\Users\jakem\dev\projects\sajtmaskin-hosting-a3-https`. |

Denna underlags-PR: [#1380](https://github.com/Jakeminator123/sajtmaskin/pull/1380).

## Worktrees — radera inte hosting-ytorna

| Yta | Gren / PR |
| --- | --- |
| `C:\Users\jakem\dev\projects\sajtmaskin-codex-hosting` | #1369 / `feat/address-contract-a3` |
| `C:\Users\jakem\dev\projects\sajtmaskin-codex-c2` | #1378 / `codex/hosting-c2-domain-observation` |
| `C:\Users\jakem\dev\projects\sajtmaskin-codex-d2` | #1379 / `codex/hosting-d2-checkout-boundary` |
| `C:\Users\jakem\dev\projects\sajtmaskin-hosting-d2-offer` | #1381 / `feat/hosting-d2-offer-gate` |
| `C:\Users\jakem\dev\projects\sajtmaskin-hosting-a3-https` | #1382 / `feat/hosting-a3-https-proof` |
| `C:\Users\jakem\dev\projects\sajtmaskin-hosting-a1-dns` | #1380 / `docs/hosting-a1-dns-underlag` |

Ingen skarp DNS-/alias-/Vercel-skrivning.
