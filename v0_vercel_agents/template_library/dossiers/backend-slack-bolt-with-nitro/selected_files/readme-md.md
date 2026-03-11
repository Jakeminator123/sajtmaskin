# README.md

Reason: Setup and architecture context

```text
# Slack Bolt with Nitro Template

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?demo-description=This%20is%20a%20generic%20Bolt%20for%20JavaScript%20(TypeScript)%20template%20app%20used%20to%20build%20out%20Slack%20apps%20with%20the%20Nitro%20framework.&demo-image=%2F%2Fimages.ctfassets.net%2Fe5382hct74si%2FSs9t7RkKlPtProrbDhZFM%2F0d11b9095ecf84c87a68fbdef6f12ad1%2FFrame__1_.png&demo-title=Slack%20Bolt%20with%20Nitro&demo-url=https%3A%2F%2Fgithub.com%2Fvercel-partner-solutions%2Fslack-bolt-with-nitro&env=SLACK_SIGNING_SECRET%2CSLACK_BOT_TOKEN&envDescription=These%20environment%20variables%20are%20required%20to%20deploy%20your%20Slack%20app%20to%20Vercel&envLink=https%3A%2F%2Fapi.slack.com%2Fapps&from=templates&project-name=Slack%20Bolt%20with%20Nitro&repository-name=slack-bolt-with-nitro&repository-url=https%3A%2F%2Fgithub.com%2Fvercel-partner-solutions%2Fslack-bolt-with-nitro&skippable-integrations=1&teamSlug=vercel-partnerships)

This is a generic Bolt for JavaScript (TypeScript) template app used to build Slack apps with Nitro

Before getting started, make sure you have a development workspace where you have permissions to install apps. You can use a [developer sandbox](https://api.slack.com/developer-program) or [create a workspace](https://slack.com/create)

## Getting Started

### Clone and install dependencies
```bash
git clone https://github.com/vercel-partner-solutions/slack-bolt-with-nitro.git && cd slack-bolt-with-nitro && pnpm install
```

### Create a Slack App

1. Open https://api.slack.com/apps/new and choose "From an app manifest"
2. Choose the workspace you want to use
3. Copy the contents of [`manifest.json`](./manifest.json) into the text box that says "Paste your manifest code here" (JSON tab) and click Next
4. Review the configuration and click Create
5. On the Install App tab, click Install to <Workspace_Name>. 
      - You will be redirected to the App Configuration dashboard
6. Copy the Bot User OAuth Token into your environment as `SLACK_BOT_TOKEN`
7. On the Basic Information tab, copy your Signing Secret into your environment as `SLACK_SIGNING_SECRET`

### Prepare for Local Development

1. Add your `NGROK_AUTH_TOKEN` to your `.env` file
    - You can get a free token [here](https://dashboard.ngrok.com/login?state=X1FFBj9sgtS9-oFK_2-h15Xcg0zHPjp_b9edWYrpGBVvIluUPEAarKRIjp

// ... truncated
```
