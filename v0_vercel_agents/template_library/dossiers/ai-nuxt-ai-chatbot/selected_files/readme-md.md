# README.md

Reason: Setup and architecture context

```text
# Nuxt Auth Utils

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]
[![Nuxt][nuxt-src]][nuxt-href]

Add Authentication to Nuxt applications with secured & sealed cookies sessions.

- [Release Notes](/CHANGELOG.md)
- [Demo with OAuth](https://github.com/atinux/atidone)
- [Demo with Passkeys](https://github.com/atinux/todo-passkeys)
<!-- - [🏀 Online playground](https://stackblitz.com/github/your-org/nuxt-auth-utils?file=playground%2Fapp.vue) -->
<!-- - [📖 &nbsp;Documentation](https://example.com) -->

## Features

- [Hybrid Rendering](#hybrid-rendering) support (SSR / CSR / SWR / Prerendering)
- [40+ OAuth Providers](#supported-oauth-providers)
- [Password Hashing](#password-hashing)
- [WebAuthn (passkey)](#webauthn-passkey)
- [`useUserSession()` Vue composable](#vue-composable)
- [Tree-shakable server utils](#server-utils)
- [`<AuthState>` component](#authstate-component)
- [Extendable with hooks](#extend-session)
- [WebSocket support](#websocket-support)

It has few dependencies (only from [UnJS](https://github.com/unjs)), run on multiple JS environments (Node, Deno, Workers) and is fully typed with TypeScript.

## Requirements

This module only works with a Nuxt server running as it uses server API routes (`nuxt build`).

This means that you cannot use this module with `nuxt generate`.

You can anyway use [Hybrid Rendering](#hybrid-rendering) to pre-render pages of your application or disable server-side rendering completely.

## Quick Setup

1. Add `nuxt-auth-utils` in your Nuxt project

```bash
npx nuxi@latest module add auth-utils
```

2. Add a `NUXT_SESSION_PASSWORD` env variable with at least 32 characters in the `.env`.

```bash
# .env
NUXT_SESSION_PASSWORD=password-with-at-least-32-characters
```

Nuxt Auth Utils generates one for you when running Nuxt in development the first time if no `NUXT_SESSION_PASSWORD` is set.

3. That's it! You can now add authentication to your Nuxt app ✨

## Vue Composable

Nuxt Auth Utils automatically adds some plugins to fetch the current user session to let you access it from your Vue components.

### User Session

```vue
<script setup>
const { loggedIn, user, session, fetch, clear, openInPopup } = useUserSession()
</script>

<template>
  <div v-if="

// ... truncated
```
