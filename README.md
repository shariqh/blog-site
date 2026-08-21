# shariq.dev

Personal blog at [shariq.dev](https://www.shariq.dev). Astro 6 + Tailwind 4 + MDX. Hosted on Cloudflare Pages.

## Architecture & flows

A few moving parts beyond "build a static site": a Notion-driven drafting agent,
AI cover generation through a shared image service, build-time OG images, and
Cloudflare Pages CI. Here's how they fit.

### System overview

```
   you  ────────────┐           Notion CMS (control panel)
   the draft agent ─┤           ideas → triage → Ready
                    ▼                    │
   ┌──────────────────── content ───────┼─────────────────────┐
   │  src/content/writing/*.mdx          ▼                     │
   │  Zod-validated frontmatter · tags → 5 buckets             │
   │  each post: hero cover (AI) + a build-time OG image       │
   └───────────────────────────┬─────────────────────────────-┘
                               │ git push / PR
                               ▼
   ┌──────────── Astro build (GitHub Actions) ───────────────┐
   │  render pages  +  OG PNGs (Satori/resvg, LOCAL, one per  │
   │  post → dist/og/<slug>.png)                              │
   └───────────────────────────┬─────────────────────────────┘
                               ▼
   ┌──────────── Cloudflare Pages ──────────────┐  analytics: GoatCounter
   │  main → production (shariq.dev)             │  engagement: email / X (footer)
   │  PR   → preview URL (commented on the PR)   │  no comments
   └─────────────────────────────────────────────┘

   AI covers call the external image-gateway (img-gateway.shariq.dev) at
   draft/CLI time — see "Cover + OG generation". The site BUILD never calls it.
```

### Post lifecycle (idea → live)

```
  Notion: Idea ──► Proposed ──► Ready
                                  │  agent-draft (daily 02:00 UTC)
                                  ▼
     write MDX  ─►  AI cover (→ image-gateway)  ─►  open PR
     (by hand,      patch hero.image                 │
      or agent)                                       ▼
                                     PR checks: CI (vitest) · Vale ·
                                  GPT-5.6 Sol AI review · Pages preview
                                                      │ review + merge
                                                      ▼
                                push to main ─► build (+ OG) ─► Cloudflare
                                                                Pages = LIVE
```

### AI drafting agent (Plan B) — GitHub Actions cron

Nothing publishes automatically; the agent only proposes and drafts. Full details
under [Content workflow](#content-workflow).

```
        Notion CMS DB  (Stage: Idea/Proposed/Ready/Drafted/Published)
              ▲                ▲                         ▲
   discover   │      draft     │            promote      │
   (Sun 03:00)│   (daily 02:00)│          (daily 04:00)  │
   ┌──────────┴─┐  ┌───────────┴─────┐  ┌───────────────-┴──┐
   │ scan ideas,│  │ Ready rows →    │  │ published YT with  │
   │ my commits,│  │ MDX + AI cover  │  │ cross-post=blog →  │
   │ dev trends │  │ → open a PR     │  │ new blog row       │
   │ → Proposed │  │ (cover failure  │  │ (Stage=Proposed)   │
   │            │  │  is non-fatal)  │  │                    │
   └────────────┘  └─────────────────┘  └────────────────────┘
```

### Cover + OG generation

Two separate image paths — one generative (remote, via the gateway), one
deterministic (local, at build):

```
  AI COVER  (generative — at draft/CLI/workflow time, NOT during the build)
    gen:cover / agent / Attach blog cover → canonical prompt + style pipeline
      ├─ POST img-gateway.shariq.dev /v1/images/generate ─┐ retry ≤3
      ├─ POST                        /v1/vision/check-text┘ "readable text?"
      │     gateway holds the Azure key → gpt-image-1 + gpt-4o-mini
      ├─ 3 strikes → render a seeded, article-unique fallback locally
      └─ write public/static/images/blog/<slug>/cover.png + patch hero

  OG IMAGE  (deterministic — LOCAL, at build, no network)
    astro build → src/pages/og/[...slug].png.ts → Satori + resvg
      ├─ hybrid     (cover + scrim + title)   when hero.image exists
      └─ fallback   (ink panel + motif + title) otherwise
      → dist/og/<slug>.png   (emitted as og:image / twitter:card)
```

The image-gateway is a separate service (`shariqh/image-gateway`) that holds the
only Azure key; the build and the live site never talk to it.

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
- `npm run gen:cover <slug> [--style line-art|conceptual] [--concept "..."] [--force]` — generate a post's AI cover (via the image-gateway)
- `npm run gen:cover:all [--force]` — backfill AI covers across all posts

### GoatCounter article view counts

Article metadata reads public pageview totals through the same-origin
`/api/read-count` Pages Function. The function exists because Firefox Enhanced
Tracking Protection and other content blockers can block direct browser
requests to GoatCounter. It validates canonical `/blog/.../` paths and forwards
only to the fixed public GoatCounter JSON endpoint; there is no admin API,
token, cookie, user data storage, or additional tracking. Internal cache keys
accept only the production, Cloudflare Pages preview, and local-development
origins.

In GoatCounter, keep **Settings → Allow adding visitor counts on your website**
enabled. The function stores only validated `{count:string}` responses in
Cloudflare's per-edge Cache API under an internal same-origin key. Counts are
fresh for four hours and retained for up to seven days. After four hours the
function refreshes synchronously; an upstream timeout, network failure, HTTP
429, or HTTP 5xx serves the retained value with `x-read-count-cache: stale`.
Those stale responses use at most `max-age=60` and `s-maxage=300`, capped by the
entry's remaining retention time, so public caches retry soon instead of
pinning the fallback.

Concurrent refreshes for the same article share one upstream request within a
Pages Function isolate. A disconnected caller releases its interest without
cancelling active peers; the shared fetch aborts when no consumers remain.
The deploy workflow keeps Cloudflare's `enable_request_signal` compatibility
flag enabled for preview and production so incoming disconnects reach that
coordinator. It serializes Pages project updates and changes only the target
environment's flags, so preview deploys do not mutate production configuration.
GoatCounter pageview totals are treated as cumulative: immediately before
writing, the function re-reads the count cache and preserves an observed higher
count or equal count with newer fetch metadata. Availability failures write a
separate 30-second internal backoff marker, never failure data in the count
entry. While that marker is active, requests skip GoatCounter and serve retained
stale data or remain unavailable when no valid count exists.

Fresh responses use at most `max-age=300` for browsers and `s-maxage=14400` for
shared caches, capped by the remaining four-hour freshness window. Invalid
paths, upstream 404s, malformed responses, and entries older than seven days
still fail closed. A cold or evicted edge cache also fails closed while
GoatCounter is unavailable, so the count remains hidden until that edge has
observed a valid upstream response.

Cloudflare's Cache API remains per-edge and has no conditional write. Coalescing
is isolate-local, backoff is edge-local, and a cross-isolate write can still
race between the final re-read and `cache.put`. The cumulative-count guard
prevents overwriting a higher value already observed by that re-read, but true
global serialization would require Durable Objects or another coordinated
store. Cache API operations also do not accept an `AbortSignal`; request
cancellation stops the shared upstream fetch but cannot cancel an already-issued
edge cache operation.

## Authoring posts

Posts live in `src/content/writing/`. Frontmatter is Zod-validated at build
time (see `src/content.config.ts`). Tags map to display buckets in
`src/lib/buckets.ts`. URLs are `/blog/<filename-without-extension>`.

You can write a post by hand (create the MDX, commit, push, open a PR), or
let the drafting agent write one for you — see [Content workflow](#content-workflow).

Each post gets an on-brand **cover image** — AI-generated via the **image-gateway**
(`img-gateway.shariq.dev`, which proxies Azure `gpt-image-1`) and written to
`hero.image` — plus a build-time **Open Graph image** (1200×630, one per post under
`dist/og/`) so shared links preview cleanly. The drafting agent covers new posts
automatically; `npm run gen:cover` / `gen:cover:all` do it by hand.
External drafting services must dispatch `.github/workflows/attach-cover.yml`
instead of reimplementing prompts, text checks, fallbacks, frontmatter edits, or
asset paths. The workflow always runs the canonical tooling from `main` against
the requested same-repository branch.

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
