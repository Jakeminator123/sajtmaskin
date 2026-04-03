# Strict Schemas

This folder contains machine-oriented schema artifacts for Sajtmaskin.

Purpose:

- give dashboard/tooling a cleaner contract surface
- support parity tests and path validation
- stay diff-friendly and conservative

Rules:

- strict schema files must be backed by real code sources of truth
- strict schema files do **not** replace runtime truth in code
- prefer JSON or similarly machine-readable formats
- keep one concern per file

Conservative rollout:

- human-readable schema docs remain in `docs/schemas/*.md`
- new machine-oriented contract mirrors go here under `strict/`
- do not move the whole human layer into a `human/` subfolder unless the churn
  is justified and all references are updated together
