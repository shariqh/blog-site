# Social Agent — Design Spec

**Date:** 2026-06-25
**Status:** Approved (design), ready for implementation planning
**Relates to:** [2026-06-02-plan-b-ai-drafting-agent-design.md](./2026-06-02-plan-b-ai-drafting-agent-design.md) (same voice contracts, same Claude/Notion stack, different runtime)

## Goal

A small always-on service that turns your real work into social posts you can approve from Notion. It proposes — it never posts on its own. The shape mirrors Plan B (Notion as the control surface, you approve, the machine publishes), pointed at X instead of MDX, and it reuses the X thread poster already merged into `blog-site` (`scripts/social/post-thread.ts`, PR #52).

The loop, end to end:

1. Something happens (a blog post goes live, you jot a seed, a repo ships).
2. The agent drafts a thread or a standalone in your voice and writes it to a **Notion Social Queue** as a `Proposed` row, with the thread's parts laid out in the row's page body.
3. You review in Notion, edit any part inline, and flip **Status → Approved**.
4. The service reads the row, posts the thread to X as a reply-chain, and writes **Posted** plus the live URL back to the row.

The service runs as a Docker container on `ubi-prod`, reachable only through a Cloudflare Tunnel (no open inbound ports). Work is **event-driven**: a GitHub webhook fires the propose leg, a Notion automation fires the post leg.

## Non-goals (v1, explicit)

- **No auto-posting.** Nothing reaches X without a human flipping a row to `Approved`. This is the load-bearing invariant.
- **LinkedIn** — deferred to Phase 3; its API is gated and is its own piece of work.
- **Media/images on tweets** — v1 posts text threads only. The blog already mints OG images; attaching media to tweets is deferred.
- **Engagement/analytics ingestion** (likes, impressions back into Notion) — deferred.
- **Scheduling to an "optimal" time** — approved posts go out on approval, not on a calendar.
- **X Premium long-posts (25k chars)** — not needed; threading ≤280-char parts is the free-tier path and the better format anyway.
- **A second Notion DB for content** — the Social Queue is its own database, separate from the Plan B CMS DB; we do not overload `Kind` on the CMS DB with social types.

## Phasing

All four idea sources are designed; the build is staged so the pipeline proves out before we have four generators to babysit.

| Phase | Adds | Trigger |
| ----- | ---- | ------- |
| **1 — spine** | Blog post → thread proposal; the full propose→approve→post loop; container + tunnel on `ubi-prod` | GitHub webhook (blog merge) + Notion automation (approval) |
| **2 — more in** | **Seeds** (jot a topic, get a draft back) and **dev activity** (commits/releases → build-in-public posts) | Notion button / repo webhooks |
| **3 — the rest** | **Original takes** (standalone takes from your themes) and **LinkedIn** | Internal scheduler (takes) + LinkedIn API |

Phase 1 is the whole architecture with one source wired. Phases 2–3 are new handlers hanging off the same spine.

## System overview

```
                       ┌──────────────────────────────────────────┐
                       │  Notion: Social Queue DB                  │
                       │   Status = Proposed → Approved → Posted   │
                       │   thread parts live in the row page body  │
                       │   (divider blocks separate the parts)     │
                       └──────────────────────────────────────────┘
                          ▲  writes Proposed        │  Status→Approved
            writes a      │  rows + parts           │  fires automation
            Proposed row  │                         ▼
        ┌─────────────────┴───────────────┐   ┌─────────────────────────┐
        │  POST /hook/blog                │   │  POST /hook/notion       │
        │  GitHub push → main (HMAC)      │   │  Notion automation       │
        │  • find new src/content/writing │   │  (secret + re-fetch)     │
        │    posts in the push            │   │  • read page blocks      │
        │  • draft thread via Claude      │   │  • split on dividers     │
        │    (EDITORIAL voice)            │   │  • validate each ≤280    │
        │  • each part validated ≤280     │   │  • post chain to X       │
        │  • write Proposed row + blocks  │   │  • write Posted + URL     │
        └─────────────────────────────────┘   └─────────────────────────┘
                          ▲                              │
                          │                              ▼
        ┌─────────────────┴──────────────────────────────────────────────┐
        │  social-agent container on ubi-prod  (Hono server, Node 22)     │
        │  reaches OUT to: GitHub raw (voice docs), Anthropic, Notion, X  │
        │  reached only THROUGH: cloudflared tunnel → public hostname     │
        └────────────────────────────────────────────────────────────────┘

Drafting calls Claude via subscription OAuth (CLAUDE_CODE_OAUTH_TOKEN), same as Plan B.
Posting reuses the post-thread core (twitter-api-v2, OAuth 1.0a). No open ports on ubi-prod;
the only inbound path is the Cloudflare Tunnel.
```

## Stack

| Layer | Choice | Why |
| ----- | ------ | --- |
| Runtime | Node 22 + [Hono](https://hono.dev) HTTP server | Small, portable; same server stack as askdocs |
| Language | TypeScript strict | Matches the whole ecosystem |
| Model | Claude via Agent SDK (`@anthropic-ai/claude-agent-sdk`) | Subscription OAuth (`CLAUDE_CODE_OAUTH_TOKEN`), same as Plan B — no per-token billing |
| X API | `twitter-api-v2` (OAuth 1.0a user context) | Already the dependency behind `post-thread.ts`; Free tier covers posting |
| Notion | Raw HTTP via `fetch` (Notion API `2025-09-03`) | Same approach as Plan B; no MCP server in the container |
| Ingress | Cloudflare Tunnel (`cloudflared`) | Public HTTPS hostname with no open ports; you're already Cloudflare-native |
| Deploy | Docker Compose on `ubi-prod` (`app` + `cloudflared`) | Your box; one `compose up` |
| Secrets | 1Password (`op inject` rendered `.env`; op-connect optional later) | Matches your env pattern |

## Its own repo

`social-agent` is a new repository. It's a deployed long-running service with its own lifecycle (Dockerfile, compose, tunnel config) — distinct from `blog-site`, whose agents run as GitHub Actions crons. The two things it borrows from `blog-site`:

- **Voice contract** — it fetches `docs/EDITORIAL.md` from `blog-site`'s raw GitHub (`main`) at draft time, so the voice is always current with no vendored copy to drift. The X-specific format rules live in this repo as `SOCIAL-STYLE.md` (new — analogous to `SHORTS-STYLE.md`).
- **Posting core** — the `tweetLength` / `sanitize` / reply-chain loop from `post-thread.ts` is ported into `src/x/` here (~40 lines, stable). `blog-site`'s CLI stays as the manual/ad-hoc poster; this is an independent copy. Sharing it as a package is deferred (see Open questions).

## Notion: the Social Queue DB

A **new** database in your personal Notion, separate from the Plan B CMS DB. One row per proposed post. It is the entire human control surface.

### Schema

| Property | Type | Notes |
| -------- | ---- | ----- |
| Title | title | Working label, e.g. "lognote day one" |
| Status | select | `Proposed` → `Approved` → `Posting` → `Posted`, plus `Rejected` and `Needs fix`. **The only field you routinely touch.** |
| Platform | select | `X` (LinkedIn added in Phase 3) |
| Type | select | `Thread` / `Standalone` |
| Source | select | `Blog post` / `Seed` / `Dev activity` / `Original take` |
| Source link | url | The post / commit / release the draft came from |
| Posted URL | url | The live thread URL, written back after posting |
| Error | rich_text | Set on validation/post failure (e.g. "part 7 is 291 chars") |
| Created / Updated | auto | Notion-managed |

### Where the thread content lives

The parts of a thread live in the **page body** of the row, not in a property — a 10-part thread is far too much for a cramped text field. Layout:

- One Notion **paragraph block** (or several) per part.
- A Notion **divider block** between parts. The divider is the exact equivalent of the `---` delimiter the poster already uses in `.txt` thread files.
- A `Standalone` row's body is just the single post's text, no dividers.

This is symmetric with how the Plan B YT branch writes structured blocks into a row body, and with how `parseThread()` splits `.txt` files on `---`.

**Write (propose):** the agent creates the row (`Status=Proposed`) and writes the parts as divider-separated paragraph blocks via the Notion blocks API.

**Read (post):** on approval, the service fetches the row's child blocks, splits the sequence on divider blocks, joins each group's paragraph text into one part, and feeds the parts to the poster.

### Status lifecycle

| Status | Meaning | Who sets it |
| ------ | ------- | ----------- |
| `Proposed` | Draft ready for review | Agent |
| `Approved` | You signed off — post it | You |
| `Posting` | Interim lock while the service posts (prevents a double-fire from double-posting) | Service |
| `Posted` | Live on X; `Posted URL` is filled | Service |
| `Needs fix` | Approved but a part failed validation (over 280, empty) | Service |
| `Rejected` | You don't want it; ignored forever | You |

### Recommended views

| View | Filter | Sort |
| ---- | ------ | ---- |
| Review | `Status = Proposed` | Created desc |
| Posted | `Status = Posted` | Updated desc |
| Needs fix | `Status = Needs fix` | Updated desc |

## Propose leg — `POST /hook/blog`

GitHub webhook on `shariqh/blog-site`, event `push` to `main`.

```
1. Verify HMAC: X-Hub-Signature-256 against GITHUB_WEBHOOK_SECRET. 401 on mismatch.
2. From the push payload, collect added/modified files under src/content/writing/*.mdx.
   - Ignore drafts (frontmatter draft: true).
   - Ignore pure edits if the post already has a Posted/Proposed row for it
     (dedupe by Source link = the post URL).
3. For each new published post:
   a. Fetch the post's MDX (raw GitHub) + resolve its live URL (/blog/<slug>).
   b. Load the system prompt: SITE.author voice + EDITORIAL.md (raw GitHub) + SOCIAL-STYLE.md.
   c. Claude call (Agent SDK, structured output): a thread (array of parts) + one standalone variant.
   d. Validate each part with tweetLength() ≤ 280. If the model overshoots, ask it once to trim;
      if still over, write the row anyway as Needs fix with an Error note (you'd see and fix it).
   e. Create a Social Queue row: Status=Proposed, Platform=X, Type=Thread,
      Source=Blog post, Source link=<post URL>; write the parts as divider-split page blocks.
      Create a second Type=Standalone row for the standalone variant.
4. Respond 200 immediately (GitHub expects a fast ack); the draft runs as a background task in
   the long-running container and is logged. A blog merge is a single event, so a draft failure
   just means "no proposal" — logged, and re-triggerable via a manual endpoint
   (POST /hook/blog/replay?sha=...).
```

## Post leg — `POST /hook/notion`

A Notion **database automation** on the Social Queue fires when a row's `Status` changes to `Approved`, calling our endpoint.

```
1. Authenticate the call: a secret token in the path (/hook/notion/<NOTION_WEBHOOK_TOKEN>).
   The payload is NOT trusted for correctness — only as a "look at row X" nudge.
2. Re-fetch the row from Notion (authoritative). Proceed only if Status is still Approved
   and Posted URL is empty (idempotency — a double-fire can't double-post).
3. Set Status=Posting (interim lock) so a concurrent fire bails at step 2.
4. Read the row's child blocks; split on dividers into parts; trim; drop empties.
5. Validate every part ≤ 280 with tweetLength(). If any part fails:
   set Status=Needs fix, write Error ("part N is M chars"), post a Notion comment, stop.
6. Post the chain via the ported post-thread core (reply.in_reply_to_tweet_id threading).
   - On a mid-thread failure: write Error with how many parts posted + the last tweet ID,
     set Status=Needs fix, post a Notion comment. (Mirrors the CLI's partial-failure message.)
7. On success: set Status=Posted, Posted URL=<first tweet URL>, post a Notion comment with the link.
```

### The one real integration risk

The post leg depends on Notion's database automations being able to call an external webhook on a status change. That capability is newer and somewhat constrained. **Mitigation:** if the automation proves unreliable, this single leg falls back to a **60-second poll** — a timer in the container queries `Status=Approved AND Posted URL is empty` and runs the same step 2–7 logic. Everything else stays event-driven. We verify the webhook during Phase 1 build and choose webhook-vs-poll based on what actually works; the handler logic is identical either way.

## Phase 2 handlers (designed, built later)

- **Seeds — `POST /hook/notion` (reused).** You add a row with `Source=Seed`, a title, and a one-line angle in the body, then click a Notion button (or set a `Seed` status) whose automation calls the endpoint. The handler branches on `Source=Seed`: draft from the seed text, write the parts back into the same row, flip it to `Proposed`. Same draft+validate code as the blog leg, different input.
- **Dev activity — `POST /hook/repo`.** GitHub webhooks (`release` published, or tagged pushes) on `lognote` / `blog-site` / opportunistic `shariqh` repos. The handler pulls the release notes / commit range, drafts a build-in-public post, writes a `Proposed` row with `Source=Dev activity`. Reuses the Plan B `git` source-reader shape for commit context.

## Phase 3 handlers (designed, built later)

- **Original takes — internal scheduler.** The only source that isn't an event. A timer in the container (e.g. weekly) asks Claude to propose 1–3 standalone takes drawn from your recurring themes and recent posts, each written as a `Proposed` row with `Source=Original take`. Higher off-key risk, so it stays low-volume and always human-gated.
- **LinkedIn.** Adds `Platform=LinkedIn` to the queue and a LinkedIn poster alongside the X one. Gated API access is the gating work; the queue/approve mechanics are unchanged.

## Secrets and config

All secrets come from 1Password, rendered into a gitignored `.env` at deploy via `op inject -i .env.tpl -o .env`, then `docker compose --env-file .env up -d`. (1Password Connect — already running on `ubi` — is the later production-grade option for runtime fetch; v1 uses the rendered file for simplicity.)

| Secret | Purpose |
| ------ | ------- |
| `X_API_KEY` / `X_API_SECRET` / `X_ACCESS_TOKEN` / `X_ACCESS_SECRET` | OAuth 1.0a, from your X developer app (Read+Write) |
| `NOTION_TOKEN` | Internal integration scoped to the Social Queue DB |
| `CLAUDE_CODE_OAUTH_TOKEN` | Subscription auth for drafting (`claude setup-token`) |
| `GITHUB_WEBHOOK_SECRET` | HMAC secret for `/hook/blog` and `/hook/repo` |
| `NOTION_WEBHOOK_TOKEN` | Path secret for `/hook/notion` |

| Config | Value |
| ------ | ----- |
| `SOCIAL_QUEUE_DB_ID` | The new Notion DB ID |
| `BLOG_REPO` | `shariqh/blog-site` |
| `BLOG_BASE_URL` | `https://shariq.dev` |
| `PUBLIC_HOSTNAME` | The Cloudflare Tunnel hostname (e.g. `social-hooks.shariq.dev`) |

## Local development

The whole service runs locally against `.env.local`:

```sh
npm run dev          # Hono server on localhost
npm run draft -- <post-slug-or-mdx-path>   # run the propose path once, print the parts (no Notion write with --dry)
```

For the webhook legs without a tunnel, `cloudflared tunnel --url http://localhost:PORT` gives an ephemeral public URL to point a test GitHub webhook / Notion automation at. The ported poster keeps its dry-run default, so a local `draft` never touches X.

## Error handling and observability

| Failure mode | Behavior |
| ------------ | -------- |
| Bad webhook signature/token | 401, logged, no action |
| Claude draft failure (blog/seed) | Logged; blog → replayable via `/hook/blog/replay`; seed → Error on the row |
| Model part over 280 after one retry | Row written as `Needs fix` with an Error note |
| User edit pushes a part over 280 | Caught at approval; `Needs fix` + Error + Notion comment; nothing posted |
| Mid-thread X failure | `Needs fix` + Error (parts posted + last tweet ID) + Notion comment |
| Duplicate approval fire | Re-fetch + `Posting` lock + empty-`Posted URL` guard → no double-post |
| Notion automation unreliable | Fall back to 60s poll for the post leg (same logic) |
| X rate limit (Free ~1,500/mo) | Logged; `Needs fix` + Error; retry by re-approving |

Observability in v1 = container logs (`docker compose logs -f`) + Notion row comments/Error fields, both inspectable from where you already work.

## Testing

**Unit (Vitest):**

- `tweetLength` (URL t.co wrapping, trailing punctuation) and `sanitize` (C0/DEL/C1 stripping) — ported with their behavior.
- Notion-blocks → parts splitter (divider splitting, empty-part dropping, internal line breaks preserved).
- GitHub HMAC signature verifier (valid/invalid/missing).
- Draft-output validator (every part ≤ 280; standalone present).
- Idempotency guard (already-Posted / empty-content rows are no-ops).

**Integration (manual, gated):**

- `cloudflared --url` an ephemeral tunnel; deliver a real GitHub `push` test payload to `/hook/blog`; verify a `Proposed` row with divider-split parts appears.
- Create a test row, flip to `Approved`; verify it posts (to a throwaway X account first) and writes `Posted` + URL.
- Verify the Notion automation actually reaches the endpoint (the flagged risk) — decide webhook vs poll here.
- Force an over-280 edit; confirm `Needs fix` + no post.

## Implementation order (high-level)

The implementation plan (next phase, via writing-plans) sequences these. Rough shape:

**Phase 1 — spine**

1. New `social-agent` repo: Hono skeleton, TS strict, Dockerfile, `docker-compose.yml` (`app` + `cloudflared`), `.env.tpl` + `op inject` flow.
2. Port the X posting core into `src/x/`; Vitest on `tweetLength`/`sanitize`.
3. `SOCIAL-STYLE.md`; EDITORIAL.md raw-GitHub fetch + caching.
4. Notion Social Queue DB (schema + views), share with the integration; the divider-split block reader/writer + its tests.
5. `/hook/blog`: HMAC verify → find new post → draft → validate → write `Proposed` row.
6. `/hook/notion`: token verify → re-fetch → validate → post chain → write back; idempotency.
7. Cloudflare Tunnel: hostname → container; register the GitHub webhook; build the Notion automation; **decide webhook vs poll**.
8. Deploy to `ubi-prod`; end-to-end: publish a post → `Proposed` → approve → live thread.

**Phase 2** — seed handler (Notion button) + dev-activity handler (`/hook/repo`).

**Phase 3** — original-takes scheduler + LinkedIn platform/poster.

## Open questions (deferred, not blocking)

- **Notion outbound webhook reliability** — resolved empirically in Phase 1 step 7; poll fallback is specified and costs nothing to keep.
- **Shared posting core** — v1 ports the ~40-line core into `social-agent`. If `blog-site`'s CLI and the service drift, extract a tiny shared package. Re-evaluate after Phase 2.
- **Original-takes cadence** — weekly is a guess; tune once it's running. The scheduler interval is config, not code.
- **op-connect at runtime** — v1 renders an `.env` from 1Password at deploy. Move to op-connect runtime fetch if secret rotation becomes a chore.
- **LinkedIn API access** — application/approval is the unknown; start it before Phase 3.
