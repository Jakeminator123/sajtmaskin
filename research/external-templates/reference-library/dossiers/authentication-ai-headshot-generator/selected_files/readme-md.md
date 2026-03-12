# README.md

Reason: Setup and architecture context

```text
# 👨‍💼 [Headshot AI](https://headshots-starter.vercel.app/) - Professional Headshots with AI (powered by Astria.ai)

Introducing Headshot AI, an open-source project from [Astria](https://www.astria.ai/) that generates Professional AI Headshots in minutes.

This project was built to give developers & makers a great starting point into building AI applications. This is your launch pad - fork the code, modify it, and make it your own to build a popular AI SaaS app.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fleap-ai%2Fheadshots-starter%2Ftree%2Fmain&env=ASTRIA_API_KEY,APP_WEBHOOK_SECRET&envDescription=Set%20up%20environment%20variables%20for%20Leap%20AI%20and%20redirect%20URL%20in%20Supabase%20Auth%20dashboard.%20See%20.env.local.example%20for%20full%20config%20with%20Resend%20and%20Stripe.&envLink=https%3A%2F%2Fgithub.com%2Fleap-ai%2Fheadshots-starter%2Fblob%2Fmain%2F.env.local.example&project-name=headshots-starter-clone&repository-name=headshots-starter-clone&demo-title=AI%20Headshot%20Generator&demo-description=A%20Professional%20AI%20headshot%20generator%20starter%20kit%20powered%20by%20Next.js%2C%20Leap%20AI%2C%20and%20Vercel&demo-url=https%3A%2F%2Fwww.getheadshots.ai%2F&demo-image=https%3A%2F%2Fimages.ctfassets.net%2Fe5382hct74si%2F1CEDfTwO5vPEiNMgN2Y1t6%2F245d1e0c11c4d8e734fbe345b9ecdc7c%2Fdemo.png&integration-ids=oac_VqOgBHqhEoFTPzGkPd7L0iH6&external-id=https%3A%2F%2Fgithub.com%2Fleap-ai%2Fheadshots-starter%2Ftree%2Fmain)

[![Headshot AI Demo](/public/new-demo.png)](https://headshots-starter.vercel.app/)

## Incoming changes

Incoming [PR]((https://github.com/astriaai/headshots-starter/pull/121)) has been merged to allow usage of  Astria's packs API which helps you avoid hardcoding prompts in your code as well as offering different packs of prompts, and switching to the new Flux model fine-tuning easily.
Read more on advantage of using packs [Astria's documentation](https://docs.astria.ai/docs/api/pack/pack/).

When migrating to the new packs api, add to your vercel environment:
```text
NEXT_PUBLIC_TUNE_TYPE=packs
PACK_QUERY_TYPE=both
```

![Headshot AI Packs](assets/headshots-packs.png)
Here is how it looks

## Important Environment Variable Change

**Note:** The environment variable `VERCEL_URL` has been renamed to `DEPLOYMENT_URL` for consistenc

// ... truncated
```
