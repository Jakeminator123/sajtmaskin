# Browser QA Autoloop — Aggregate Report

**Date:** 2026-04-04T19:06:52.635Z
**Personas tested:** 10
**Successful:** 7/10
**Average score:** 59%
**Total duration:** 141 min
**Pause between personas:** 120s

## Per-persona results

| # | Name | Business | Score | Pages | Duration | Status |
|---|------|----------|-------|-------|----------|--------|
| 1 | Anna | Frisörsalong i Göteborg | 93% | 5 | 934s | ✅ |
| 2 | Erik | IT-konsult i Stockholm | 100% | 5 | 945s | ✅ |
| 3 | Fatima | Restaurang i Malmö | 100% | 5 | 861s | ✅ |
| 4 | Mohammed | Bilverkstad i Västerås | 0% | 0 | 1024s | ✅ |
| 5 | Linnea | Yoga-studio i Lund | 100% | 5 | 977s | ✅ |
| 6 | Oskar | Advokatbyrå i Linköping | 0% | 0 | 45s | ❌ |
| 7 | Mei | Second-hand butik i Uppsala | 0% | 0 | 948s | ❌ |
| 8 | Björn | Takläggeri i Norrköping | 100% | 7 | 769s | ✅ |
| 9 | Saga | Influencer/content i Malmö | 100% | 4 | 987s | ✅ |
| 10 | Lars | Pensionär hobby blogg | 0% | 0 | 946s | ❌ |

## Check summary

| Check | Pass | Fail |
|-------|------|------|
| iframe-accessible | 6 | 1 |
| swedish-characters | 6 | 0 |
| no-english-body | 6 | 0 |
| no-lorem-ipsum | 6 | 0 |
| has-heading | 6 | 0 |
| has-cta | 6 | 0 |
| has-images | 6 | 0 |
| has-footer | 6 | 0 |
| has-navigation | 6 | 0 |
| content-density | 6 | 0 |
| has-sections | 6 | 0 |
| has-internal-links | 6 | 0 |
| has-contact-info | 6 | 0 |
| relevant-heading | 5 | 1 |

## Prompt Improvement Patterns

### heading (1 occurrences)
- Specify the hero headline in the prompt, e.g. 'med rubriken: Din lokala frisör i Göteborg'

### preview (1 occurrences)
- Check preview_host (Fly.io VM) health and sandbox-preview route for errors


## Failures

- **Oskar**: TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('textarea[placeholder*="Skriv"], textarea[placeholder*="skriv"], textarea:visible').first()
    - locator resolved to <textarea rows="1" autocomplete="off" name="prompt-_r_6_" id="prompt-input-_r_6_" aria-label="Skriv ditt svar" placeholder="Skriv eller prata. Jag guidar dig." data-openclaw-text-target="builder.chat.primary" data-openclaw-text-label="Builderns huvudprompt" class="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 min-h-[80px] border-0 shadow-none focus-visible:ring-0"></textarea>
  - attempting click action
    - waiting for element to be visible, enabled and stable
    - element is not stable
  - retrying click action
    - waiting for element to be visible, enabled and stable
    - element is not enabled
  - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is not enabled
    - retrying click action
      - waiting 100ms
    58 × waiting for element to be visible, enabled and stable
       - element is not enabled
     - retrying click action
       - waiting 500ms

- **Mei**: Generation timed out or blocked
- **Lars**: Generation timed out or blocked