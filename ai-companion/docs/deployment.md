# Deployment

## API

1. Create or select the Cloudflare D1 database.
2. Replace the placeholder `database_id` in `apps/api/wrangler.toml`.
3. Create the Vectorize index:

```bash
wrangler vectorize create ai-companion-memories --dimensions <embedding-dimensions> --metric cosine
```

4. Apply migrations:

```bash
wrangler d1 migrations apply ai-companion --remote
```

5. Set secrets:

```bash
wrangler secret put DEEPSEEK_API_KEY
wrangler secret put EMBEDDING_API_KEY
wrangler secret put JWT_SECRET
wrangler secret put COOKIE_SECRET
```

6. Dry-run deploy:

```bash
pnpm --filter @ai-companion/api build
```

7. Deploy:

```bash
pnpm --filter @ai-companion/api exec wrangler deploy
```

## Web

Configure:

```text
NEXT_PUBLIC_API_BASE_URL=https://<api-domain>
```

Then deploy the Next.js app with the selected hosting provider.

## Production Smoke Test

- [ ] `GET /health` returns success.
- [ ] Web can reach API with credentials.
- [ ] Register and login work.
- [ ] Chat stream works.
- [ ] `X-Conversation-Id` and `X-Trace-Id` are readable by the browser.
- [ ] Memory list, create, edit, confirm, reject, and delete work.
