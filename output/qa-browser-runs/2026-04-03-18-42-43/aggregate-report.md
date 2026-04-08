# Browser QA Autoloop — Aggregate Report

**Date:** 2026-04-03T18:43:48.195Z
**Personas tested:** 1
**Successful:** 0/1
**Average score:** 0%
**Total duration:** 1 min
**Pause between personas:** 120s

## Per-persona results

| # | Name | Business | Score | Pages | Duration | Status |
|---|------|----------|-------|-------|----------|--------|
| 1 | Anna | Frisörsalong i Göteborg | 0% | 0 | 64s | ❌ |

## Check summary

| Check | Pass | Fail |
|-------|------|------|

## Failures

- **Anna**: TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('button[aria-label="Skicka"]').first()
    - locator resolved to <button disabled data-size="icon" data-slot="button" aria-label="Skicka" data-variant="default" class="inline-flex shrink-0 items-center justify-center gap-2 text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:…>…</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not enabled
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is not enabled
    - retrying click action
      - waiting 100ms
    46 × waiting for element to be visible, enabled and stable
       - element is not enabled
     - retrying click action
       - waiting 500ms
