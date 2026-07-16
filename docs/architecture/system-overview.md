# Systemöversikt

Sajtmaskin är en AI-driven builder för webbplatser och webbappar. Systemet gör
användarens avsikt till en versionerad kodbas, verifierar den och visar den i
preview innan nästa delta eller explicit publiceringsarbete.

## Huvudloop

```text
prompt
  → intent / Deep Brief eller Snapshot-Brief
  → orchestration
  → BuildSpec
  → Core Rules + Dynamic Context
  → code generation
  → Normalize / finalize + kandidatkontroller
  → persisterad draft/version
  → preview-handoff + post-check
  → RenderGate eller ReleaseGate
  → promote, Advisory, Blocker eller RepairGate
  → follow-up eller deploy
```

Stegen är ansvar, inte separata tjänster. Den faktiska körvägen och ordningen
finns i [`llm-pipeline.md`](llm-pipeline.md).

Finalize har kontroller före persist, men VM-gaten arbetar mot den persisterade
versionens filsnapshot. Samma RepairGate-port kan användas för residual i
finalize och efter den post-persist gaten. Efter persist kan den spara en
revision-bunden repair-kandidat på samma target-version; accepterad repair
uppdaterar den versionen. “Versionerad” betyder därför inte att varje target
alltid är immutabel.

Ägarskap finns i [`code-map.md`](code-map.md). Pedagogiska gränser finns i
[`../concepts/mental-model.md`](../concepts/mental-model.md). Bindande invariants
finns i [`runtime-contracts.md`](runtime-contracts.md).
