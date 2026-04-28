## Agent 29 — previewBlocked linkage

### Code path summary

Home gate (`buildMissingHomeRouteIssue`) → `code_structure_failure` → `hasCriticalCodeFailure` i `buildPreviewStartContract` → `canStartPreview === false` → `hasPreviewBlockingPreflightErrors` (när `primaryPreviewTarget === "none"` och blockingCategories innehåller `code_structure_failure`) → `finalized.preflight.previewBlocked`.

**OBS:** telemetry i `preflight-phase` kan sätta `previewBlocked := !canStartPreview` vilket är **bredare** än log-bundlens `hasPreviewBlockingPreflightErrors`.

### Confidence (%)

**~92%** att trivial/missing home leder till preview block via `code_structure_failure`.

### Improvements

- Namnge telemetry vs bundle-flaggor olika för att undvika observability-förväxling.

**Model:** composer-2-fast (subagent)
