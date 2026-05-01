# Eval Runs

`data/eval-runs/` innehaller lokala codegen-eval-artefakter.

- `latest/summary.json` och `latest/summary.md` skrivs vid varje CLI-run.
- `runs/<timestamp>-<prompt-id>/` innehaller per-prompt metadata.
- Fil-dumpar (`raw-files`, `fixed-files`, `merged-files`, `canonical-runtime-files`) skrivs bara med `--dump-files` eller `SAJTMASKIN_EVAL_DUMP_FILES=1`.

Allt under denna mapp utom README:n ska vara gitignored. Behandla fil-dumpar som potentiellt kansliga eftersom promptar och genererad kod kan innehalla inklistrad kundtext eller konfiguration.
