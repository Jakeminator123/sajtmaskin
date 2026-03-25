# Återstående arbete (efter external-review remediation exit)

**Remediation enligt `1.txt` / `2.txt` / `3.txt` + W1–W5:** avslutad — se [`archived/external-review-execution/REMEDIATION-EXIT.md`](../archived/external-review-execution/REMEDIATION-EXIT.md). Den här filen är **inte** en andra sanning om samma spår; den **samlar pekare** till det som fortfarande är medvetet öppet (produkt, arkitektur, valfri drift).

## Snabb checklista för agenter

| Område | Kanonisk källa | Typ |
|--------|----------------|-----|
| Kritik / K-rader | [`kritik-consolidated-open-items.md`](./kritik-consolidated-open-items.md) | produkt + kod (K-007 deploy-policy, K-008 landningssignoff, K-009 own-engine utanför W3, K-014 copy) |
| Repo separation / städ | [`17-repo-separation-and-independence.md`](./17-repo-separation-and-independence.md) | WS-5 (research/`docs/old`), WS-6 (D-ID / OpenClaw / … beslut), deferred (`AI_GATEWAY_*`, `ENV.md`, v0 SDK där det fortfarande behövs) |
| Valfri HTTP-smoke deploy | [`e2e/README.md`](../../e2e/README.md) § *Deploy API* | kräver `SAJTMASKIN_E2E_*` |
| Segment-% (integration / own-engine) | [`external-review-remediation-progress.md`](./external-review-remediation-progress.md) § *Overall fill* | scope-indikator, inte “trasigt spår” |
| W1–W5 under remediation (historik) | [`../archived/orchestrator-workloads-external-review.md`](../archived/orchestrator-workloads-external-review.md) | läs inte som aktiv backlog; använd tabellen ovan |

## Är plan 17 gammal / obsolet?

**Nej** — kärnan WS-1–WS-4 är levererad och historiken är värdefull. Det som återstår (WS-5/WS-6 + deferred-raderna i WS-2/WS-4) är **medvetet** öppet; antingen gör ni det i en framtida våg eller stryker kryss med motivering. Ingen motsägelse mot att **external review** är 100 % i *sitt* scope.

## Uppdatering

När en rad stängs: uppdatera **källfilen** (kritik-tabellen eller plan 17), inte bara denna lista. Denna fil får kort **“Senast synkad”**-rad i [`../README.md`](../README.md) vid behov — undvik att duplicera långa tabeller här.

**Senast innehållsmässigt stämd:** 2026-03-25 (`external-review-execution/` flyttad till `docs/plans/archived/`; stub kvar under `active/`).
