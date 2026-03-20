# Plans

This area uses explicit lifecycle buckets instead of treating every plan as
equally current.

## Buckets

- `active/`
  Execution-ready plans that should still steer implementation.
- `review-needed/`
  Older or partial plans that may still contain value, but need a reality check
  before reuse.
- `archived/`
  Completed or superseded plans kept only for traceability.

## Current status map

Verified `2026-03-20`.

- `active`:
  - `active/17-repo-separation-and-independence.md`
  - `active/build-ui-autofix-models-audit.md`
- `review-needed`: none currently
- `archived`: see `archived/README.md` and the folder contents for completed or recovery-only plans

Plans 14-16 originated from the external deep-research audit
(`docs/analyses/2026-03-deep-research-buggar-overlapp.md`).

These are planning artifacts, not runtime documentation. New plan files should
be created in `docs/plans/active/`, not in this root folder.
