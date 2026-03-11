# Agent Usage

## Research-lane split

- Docs agent
  Answers platform and API questions from MCP-backed documentation and curated local notes.

- Template agent
  Searches `v0_vercel_agents/template_library/` for structural references, implementation hints, and scaffold upgrade candidates.

- Runtime scaffold agent
  Works only with the internal scaffold registry in `src/lib/gen/scaffolds/`.

## Important boundary

Do not treat raw external templates as runtime scaffolds.
Do not treat the product template gallery as a runtime scaffold registry either.

The promotion path is:

1. Raw template research
2. Curated dossier
3. Evaluation
4. Internal scaffold improvement

## Prompt guidance

When an agent cites a result, it should identify whether the result came from:

- official documentation
- local browser docs helper
- curated template research
- internal runtime scaffold data

This prevents prompts from mixing authoritative docs with example code and heuristics.

## Local browser helpers

For short, open-ended Vercel or v0 questions, local helpers may be used:

- `v0_vercel_agent/talk_to_v0_doc/ask_v0.py`
- `v0_vercel_agent/talk_to_vercel_doc/ask_vercel.py`

Use them only when the user is already logged in or can quickly reopen the
relevant session.
