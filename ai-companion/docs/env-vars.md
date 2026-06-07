# Environment Variables

## Local API

`apps/api/.dev.vars` is private and must not be committed.

```text
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-flash
LLM_TIMEOUT_MS=60000

EMBEDDING_API_KEY=
EMBEDDING_BASE_URL=https://api.nodion.ai/v1
EMBEDDING_MODEL=qwen/qwen3-embedding-0.6b

JWT_SECRET=
COOKIE_SECRET=
```

## Local Web

`apps/web/.env.local` is private and must not be committed.

```text
NEXT_PUBLIC_API_BASE_URL=http://localhost:8787
```

## Production Secrets

Store sensitive values with Worker secrets or the hosting provider secret manager.

```text
wrangler secret put DEEPSEEK_API_KEY
wrangler secret put EMBEDDING_API_KEY
wrangler secret put JWT_SECRET
wrangler secret put COOKIE_SECRET
```

Do not put API keys in `.env.example`, `.dev.vars.example`, or `wrangler.toml`.

## Rotation Rule

If a key is ever committed, shared, or copied into an example file, treat it as leaked and rotate it before the next deployment.
