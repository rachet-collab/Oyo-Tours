# Deploy OYO Tours to Vercel

The project is ready: production build passes and `vercel.json` already handles
SPA routing (deep links like `/inventory` won't 404 on refresh).

## Step 1 — Push to GitHub

Unzip the project, then from inside the folder:

### Easiest (GitHub CLI installed)
```bash
git init && git add -A && git commit -m "OYO Tours booking portal"
gh repo create oyo-tours-portal --private --source=. --push
```

### Or without the CLI
1. Create an empty **private** repo named `oyo-tours-portal` at https://github.com/new
   (do NOT add a README/.gitignore — keep it empty).
2. Then:
```bash
git init && git add -A && git commit -m "OYO Tours booking portal"
git branch -M main
git remote add origin https://github.com/<your-username>/oyo-tours-portal.git
git push -u origin main
```

## Step 2 — Import to Vercel

1. Go to https://vercel.com/new
2. Pick the `oyo-tours-portal` repo (authorize GitHub if prompted).
3. Vercel auto-detects **Vite** — framework preset, build command `vite build`,
   output `dist`. Leave the defaults.
4. Click **Deploy**. ~1 minute later you get a live `*.vercel.app` URL.

Every future `git push` to `main` redeploys automatically.

## Supabase / environment variables

The app is wired to a Supabase project (**OYO Tours Portal**) via `.env`, which
is committed — so a Vercel build from the repo picks the keys up automatically
(Vite inlines `VITE_` vars at build time). **Zero extra config needed.**

If you'd rather manage the keys in Vercel instead of the committed `.env`, add
these under Project → Settings → Environment Variables and remove `.env`:

```
VITE_SUPABASE_URL=https://iolruetjcdvogkiohfex.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_okVD0Rhwkd1veqNayKAdeQ_mku0Ki4H
```

The publishable anon key is safe to expose in the client (Row-Level Security is
enabled on the tables).

## Notes
- Data persists in Supabase; if the keys are absent the app falls back to an
  in-memory store seeded with the same data.
- This is a prototype: mocked auth and permissive RLS — tighten before real use.
