
> sajtmaskin-app@0.1.0 eval:gate
> npx tsx src/lib/gen/eval/cli.ts --gate

[scaffold] seo_defaults_disabled {
  reason: 'SAJTMASKIN_SCAFFOLD_SEO_SITE_URL unset — scaffold SEO files (robots/sitemap/opengraph) and layout metadata enrichment are disabled. Set the env var (e.g. when promoting to fidelity3) to activate.'
}
Running eval suite...
[eval] Running: coffee-shop...
[build-spec] quality_target_promoted_for_multipage {
  routeCount: 3,
  buildIntent: 'website',
  generationMode: 'init',
  scaffoldId: 'landing-page',
  from: 'standard',
  to: 'premium'
}
11:56:44.996 [engine] Own-engine stream summary (AI SDK wrapper, direct provider) {
  provider: null,
  transport: 'direct_provider_api',
  sdk: 'ai',
  model: null,
  phase: 'done',
  chatId: null,
  versionId: null,
  eventCounts: {
    start: 1,
    'start-step': 1,
    'text-start': 1,
    'text-delta': 10519,
    'text-end': 1,
    'finish-step': 1,
    finish: 1
  },
  toolCalls: {},
  tokenUsage: {
    available: true,
    inputTokens: 19711,
    outputTokens: 10523,
    unavailableReason: null
  }
}
11:56:45.000 [engine] LLM stream phases {
  phase: 'done',
  streamStartedAt: 1777290884961,
  firstReasoningTokenAt: null,
  firstContentTokenAt: 1777290886647,
  streamEndedAt: 1777291004996,
  durationMs: 120035,
  reasoningMs: 0,
  outputMs: 118349,
  chatId: null,
  versionId: null
}
[35m[sajtmaskin-dev][0m 11:56:45 in-progress merged-syntax.invalid | slug=chat-eval-coffee-shop | chat=eval_cof | errors=1
[35m[sajtmaskin-dev][0m 11:56:49 in-progress preflight.summary | slug=chat-eval-coffee-shop | chat=eval_cof | files=30
[eval] coffee-shop: score=73% files=15 time=124596ms FAIL
[eval] Running: dashboard...
11:59:29.770 [engine] Own-engine stream summary (AI SDK wrapper, direct provider) {
  provider: null,
  transport: 'direct_provider_api',
  sdk: 'ai',
  model: null,
  phase: 'done',
  chatId: null,
  versionId: null,
  eventCounts: {
    start: 1,
    'start-step': 1,
    'text-start': 1,
    'text-delta': 14976,
    'text-end': 1,
    'finish-step': 1,
    finish: 1
  },
  toolCalls: {},
  tokenUsage: {
    available: true,
    inputTokens: 23513,
    outputTokens: 14980,
    unavailableReason: null
  }
}
11:59:29.773 [engine] LLM stream phases {
  phase: 'done',
  streamStartedAt: 1777291010208,
  firstReasoningTokenAt: null,
  firstContentTokenAt: 1777291014071,
  streamEndedAt: 1777291169770,
  durationMs: 159562,
  reasoningMs: 0,
  outputMs: 155699,
  chatId: null,
  versionId: null
}
[35m[sajtmaskin-dev][0m 11:59:30 in-progress preflight.summary | slug=chat-eval-dashboard | chat=eval_das | files=42
[35m[sajtmaskin-dev][0m 11:59:30 in-progress project-sanity | slug=chat-eval-dashboard | chat=eval_das | valid=false | issues=1 | files=42
[eval] dashboard: score=73% files=19 time=160670ms FAIL
[eval] Running: portfolio...
[build-spec] quality_target_promoted_for_multipage {
  routeCount: 4,
  buildIntent: 'website',
  generationMode: 'init',
  scaffoldId: 'portfolio',
  from: 'standard',
  to: 'premium'
}
[orchestrate] dossiers_selected {
  count: 1,
  poolSize: 17,
  byCapability: { carousel: [ 'embla-carousel' ] },
  inferredCapabilityBridge: [ 'carousel' ],
  callerProvidedCapabilities: [],
  requestedCapabilityTiers: null
}
12:01:59.141 [engine] Own-engine stream summary (AI SDK wrapper, direct provider) {
  provider: null,
  transport: 'direct_provider_api',
  sdk: 'ai',
  model: null,
  phase: 'done',
  chatId: null,
  versionId: null,
  eventCounts: {
    start: 1,
    'start-step': 1,
    'text-start': 1,
    'text-delta': 12822,
    'text-end': 1,
    'finish-step': 1,
    finish: 1
  },
  toolCalls: {},
  tokenUsage: {
    available: true,
    inputTokens: 22029,
    outputTokens: 12826,
    unavailableReason: null
  }
}
12:01:59.142 [engine] LLM stream phases {
  phase: 'done',
  streamStartedAt: 1777291171949,
  firstReasoningTokenAt: null,
  firstContentTokenAt: 1777291172895,
  streamEndedAt: 1777291319141,
  durationMs: 147192,
  reasoningMs: 0,
  outputMs: 146246,
  chatId: null,
  versionId: null
}
[35m[sajtmaskin-dev][0m 12:01:59 in-progress preflight.summary | slug=chat-eval-portfolio | chat=eval_por | files=37
[eval] portfolio: score=87% files=17 time=148586ms PASS
[eval] Running: blog...
[build-spec] quality_target_promoted_for_multipage {
  routeCount: 2,
  buildIntent: 'website',
  generationMode: 'init',
  scaffoldId: 'blog',
  from: 'standard',
  to: 'premium'
}
12:04:13.491 [engine] Own-engine stream summary (AI SDK wrapper, direct provider) {
  provider: null,
  transport: 'direct_provider_api',
  sdk: 'ai',
  model: null,
  phase: 'done',
  chatId: null,
  versionId: null,
  eventCounts: {
    start: 1,
    'start-step': 1,
    'text-start': 1,
    'text-delta': 10192,
    'text-end': 1,
    'finish-step': 1,
    finish: 1
  },
  toolCalls: {},
  tokenUsage: {
    available: true,
    inputTokens: 20375,
    outputTokens: 10196,
    unavailableReason: null
  }
}
12:04:13.492 [engine] LLM stream phases {
  phase: 'done',
  streamStartedAt: 1777291320625,
  firstReasoningTokenAt: null,
  firstContentTokenAt: 1777291321585,
  streamEndedAt: 1777291453491,
  durationMs: 132866,
  reasoningMs: 0,
  outputMs: 131906,
  chatId: null,
  versionId: null
}
[35m[sajtmaskin-dev][0m 12:04:13 in-progress preflight.summary | slug=chat-eval-blog | chat=eval_blog | files=29
[eval] blog: score=94% files=13 time=133916ms PASS
[eval] Running: pricing...
12:06:23.578 [engine] Own-engine stream summary (AI SDK wrapper, direct provider) {
  provider: null,
  transport: 'direct_provider_api',
  sdk: 'ai',
  model: null,
  phase: 'done',
  chatId: null,
  versionId: null,
  eventCounts: {
    start: 1,
    'start-step': 1,
    'text-start': 1,
    'text-delta': 11095,
    'text-end': 1,
    'finish-step': 1,
    finish: 1
  },
  toolCalls: {},
  tokenUsage: {
    available: true,
    inputTokens: 18876,
    outputTokens: 11099,
    unavailableReason: null
  }
}
12:06:23.579 [engine] LLM stream phases {
  phase: 'done',
  streamStartedAt: 1777291456291,
  firstReasoningTokenAt: null,
  firstContentTokenAt: 1777291456926,
  streamEndedAt: 1777291583578,
  durationMs: 127287,
  reasoningMs: 0,
  outputMs: 126652,
  chatId: null,
  versionId: null
}
[35m[sajtmaskin-dev][0m 12:06:23 in-progress merged-syntax.invalid | slug=chat-eval-pricing | chat=eval_pri | errors=1
[35m[sajtmaskin-dev][0m 12:06:44 in-progress preflight.summary | slug=chat-eval-pricing | chat=eval_pri | files=32
[35m[sajtmaskin-dev][0m 12:06:44 in-progress project-sanity | slug=chat-eval-pricing | chat=eval_pri | valid=false | issues=1 | files=32
[eval] pricing: score=66% files=15 time=129755ms FAIL
[eval] Running: auth...
[orchestrate] dossiers_selected {
  count: 1,
  poolSize: 17,
  byCapability: { auth: [ 'clerk-auth' ] },
  inferredCapabilityBridge: [ 'auth' ],
  callerProvidedCapabilities: [],
  requestedCapabilityTiers: null
}
12:07:42.751 [engine] Own-engine stream summary (AI SDK wrapper, direct provider) {
  provider: null,
  transport: 'direct_provider_api',
  sdk: 'ai',
  model: null,
  phase: 'done',
  chatId: null,
  versionId: null,
  eventCounts: {
    start: 1,
    'start-step': 1,
    'text-start': 1,
    'text-delta': 5232,
    'text-end': 1,
    'finish-step': 1,
    finish: 1
  },
  toolCalls: {},
  tokenUsage: {
    available: true,
    inputTokens: 20885,
    outputTokens: 5242,
    unavailableReason: null
  }
}
12:07:42.752 [engine] LLM stream phases {
  phase: 'done',
  streamStartedAt: 1777291604626,
  firstReasoningTokenAt: null,
  firstContentTokenAt: 1777291605681,
  streamEndedAt: 1777291662751,
  durationMs: 58125,
  reasoningMs: 0,
  outputMs: 57070,
  chatId: null,
  versionId: null
}
[35m[sajtmaskin-dev][0m 12:07:42 in-progress preflight.summary | slug=chat-eval-auth | chat=eval_auth | files=28
[35m[sajtmaskin-dev][0m 12:07:42 in-progress project-sanity | slug=chat-eval-auth | chat=eval_auth | valid=false | issues=1 | files=28
[eval] auth: score=72% files=9 time=58607ms FAIL
[eval] Running: ecommerce...
12:09:44.621 [engine] Own-engine stream summary (AI SDK wrapper, direct provider) {
  provider: null,
  transport: 'direct_provider_api',
  sdk: 'ai',
  model: null,
  phase: 'done',
  chatId: null,
  versionId: null,
  eventCounts: {
    start: 1,
    'start-step': 1,
    'text-start': 1,
    'text-delta': 10990,
    'text-end': 1,
    'finish-step': 1,
    finish: 1
  },
  toolCalls: {},
  tokenUsage: {
    available: true,
    inputTokens: 20903,
    outputTokens: 10994,
    unavailableReason: null
  }
}
12:09:44.622 [engine] LLM stream phases {
  phase: 'done',
  streamStartedAt: 1777291663466,
  firstReasoningTokenAt: null,
  firstContentTokenAt: 1777291664081,
  streamEndedAt: 1777291784620,
  durationMs: 121154,
  reasoningMs: 0,
  outputMs: 120539,
  chatId: null,
  versionId: null
}
[35m[sajtmaskin-dev][0m 12:09:45 in-progress preflight.summary | slug=chat-eval-ecommerce | chat=eval_eco | files=35
[35m[sajtmaskin-dev][0m 12:09:45 in-progress project-sanity | slug=chat-eval-ecommerce | chat=eval_eco | valid=false | issues=1 | files=35
[eval] ecommerce: score=69% files=13 time=121625ms FAIL
[eval] Running: restaurant...
[build-spec] quality_target_promoted_for_multipage {
  routeCount: 2,
  buildIntent: 'website',
  generationMode: 'init',
  scaffoldId: 'landing-page',
  from: 'standard',
  to: 'premium'
}
12:12:04.885 [engine] Own-engine stream summary (AI SDK wrapper, direct provider) {
  provider: null,
  transport: 'direct_provider_api',
  sdk: 'ai',
  model: null,
  phase: 'done',
  chatId: null,
  versionId: null,
  eventCounts: {
    start: 1,
    'start-step': 1,
    'text-start': 1,
    'text-delta': 12010,
    'text-end': 1,
    'finish-step': 1,
    finish: 1
  },
  toolCalls: {},
  tokenUsage: {
    available: true,
    inputTokens: 20772,
    outputTokens: 12014,
    unavailableReason: null
  }
}
12:12:04.886 [engine] LLM stream phases {
  phase: 'done',
  streamStartedAt: 1777291786558,
  firstReasoningTokenAt: null,
  firstContentTokenAt: 1777291787615,
  streamEndedAt: 1777291924884,
  durationMs: 138326,
  reasoningMs: 0,
  outputMs: 137269,
  chatId: null,
  versionId: null
}
[35m[sajtmaskin-dev][0m 12:12:05 in-progress file-repair | slug=chat-eval-restaurant | chat=eval_res | fixes=1
[35m[sajtmaskin-dev][0m 12:12:05 in-progress merged-syntax.invalid | slug=chat-eval-restaurant | chat=eval_res | errors=1
[35m[sajtmaskin-dev][0m 12:12:08 in-progress preflight.summary | slug=chat-eval-restaurant | chat=eval_res | files=33
[eval] restaurant: score=76% files=14 time=139654ms FAIL
[eval] Running: agency...
[build-spec] quality_target_promoted_for_multipage {
  routeCount: 2,
  buildIntent: 'website',
  generationMode: 'init',
  scaffoldId: 'landing-page',
  from: 'standard',
  to: 'premium'
}
12:14:24.612 [engine] Own-engine stream summary (AI SDK wrapper, direct provider) {
  provider: null,
  transport: 'direct_provider_api',
  sdk: 'ai',
  model: null,
  phase: 'done',
  chatId: null,
  versionId: null,
  eventCounts: {
    start: 1,
    'start-step': 1,
    'text-start': 1,
    'text-delta': 12514,
    'text-end': 1,
    'finish-step': 1,
    finish: 1
  },
  toolCalls: {},
  tokenUsage: {
    available: true,
    inputTokens: 18432,
    outputTokens: 12518,
    unavailableReason: null
  }
}
12:14:24.613 [engine] LLM stream phases {
  phase: 'done',
  streamStartedAt: 1777291929931,
  firstReasoningTokenAt: null,
  firstContentTokenAt: 1777291931018,
  streamEndedAt: 1777292064611,
  durationMs: 134680,
  reasoningMs: 0,
  outputMs: 133593,
  chatId: null,
  versionId: null
}
[35m[sajtmaskin-dev][0m 12:14:24 in-progress merged-syntax.invalid | slug=chat-eval-agency | chat=eval_age | errors=1
[35m[sajtmaskin-dev][0m 12:14:28 in-progress preflight.summary | slug=chat-eval-agency | chat=eval_age | files=32
[eval] agency: score=75% files=13 time=135965ms FAIL
[eval] Running: settings...
12:16:22.927 [engine] Own-engine stream summary (AI SDK wrapper, direct provider) {
  provider: null,
  transport: 'direct_provider_api',
  sdk: 'ai',
  model: null,
  phase: 'done',
  chatId: null,
  versionId: null,
  eventCounts: {
    start: 1,
    'start-step': 1,
    'text-start': 1,
    'text-delta': 10889,
    'text-end': 1,
    'finish-step': 1,
    finish: 1
  },
  toolCalls: {},
  tokenUsage: {
    available: true,
    inputTokens: 20199,
    outputTokens: 10899,
    unavailableReason: null
  }
}
12:16:22.928 [engine] LLM stream phases {
  phase: 'done',
  streamStartedAt: 1777292068545,
  firstReasoningTokenAt: null,
  firstContentTokenAt: 1777292069397,
  streamEndedAt: 1777292182927,
  durationMs: 114382,
  reasoningMs: 0,
  outputMs: 113530,
  chatId: null,
  versionId: null
}
[35m[sajtmaskin-dev][0m 12:16:23 in-progress preflight.summary | slug=chat-eval-settings | chat=eval_set | files=34
[eval] settings: score=75% files=9 time=114876ms FAIL
[eval] Running: booking-service...
[build-spec] quality_target_promoted_for_multipage {
  routeCount: 2,
  buildIntent: 'website',
  generationMode: 'init',
  scaffoldId: 'landing-page',
  from: 'standard',
  to: 'premium'
}
12:20:59.271 [engine] Own-engine stream summary (AI SDK wrapper, direct provider) {
  provider: null,
  transport: 'direct_provider_api',
  sdk: 'ai',
  model: null,
  phase: 'done',
  chatId: null,
  versionId: null,
  eventCounts: {
    start: 1,
    'start-step': 1,
    'text-start': 2,
    'text-delta': 26786,
    'text-end': 2,
    'finish-step': 1,
    finish: 1
  },
  toolCalls: {},
  tokenUsage: {
    available: true,
    inputTokens: 17200,
    outputTokens: 26797,
    unavailableReason: null
  }
}
12:20:59.273 [engine] LLM stream phases {
  phase: 'done',
  streamStartedAt: 1777292183980,
  firstReasoningTokenAt: null,
  firstContentTokenAt: 1777292184786,
  streamEndedAt: 1777292459271,
  durationMs: 275291,
  reasoningMs: 0,
  outputMs: 274485,
  chatId: null,
  versionId: null
}
[35m[sajtmaskin-dev][0m 12:21:01 in-progress merged-syntax.invalid | slug=chat-eval-booking-service | chat=eval_boo | errors=1
[35m[sajtmaskin-dev][0m 12:21:05 in-progress preflight.summary | slug=chat-eval-booking-service | chat=eval_boo | files=29
[35m[sajtmaskin-dev][0m 12:21:05 in-progress project-sanity | slug=chat-eval-booking-service | chat=eval_boo | valid=false | issues=2 | files=29
[eval] booking-service: score=74% files=12 time=275949ms FAIL
[eval] Running: multi-page-brochure...
[build-spec] quality_target_promoted_for_multipage {
  routeCount: 3,
  buildIntent: 'website',
  generationMode: 'init',
  scaffoldId: 'landing-page',
  from: 'standard',
  to: 'premium'
}
12:24:21.073 [engine] Own-engine stream summary (AI SDK wrapper, direct provider) {
  provider: null,
  transport: 'direct_provider_api',
  sdk: 'ai',
  model: null,
  phase: 'done',
  chatId: null,
  versionId: null,
  eventCounts: {
    start: 1,
    'start-step': 1,
    'text-start': 1,
    'text-delta': 16030,
    'text-end': 1,
    'finish-step': 1,
    finish: 1
  },
  toolCalls: {},
  tokenUsage: {
    available: true,
    inputTokens: 18329,
    outputTokens: 16034,
    unavailableReason: null
  }
}
12:24:21.074 [engine] LLM stream phases {
  phase: 'done',
  streamStartedAt: 1777292467998,
  firstReasoningTokenAt: null,
  firstContentTokenAt: 1777292468444,
  streamEndedAt: 1777292661073,
  durationMs: 193075,
  reasoningMs: 0,
  outputMs: 192629,
  chatId: null,
  versionId: null
}
[35m[sajtmaskin-dev][0m 12:24:21 in-progress merged-syntax.invalid | slug=chat-eval-multi-page-brochure | chat=eval_mul | errors=1
[35m[sajtmaskin-dev][0m 12:24:26 in-progress preflight.summary | slug=chat-eval-multi-page-brochure | chat=eval_mul | files=40
[eval] multi-page-brochure: score=80% files=21 time=195306ms FAIL
[eval] Running: saas-dashboard...
12:27:36.389 [engine] Own-engine stream summary (AI SDK wrapper, direct provider) {
  provider: null,
  transport: 'direct_provider_api',
  sdk: 'ai',
  model: null,
  phase: 'done',
  chatId: null,
  versionId: null,
  eventCounts: {
    start: 1,
    'start-step': 1,
    'text-start': 1,
    'text-delta': 16864,
    'text-end': 1,
    'finish-step': 1,
    finish: 1
  },
  toolCalls: {},
  tokenUsage: {
    available: true,
    inputTokens: 21494,
    outputTokens: 16868,
    unavailableReason: null
  }
}
12:27:36.390 [engine] LLM stream phases {
  phase: 'done',
  streamStartedAt: 1777292667634,
  firstReasoningTokenAt: null,
  firstContentTokenAt: 1777292668369,
  streamEndedAt: 1777292856389,
  durationMs: 188755,
  reasoningMs: 0,
  outputMs: 188020,
  chatId: null,
  versionId: null
}
[35m[sajtmaskin-dev][0m 12:27:37 in-progress preflight.summary | slug=chat-eval-saas-dashboard | chat=eval_saa | files=47
[35m[sajtmaskin-dev][0m 12:27:37 in-progress project-sanity | slug=chat-eval-saas-dashboard | chat=eval_saa | valid=false | issues=4 | files=47
[eval] saas-dashboard: score=74% files=18 time=189846ms FAIL
[eval] Running: content-heavy-blog...
[build-spec] quality_target_promoted_for_multipage {
  routeCount: 3,
  buildIntent: 'website',
  generationMode: 'init',
  scaffoldId: 'blog',
  from: 'standard',
  to: 'premium'
}
12:31:07.154 [engine] Own-engine stream summary (AI SDK wrapper, direct provider) {
  provider: null,
  transport: 'direct_provider_api',
  sdk: 'ai',
  model: null,
  phase: 'done',
  chatId: null,
  versionId: null,
  eventCounts: {
    start: 1,
    'start-step': 1,
    'text-start': 1,
    'text-delta': 17665,
    'text-end': 1,
    'finish-step': 1,
    finish: 1
  },
  toolCalls: {},
  tokenUsage: {
    available: true,
    inputTokens: 16876,
    outputTokens: 17669,
    unavailableReason: null
  }
}
12:31:07.155 [engine] LLM stream phases {
  phase: 'done',
  streamStartedAt: 1777292858249,
  firstReasoningTokenAt: null,
  firstContentTokenAt: 1777292859833,
  streamEndedAt: 1777293067154,
  durationMs: 208905,
  reasoningMs: 0,
  outputMs: 207321,
  chatId: null,
  versionId: null
}
[35m[sajtmaskin-dev][0m 12:31:08 in-progress preflight.summary | slug=chat-eval-content-heavy-blog | chat=eval_con | files=42
[35m[sajtmaskin-dev][0m 12:31:08 in-progress project-sanity | slug=chat-eval-content-heavy-blog | chat=eval_con | valid=false | issues=1 | files=42
[eval] content-heavy-blog: score=73% files=26 time=209630ms FAIL
[eval] Running: consultant-landing...
[build-spec] quality_target_promoted_for_multipage {
  routeCount: 4,
  buildIntent: 'website',
  generationMode: 'init',
  scaffoldId: 'landing-page',
  from: 'standard',
  to: 'premium'
}
12:33:46.050 [engine] Own-engine stream summary (AI SDK wrapper, direct provider) {
  provider: null,
  transport: 'direct_provider_api',
  sdk: 'ai',
  model: null,
  phase: 'done',
  chatId: null,
  versionId: null,
  eventCounts: {
    start: 1,
    'start-step': 1,
    'text-start': 1,
    'text-delta': 13392,
    'text-end': 1,
    'finish-step': 1,
    finish: 1
  },
  toolCalls: {},
  tokenUsage: {
    available: true,
    inputTokens: 19666,
    outputTokens: 13396,
    unavailableReason: null
  }
}
12:33:46.051 [engine] LLM stream phases {
  phase: 'done',
  streamStartedAt: 1777293070006,
  firstReasoningTokenAt: null,
  firstContentTokenAt: 1777293070737,
  streamEndedAt: 1777293226050,
  durationMs: 156044,
  reasoningMs: 0,
  outputMs: 155313,
  chatId: null,
  versionId: null
}
[35m[sajtmaskin-dev][0m 12:33:46 in-progress merged-syntax.invalid | slug=chat-eval-consultant-landing | chat=eval_con | errors=1
[35m[sajtmaskin-dev][0m 12:33:50 in-progress preflight.summary | slug=chat-eval-consultant-landing | chat=eval_con | files=36
[eval] consultant-landing: score=74% files=15 time=157556ms FAIL
# Eval Report — 2026-04-27

Model: gpt-5.4 | Total: 15 | Passed: 2 | Avg Score: 76% | Avg Time: 153.1s

Blocking failures: 13/15 | Top blockers: tier2-readiness (13), syntax (7), project-sanity (7), required-files (2)

| # | Prompt | Score | Files | Time | Status | Issues |
|---|--------|-------|-------|------|--------|--------|
| 1 | coffee-shop | 73%   | 15    | 124.6s | FAIL   | tier2-readiness: Merged syntax error line 10:8 — Expected ">" but found "style" [code_structure_failure]; file-count: Expected at most 8 files, got 15; responsive: 11/12 components use responsive classes; syntax: 1 syntax error: app/api/placeholder/route.ts:10 Expected ">" but found "style" blockers=tier2-readiness,syntax |
| 2 | dashboard | 73%   | 19    | 160.7s | FAIL   | project-sanity: components/stats-card.tsx: Unresolved local import: @/components/icon; tier2-readiness: Unresolved local import: @/components/icon [code_structure_failure]; file-count: Expected at most 12 files, got 19; responsive: 13/17 components use responsive classes blockers=project-sanity,tier2-readiness |
| 3 | portfolio | 87%   | 17    | 148.6s | PASS   | file-count: Expected at most 8 files, got 17; responsive: 13/15 components use responsive classes |
| 4 | blog   | 94%   | 13    | 133.9s | PASS   | file-count: Expected at most 10 files, got 13; responsive: 9/11 components use responsive classes |
| 5 | pricing | 66%   | 15    | 129.8s | FAIL   | project-sanity: package.json: Imported third-party package "@vercel/analytics" is used in code but not pinned in package.json (app/layout.tsx); tier2-readiness: Imported third-party package "@vercel/analytics" is used in code but not pinned in package.json (app/layout.tsx) [dependency_install_failure]; file-count: Expected at most 6 files, got 15; responsive: 12/13 components use responsive classes; syntax: 1 syntax error: app/page.tsx:168 Unexpected end of file before a closing "p" tag blockers=project-sanity,tier2-readiness,syntax |
| 6 | auth   | 72%   | 9     | 58.6s | FAIL   | project-sanity: package.json: Imported third-party package "@vercel/analytics" is used in code but not pinned in package.json (app/layout.tsx); tier2-readiness: Imported third-party package "@vercel/analytics" is used in code but not pinned in package.json (app/layout.tsx) [dependency_install_failure]; file-count: Expected at most 5 files, got 9; responsive: 4/7 components use responsive classes blockers=project-sanity,tier2-readiness |
| 7 | ecommerce | 69%   | 13    | 121.6s | FAIL   | project-sanity: package.json: Imported third-party package "@vercel/analytics" is used in code but not pinned in package.json (app/layout.tsx); tier2-readiness: Required home route is missing — neither app/page.tsx nor src/app/page.tsx exists in the merged file set. Scaffold defaults are blocked from filling this slot (LLM_ONLY_PATHS); the LLM must emit it. [code_structure_failure, dependency_install_failure]; visual-quality: hero-quality: No main page found.; image-usage: No main page found.; section-variety: No main page found.; file-count: Expected at most 10 files, got 13; required-files: Missing: app/page.tsx; responsive: 9/11 components use responsive classes blockers=project-sanity,tier2-readiness,required-files |
| 8 | restaurant | 76%   | 14    | 139.7s | FAIL   | tier2-readiness: Merged syntax error line 12:8 — Expected ">" but found "style" [code_structure_failure]; file-count: Expected at most 8 files, got 14; responsive: 8/11 components use responsive classes; syntax: 1 syntax error: app/api/placeholder/route.ts:12 Expected ">" but found "style" blockers=tier2-readiness,syntax |
| 9 | agency | 75%   | 13    | 136.0s | FAIL   | tier2-readiness: Merged syntax error line 10:8 — Expected ">" but found "style" [code_structure_failure]; file-count: Expected at most 8 files, got 13; responsive: 9/10 components use responsive classes; syntax: 1 syntax error: app/api/placeholder/route.ts:10 Expected ">" but found "style" blockers=tier2-readiness,syntax |
| 10 | settings | 75%   | 9     | 114.9s | FAIL   | tier2-readiness: Required home route is missing — neither app/page.tsx nor src/app/page.tsx exists in the merged file set. Scaffold defaults are blocked from filling this slot (LLM_ONLY_PATHS); the LLM must emit it. [code_structure_failure]; visual-quality: hero-quality: No main page found.; image-usage: No main page found.; section-variety: No main page found.; file-count: Expected at most 6 files, got 9; required-files: Missing: app/page.tsx; responsive: 6/7 components use responsive classes blockers=tier2-readiness,required-files |
| 11 | booking-service | 74%   | 12    | 275.9s | FAIL   | project-sanity: app/booking/page.tsx: Unresolved local import: @/components/date; package.json: Imported third-party package "@vercel/analytics" is used in code but not pinned in package.json (app/layout.tsx); tier2-readiness: Merged syntax error line 10:8 — Expected ">" but found "style" [code_structure_failure, dependency_install_failure]; file-count: Expected at most 10 files, got 12; responsive: 8/9 components use responsive classes; syntax: 1 syntax error: app/api/placeholder/route.ts:10 Expected ">" but found "style" blockers=project-sanity,tier2-readiness,syntax |
| 12 | multi-page-brochure | 80%   | 21    | 195.3s | FAIL   | tier2-readiness: Merged syntax error line 16:8 — Expected ">" but found "style" [code_structure_failure]; file-count: Expected at most 15 files, got 21; responsive: 17/18 components use responsive classes; syntax: 1 syntax error: app/api/placeholder/route.ts:16 Expected ">" but found "style" blockers=tier2-readiness,syntax |
| 13 | saas-dashboard | 74%   | 18    | 189.8s | FAIL   | project-sanity: components/stats-card.tsx: Unresolved local import: @/components/icon; components/settings-workspace.tsx: Unresolved local import: @/components/k; components/ui/empty.tsx: Unresolved local import: @/components/icon; tier2-readiness: Unresolved local import: @/components/k [code_structure_failure]; file-count: Expected at most 15 files, got 18; responsive: 12/16 components use responsive classes blockers=project-sanity,tier2-readiness |
| 14 | content-heavy-blog | 73%   | 26    | 209.6s | FAIL   | project-sanity: package.json: Imported third-party package "@vercel/analytics" is used in code but not pinned in package.json (app/layout.tsx); tier2-readiness: Imported third-party package "@vercel/analytics" is used in code but not pinned in package.json (app/layout.tsx) [dependency_install_failure]; file-count: Expected at most 15 files, got 26; responsive: 12/22 components use responsive classes blockers=project-sanity,tier2-readiness |
| 15 | consultant-landing | 74%   | 15    | 157.6s | FAIL   | tier2-readiness: Merged syntax error line 10:8 — Expected ">" but found "style" [code_structure_failure]; file-count: Expected at most 8 files, got 15; responsive: 8/13 components use responsive classes; syntax: 1 syntax error: app/api/placeholder/route.ts:10 Expected ">" but found "style" blockers=tier2-readiness,syntax |

## Failed Prompts

### coffee-shop

- **Blocking checks:** tier2-readiness, syntax
- **tier2-readiness** (0%): Merged syntax error line 10:8 — Expected ">" but found "style" [code_structure_failure]
- **file-count** (13%): Expected at most 8 files, got 15
- **responsive** (92%): 11/12 components use responsive classes
- **syntax** (0%): 1 syntax error: app/api/placeholder/route.ts:10 Expected ">" but found "style"

### dashboard

- **Blocking checks:** project-sanity, tier2-readiness
- **project-sanity** (0%): components/stats-card.tsx: Unresolved local import: @/components/icon
- **tier2-readiness** (0%): Unresolved local import: @/components/icon [code_structure_failure]
- **file-count** (42%): Expected at most 12 files, got 19
- **responsive** (76%): 13/17 components use responsive classes

### pricing

- **Blocking checks:** project-sanity, tier2-readiness, syntax
- **project-sanity** (0%): package.json: Imported third-party package "@vercel/analytics" is used in code but not pinned in package.json (app/layout.tsx)
- **tier2-readiness** (0%): Imported third-party package "@vercel/analytics" is used in code but not pinned in package.json (app/layout.tsx) [dependency_install_failure]
- **file-count** (0%): Expected at most 6 files, got 15
- **responsive** (92%): 12/13 components use responsive classes
- **syntax** (0%): 1 syntax error: app/page.tsx:168 Unexpected end of file before a closing "p" tag

### auth

- **Blocking checks:** project-sanity, tier2-readiness
- **project-sanity** (0%): package.json: Imported third-party package "@vercel/analytics" is used in code but not pinned in package.json (app/layout.tsx)
- **tier2-readiness** (0%): Imported third-party package "@vercel/analytics" is used in code but not pinned in package.json (app/layout.tsx) [dependency_install_failure]
- **file-count** (20%): Expected at most 5 files, got 9
- **responsive** (57%): 4/7 components use responsive classes

### ecommerce

- **Blocking checks:** project-sanity, tier2-readiness, required-files
- **project-sanity** (0%): package.json: Imported third-party package "@vercel/analytics" is used in code but not pinned in package.json (app/layout.tsx)
- **tier2-readiness** (0%): Required home route is missing — neither app/page.tsx nor src/app/page.tsx exists in the merged file set. Scaffold defaults are blocked from filling this slot (LLM_ONLY_PATHS); the LLM must emit it. [code_structure_failure, dependency_install_failure]
- **visual-quality** (50%): hero-quality: No main page found.; image-usage: No main page found.; section-variety: No main page found.
- **file-count** (70%): Expected at most 10 files, got 13
- **required-files** (0%): Missing: app/page.tsx
- **responsive** (82%): 9/11 components use responsive classes

### restaurant

- **Blocking checks:** tier2-readiness, syntax
- **tier2-readiness** (0%): Merged syntax error line 12:8 — Expected ">" but found "style" [code_structure_failure]
- **file-count** (25%): Expected at most 8 files, got 14
- **responsive** (73%): 8/11 components use responsive classes
- **syntax** (0%): 1 syntax error: app/api/placeholder/route.ts:12 Expected ">" but found "style"

### agency

- **Blocking checks:** tier2-readiness, syntax
- **tier2-readiness** (0%): Merged syntax error line 10:8 — Expected ">" but found "style" [code_structure_failure]
- **file-count** (38%): Expected at most 8 files, got 13
- **responsive** (90%): 9/10 components use responsive classes
- **syntax** (0%): 1 syntax error: app/api/placeholder/route.ts:10 Expected ">" but found "style"

### settings

- **Blocking checks:** tier2-readiness, required-files
- **tier2-readiness** (0%): Required home route is missing — neither app/page.tsx nor src/app/page.tsx exists in the merged file set. Scaffold defaults are blocked from filling this slot (LLM_ONLY_PATHS); the LLM must emit it. [code_structure_failure]
- **visual-quality** (50%): hero-quality: No main page found.; image-usage: No main page found.; section-variety: No main page found.
- **file-count** (50%): Expected at most 6 files, got 9
- **required-files** (0%): Missing: app/page.tsx
- **responsive** (86%): 6/7 components use responsive classes

### booking-service

- **Blocking checks:** project-sanity, tier2-readiness, syntax
- **project-sanity** (0%): app/booking/page.tsx: Unresolved local import: @/components/date; package.json: Imported third-party package "@vercel/analytics" is used in code but not pinned in package.json (app/layout.tsx)
- **tier2-readiness** (0%): Merged syntax error line 10:8 — Expected ">" but found "style" [code_structure_failure, dependency_install_failure]
- **file-count** (80%): Expected at most 10 files, got 12
- **responsive** (89%): 8/9 components use responsive classes
- **syntax** (0%): 1 syntax error: app/api/placeholder/route.ts:10 Expected ">" but found "style"

### multi-page-brochure

- **Blocking checks:** tier2-readiness, syntax
- **tier2-readiness** (0%): Merged syntax error line 16:8 — Expected ">" but found "style" [code_structure_failure]
- **file-count** (60%): Expected at most 15 files, got 21
- **responsive** (94%): 17/18 components use responsive classes
- **syntax** (0%): 1 syntax error: app/api/placeholder/route.ts:16 Expected ">" but found "style"

### saas-dashboard

- **Blocking checks:** project-sanity, tier2-readiness
- **project-sanity** (0%): components/stats-card.tsx: Unresolved local import: @/components/icon; components/settings-workspace.tsx: Unresolved local import: @/components/k; components/ui/empty.tsx: Unresolved local import: @/components/icon
- **tier2-readiness** (0%): Unresolved local import: @/components/k [code_structure_failure]
- **file-count** (80%): Expected at most 15 files, got 18
- **responsive** (75%): 12/16 components use responsive classes

### content-heavy-blog

- **Blocking checks:** project-sanity, tier2-readiness
- **project-sanity** (0%): package.json: Imported third-party package "@vercel/analytics" is used in code but not pinned in package.json (app/layout.tsx)
- **tier2-readiness** (0%): Imported third-party package "@vercel/analytics" is used in code but not pinned in package.json (app/layout.tsx) [dependency_install_failure]
- **file-count** (27%): Expected at most 15 files, got 26
- **responsive** (55%): 12/22 components use responsive classes

### consultant-landing

- **Blocking checks:** tier2-readiness, syntax
- **tier2-readiness** (0%): Merged syntax error line 10:8 — Expected ">" but found "style" [code_structure_failure]
- **file-count** (13%): Expected at most 8 files, got 15
- **responsive** (62%): 8/13 components use responsive classes
- **syntax** (0%): 1 syntax error: app/api/placeholder/route.ts:10 Expected ">" but found "style"


## Baseline comparison

Overall avg score delta: -20.7%
Gate result: FAIL

### Regressions

- **coffee-shop**: 93.8% → 73.4% (-20.4%)
- **dashboard**: 93.8% → 72.5% (-21.2%)
- **portfolio**: 93.8% → 86.7% (-7.0%)
- **blog**: 96.3% → 94.2% (-2.0%)
- **pricing**: 100.0% → 65.6% (-34.4%)
- **auth**: 100.0% → 72.2% (-27.8%)
- **ecommerce**: 100.0% → 68.6% (-31.4%)
- **restaurant**: 93.8% → 76.0% (-17.8%)
- **agency**: 100.0% → 75.2% (-24.8%)
- **settings**: 100.0% → 75.1% (-24.9%)
- **booking-service**: 83.3% → 73.8% (-9.6%)
- **multi-page-brochure**: 100.0% → 80.0% (-20.0%)
- **saas-dashboard**: 87.5% → 74.5% (-13.0%)
- **content-heavy-blog**: 94.6% → 72.8% (-21.8%)
- **consultant-landing**: 93.8% → 74.2% (-19.6%)

### PASS → FAIL

- **coffee-shop**: PASS → FAIL
- **dashboard**: PASS → FAIL
- **pricing**: PASS → FAIL
- **auth**: PASS → FAIL
- **ecommerce**: PASS → FAIL
- **restaurant**: PASS → FAIL
- **agency**: PASS → FAIL
- **settings**: PASS → FAIL
- **multi-page-brochure**: PASS → FAIL
- **saas-dashboard**: PASS → FAIL
- **content-heavy-blog**: PASS → FAIL
- **consultant-landing**: PASS → FAIL

### New Blocking Checks

- **coffee-shop**: +tier2-readiness, syntax
- **dashboard**: +project-sanity, tier2-readiness
- **pricing**: +project-sanity, tier2-readiness, syntax
- **auth**: +project-sanity, tier2-readiness
- **ecommerce**: +project-sanity, tier2-readiness, required-files
- **restaurant**: +tier2-readiness, syntax
- **agency**: +tier2-readiness, syntax
- **settings**: +tier2-readiness, required-files
- **booking-service**: +project-sanity, tier2-readiness, syntax
- **multi-page-brochure**: +tier2-readiness, syntax
- **saas-dashboard**: +project-sanity, tier2-readiness
- **content-heavy-blog**: +project-sanity, tier2-readiness
- **consultant-landing**: +tier2-readiness, syntax

Gate failed: regression detected.
