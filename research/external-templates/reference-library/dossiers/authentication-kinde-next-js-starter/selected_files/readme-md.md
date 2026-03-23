# README.md

Reason: Setup and architecture context

```text
# Kinde Next.js Starter

![Composite of the project running in a browser window](/public/demo-image.png)

A starter template using [Next.js](https://nextjs.org) and [Kinde](https://kinde.com) for authentication. See [live demo](https://kinde-nextjs-starter.vercel.app/).

## Pre-requisites

### 1. Create a Kinde account

Create a [Kinde](https://app.kinde.com/register) account if you don't already have one.

### 2. Add a back-end application in Kinde

1. Go to `Settings > Applications`.
2. Select `Add application` in the top right.
3. Give your application a name and make sure you select `Back-end web` as the application type.
4. Select `Save`.
5. In the `Quick start` screen, select `Next.js` as the technology and `Save`.

### 3. Create a Vercel account

Create a [Vercel](https://vercel.com/signup) account if you don't already have one.

## Get your environment variables from Kinde

1. In Kinde, go to `Settings > Applications > [Your app] > Details`.
2. Copy the following values in the `App keys` section:
   - `Domain`
   - `Client ID`
   - `Client secret`

## Deploy this template

When you click the **deploy** button below, you will be prompted to fill in the environment variables you copied previously. These are required to successfully deploy this template.

<a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fkinde-starter-kits%2Fkinde-nextjs-vercel-starter&env=KINDE_CLIENT_ID,KINDE_CLIENT_SECRET,KINDE_ISSUER_URL&envDescription=Find%20your%20application%20keys&envLink=https%3A%2F%2Fdocs.kinde.com%2Fget-started%2Fconnect%2Fgetting-app-keys%2F&project-name=kinde-nextjs-starter&repository-name=kinde-nextjs-starter&demo-title=Kinde%20Next.js%20Starter&demo-description=A%20Next.js%20authentication%20starter%20template%20using%20Kinde%2C%20TypeScript%20and%20tailwindcss.&demo-url=https%3A%2F%2Fkinde-nextjs-starter.vercel.app"><img src="https://vercel.com/button" alt="Deploy with Vercel"/></a>

- `KINDE_ISSUER_URL`: `Domain` value.
- `KINDE_CLIENT_ID`: `Client ID` value.
- `KINDE_CLIENT_SECRET`: `Client secret` value.

## After you deploy

### Set callback URLs

> [!IMPORTANT]
> Make sure to replace `[your-vercel-slug]` in the code examples below with your Vercel project or team slug, but keep the `*` (asterisk).
> [More info on wild card callback URLs in Kinde](https://docs.kinde.com/get

// ... truncated
```
