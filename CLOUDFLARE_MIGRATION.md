# Cloudflare Free Backend Migration (Stories API)

This project now supports a Cloudflare D1 backend for stories with Netlify fallback to prevent glitches.

## What is already done

- Frontend supports primary + fallback endpoints in [src/store.js](src/store.js):
  - Primary: `VITE_STORIES_API_ENDPOINT`
  - Fallback: `/.netlify/functions/stories-data`
- Cloudflare Worker code added in [cloudflare/stories-worker/src/index.js](cloudflare/stories-worker/src/index.js)
- D1 schema added in [cloudflare/stories-worker/schema.sql](cloudflare/stories-worker/schema.sql)
- Wrangler config scaffolded in [cloudflare/stories-worker/wrangler.toml](cloudflare/stories-worker/wrangler.toml)

## Deploy steps

1. Install Wrangler (if needed)

```bash
npm i -g wrangler
```

2. Login to Cloudflare

```bash
wrangler login
```

3. Create D1 database

```bash
cd cloudflare/stories-worker
wrangler d1 create storyverse
```

4. Copy returned `database_id` into [cloudflare/stories-worker/wrangler.toml](cloudflare/stories-worker/wrangler.toml)

5. Create tables

```bash
wrangler d1 execute storyverse --file=./schema.sql
```

6. Deploy worker

```bash
wrangler deploy
```

7. Copy Worker URL and append `/stories-data`

Example:

```text
https://storyverse-stories-api.<your-subdomain>.workers.dev/stories-data
```

8. Set Netlify environment variable

```text
VITE_STORIES_API_ENDPOINT=<worker-url>/stories-data
```

9. Redeploy Netlify site

## Safety behavior

- If Cloudflare endpoint fails, app auto-falls back to Netlify stories endpoint.
- This avoids hard downtime/glitches during rollout.
- You can remove fallback later if you want full Cloudflare-only operation.

## Rollback

- Remove `VITE_STORIES_API_ENDPOINT` from Netlify env.
- Redeploy. App will use Netlify endpoint only.
