# When to use

_Curator: replace this with 1-3 specific bullets describing when the LLM should use this dossier._

- _Example: User mentions auth provider X, Y, or Z._
- _Example: User has chosen [Provider] explicitly._

# How to integrate

_Curator: write concrete steps. Reference actual files in `components/`._

1. Install dependencies (see manifest.json `dependencies`).
2. Copy `components/` files into the user's project.
3. Add env vars from `.env.example` to user's `.env.local`.
4. _Steps specific to this provider..._

# UX rules

- _Loading states, error feedback, accessibility..._

# Avoid

- _Concrete anti-patterns specific to this integration..._

# Verification

- _Manual check-points the user can test in preview..._

---

**Source template:** https://vercel.com/templates/next.js/auth0-nextjs-saas-starter
**Repo:** https://github.com/nvm-sh/nvm
**Demo:** https://saastart.app/

**Status:** draft. Fill in concrete content above + add `components/*.tsx` + `.env.example` if needed, then change `_status` to "active" in manifest.json.
