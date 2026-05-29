# Cloudflare Pages Migration Checklist

Migrating from Vercel to Cloudflare Pages. DNS is already on Cloudflare. The deploy is automated by `.github/workflows/deploy.yml` (modeled on lognote's setup — pushes from CI rather than relying on CF's dashboard ↔ GitHub auto-integration).

## 1. Add the two GitHub secrets

In **Cloudflare dashboard:**

1. Find your **Account ID** in the right sidebar of any page. Copy it.
2. Go to **My Profile → API Tokens → Create Token → Custom token**. Permissions: `Account → Cloudflare Pages → Edit`. Generate and copy the token (you only see it once).

In **GitHub:** repo → Settings → Secrets and variables → Actions → New repository secret:

- `CLOUDFLARE_ACCOUNT_ID` = the account ID
- `CLOUDFLARE_API_TOKEN` = the API token

## 2. Create the Pages project

`wrangler pages deploy` does NOT auto-create the project — it fails with `Project not found` if the project doesn't exist. Create it once via CLI:

```sh
wrangler login   # if you haven't already
wrangler pages project create shariq-dev --production-branch=main
```

Alternatively, create via dashboard: Workers & Pages → Create application → Pages → Connect to Git → name `shariq-dev`. (CLI is faster.)

## 3. Trigger the first deploy

Easiest trigger: push any commit to `main`, or click "Run workflow" on the "Deploy to Cloudflare Pages" workflow in GitHub Actions. Watch the run at GitHub → Actions.

If it's a PR push, the workflow comments the preview URL back on the PR.
If it's a `main` push, it deploys to the project's production environment at `*.shariq-dev.pages.dev`.

## 4. Verify the deploy at `*.pages.dev`

The canonical URL is `https://shariq-dev.pages.dev` (each deployment also gets a `<sha>.shariq-dev.pages.dev` URL). Open it:

- Homepage renders, all 4 cells colored, portrait visible.
- 2–3 posts under `/blog/<slug>`.
- Theme toggle works.
- `/feed.xml` returns valid RSS.

If anything looks wrong, fix on a branch and let CF re-deploy.

## 5. Point shariq.dev at Cloudflare Pages

1. In **Cloudflare → Workers & Pages → shariq-dev → Custom domains → Set up a custom domain**.
2. Add `shariq.dev` and `www.shariq.dev`. CF detects DNS is on the same account and adds records automatically.
3. DNS propagates in seconds. The site now serves from Cloudflare Pages.

Alternatively via CLI (after `wrangler login`):

```sh
wrangler pages domain add shariq.dev --project-name=shariq-dev
wrangler pages domain add www.shariq.dev --project-name=shariq-dev
```

## 6. Decommission Vercel

Only after Cloudflare is live and verified on `shariq.dev`:

1. Vercel dashboard → blog-site project → Settings → Domains → remove `shariq.dev` and `www.shariq.dev`.
2. Optionally delete the Vercel project entirely.
3. Revoke the Vercel ↔ GitHub app connection if no other Vercel projects.

## Notes

- **`wrangler login` vs `CLOUDFLARE_API_TOKEN`** — totally separate auth. `wrangler login` is your personal OAuth for the local CLI; the token is a scoped credential for CI. Don't share or reuse them.
- **Build minutes:** CF Pages free tier is 500 builds/month. Personal blog won't approach this.
- **Bandwidth:** unlimited on free tier.
- **Image optimization:** none at runtime on CF Pages without Workers. Astro's `astro:assets` build-time optimization is fine for v1; revisit if Plan B's agent generates a lot of heroes that need runtime resizing.
- **PR preview URLs are auto-commented** by the workflow (`actions/github-script` step) — no longer a Vercel-only feature.
