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
- `npm run gen:cover <slug> [--style line-art|conceptual] [--force]` — generate a post's AI cover (Azure `gpt-image-1`)
- `npm run gen:cover:all [--force]` — backfill AI covers across all posts

## Authoring posts

Posts live in `src/content/writing/`. Frontmatter is Zod-validated at build
time (see `src/content.config.ts`). Tags map to display buckets in
`src/lib/buckets.ts`. URLs are `/blog/<filename-without-extension>`.

You can write a post by hand (create the MDX, commit, push, open a PR), or
let the drafting agent write one for you — see [Content workflow](#content-workflow).

Each post gets an on-brand **cover image** — AI-generated via Azure `gpt-image-1`
and written to `hero.image` — plus a build-time **Open Graph image** (1200×630,
one per post under `dist/og/`) so shared links preview cleanly. The drafting
agent covers new posts automatically; `npm run gen:cover` / `gen:cover:all`
do it by hand.

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

## Content workflow

All content — blog posts and YouTube scripts — is planned in a **Notion CMS
database**. That DB is the control panel: I add and triage ideas there, and a
nightly Claude-based agent does discovery and drafting off it. **Nothing
publishes automatically.** Blog drafts arrive as PRs (with a Cloudflare preview)
for me to review and merge; YouTube scripts land in the Notion row for me to record.

Each row moves through a **Stage**:

| Stage         | Meaning                                                               |
| ------------- | --------------------------------------------------------------------- |
| **Idea**      | A raw seed. Not a commitment — the agent reads these for inspiration. |
| **Proposed**  | A candidate in triage, waiting for a yes/no (mine or the agent's).    |
| **Ready**     | Approved — the agent drafts it on the next run.                       |
| **Drafted**   | Agent opened a PR (blog) or wrote the script into the row (YouTube).  |
| **Published** | Live.                                                                 |
| **Abandoned** | Killed; the agent won't resurface it.                                 |

### Add an idea

Make a new row, set **Kind** (`blog`, `YT short`, `YT long`), a **Title**, and a
one-line **Hint**. Then:

- **Want it drafted now?** Set **Stage = Ready** — the agent picks it up next run.
- **Just a seed?** Set **Stage = Idea** — no draft yet, but discovery reads it and
  may spin a sharper candidate into triage.

The **Hint is the field that matters most** — it's what actually steers the draft.
Put the _point_ there (the decision, the gotcha, the angle), not just a topic.

### Pull in one of my commits

In a Ready row's **Source URLs**, paste a GitHub commit link
(`.../commit/<sha>`). If it's a recent commit (last ~week) in a repo I own —
public or private — the agent attaches the real diff to the draft, filtered down
to the meaningful changes. Older commits, or repos I don't own, won't pull, so
it's worth capturing the Hint while the work is fresh.

### Triage, kill, or refine

- **Triage:** candidates sit in **Proposed**. Flip the good ones to **Ready** and
  the agent drafts them.
- **Don't like it?** Set **Stage = Abandoned** (cleaner than deleting — the agent
  won't propose it again).
- **Needs work?** Edit the **Hint / Title** in place, or send it back to **Idea**
  for discovery to reshape on the next run.

### Schedule

The agent runs on GitHub Actions cron (it never publishes — it only proposes and drafts):

- **Discover** (weekly) — scans Notion ideas, my recent commits, and dev-tool
  trends; proposes new candidates into triage.
- **Draft** (daily) — turns **Ready** rows into PRs / scripts.
- **Promote** (daily) — mints blog-derivative rows from published YouTube videos.

To run a step by hand for testing (needs a local `.env.local` — see
`.env.local.example`):

```sh
npm run agent:discover
npm run agent:draft
npm run agent:promote
```

Design details: [`docs/superpowers/specs/2026-06-02-plan-b-ai-drafting-agent-design.md`](docs/superpowers/specs/2026-06-02-plan-b-ai-drafting-agent-design.md).
