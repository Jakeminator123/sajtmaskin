## Agent 22 — Required imports / Lucide blocks

### Role

- `renderRequiredImportsChecklistBlock`: deterministisk shadcn-import-tabell från route/capabilities; tom om ingen kontext.  
- `renderLucideIconsReminderBlock`: **alltid** inklistrad fast kostnad.

### Risk of bloat vs autofix_heavy_load

Checklist: högt värde när kontext finns (explicit anti-`import-validator`-text). Lucide: kan vara redundant på text-tunga sidor.

### Confidence (%)

Checklist minskar heavy_load: **75–85%** (design, ej mätt). Lucide gated: **60–70%** rimlig nytta.

### Improvements

- Villkor för Lucide-block.  
- Cap/sortering på checklist vid många grupper.

**Model:** composer-2-fast (subagent)
