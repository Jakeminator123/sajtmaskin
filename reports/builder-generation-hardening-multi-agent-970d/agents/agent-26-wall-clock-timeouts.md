## Agent 26 — Wall-clock vs configured timeouts

### Defaults from manifest

`routeTimeouts`: `engineRouteMaxDurationSeconds` default **800**, `streamSafetyTimeoutMs` default **840000** (14m), assist **600s**.

### Whether 8m50 suggests timeout vs model slowness

**530s < 800s och < 840s** → default engine/stream-safety **förklarar sällan** en ren timeout vid 8m50; troligare långsam modell/reasoning, flera sekventiella faser, eller **strängare env** / annan route (t.ex. 300s quality-gate).

### Confidence (%)

Manifest-siffror: **~98%**. Att 8m50 inte är default-timeout: **~75–85%** utan faktisk feltext.

### Improvements

- Koppla `export const maxDuration` på stream routes till manifest/env om policy ska vara sann.  
- Logga **vilket** lager som avbröt (client safety vs route vs provider).

**Model:** composer-2-fast (subagent)
