# `docs/archive/` — historik

Avslutade, icke-aktiva dokument som behålls som referens men **inte** styr pågående arbete. Source of truth för djupare historik är git (`git log`, `git show <commit>:<path>`).

| Undermapp | Innehåll |
|---|---|
| `status/` | Daterade statusögonblicksbilder (`STATUS-YYYY-MM-DD.md`). |

## Får läggas här

- Daterade status-/historikdokument som är klara men värda att hitta utan git-arkeologi.

## Hör inte hit

- Aktivt planarbete → [`docs/plans/active/`](../plans/active/) (se [`plan-lifecycle`](../../.cursor/rules/plan-lifecycle.mdc)).
- Avklarade **planer** → [`docs/plans/avklarat/`](../plans/avklarat/).
- Genererade artefakter som driver CI (t.ex. `docs/canvases/`) — de är **inte** arkiv.

**Nav:** [`docs/README.md`](../README.md) · [`documentation-lifecycle.md`](../architecture/documentation-lifecycle.md).
