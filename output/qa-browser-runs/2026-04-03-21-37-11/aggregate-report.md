# Browser QA Autoloop — Aggregate Report

**Date:** 2026-04-03T21:38:37.249Z
**Personas tested:** 1
**Successful:** 0/1
**Average score:** 0%
**Total duration:** 1 min
**Pause between personas:** 120s

## Per-persona results

| # | Name | Business | Score | Pages | Duration | Status |
|---|------|----------|-------|-------|----------|--------|
| 1 | Anna | Frisörsalong i Göteborg | 0% | 0 | 86s | ❌ |

## Check summary

| Check | Pass | Fail |
|-------|------|------|

## Failures

- **Anna**: TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('[class*="chat"], [class*="builder"], [data-testid*="chat"], main').locator('button.rounded-full, button[class*="rounded-xl"], button[class*="rounded-lg"]').first()
    - locator resolved to <button disabled type="button" class="rounded-xl border border-primary/20 bg-primary/5 px-3 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-primary/10 disabled:opacity-50">Nej, börja från noll</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
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
