# LLM And Engine Docs

This folder contains active AI, prompt, gateway, and own-engine documentation.

## Key files

- `AC-schema.txt`
  Acceptance criteria and behavioral rules for prompt-assist/gateway flows.
- `DEPS-STATUS.txt`
  Dependency, environment, and install notes.
- `ROADMAP-next.txt`
  Prioritized roadmap notes.
- `v0-prompt-guide.txt`
  Prompting and external-reference notes for v0-related work.
- `NEXT-STEPS.md`
  Current next-steps memo for the own-engine track.

## Own-engine subfolder

`docs/llm/egen-motor/` now contains only the actively maintained motor status
doc (`MOTOR-STATUS.md`).

The original R&D evaluation, analysis writeups, build plans, and handoff notes
have been moved to `old/docs-llm-egen-motor/` since that work has been absorbed
into the runtime codebase under `src/lib/gen/`.

Related architecture doc:

- `../architecture/generation-loop-and-error-memory.md`
  Current generation, post-check, scaffold traceability, and error-memory flow.

## Schema docs

Schema-heavy docs now live under `docs/schemas/`.

Start there for:

- model/build-profile mappings
- scaffold contract
- integration/data schema surfaces

## Archive note

Historical or superseded LLM-adjacent docs now live under `docs/old/llm/`.
