# Plan B — AI Drafting Agent — Design Spec

**Date:** 2026-06-02
**Status:** Approved, ready for implementation planning
**Extends:** [2026-05-27-blog-modernization-design.md](./2026-05-27-blog-modernization-design.md)

## Goal

A nightly Claude-based agent that watches your real work — Notion ideas, recent commits across active repos, public AI/dev tool releases — and proposes content to publish in two formats: blog posts and YouTube shorts. You triage candidates in Notion. The agent then drafts each in the right shape:

- **Blog** → an MDX file in a PR against this repo, reviewed via the Cloudflare Pages preview.
- **YouTube short / long** → a structured script written directly into the Notion row body, ready for you to record.

When a published YT short turns out to be worth a long-form treatment, a separate promotion workflow mints a linked blog-derivative row carrying the video forward. You triage that the same way.

The agent never publishes anything. Every blog post still flows through your PR review; every video still gets you behind the camera. Git is the database for blog content; Notion is the database for video scripts and for the workflow state of everything.

## Non-goals (v1, explicit)

- Hero image generation for blog posts (deferred — you add images at PR review)
- Notion webhooks for sub-minute draft trigger (nightly cron is fine for content)
- Blog → YT script derivative direction (only YT → blog in v1)
- Video editing, thumbnail rendering, or upload automation
- Auto-merge or auto-publish of any kind
- Real-time tool-discovery beyond Notion + GH trending + HN

## System overview

```
                  ┌───────────────────────────────────────────┐
                  │  Notion CMS DB (restructured in place)    │
                  │   Kind ∈ {blog, YT short, YT long, ...}   │
                  │   Stage = workflow state                  │
                  └───────────────────────────────────────────┘
                       ▲                              ▲
            proposes   │                              │   writes script blocks / PR link
            new        │                              │
            candidate  │                              │
            rows       │                              │
                       │                              │
        ┌──────────────┴──────────────┐  ┌────────────┴─────────────────┐
        │ agent-discover.yml          │  │ agent-draft.yml              │
        │ Sun 03:00 UTC + manual      │  │ Daily 02:00 UTC + manual     │
        │                             │  │                              │
        │ Reads:                      │  │ Reads: Stage=Ready rows      │
        │  • Notion Stage=Idea rows   │  │ Per row, branches on Kind:   │
        │  • Git commits (active 30d) │  │   blog → MDX + PR            │
        │  • GH trending + HN feed    │  │   YT*  → script in row body  │
        │  • Past YT perf (YT API)    │  │ Flips Stage=Drafted          │
        │ Writes: candidate rows      │  │                              │
        └─────────────────────────────┘  └──────────────────────────────┘

                       ┌─────────────────────────────────────────────┐
                       │ agent-promote.yml                            │
                       │ Daily 04:00 UTC + manual                     │
                       │                                              │
                       │ Reads: Kind=YT* rows now Stage=Published     │
                       │   with Cross-post Targets includes 'blog'    │
                       │   AND no derivative row exists yet           │
                       │ Mints: linked derivative blog row            │
                       │   Stage=Proposed, Origin=Derivative          │
                       └──────────────────────────────────────────────┘

Discovery and drafting call Claude via subscription OAuth (CLAUDE_CODE_OAUTH_TOKEN);
promotion is metadata-only (no model call). All three use the Notion HTTP API, and
drafting shells out to `gh` for PR creation. No MCP servers are spawned in CI.
```

## Stack

| Layer          | Choice                                                  | Why                                                                                 |
| -------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Runtime        | Node 22 (matches site CI)                               | Same toolchain as the rest of the repo                                              |
| Language       | TypeScript strict                                       | Matches the rest of the repo; types end-to-end on Notion + Claude payloads          |
| Model          | Claude via Agent SDK (`@anthropic-ai/claude-agent-sdk`) | Supports subscription OAuth auth (raw `@anthropic-ai/sdk` requires API-key billing) |
| Auth           | `CLAUDE_CODE_OAUTH_TOKEN` (your subscription)           | Runs against your subscription quota, not per-token billing                         |
| Notion         | Raw HTTP via `fetch` (Notion API v2025-09-03)           | No MCP server in CI; HTTP is enough for the operations we need                      |
| GitHub PRs     | `gh` CLI (already on GHA runners)                       | Familiar; handles PR body via heredoc cleanly                                       |
| YouTube        | YT Data API v3 via `fetch`                              | Free, no OAuth (public stats only)                                                  |
| Trending feeds | HN Firebase API + GH trending scrape                    | HN has an official API; GH trending doesn't (acceptable for v1)                     |
| Orchestration  | GitHub Actions (cron + workflow_dispatch)               | Same infra as the deploy workflow                                                   |

## Notion DB redesign

We restructure the existing `CMS` database **in place** rather than create a parallel `Content` DB. Same row IDs, same DB ID, same Notion views URL — but with cleaner properties for the agent loop. One source of truth, no archive DB to maintain.

The transformation is split between manual Notion-UI changes (rename property, rename options, add new properties) and a migration script that backfills the new properties on every existing row.

### Target schema (after restructure)

| Property           | Type            | Notes                                                                                              |
| ------------------ | --------------- | -------------------------------------------------------------------------------------------------- |
| Title              | title           | Working title                                                                                      |
| Kind               | select (single) | `blog`, `YT short`, `YT long`, `podcast`, `presentation`, `IG reel`, `stand up`. One Kind per row. |
| Stage              | select          | `Idea`, `Proposed`, `Ready`, `Drafted`, `Recorded`, `Edited`, `Published`, `Abandoned`             |
| Origin             | select          | `OC` (you), `Agent Proposed` (discovery wrote it), `Derivative` (promotion minted it)              |
| Source Row         | relation (self) | For derivatives — links back to the parent row                                                     |
| Cross-post Targets | multi-select    | `blog`, `YT short`, `YT long`. Promotion workflow reads this.                                      |
| Tags               | multi-select    | Free-form pool. Display bucket for blog still resolved by `src/lib/buckets.ts`.                    |
| Tools              | multi-select    | AI/dev tools the piece covers; powers YT dedupe                                                    |
| Hint               | rich_text       | One-line angle / take (agent writes this on proposal)                                              |
| Source URLs        | rich_text       | Commit SHAs, HN links, tool homepages                                                              |
| Draft URL          | url             | PR URL for blog; null for YT (script lives in row body)                                            |
| Published URL      | url             | Final live URL                                                                                     |
| Publishing         | date            | Target / actual publish date                                                                       |
| Created / Updated  | auto            |                                                                                                    |

### Stage lifecycle by Kind

| Stage     | blog | YT short / YT long | Notes                                                   |
| --------- | ---- | ------------------ | ------------------------------------------------------- |
| Idea      | ✓    | ✓                  | Seed state — your raw notes; never touched by the agent |
| Proposed  | ✓    | ✓                  | Discovery wrote this row OR you upgraded an Idea        |
| Ready     | ✓    | ✓                  | You flipped this; drafting picks it up overnight        |
| Drafted   | ✓    | ✓                  | Blog: PR opened. YT: script blocks in row body.         |
| Recorded  | —    | ✓                  | You shot the video                                      |
| Edited    | —    | ✓                  | Video edit done                                         |
| Published | ✓    | ✓                  | Live (you set this)                                     |
| Abandoned | ✓    | ✓                  | Dead end, any stage                                     |

Blog skips Recorded/Edited; YT uses them. Stage is single-select, so there's no ambiguity at any moment.

### Recommended views to add (existing views keep working)

Because we restructure the same DB, your current Notion views on CMS continue working — they reference the same DB ID and the same properties (where renamed, Notion updates view references automatically). Add these new agent-oriented views alongside what you already have:

| View               | Filter                                        | Sort                        |
| ------------------ | --------------------------------------------- | --------------------------- |
| Triage             | `Stage in [Proposed, Ready]`                  | Created desc                |
| In flight          | `Stage in [Ready, Drafted, Recorded, Edited]` | Updated desc                |
| Recently published | `Stage = Published`                           | Publishing desc             |
| Ideas inbox        | `Stage = Idea`                                | Created desc                |
| By Kind            | (no filter)                                   | grouped by Kind, then Stage |

### Manual Notion-UI restructure (one-time, human action)

Before the migration script runs, restructure the CMS DB schema in Notion's UI:

1. **Rename `Status` → `Stage`.** Notion preserves all existing values automatically.
2. **Rename Status options to new Stage values:**
   - `Prepping` → `Idea`
   - `Ready To Record` → `Ready`
   - `Recording` → `Recorded`
   - `Post-Processing` → `Edited`
   - `Published` stays `Published`
   - `Abandoned` stays `Abandoned`
   - `✅` → merge into `Published` (re-tag any rows using ✅, then delete the ✅ option)
3. **Add new Stage options:** `Proposed`, `Drafted`. These are agent states that don't exist yet.
4. **Add new property `Kind`** (single-select) with options: `blog`, `YT short`, `YT long`, `podcast`, `presentation`, `IG reel`, `stand up`. Empty initially — migration backfills from Medium.
5. **Add Origin options:** `Agent Proposed`, `Derivative`. Keep existing `OC`, `x-post:bundle`, `x-post:blog`.
6. **Add new properties:**
   - `Source Row` — relation to self (this same DB)
   - `Cross-post Targets` — multi-select with options `blog`, `YT short`, `YT long`
   - `Tools` — multi-select (empty pool initially)
   - `Hint` — text
   - `Draft URL` — URL
7. **Optionally rename** `Published Link` → `Published URL` for consistency. Notion preserves values.
8. **Keep as-is (legacy, agent ignores):** `Medium`, `Type`, `Keywords`, `Source(s)`, `No.`, `Files & Media`. The migration reads these and populates the new properties, but they're not deleted — your historical data stays intact.

After this, share the DB with the `Claude Code MCP` integration (already done, no action needed).

### Migration script

One-shot, in-place: updates existing pages, creates sibling pages only for multi-Medium splits.

```sh
npm run migrate:cms -- --dry-run    # transformation report, no writes
npm run migrate:cms -- --execute    # performs migration after you approve
```

Transformation rules:

1. **Single-Medium rows:** PATCH the existing page. Set `Kind` from the first Medium value, populate `Source URLs` from `Source(s)`, append `Keywords` to `Hint`. (Stage is already correct because Notion renamed it during the UI restructure.) Set Origin if mapping: `x-post:blog` → `Derivative`; everything else unchanged.
2. **Multi-Medium rows:** PATCH the existing page (becomes primary; `Kind` = first Medium, `Cross-post Targets` = other Mediums). CREATE one new sibling page per additional Medium with `Origin=Derivative` and `Source Row` linking back to the primary.
3. **`x-post:bundle`** → keep as `OC` but populate `Cross-post Targets` from the other Mediums (for both single and multi rows).
4. **Drop nothing.** Legacy properties (Medium, Type, Keywords, etc.) remain on rows; the agent just doesn't read them after migration.

The dry-run report flags:

- How many rows will be PATCHed vs how many sibling pages will be CREATED (from multi-Medium splits)
- Rows where `x-post:blog` would mark Origin=Derivative but no Source Row link can be inferred (left unlinked)

Execute mode is idempotent against already-migrated rows: it skips PATCH on rows where `Kind` is already populated. Splits are NOT re-run for rows that already have derivative siblings (detected via `Source Row` back-references).

## Discovery workflow

Path: `.github/workflows/agent-discover.yml`. Schedule: `cron: '0 3 * * 0'` (Sunday 03:00 UTC) + `workflow_dispatch`.

Entry: `scripts/agent/discover.ts`.

```
discover.ts
├─ sources/
│  ├─ notion.ts    – existing Stage=Idea rows for both blog + YT
│  ├─ git.ts       – commits last 7d across active repos
│  ├─ trending.ts  – GH trending (ai-tools topic) + HN Show HN feed
│  └─ youtube.ts   – last 30d of own video stats via YT Data API v3
├─ rank.ts         – calls Claude with structured-output prompt
└─ upsert.ts       – writes new candidate rows to Notion
```

### Source-reader rules

**`notion.ts`** — query `Stage=Idea` rows. Pass title + Tags + Tools + body excerpt to the ranker.

**`git.ts`** — for each repo in scope:

- Always: `blog-site`, `lognote`
- Opportunistic: every public repo under `shariqh` with a push in the last 30 days

Use the GH REST API (`/repos/{owner}/{repo}/commits?since=<date>`). Pull commit messages + first ~10 changed files per commit. Cap at the last 50 commits per repo per run.

**`trending.ts`** — two feeds:

- GH trending: scrape `github.com/trending/typescript?since=weekly` and `python`, `rust`, plus `github.com/topics/ai-tools`. No official API; cache the HTML for the run. If scraping fails, log and continue without it.
- HN: official Firebase API (`https://hacker-news.firebaseio.com/v0/topstories.json`). Filter to titles matching `cli`, `agent`, `claude`, `gemini`, `copilot`, `codex`, plus tool-names already in the `Tools` registry.

**`youtube.ts`** — YouTube Data API v3 `videos.list` filtered to your channel. Pull title + view count + like count for the last 30 days. Compute per-tool average performance via the matching row's `Tools` field.

### Ranking prompt

Single Claude call. System prompt loads `docs/EDITORIAL.md` and `docs/SHORTS-STYLE.md`. User message contains all source data, requests structured JSON output:

```jsonc
{
  "blog_candidates": [
    {
      "title": "...",
      "hint": "...",
      "tags": ["..."],
      "source_urls": ["..."],
      "rationale": "...",
    },
  ],
  "yt_candidates": [
    {
      "title": "...",
      "hint": "...",
      "tools": ["..."],
      "source_urls": ["..."],
      "rationale": "...",
    },
  ],
}
```

Up to 3 candidates per track. Empty arrays if nothing meets the bar (no spam runs).

### Upsert rules

For each candidate from the model:

- **Dedupe by title similarity** (case-insensitive normalized Levenshtein distance ≤ 0.2 — i.e., titles ≥80% similar count as duplicates) against existing rows in the last 60 days. Skip if a near-match exists.
- **YT-only dedupe by Tools overlap**: if every tool in the proposed candidate appears in an existing `Stage=Published Kind=YT*` row, skip.
- Create row with: `Kind=<blog|YT short>`, `Stage=Proposed`, `Origin=Agent Proposed`, Tags/Tools/Hint/Source URLs from the model, body containing the rationale.

## Drafting workflow

Path: `.github/workflows/agent-draft.yml`. Schedule: `cron: '0 2 * * *'` (daily 02:00 UTC) + `workflow_dispatch`.

Entry: `scripts/agent/draft.ts`. Queries Notion for rows where `Stage=Ready`. For each row, branches on `Kind`.

### Blog branch

```
1. Gather context:
   - Notion row body + Hint + Source URLs
   - For each commit SHA in Source URLs: fetch full diff via GH API

2. Load system prompt:
   - SITE.author voice (from src/lib/site.ts)
   - docs/EDITORIAL.md (verbatim)
   - Bucket map from src/lib/buckets.ts
   - For Origin=Derivative rows: include the source YT script + URL,
     and instruct the model to embed the video at the top via
     <Youtube id="..." />

3. Claude call: write the full MDX file. Output is the file contents.

4. Validate:
   - Parse frontmatter, run through the Zod schema from src/content.config.ts
   - If invalid: post a comment on the Notion row with the error,
     leave Stage=Ready, abort this row

5. Run Vale:
   - vale src/content/writing/<slug>.mdx
   - Errors block (current Vale config triggers errors only on broken frontmatter)
   - Warnings collected for PR description, do not block

6. Git ops:
   - Branch: agent/draft/<slug>
   - Commit: "draft: <title> (proposed by agent)"
   - Push

7. PR via gh CLI:
   - Title: same as commit
   - Body: Notion source link + EDITORIAL pre-publish checklist
     + Vale warning report + "this was AI-drafted, please review"

8. Update Notion row: Stage=Drafted, Draft URL=<PR URL>
```

### YT short / YT long branch

```
1. Gather context (same as blog).

2. Load system prompt:
   - SITE.author voice (from src/lib/site.ts)
   - docs/SHORTS-STYLE.md (verbatim)
   - The row's Tools field for tool-specific framing

3. Claude call: structured output with these fields:
   - hook            (≤3 seconds of dialogue, sentence by sentence)
   - script          (full body, ~50s for short, ~5min for long)
   - on_screen_text  [{timestamp_seconds, text}]
   - b_roll          [{timestamp_seconds, description}]
   - thumbnail_prompt (string)
   - title_variants  (array of 3)
   - hashtags        (array of 5-8)

4. Render as Notion blocks; replace row body via the Notion blocks API:
   - H2 Hook                → paragraph
   - H2 Script              → paragraphs
   - H2 On-screen text      → bulleted list "{time}s — {text}"
   - H2 B-roll              → bulleted list "{time}s — {description}"
   - H2 Thumbnail           → paragraph with the prompt
   - H2 Title variants      → bulleted list
   - H2 Hashtags            → paragraph (space-joined)

5. Update Notion row: Stage=Drafted. Draft URL stays null —
   the script is in the row body.
```

### Per-row error isolation

Try/catch around each row. Any failure leaves Stage=Ready, posts a Notion page comment with the error, and continues to the next row. The whole workflow exits 0 unless something catastrophic happens (Notion API completely down, OAuth invalid, etc.) — those exit 1 and trigger GH's email notification.

## Promotion workflow

Path: `.github/workflows/agent-promote.yml`. Schedule: `cron: '0 4 * * *'` (daily 04:00 UTC) + `workflow_dispatch`.

Runs two hours after drafting so rows that just got drafted earlier in the same night don't trigger spurious promotions.

Entry: `scripts/agent/promote.ts`.

```
1. Query Notion: rows where
   - Kind in [YT short, YT long]
   - Stage = Published
   - Cross-post Targets includes 'blog'
   - No existing row has this row as Source Row (no derivative yet)

2. For each such row, create a new Content row:
   - Kind = blog
   - Stage = Proposed
   - Origin = Derivative
   - Source Row = <published YT row's page ID>
   - Title = <YT title, adapted toward blog convention>
   - Tags = inherited from source
   - Tools = inherited from source
   - Hint = "Blog-length treatment of YT video <YT URL>. Expand on: ..."
   - Source URLs = source row's Source URLs + the published YT URL
   - Body: pre-filled with the YT script as a starting point
           + a static expansion-outline template (Setup / Demo / What surprised me / Where this fits)

3. Post a Notion comment on the source row: "Created derivative blog row: <link>"
```

Important: promotion only creates the row in `Proposed`. The agent **never** auto-promotes to `Ready` — you triage every derivative the same as any other candidate.

Promotion does not call Claude. The adapted title is a literal copy of the source title, the body is templated. When you later flip the derivative row to `Ready`, the drafting workflow's blog branch handles all the model-driven work — and because `Origin=Derivative`, that prompt includes the source video URL and script context.

## Style contracts

### `docs/EDITORIAL.md` (existing)

The agent loads this verbatim into the system prompt for the blog branch. No changes needed for v1.

### `docs/SHORTS-STYLE.md` (new, to be drafted during implementation)

Captures:

- Hook discipline (first 3 seconds promise a payoff)
- 60s pacing for shorts, ~5min for YT long
- Vertical framing assumed
- Tone: peer-to-peer; no influencer voice; no "what's up guys"
- Tool framing: what's this for / what's surprising / what's it replace
- Title formula guidelines: punchy without clickbait
- Hashtag conventions (5–8 per video, lowercase, mix of broad + tool-specific)

The agent never invents style rules — it follows what's documented. Updates to either style doc require no code changes; the agent re-reads on every run.

## Secrets and config

### Secrets (`.github/workflows/*.yml` env)

- `CLAUDE_CODE_OAUTH_TOKEN` — subscription auth, obtained via `claude setup-token`
- `NOTION_TOKEN` — internal Notion integration token, scoped to the restructured CMS DB
- `AGENT_GH_TOKEN` — fine-grained PAT with `contents:write` + `pull-requests:write` on this repo (the default `GITHUB_TOKEN` from a cron workflow can't trigger downstream workflows like deploy/Vale CI; a separate PAT can)
- `YOUTUBE_API_KEY` — YT Data API v3 key for public stats

### Repo variables

- `NOTION_CMS_DB_ID` — the existing CMS DB ID (`d25e9f1c0a3345589592fce32f7bc02b`)
- `YOUTUBE_CHANNEL_ID` — your channel ID
- `SCAN_REPO_ORG=shariqh`
- `SCAN_REPO_INCLUDE=blog-site,lognote` — always-on repos
- `SCAN_REPO_ACTIVE_DAYS=30` — gate for opportunistic public repos

## Local development

All three scripts runnable locally:

```sh
npm run agent:discover
npm run agent:draft
npm run agent:promote
```

Each reads from a gitignored `.env.local` mirroring CI secrets. Useful for prompt iteration without burning a subscription window in CI.

The migration script (`migrate:cms`) is local-only — it never runs in CI.

## Error handling and observability

| Failure mode                    | Behavior                                                            |
| ------------------------------- | ------------------------------------------------------------------- |
| Subscription rate limit (429)   | Log, exit 0. Cron retries next slot.                                |
| Notion API outage               | Exit 1 → GH email notification                                      |
| Per-row drafting error          | Try/catch isolates; Notion comment on the row; continue to next row |
| Frontmatter Zod validation fail | Row stays Ready; Notion comment with the validation error           |
| Vale errors                     | Currently only fire on broken frontmatter — same handling as above  |
| Vale warnings                   | Collected; surfaced in PR description; never block                  |
| `gh pr create` failure          | Row stays Ready; Notion comment                                     |
| YouTube API quota exhausted     | Discovery proceeds without perf signal; logged                      |
| GH trending scrape failure      | Discovery proceeds without trending signal; logged                  |

Observability in v1 = GH Actions run logs + Notion row comments. Both are easy to inspect from where you already are.

## Testing

**Unit (Vitest):**

- Notion row mapper: old CMS shape → new Content shape (both directions, for migration verification)
- Bucket consumption from agent output
- Frontmatter validator using `src/content.config.ts`'s schema
- Dedupe logic: title-similarity threshold, Tools overlap

**Integration (manual, gated):**

- Migration dry-run against the real CMS DB; inspect transformation report
- Migration execute; verify CMS DB rows now have Kind/Stage/Origin/etc populated; spot-check a split row's sibling
- `workflow_dispatch` discovery once; verify candidates land in Notion
- Manually flip one Content row to Stage=Ready; `workflow_dispatch` draft; verify either PR opens (blog) or script blocks appear in row body (YT)
- Enable crons

## Implementation order (high-level)

The implementation plan (next phase, via the writing-plans skill) will sequence these. Rough shape:

1. Write `docs/SHORTS-STYLE.md`
2. Notion redesign: manually restructure CMS DB schema (rename Status→Stage with new options, add Kind + 5 new properties, add Origin options)
3. Migration script: dry-run mode → review → execute mode
4. Shared lib: `sources/notion.ts`, `sources/git.ts`, `sources/trending.ts`, `sources/youtube.ts`
5. Drafting: blog branch (MDX + PR) — narrowest path, most existing primitives
6. Drafting: YT branch (script blocks into Notion)
7. Discovery script + workflow
8. Promotion workflow
9. Vitest coverage on lib units
10. End-to-end smoke via workflow_dispatch
11. Enable crons

## Open questions (deferred, not blocking)

- **Tools registry as separate DB.** v1 uses the `Tools` multi-select on `Content`. If the list grows past ~30 entries, a separate `Tools` DB with status (Untested/Covered/Deprioritized) may earn its keep. Re-evaluate after 3 months.
- **YT performance window.** v1 uses last 30d. Some videos pop late; the window may need tuning. Adjustable via a repo variable.
- **PR auto-labeling.** Could tag draft PRs with `agent-draft`, `bucket-<key>` for filtering. Cheap; saving for v2 unless filtering becomes annoying.
- **Blog → YT script derivative.** Symmetric to the YT → blog flow. Less common per the original framing. Add later if the need shows up.
