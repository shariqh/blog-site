# Blog Modernization — Design Spec

**Date:** 2026-05-27
**Status:** Approved, ready for implementation planning

## Goal

Rebuild `shariq.dev` on a modern stack with an AI-driven publishing workflow. Posts are drafted by a Claude-based agent that reads from the author's Notion idea inbox and recent work across their repos. Drafts land as PRs that are reviewed against a Vercel preview deployment (full production fidelity). Merging the PR publishes the post. No CMS, no admin UI, no draft database — git is the database, PRs are the editorial workflow.

The visual rebuild is an art-directed, editorial-magazine treatment (Pentagram-magazine palette: navy + ochre + cream), distinct from the current generic Tailwind-starter look.

## System overview

Three loosely-coupled pieces around a single source of truth (Git):

1. **The site** — Astro static site, Tailwind 4, MDX content. Built and deployed by Vercel on every push to `main`. Posts live as MDX in `src/content/writing/`, validated by Astro Content Collections with a Zod schema.

2. **The drafting agent** — TypeScript script using the Claude Agent SDK, run on a weekly cron by GitHub Actions (also manually triggerable). Reads from Notion + the author's other repos, generates a hero image, writes the MDX, opens a PR.

3. **The review loop** — Vercel preview deployments render every PR at a unique URL with identical fidelity to production. Author reviews on phone or laptop. Merging the PR is the publish action.

```
Notion ideas DB ─┐
                 ├──> [Agent SDK script]  ──> [PR with MDX + hero] ──> [Vercel preview] ──> [Merge to main] ──> Production
Work repo scans ─┤        (weekly cron)
Existing posts ──┘
```

## Stack

| Layer              | Choice                                                  | Why                                                                                                                            |
| ------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Framework          | **Astro 5** (latest stable)                             | Content-first; zero JS by default; Content Collections give typed frontmatter via Zod; native MDX; first-class Vercel support. |
| Language           | **TypeScript**                                          | Type-safe end-to-end (schema → component props → agent tool calls).                                                            |
| Styling            | **Tailwind 4**                                          | CSS-first `@theme` config; design tokens live in the stylesheet, not a JS config file.                                         |
| MDX                | Astro's built-in MDX integration                        | Replaces `mdx-bundler` + hand-rolled remark chain.                                                                             |
| Code highlighting  | Shiki (built into `@astrojs/markdown-remark`)           | Replaces `rehype-prism-plus`; better DX, no runtime JS.                                                                        |
| Math               | `rehype-katex` (carryover)                              | Same plugin still works under Astro.                                                                                           |
| RSS                | `@astrojs/rss`                                          | Replaces hand-rolled `generate-rss.js`.                                                                                        |
| Sitemap            | `@astrojs/sitemap`                                      | Replaces hand-rolled `generate-sitemap.js`.                                                                                    |
| Hosting            | **Vercel** (carryover)                                  | Preview deployments are load-bearing; no reason to move.                                                                       |
| Analytics          | Plausible (carryover)                                   | Keeps the existing domain config.                                                                                              |
| Agent runtime      | **Claude Agent SDK** (TypeScript)                       | Standard tool for building agentic workflows over the Claude API.                                                              |
| Image generation   | **Flux Pro via fal.ai**                                 | Good quality, simple HTTP API, ~$0.05–0.10/image. Alternative: Imagen 4, DALL·E 3.                                             |
| Cron orchestration | **GitHub Actions** (`schedule:` + `workflow_dispatch:`) | Already gated on this repo; no new infra.                                                                                      |

## Content model

### File layout

```
src/content/writing/
  managing-your-lows.mdx
  cloud-native-flow.mdx
  ...
  _assets/<slug>/
    hero.webp
```

Hero images are colocated with the post (Astro 5 pattern). The agent generates and commits in one place.

### Frontmatter schema

Defined in `src/content/config.ts`. Zod-validated at build time; malformed posts fail CI and cannot be merged.

```ts
import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

const writing = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/writing' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      date: z.date(),
      tags: z.array(z.string()).default([]),
      summary: z.string().max(200),
      hero: z
        .object({
          image: image(),
          alt: z.string(),
          prompt: z.string().optional(), // generation prompt — kept so we can regen
          background: z.enum(['ink', 'ochre', 'paper']).optional(), // per-post art direction override
          titleStyle: z.enum(['italic', 'upper-mono', 'serif-display']).optional(),
        })
        .optional(),
      draft: z.boolean().default(false),
      updatedAt: z.date().optional(),
    }),
})

export const collections = { writing }
```

### Tags and display buckets

Tags are free-form on posts. A small TS module (`src/lib/buckets.ts`) maps tags to a fixed set of display buckets that drive the visual treatment (color cell, typography). One source of truth, read by both the site and the agent.

```ts
export const BUCKETS = {
  leadership: { label: 'Leadership', tags: ['leadership', 'management', 'teams', 'culture'] },
  engineering: {
    label: 'Engineering',
    tags: ['nextjs', 'docker', 'devops', 'cloud', 'architecture', 'astro', 'typescript'],
  },
  process: { label: 'Process', tags: ['workflow', 'tooling', 'systems', 'how-to', 'guide'] },
  notes: { label: 'Notes', tags: [] }, // fallback
} as const

export type Bucket = keyof typeof BUCKETS
```

Resolver: first tag with a bucket match wins; otherwise `notes`. Adding a new bucket is a deliberate code change (touches palette, layout, mapping) — not a content decision.

## Design system

### Palette

Pentagram-magazine direction (navy + ochre + cream), defined as Tailwind 4 design tokens:

```css
@theme {
  --color-ink: #15233a; /* deep navy — primary text, primary cell */
  --color-ink-soft: #2a3f5f; /* secondary navy */
  --color-ochre: #d49a3a; /* golden ochre — accent cell, link hover */
  --color-paper: #f3e8d2; /* cream — primary background */
  --color-paper-soft: #faf3e3; /* lighter cream — card backgrounds */
}
```

**Dark mode:** palette inverts (`ink` becomes background, `paper` becomes text, `ochre` stays as accent). Default behavior is `prefers-color-scheme` system pref with a manual toggle in the header.

### Typography

| Family                                 | Job                                                         |
| -------------------------------------- | ----------------------------------------------------------- |
| **Fraunces** (serif, variable, italic) | Display + body type. Italic hero titles.                    |
| **Inter** (sans, variable)             | UI chrome, post body, navigation, post meta.                |
| **JetBrains Mono**                     | Eyebrows, dates, code blocks, "//" prefix on category tags. |

All three are free, shipped via Astro font optimization (subset, preload, swap). ~30kb total.

### Layout primitives

Four reusable components do most of the heavy lifting:

1. `<Hero>` — cream/navy intro block. Used on home, about, projects, post pages.
2. `<PostCard variant="bucket">` — colored cell in the homepage grid. `variant` drives palette per bucket.
3. `<PostHeader>` — for post pages: eyebrow (bucket + date), italic serif title, summary, optional hero image.
4. `<Prose>` — wraps MDX body. Owns the typography craft for headings, links, lists, code blocks, callouts.

### Per-post art direction

Each post can override its hero treatment via optional frontmatter (`hero.background`, `hero.titleStyle`). Defaults derive from the bucket; specific posts can break the mold. Keeps visual variety without making every post a one-off.

### Pages

| Path                 | Purpose                                                                    |
| -------------------- | -------------------------------------------------------------------------- |
| `/`                  | Homepage = writing index, art-directed grid of recent posts by bucket      |
| `/blog/<slug>`       | Individual post page. **URL pattern preserved from current site for SEO.** |
| `/about`             | Bio page                                                                   |
| `/projects`          | Projects                                                                   |
| `/feed.xml`          | RSS feed (URL preserved)                                                   |
| `/sitemap-index.xml` | Sitemap                                                                    |

## AI drafting agent

### Trigger

```yaml
# .github/workflows/draft.yml
on:
  schedule:
    - cron: '0 14 * * 0' # Sundays 14:00 UTC (morning US Eastern; exact hour shifts with DST)
  workflow_dispatch:
```

`workflow_dispatch` makes the agent manually triggerable from the GitHub mobile app or `gh` CLI.

### Inputs (research phase)

| Source                                           | What                                                           | How                                                                                                                                                                                |
| ------------------------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Notion "Ideas" DB                                | Topics, brain dumps, source links                              | Notion HTTP API via `@notionhq/client` (the agent runs in GitHub Actions, where MCP isn't applicable; MCP would only apply if you wanted to run the agent locally via Claude Code) |
| Work repos                                       | Recent commits, PR titles, README diffs from a configured list | `octokit` against GitHub API                                                                                                                                                       |
| Existing posts                                   | Voice, recent topics (avoid duplication)                       | Filesystem reads of `src/content/writing/`                                                                                                                                         |
| `agent/style.md`                                 | Voice / dos and don'ts / pointers to gold-standard posts       | Loaded into system prompt (cached)                                                                                                                                                 |
| `src/lib/buckets.ts` and `src/content/config.ts` | Bucket map and Zod schema                                      | Loaded so it writes valid frontmatter                                                                                                                                              |

### Notion "Ideas" database schema

| Property | Type         | Purpose                                                 |
| -------- | ------------ | ------------------------------------------------------- |
| Title    | text         | Working title or topic                                  |
| Status   | select       | `idea` / `ready` / `drafting` / `drafted` / `published` |
| Tags     | multi-select | Seeds the post's tags                                   |
| Notes    | long text    | Brain dump / bullets / links                            |
| Sources  | URL list     | Repos, articles, tweets to read for context             |
| Draft PR | URL          | Set by the agent after it opens a PR                    |

The agent only picks items where `Status = ready`. On pick, flips to `drafting` (idempotency guard against parallel runs). On PR open, sets `Draft PR` URL and flips to `drafted`. On merge (handled by a separate small workflow), flips to `published`.

### Agent tools

Exposed to Claude via the Agent SDK:

- `read_notion_ideas(status)` — query the DB
- `read_repo_activity(repo, since)` — recent commits/PRs in a named repo from the configured allowlist
- `read_existing_posts()` — list + read MDX
- `generate_hero_image(prompt, slug)` — calls Flux Pro via fal.ai with a templated style prefix ("editorial collage, navy/ochre/cream palette, abstract"); saves to `src/content/writing/_assets/<slug>/hero.webp`; returns the path + prompt
- `write_post(frontmatter, body, slug)` — writes the MDX file with validated frontmatter
- `open_pr(slug, summary)` — branches `drafts/<date>-<slug>`, commits, opens PR

### PR shape

- **Branch:** `drafts/<YYYY-MM-DD>-<slug>`
- **Title:** `[draft] <post title>`
- **Body (templated):**
  - Which Notion idea it came from (link)
  - Which repo activity it referenced
  - The generated hero image inline
  - A review checklist: voice / factual accuracy / hero image / SEO summary
  - (Vercel auto-comments the preview URL on the PR)
- **Label:** `ai-draft`
- **Branch protection on `main`:** requires the Vercel build (which runs Zod validation) to pass before merge. Malformed frontmatter or broken MDX cannot be merged.

### Revision loop

**v1 — manual.** Author reads the PR on the Vercel preview, edits prose directly in GitHub's web editor (mobile or desktop) or pulls locally and pushes. The agent does not auto-revise from PR comments.

**v2 — comment-driven (deferred).** A second workflow listens for PR comments tagged `@agent` and triggers a re-draft using the comment as input. Not in scope for v1 — wait until we know what feedback shapes are common in practice.

### Configured repo allowlist

Lives at `agent/config.ts`:

```ts
// repos is an allowlist of <org>/<name> entries; populated during setup with the
// repos you actually want the agent to scan. Empty list = the agent skips repo activity.
export const AGENT_CONFIG = {
  repos: [] as string[], // e.g. 'shariqh/my-side-project'
  postsPerRun: 1, // start conservative; can raise later
  lookbackDays: 14, // window for repo activity scans
}
```

### Cost envelope

- Opus 4.7 weekly run with prompt caching: ~$2–5/run
- Image generation: ~$0.05–0.10/image
- Upper bound: ~$15–30/month

## Migration

### Content (14 existing posts)

| Concern     | Approach                                                                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontmatter | Add `summary` field (manual one-time backfill; ~5 min/post). Drop `images`, `authors`, `layout` (single-author site; layout is a component). Keep `title/date/tags/draft`.      |
| Hero images | Existing posts don't have proper heroes. Launch heroless; a "backfill mode" run of the agent can generate retroactively after launch.                                           |
| MDX body    | Carries over mostly unchanged. Custom components (`Youtube`, `Callout`, `Image`, `TOCInline`, `Pre`, custom `Link`) reimplemented as Astro components in `src/components/mdx/`. |
| URLs        | **Preserved.** `/blog/<slug>` continues to work; route at `src/pages/blog/[...slug].astro` reads from `src/content/writing/`.                                                   |

### Dropped from current site

| Page / feature                            | Why                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| `/coffee` (Spotify now-playing)           | Maintenance tax (token refresh); no longer compelling.                                      |
| `/api/*` (goals, now-playing, top-tracks) | Static site doesn't need API routes; the agent does Notion reads.                           |
| `/tags/<tag>` index                       | Tags become metadata-only (derive buckets). Tag index can be added later if missed.         |
| `lib/notion.js` content fetcher           | The agent owns all Notion reads.                                                            |
| Giscus comments                           | Personal blogs rarely get meaningful comment activity; removes a third-party JS dependency. |
| `next-remote-watch`                       | Astro's dev server already watches content.                                                 |

### Sequencing

Single-branch rebuild on a long-lived `rebuild` branch. The current Next.js site keeps serving production from `main`. When the new site is ready, merge `rebuild` → `main`; Vercel auto-deploys; DNS unchanged. No separate staging environment — Vercel's `rebuild`-branch preview URL _is_ staging.

## Deployment

- **Vercel project:** existing project; build command switches from `next build` to `astro build`. Output directory becomes `dist/`. Domain and DNS unchanged.
- **GitHub Actions secrets** (drafting agent): `ANTHROPIC_API_KEY`, `NOTION_API_KEY`, `FAL_API_KEY`. `GITHUB_TOKEN` is auto-provided to workflows.
- **Vercel env vars** (site runtime): essentially none — the site is fully static. `PUBLIC_PLAUSIBLE_DOMAIN` if analytics needs domain config at build.

## Out of scope (v1)

Explicit non-goals, so the implementation plan stays focused:

- Out-of-band brain-dump capture (Telegram bot, voice memo). Brain dumps go into Notion's "Notes" field.
- Agent-driven PR revisions from comments (the "v2 revision loop"). v1 is manual edits.
- Scheduled publishing ("merge this PR at Tuesday 9am"). Manual merge is the publish action.
- Hero image backfill for existing posts. Launch heroless; backfill later if desired.
- A `/tags/<tag>` index. Tags are metadata-only in v1.
- Multi-author support. Single author.
- Comments. Dropped entirely (replaceable with "reply via email/X" link in footer if missed).

## Open questions / future work

Not blocking v1, but worth flagging:

- **Repo allowlist size.** Starting with 2–3 repos is reasonable; if the agent needs broader access later, revisit.
- **Image generation provider.** Flux Pro via fal.ai is the v1 default. If quality or cost becomes an issue, swap in Imagen 4 or DALL·E 3 behind the same `generate_hero_image` tool interface.
- **Comment-driven agent revisions (v2).** Build once v1 reveals which feedback patterns are common.
- **OpenGraph image generation.** Astro supports `@vercel/og` at build time; could auto-generate per-post OG cards. Punt until v1 ships.
