# Gör inte om redan löst arbete

Utan ny konkret repro ska agenten **inte** ändra:

- importens projectId/chatId/versionId-handoff
- `chat_old → chat_new`-latch
- brancher med slash
- `.git`-URL
- stale-token fallback för publika repos
- GitHub User-Agent
- SSRF redirect/token-strip
- preview-after-persist containment
- `previewUrl=null` vid failed
- modal close/double-click guards
- gamla 413-copyfixen
- `preferZip`

Inte heller:

- Builder Google OAuth/autharbete från #1439
- Nordlunden/A6
- portalplaner
- billing
- kostnadsfri AB-slugs
- dependencies
- master/promotion
- ny mediaarkitektur utanför importens befintliga CodeFile-kontrakt
