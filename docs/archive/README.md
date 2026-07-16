# `docs/archive/` — historik

Avslutade, icke-aktiva dokument som behålls som referens men **inte** styr
pågående arbete. Source of truth för djupare historik är git (`git log`,
`git show <commit>:<path>`).

## Får läggas här

- Historik med fortsatt incident- eller beslutsvärde som är svår att hitta via
  commit- och PR-historik.
- Daterade statusögonblicksbilder får använda `status/` när de har fortsatt
  operativt värde; annars räcker git-historiken.

## Hör inte hit

- Aktivt planarbete → [`docs/plans/active/`](../plans/active/) (se [`plan-lifecycle`](../../.cursor/rules/plan-lifecycle.mdc)).
- Avklarade **planer** → [`docs/plans/avklarat/`](../plans/avklarat/).
- Genererade artefakter som driver CI (t.ex. `docs/canvases/`) — de är **inte** arkiv.

**Nav:** [`docs/README.md`](../README.md) · [`documentation-lifecycle.md`](../documentation-lifecycle.md).
