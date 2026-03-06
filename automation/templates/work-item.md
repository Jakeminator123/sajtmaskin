---
id: {{PACKET_ID}}
iteration: {{ITERATION}}
title: {{TITLE}}
status: pending
type: {{TYPE}}
priority: {{PRIORITY}}
sourceBacklogItems:
  - {{BACKLOG_ITEM_IDS}}
reportPath: {{REPORT_PATH}}
verificationPath: {{VERIFICATION_PATH}}
steeringLogPath: {{STEERING_LOG_PATH}}
---

# Objective

{{OBJECTIVE}}

## In Scope

{{IN_SCOPE}}

## Out Of Scope

{{OUT_OF_SCOPE}}

## Linked Backlog Items

{{BACKLOG_DETAILS}}

## Acceptance Criteria

{{ACCEPTANCE_CRITERIA}}

## Implementation Notes

- Read only the code paths needed for this packet.
- Keep the scope narrow and finishable in one focused pass.
- Update the implementation report at `{{REPORT_PATH}}`.
- Append a short status note to the shared steering log at `{{STEERING_LOG_PATH}}`.

## Required Report Format

Use this exact section structure in the report:

1. `# Packet {{PACKET_ID}}`
2. `## Status`
3. `## Claimed Outcome`
4. `## Actual Outcome`
5. `## Implementation Notes`
6. `## Short Thoughts`
7. `## Validation`
