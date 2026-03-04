# Phase 3: Polish and Best Practices

**Priority:** Nice to have. Schedule when convenient, no urgency.
**Estimated time:** Variable, 1-2 hours per item
**Dependencies:** Phase 1 and 2 should be done first
**Branch:** New feature branches off main

---

## Overview

These items are from the "DEFER" category in the triage. They improve security
posture, developer experience, and compliance — but none are exploitable
vulnerabilities. Pick them up when you have downtime or as part of regular
maintenance sprints.

---

## Item D1: DNS resolution in SSRF guard
**Effort:** Medium
**What:** Add `dns.lookup()` to validate that hostnames don't resolve to
private IPs (prevents DNS rebinding attacks).
**When to do:** If you start handling high-value targets or see suspicious
traffic patterns.

## Item D2: CSRF tokens for state-changing routes
**Effort:** Medium
**What:** Add double-submit CSRF tokens to complement SameSite cookies.
**When to do:** If you add cross-origin forms or relax SameSite policy.

## Item D3: JWT timing-safe signature comparison
**Effort:** Small
**What:** Use `timingSafeEqual` in JWT verification in `auth.ts`.
**When to do:** Next time you touch the auth module.

## Item D4: JWT token revocation (tokenVersion)
**Effort:** Medium-Large
**What:** Add `token_version` column to users table, check on every request,
increment on password change to invalidate all existing JWTs.
**When to do:** When you implement password reset or account security features.

## Item D5: PII redaction in prompt logs
**Effort:** Small
**What:** Hash or truncate prompt content in file logger.
**When to do:** Before enabling file logging in production.

## Item D9: Migrate from db-init.mjs to Drizzle migrations
**Effort:** Large
**What:** Set up `drizzle-kit` with a proper migrations directory. Convert
existing schema to migration files. Add `npx drizzle-kit migrate` to deploy.
**When to do:** Before making your next schema change, to avoid manual SQL.

## Item D10: Backup and restore documentation
**Effort:** Small (documentation only)
**What:** Document Supabase backup settings, RPO/RTO targets, restore procedure.
**When to do:** Before you have real customer data you can't afford to lose.

## Item D13: CodeQL, Node upgrade, LICENSE, GDPR
**Effort:** Variable
**What:** See triage document for details on each.
**When to do:**
- CodeQL: When CI is stable and you want automated vulnerability scanning
- Node 22→24: When Next.js officially supports Node 24 and you want latest features
- LICENSE: Before making the repo public
- GDPR: Before collecting real customer personal data (email, payment, etc.)

---

## This phase has no strict checklist

Pick items based on what becomes relevant. Update the handoff log when
you complete any of these.
