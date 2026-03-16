# README.md

Reason: Setup and architecture context

```text
<!-- markdownlint-disable MD033 MD041 -->
<a href="https://arcjet.com" target="_arcjet-home">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://arcjet.com/logo/arcjet-dark-lockup-voyage-horizontal.svg">
    <img src="https://arcjet.com/logo/arcjet-light-lockup-voyage-horizontal.svg" alt="Arcjet Logo" height="128" width="auto">
  </picture>
</a>

[![Deploy with Vercel][vercel_button]][vercel_deploy]
&nbsp; &nbsp;
[![Deploy to Netlify][netlify_button]][netlify_deploy]

# Arcjet example app

[Arcjet](https://arcjet.com) helps developers protect their apps in just a few
lines of code. Bot detection. Rate limiting. Email validation. Attack
protection. Data redaction. A developer-first approach to security.

This is an example Next.js application demonstrating the use of multiple
features. It is deployed at
[https://example.arcjet.com](https://example.arcjet.com).

## Features

- [Signup form protection](https://example.arcjet.com/signup) uses Arcjet's
  server-side email verification configured to block disposable providers and
  ensure that the domain has a valid MX record. It also includes rate limiting
  and bot protection to prevent automated abuse.
- [Bot protection](https://example.arcjet.com/bots) shows how a page can be
  protected from automated clients.
- [Rate limiting](https://example.arcjet.com/rate-limiting) shows the use of
  different rate limit configurations depending on the authenticated user. A
  logged-in user can make more requests than an anonymous user.
- [Attack protection](https://example.arcjet.com/attack) demonstrates Arcjet
  Shield, which detects suspicious behavior, such as SQL injection and
  cross-site scripting attacks.
- [Sensitive info](https://example.arcjet.com/sensitive-info) protects against
  clients sending you sensitive information such as PII that you do not wish to
  handle.

## Run locally

1. [Register for a free Arcjet account](https://app.arcjet.com).

2. Install dependencies:

```bash
npm ci
```

3. Rename `.env.local.example` to `.env.local` and add your Arcjet key

4. Start the dev server

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Need help?

Check out [the docs](https://docs.arcjet.com/), [contact
support](https://docs.arcjet.com/support), or [join our Discord
ser

// ... truncated
```
