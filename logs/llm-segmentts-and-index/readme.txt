LLM / AI phases for website generation (focus: free-text -> first build -> follow-up)

Phase 1: Pre-generation / orchestration
	-Prompt polish ("Skriv om") [optional]
	-Prompt rewrite / improve ("Forbattra") [optional]
	-Deep brief [optional, first build only]
	-Server auto-brief [optional fallback when client has not already sent brief]
	-Spec helper / specMode
	-Scaffold selection
	-Scaffold embeddings search
	-Route plan
	-Pre-generation contracts
	-BuildSpec
	-Dynamic context assembly
	-Planner [plan mode only, not normal website generation]

Phase 2: Code generation
	-Generator / own-engine codegen stream

Phase 3: Post-generation / validation / runtime
	-Deterministic autofix
	-URL expand
	-Syntax validation
	-Syntax fixer / LLM fixer [only when validation finds errors]
	-Image materialization [deep path only]
	-Verifier pass [read-only LLM, only when policy says yes]
	-Parse / merge / preflight
	-Version persist
	-Preview start
	-Quality gate [async verify lane: typecheck/lint/build enligt policy; kan trigga repair]
	-Server verify [async background]
	-Server repair / manual repair route [only after quality-gate failures]

Notes
	-/api/ai/spec exists, but it is not part of the normal builder flow today.
	-Normal builder specMode usually builds sajtmaskin.spec.json from briefToSpec() or promptToSpec().
	-Scaffold selection is important to log even though it is not a classic LLM call, because it strongly affects downstream quality.
	-Deploy assistant exists in phase routing, but is not a normal visible step in the standard website generation path today.
	-Follow-up prompts reuse much of the same chain, but often skip deep brief and can use a lighter finalize path.

Fault and Fix Index
	-One shared index per generation run.
	-It should show both faults and attempted fixes across all phases above.
	-It should include at least:
		-time
		-phase
		-subphase / step
		-fault / signal
		-severity
		-what system created the fault
		-what system attempted the fix
		-model tier
		-concrete model
		-provider
		-pass number / repair pass
		-result
		-chatId
		-versionId
		-lineageHash

Suggested creator/fixer values
	-prompt-polish
	-prompt-rewrite
	-deep-brief
	-server-auto-brief
	-spec-helper
	-scaffold-keyword-match
	-scaffold-embedding-match
	-generator
	-deterministic-autofix
	-syntax-validator
	-llm-fixer
	-verifier-pass
	-preflight
	-preview
	-server-verify
	-server-repair
	-manual-repair

Important distinction
	-Fault and Fix Index should not only track hard errors.
	-It should also track warnings, quality findings, skipped steps, policy decisions, and "heavy load" signals that explain why a generation became unstable even when it technically succeeded.