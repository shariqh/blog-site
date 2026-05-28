# Cloudflare Pages Migration Checklist

> One-shot migration from Vercel to Cloudflare Pages, with DNS already on Cloudflare.

The code change (drop Plausible, drop `vercel.json`) lives in commit history. The dashboard steps below are manual and need to happen in this order to avoid downtime.

## Pre-flight

- [ ] The `rebuild` branch has been merged to `master` (or you're doing this on a deployment-ready branch).
- [ ] You're signed into both Vercel and Cloudflare dashboards.

## 1. Create the Cloudflare Pages project

1. Go to **dash.cloudflare.com → Workers & Pages → Create application → Pages → Connect to Git**.
2. Authorize Cloudflare to read `shariqh/blog-site`.
3. Select the repo. Project name: `shariq-dev` (or whatever — this only affects the `*.pages.dev` URL).
4. Build settings:
   - **Framework preset:** Astro
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** (leave blank)
5. Environment variables:
   - `NODE_VERSION = 22` (Astro 6 requires ≥22.12)
6. Click **Save and Deploy**. First build runs against the default branch (master). Wait for it to finish.

You should now have a working preview at `https://shariq-dev.pages.dev` (or similar).

## 2. Verify the preview

Open the `*.pages.dev` URL. Walk through:

- Homepage renders, all 4 cells colored, portrait visible.
- 2–3 posts under `/blog/<slug>`.
- Theme toggle works.
- `/feed.xml` returns valid RSS.
- View source — confirm there's no Plausible `<script>` tag.

If anything looks wrong, fix on a branch and let CF re-deploy before continuing.

## 3. Configure preview deployments

Cloudflare Pages auto-deploys every branch and every PR. The URL pattern is `<commit-sha>.<project>.pages.dev` for branch/PR previews.

For Plan B's drafting agent workflow, you'll want the PR preview URL visible on each PR. Two options:

**Option A — accept the deployment status check.** GitHub shows a "Deployments" item on the PR; click it for the preview URL. Friction: ~2 clicks.

**Option B — add a GitHub Action that comments the preview URL automatically.** ~30 lines. Worth adding when you build Plan B.

## 4. Point shariq.dev at Cloudflare Pages

1. In the Cloudflare Pages project: **Custom domains → Set up a custom domain → `shariq.dev`** (and `www.shariq.dev`).
2. Cloudflare detects that DNS is already on Cloudflare and offers to add the records automatically. Accept.
3. The DNS change propagates in seconds. The site is now served from Cloudflare Pages.

## 5. Decommission Vercel

Only after the Cloudflare deployment is live and verified on `shariq.dev`:

1. In Vercel dashboard → blog-site project → Settings → **Domains** → remove `shariq.dev` and `www.shariq.dev`.
2. (Optional) Delete the Vercel project entirely. The build will stop running on push, freeing up nothing in particular but tidying the dashboard.
3. Revoke the Vercel ↔ GitHub app connection if you have no other Vercel projects.

## 6. Update CI workflow (optional)

`.github/workflows/ci.yml` references `branches: [master, rebuild]`. Once `rebuild` is gone, simplify to `branches: [master]`. Low priority.

## Notes / gotchas

- **`vercel.json` was removed in the same commit as Plausible.** If you have any preview URLs from old Vercel deployments cached anywhere, they'll keep working until Vercel garbage-collects them.
- **Plausible domain was `shariq.dev`.** If you ever want analytics back, Cloudflare Web Analytics is free and ships as a single `<script>` tag — same shape as Plausible.
- **Build minutes:** CF Pages free tier is 500 builds/month. A personal blog won't approach this.
- **Bandwidth:** unlimited on free tier.
- **Image optimization:** none at runtime on CF Pages without Workers. The agent-generated heroes (Plan B) will be build-time-optimized via Astro's `astro:assets`, which is fine for v1.
