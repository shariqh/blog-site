# shariq.dev

Personal blog at [shariq.dev](https://www.shariq.dev). Astro 6 + Tailwind 4 + MDX. Hosted on Cloudflare Pages.

## Develop

```bash
npm install
npm run dev    # http://localhost:4321
```

## Commands

- `npm run dev` — start dev server with HMR
- `npm run build` — production build into `dist/`
- `npm run preview` — serve the built site
- `npm test` — run unit tests (Vitest)
- `npm run test:smoke` — Playwright smoke test (requires `npm run build` first)
- `npm run astro check` — type-check `.astro` files

## Authoring posts

Posts live in `src/content/writing/`. Frontmatter is Zod-validated at build
time (see `src/content.config.ts`). Tags map to display buckets in
`src/lib/buckets.ts`. URLs are `/blog/<filename-without-extension>`.

The AI drafting agent is set up in a separate workflow (Plan B). For now,
write MDX, commit, push, merge.

## Deploy (Cloudflare Pages via GitHub Actions)

Deployment is automated by `.github/workflows/deploy.yml`. On push to
`main`, the workflow builds and deploys to production
(`shariq.dev`). PRs get preview deployments with their own URL, posted
back as a PR comment.

One-time setup (only needed when first wiring up the repo, or when
rotating tokens):

1. **GitHub secrets** (repo → Settings → Secrets and variables → Actions):
   - `CLOUDFLARE_API_TOKEN` — Cloudflare API token with `Account → Cloudflare Pages: Edit`
   - `CLOUDFLARE_ACCOUNT_ID` — from the Cloudflare dashboard sidebar
2. **First deploy** auto-creates the `shariq-dev` Pages project — no manual setup in the Cloudflare dashboard needed.
3. **Custom domain** — in Cloudflare → Pages → shariq-dev → Custom domains, add `shariq.dev` (and `www.shariq.dev`). Cloudflare auto-provisions DNS + SSL since the domain is already on the same account.

## Ops (wrangler CLI)

`wrangler` is Cloudflare's CLI — useful for inspection, log-tailing, and ad-hoc deploys outside CI.

One-time setup:

```sh
npm install -g wrangler
wrangler login          # OAuth in browser; uses your CF account
wrangler whoami         # sanity check
```

Note: `wrangler login` is your own OAuth and is **separate** from the
`CLOUDFLARE_API_TOKEN` GitHub secret. Don't share or reuse them.

Day-to-day commands:

```sh
# list Pages projects
wrangler pages project list

# list recent deployments for this site
wrangler pages deployment list --project-name=shariq-dev

# live tail production logs
wrangler pages deployment tail --project-name=shariq-dev

# one-off preview deploy from local without going through CI
wrangler pages deploy dist --project-name=shariq-dev --branch=hotfix

# wire (or re-wire) the custom domain
wrangler pages domain add shariq.dev --project-name=shariq-dev
wrangler pages domain list --project-name=shariq-dev
```
