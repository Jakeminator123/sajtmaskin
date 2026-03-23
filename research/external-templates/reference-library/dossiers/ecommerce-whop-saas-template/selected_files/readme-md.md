# README.md

Reason: Setup and architecture context

```text
This is a [Next.js](https://nextjs.org/) project created using the [`whop-next-template`](https://github.com/whopio/next-template/)

## Getting Started

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fwhopio%2Fnext-template&env=NEXT_PUBLIC_WHOP_CLIENT_ID,WHOP_CLIENT_SECRET,WHOP_API_KEY,NEXT_PUBLIC_RECOMMENDED_PLAN_ID,NEXT_PUBLIC_REQUIRED_PRODUCT,NEXTAUTH_SECRET&envDescription=Follow%20the%20instructions%20here%20to%20obtain%20the%20env%20vars%20above%3A&envLink=https%3A%2F%2Fgithub.com%2Fwhopio%2Fnext-template%2Fblob%2Fmain%2F.env.example&project-name=whop-next-template&repository-name=whop-next-template&demo-title=Whop%20Next.js%20Template&demo-description=Whop%20Next.js%20Template&demo-url=https%3A%2F%2Fnext-template-whop.vercel.app%2F&demo-image=https%3A%2F%2Fimages.ctfassets.net%2Fe5382hct74si%2F4Xc0tWaSTiUEoRUI6Nyj4C%2F38157dced5977daa0a0ef2e093731023%2Fwhop-nextjs.png%3Fh%3D250)

First, set the required environment variables:

```.env
NEXT_PUBLIC_WHOP_CLIENT_ID="WHOP CLIENT ID"
WHOP_CLIENT_SECRET="WHOP CLIENT SECRET"
WHOP_API_KEY="WHOP API KEY"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="NEXTAUTH SECRET"
NEXT_PUBLIC_RECOMMENDED_PLAN_ID="PLAN ID"
NEXT_PUBLIC_REQUIRED_PRODUCT="PRODUCT ID"
```

Many of the environment variables can be found [here](https://dash.whop.com/settings/developer)

## Run locally

Pull your reposity

Then, install node modules:

```bash
pnpm i
```

Then, run the development server:

```bash
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

This template offers examples on how to utilize next.js patterns in conjuction with `@whop-sdk/core` to easily gate certain parts of your website.

## Included exmples:

### `/pages` (Server-side rendered):

The examples in this list show how to use `getServerSideProps` in the `pages` directoy

- `pages/ssr/index.tsx` - Adds the whop `User` to the page props. It renders a login button for logged-out users and a logout button for logged-in users
- `pages/ssr/logged-in.tsx` - Only displays a page to logged-in users. If a logged-out user tries to access this page they will be redirected to `/ssr` where they can log in
- `pages/ssr/product-gated.tsx` - Check if a user owns a specific `Product` and only shows the

// ... truncated
```
