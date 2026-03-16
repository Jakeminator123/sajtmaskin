# README.md

Reason: Setup and architecture context

```text
## Next.js and Optimizely Feature Experimentation

This is a [Next.js](https://nextjs.org/) template that integrates with [Optimizely Feature Experimentation](https://www.optimizely.com/products/feature-experimentation/).

This project uses Next.js [App Router](https://nextjs.org/docs/app) and [Partial Prerendering (PPR)](https://nextjs.org/docs/app/building-your-application/rendering/partial-prerendering) to combine the benefits of static and dynamic rendering. This enables fast page loads to users with dynamic content and experiments.
Optimizely experimentation data is saved to [Vercel Edge Config](https://vercel.com/docs/storage/edge-config) through [Optimizely webhooks](https://docs.developers.optimizely.com/feature-experimentation/docs/configure-webhooks) which allows [Edge Middleware](https://vercel.com/docs/functions/edge-middleware) and [React Server Components (RSC)](https://react.dev/reference/rsc/server-components) to perform decisions with minimal latency.

This project uses:

- Next.js App Router
- Partial Prerendering (PPR)
- Vercel Edge Config
- Edge Middleware
- Tailwind CSS & shadcn/ui
- Vercel Toolbar
- Vercel Feature Flags
- Optimizely Feature Experimentation

## Deploy on Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fnextjs-optimizely-experimentation&env=OPTIMIZELY_API_KEY,OPTIMIZELY_SDK_KEY,OPTIMIZELY_PROJECT_ID,OPTIMIZELY_WEBHOOK_SECRET,API_TOKEN,TEAM_ID,EDGE_CONFIG,FLAGS_SECRET&project-name=nextjs-optimizely-experimentation&repository-name=nextjs-optimizely-experimentation&demo-title=Next.js%20Optimizely%20Experimentation&demo-description=Fast%20and%20safe%20experimentation%20with%20Next.js%2C%20Vercel%2C%20and%20Optimizely%20Feature%20Experimentation&demo-url=https%3A%2F%2Fnextjs-optimizely-experimentation.vercel.app%2F&edge-config-stores=%7B%22EDGE_CONFIG%22%3A%7B%22stock%22%3A%7B%22cup%22%3A1%2C%22hat%22%3A4%2C%22mug%22%3A5%2C%22hoodie%22%3A4%7D%2C%22datafile%22%3A%7B%7D%7D%7D)

The easiest way to deploy your Next.js app is to use the Vercel Platform from the creators of Next.js.

Check out our [Next.js deployment documentation](https://vercel.com/docs/frameworks/nextjs) for more details.

## Getting started

Sign up for a free [Optimizely Feature Flags account](https://www.optimizely.com/enhancements/free-feature

// ... truncated
```
