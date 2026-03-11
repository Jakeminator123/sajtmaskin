# package.json

Reason: Dependency and script verification

```text
{
  "name": "slack-bolt-with-hono",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev:tunnel": "tsx scripts/dev.tunnel.ts"
  },
  "dependencies": {
    "@slack/bolt": "^4.4.0",
    "@vercel/slack-bolt": "^1.0.1",
    "hono": "^4.9.4"
  },
  "devDependencies": {
    "@ngrok/ngrok": "^1.5.2",
    "@slack/cli-hooks": "^1.2.1",
    "@types/node": "^20.11.17",
    "dotenv": "^17.2.1",
    "tsx": "^4.20.5",
    "typescript": "^5.8.3"
  }
}
```
