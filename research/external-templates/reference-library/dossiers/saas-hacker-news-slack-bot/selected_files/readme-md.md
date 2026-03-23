# README.md

Reason: Setup and architecture context

```text
<div align="center">
    <img alt="Slacker OG Image" src="https://slacker.run/api/og?latest">
    <h3 align="center">Slacker</h3>
    <p>A bot that notifies you on Slack whenever your company/product is mentioned on Hacker News.</p>
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://user-images.githubusercontent.com/28986134/182243546-7687d077-280e-4c13-b96b-c6639c2a9e8e.png">
        <source media="(prefers-color-scheme: light)" srcset="https://user-images.githubusercontent.com/28986134/182243511-a118223b-ebe2-4a07-a3d1-58d4a88d541e.png">
        <img alt="Demo" src="https://user-images.githubusercontent.com/28986134/182243511-a118223b-ebe2-4a07-a3d1-58d4a88d541e.png">
    </picture>
</div>

<div align="center">
  <a href="https://slack.com/oauth/v2/authorize?scope=chat:write,chat:write.public,links:read,links:write,commands,team:read&client_id=12364000946.3845028209600"><img alt="Add to Slack" height="40" width="139" src="https://platform.slack-edge.com/img/add_to_slack@2x.png" /></a>
</div>

<p align="center">
  <a href="#deploy-your-own"><strong><i>or deploy your own</i></strong></a>
</p>
<br/>

## Built With

1. [Vercel Functions](https://vercel.com/docs/concepts/functions) for [cron processes](https://github.com/vercel-labs/slacker/blob/main/pages/api/cron/index.ts) & [event subscriptions via webhooks](https://github.com/vercel-labs/slacker/blob/main/pages/api/event.ts)
2. [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs) for triggering cron processes.
3. [Hacker News API](https://github.com/HackerNews/API) for [pulling data](https://github.com/vercel-labs/slacker/blob/main/lib/hn.ts)
4. [Slack API](https://api.slack.com/docs) for [sending](https://github.com/vercel-labs/slacker/blob/main/lib/slack.ts#L47) and [unfurling](https://github.com/vercel-labs/slacker/blob/main/lib/slack.ts#L73) messages
5. [Upstash](https://upstash.com) for key-value storage ([Redis](https://upstash.com/redis)).

<br/>

## How It Works

1. Set up a [Vercel cron job](https://vercel.com/docs/cron-jobs) that pings our [`/api/cron` endpoint](https://github.com/vercel-labs/slacker/blob/main/pages/api/cron/index.ts) once every 60 seconds.
2. Get the last checked HN post ID ([`lastCheckedId`](https://github.com/vercel-labs/slacker/blob/main/lib/cron.ts#L11)) and the list of `keywords` to check against from Upstash.

// ... truncated
```
