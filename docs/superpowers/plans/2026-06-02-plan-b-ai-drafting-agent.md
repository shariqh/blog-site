# Plan B — AI Drafting Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the v1 AI drafting agent as designed in [2026-06-02-plan-b-ai-drafting-agent-design.md](../specs/2026-06-02-plan-b-ai-drafting-agent-design.md). End state: three GitHub Actions workflows that propose, draft, and promote blog posts + YouTube scripts based on Notion ideas and recent commits, with all output reviewed by the user before publishing.

**Architecture:** Three TypeScript scripts under `scripts/agent/` invoked by separate GitHub Actions workflows on cron + manual dispatch. All call the Claude Agent SDK via subscription OAuth (no per-token billing). Notion is HTTP, GitHub PRs are `gh` CLI. No MCP servers spawned in CI. The existing CMS Notion DB is restructured in place via a one-shot migration script.

**Tech Stack:** Node 24 (current LTS), TypeScript strict, `@anthropic-ai/claude-agent-sdk` (latest), `tsx` (TS runner), Vitest, native `fetch`, `gh` CLI, Vale 3.14.2, Notion HTTP API v2025-09-03, YouTube Data API v3, Hacker News Firebase API.

**Out of scope (deferred to v2):** hero image generation; Notion webhooks (replaces hourly poll); blog→YT derivative direction; podcast/presentation/IG-reel drafting (schema reserves Kind slots but no per-Kind drafting code).

---

## File structure

Files this plan creates or modifies. Use this as the map; each task points to specific paths.

**New files:**

```
docs/
  SHORTS-STYLE.md                          # Style guide for YT shorts/long agent

scripts/
  agent/
    discover.ts                            # Entry: discovery workflow
    draft.ts                               # Entry: drafting workflow
    promote.ts                             # Entry: promotion workflow
    migrate-cms.ts                         # One-shot CMS → Content migration

    lib/
      config.ts                            # Env var reader, typed config
      types.ts                             # Shared types (NotionRow, Candidate, etc.)
      notion.ts                            # Notion HTTP client + row mapping
      claude.ts                            # Agent SDK wrapper for OAuth-authed prompts
      git-scan.ts                          # GH REST scanner for recent commits
      trending.ts                          # GH trending scrape + HN feed
      youtube.ts                           # YT Data API client
      editorial.ts                         # Loads EDITORIAL.md / SHORTS-STYLE.md
      pr.ts                                # gh CLI wrapper for branch + PR creation
      validate.ts                          # Frontmatter Zod validator + Vale runner
      dedupe.ts                            # Title-similarity + Tools-overlap dedupe
      bucket.ts                            # Re-exports src/lib/buckets resolveBucket

    tests/
      notion.test.ts                       # Row-mapper unit tests
      dedupe.test.ts                       # Dedupe rule unit tests
      validate.test.ts                     # Frontmatter validator tests
      migrate.test.ts                      # CMS → Content mapping tests
      bucket.test.ts                       # Bucket resolution from agent output

.github/workflows/
  agent-discover.yml                       # cron: '0 3 * * 0' + workflow_dispatch
  agent-draft.yml                          # cron: '0 2 * * *' + workflow_dispatch
  agent-promote.yml                        # cron: '0 4 * * *' + workflow_dispatch

.env.local.example                         # Template for local dev (gitignored sibling)
```

**Modified files:**

```
package.json                               # Add scripts + deps
src/content.config.ts                      # Export writingSchema standalone for agent reuse
.gitignore                                 # Add .env.local
docs/EDITORIAL.md                          # Cross-link to SHORTS-STYLE.md (one-line)
README.md                                  # Add brief "agent pipeline" section
CLAUDE.md                                  # Add agent commands + workflow overview
```

---

## Phases overview

| Phase | What ships                                           | Can pause here?               |
| ----- | ---------------------------------------------------- | ----------------------------- |
| 0     | `SHORTS-STYLE.md` doc                                | Yes                           |
| 1     | Project scaffolding, deps, config module             | Yes                           |
| 2     | Notion DB hand-creation + migration script + execute | **Yes, big checkpoint**       |
| 3     | Shared lib modules (notion, claude, sources, etc.)   | Yes                           |
| 4     | Blog drafting branch end-to-end + smoke              | **Yes — first useful output** |
| 5     | YT drafting branch + smoke                           | Yes                           |
| 6     | Discovery workflow + smoke                           | Yes                           |
| 7     | Promotion workflow + smoke                           | Yes                           |
| 8     | Cutover: enable crons, update docs                   | Done                          |

Pauseable checkpoints: phase 2 (after migration, before any agent code) and phase 4 (first PR drafted by agent). Each phase ends with a commit and a known-good state.

---

## Phase 0: Style contract

### Task 0.1: Write `docs/SHORTS-STYLE.md`

**Files:**

- Create: `docs/SHORTS-STYLE.md`
- Modify: `docs/EDITORIAL.md` (add one-line cross-link)

- [ ] **Step 1: Write the new file**

Create `docs/SHORTS-STYLE.md`:

```markdown
# YouTube shorts / long-form style guide

Rules for AI-generated scripts for the **shariq.dev YouTube channel** (https://www.youtube.com/@ShariqHirani). The drafting agent (Plan B) loads this file verbatim into the system prompt for any row with `Kind` in `[YT short, YT long]`.

If a rule below is wrong or outdated, **update this file** before the next agent run.

---

## Voice

- **First person.** Peer-to-peer, not influencer.
- **No "what's up guys" / "smash like" / "in this video we'll" openers.** Get straight to the payoff.
- **Speak like a working engineer**, not a tutorial host. Concrete, opinionated, fast.
- **Admit gaps.** "Haven't tried X yet" beats fake authority.

## Hook (first 3 seconds)

The hook decides whether anyone watches the rest. It must:

- Promise a concrete payoff in plain language ("here's the one thing that broke for me")
- Avoid "you won't believe" / "the trick that…" / "no one is talking about…" patterns
- Be one sentence, ideally under 12 words

**Good:** "Cursor's new agent mode quietly rewrote my git config. Here's what to check."

**Bad:** "AI agents are everywhere, but no one is talking about this scary thing…"

## Length

| Kind     | Target duration | Word count guide |
| -------- | --------------- | ---------------- |
| YT short | 50-60 seconds   | 130-170 words    |
| YT long  | 4-7 minutes     | 600-1100 words   |

Going over kills retention. Going under wastes the spot.

## Script structure (shorts)

1. **Hook** (0-3s) — one sentence
2. **Setup** (3-15s) — what is the thing / why care
3. **Payoff** (15-50s) — the demo, the surprise, the take
4. **Tag** (50-60s) — one-line implication or follow-up question. No "subscribe" CTA in script (channel banner handles it).

## Script structure (long)

1. **Hook + thesis** (0-15s)
2. **Demo / walk-through** (15s-3m)
3. **What surprised me / what I'd do differently**
4. **Where this fits in your stack**
5. **Tag** — close with a take, not a CTA

## On-screen text

- Used to reinforce key terms, commands, or punchlines — never to repeat what the audio says.
- Each on-screen text is timestamped, ≤6 words, present-tense.

## B-roll

- For each timestamp, describe what visual should be on screen (screen recording, terminal, IDE, etc.).
- Avoid stock-footage cues — this channel is screen-cap-heavy.

## Thumbnail prompt

- One sentence describing the image to make.
- Include: subject, mood (matter-of-fact, not shocked-face), text overlay (≤4 words, sentence case, not all-caps).

## Titles

- 3 variants per video.
- Each ≤60 chars, sentence case, no clickbait.
- One should include a tool name; one should describe the outcome; one should be intentionally curiosity-driven without lying.

## Hashtags

- 5-8 per video, lowercase, no spaces.
- Mix: 2-3 broad (`ai`, `developer`, `programming`), 2-3 tool-specific (`claudecode`, `cursorai`), 1-2 niche (`agenticworkflows`).

## Don't

- Fake reactions ("WAIT, what?!")
- Reading the README aloud
- "Here's what I learned" recaps that aren't a take
- Mentioning competitors uncharitably
- Talking about Anthropic / OpenAI / Google as personalities
```

- [ ] **Step 2: Cross-link from EDITORIAL.md**

In `docs/EDITORIAL.md`, find the first paragraph that mentions "the AI drafting agent (Plan B)" and append after it:

```markdown
For YouTube scripts, the agent loads [`SHORTS-STYLE.md`](./SHORTS-STYLE.md) — same role, different format.
```

- [ ] **Step 3: Commit**

```bash
git add docs/SHORTS-STYLE.md docs/EDITORIAL.md
git commit -m "add SHORTS-STYLE.md for YT script generation"
```

---

## Phase 1: Scaffolding, deps, config

### Task 1.0: Bump project to Node 24 LTS

The existing site is pinned to Node 22. Bring the whole project to the current Active LTS (Node 24) so the agent and the site share one runtime. Node 22 stays in maintenance until April 2027 but Node 24 has been LTS since October 2025 — no reason to lag.

**Files:**

- Modify: `package.json` (engines field)
- Modify: `.github/workflows/deploy.yml`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Bump `engines.node` in `package.json`**

In `package.json`, find:

```json
"engines": {
  "node": ">=22.12.0"
}
```

Replace with:

```json
"engines": {
  "node": ">=24"
}
```

- [ ] **Step 2: Bump deploy workflow**

In `.github/workflows/deploy.yml`, find:

```yaml
node-version: '22'
```

Replace with:

```yaml
node-version: '24'
```

- [ ] **Step 3: Bump CI workflow**

In `.github/workflows/ci.yml`, find:

```yaml
node-version: '22'
```

Replace with:

```yaml
node-version: '24'
```

- [ ] **Step 4: Verify locally**

Run:

```bash
node --version
```

If you're on Node < 24, install via `nvm` / `fnm` / your version manager.

Then verify the full build + tests still pass:

```bash
npm ci
npm run astro check
npm test
npm run build
```

Expected: all PASS. If anything breaks on Node 24, fix before continuing.

- [ ] **Step 5: Commit**

```bash
git add package.json .github/workflows/deploy.yml .github/workflows/ci.yml
git commit -m "bump project to Node 24 LTS (was 22)"
```

### Task 1.1: Install dependencies

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Install runtime deps**

Run:

```bash
npm install --save-dev @anthropic-ai/claude-agent-sdk tsx dotenv
```

Expected: `package.json` `devDependencies` gains `@anthropic-ai/claude-agent-sdk`, `tsx`, `dotenv`. `package-lock.json` updates.

Why dev deps: these only run in agent scripts (not the site build) and we don't ship them with the Astro bundle.

- [ ] **Step 2: Add `gray-matter` if not present**

Check `package.json` for `gray-matter`. If absent:

```bash
npm install --save-dev gray-matter
```

- [ ] **Step 3: Commit deps**

```bash
git add package.json package-lock.json
git commit -m "add agent runtime deps: @anthropic-ai/claude-agent-sdk, tsx, dotenv, gray-matter"
```

### Task 1.2: Add npm scripts

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Add scripts**

In `package.json` `"scripts"` block, add (alphabetize with existing):

```json
"agent:discover": "tsx scripts/agent/discover.ts",
"agent:draft": "tsx scripts/agent/draft.ts",
"agent:promote": "tsx scripts/agent/promote.ts",
"migrate:cms": "tsx scripts/agent/migrate-cms.ts"
```

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "add agent + migration npm scripts"
```

### Task 1.3: Add `.env.local.example` and update `.gitignore`

**Files:**

- Create: `.env.local.example`
- Modify: `.gitignore`

- [ ] **Step 1: Create `.env.local.example`**

```bash
# Claude subscription auth — obtain via `claude setup-token`
CLAUDE_CODE_OAUTH_TOKEN=

# Notion integration token — create at https://www.notion.so/profile/integrations
# Share the CMS DB with the integration after creating it.
NOTION_TOKEN=

# YouTube Data API v3 key — create at https://console.cloud.google.com/apis/credentials
YOUTUBE_API_KEY=

# GitHub PAT for opening agent PRs (local dev only — CI uses AGENT_GH_TOKEN secret)
# Fine-grained, scope: contents:write + pull-requests:write on this repo.
AGENT_GH_TOKEN=

# Config (also settable as GH repo variables in CI)
NOTION_CMS_DB_ID=d25e9f1c0a3345589592fce32f7bc02b
YOUTUBE_CHANNEL_ID=
SCAN_REPO_ORG=shariqh
SCAN_REPO_INCLUDE=blog-site,lognote
SCAN_REPO_ACTIVE_DAYS=30
```

- [ ] **Step 2: Update `.gitignore`**

Append (if not present):

```
# Agent local env
.env.local
```

- [ ] **Step 3: Commit**

```bash
git add .env.local.example .gitignore
git commit -m "add agent .env.local.example template + gitignore"
```

### Task 1.4: Write `scripts/agent/lib/config.ts`

**Files:**

- Create: `scripts/agent/lib/config.ts`
- Test: (none — pure env reader, exercised by every other test)

- [ ] **Step 1: Write the module**

```typescript
// scripts/agent/lib/config.ts
import 'dotenv/config'

function required(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required env var: ${key}`)
  return val
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback
}

export const CONFIG = {
  claudeOauthToken: required('CLAUDE_CODE_OAUTH_TOKEN'),
  notionToken: required('NOTION_TOKEN'),
  notionCmsDbId: required('NOTION_CMS_DB_ID'),
  youtubeApiKey: required('YOUTUBE_API_KEY'),
  youtubeChannelId: required('YOUTUBE_CHANNEL_ID'),
  agentGhToken: required('AGENT_GH_TOKEN'),

  scanRepoOrg: optional('SCAN_REPO_ORG', 'shariqh'),
  scanRepoInclude: optional('SCAN_REPO_INCLUDE', 'blog-site,lognote').split(','),
  scanRepoActiveDays: parseInt(optional('SCAN_REPO_ACTIVE_DAYS', '30'), 10),
} as const

export type Config = typeof CONFIG
```

- [ ] **Step 2: Verify it imports**

Run:

```bash
NOTION_TOKEN=x NOTION_CMS_DB_ID=x CLAUDE_CODE_OAUTH_TOKEN=x YOUTUBE_API_KEY=x YOUTUBE_CHANNEL_ID=x AGENT_GH_TOKEN=x npx tsx -e "import('./scripts/agent/lib/config.ts').then(m => console.log(Object.keys(m.CONFIG)))"
```

Expected: prints the array of config keys.

- [ ] **Step 3: Commit**

```bash
git add scripts/agent/lib/config.ts
git commit -m "add agent config module (env vars with required/optional)"
```

### Task 1.5: Write `scripts/agent/lib/types.ts`

**Files:**

- Create: `scripts/agent/lib/types.ts`
- Test: (used by every other test)

- [ ] **Step 1: Write the type definitions**

```typescript
// scripts/agent/lib/types.ts

export type Kind =
  | 'blog'
  | 'YT short'
  | 'YT long'
  | 'podcast'
  | 'presentation'
  | 'IG reel'
  | 'stand up'

export type Stage =
  | 'Idea'
  | 'Proposed'
  | 'Ready'
  | 'Drafted'
  | 'Recorded'
  | 'Edited'
  | 'Published'
  | 'Abandoned'

export type Origin = 'OC' | 'Agent Proposed' | 'Derivative'

export type CrossPostTarget = 'blog' | 'YT short' | 'YT long'

export interface ContentRow {
  id: string // Notion page ID
  title: string
  kind: Kind
  stage: Stage
  origin: Origin
  sourceRowId?: string
  crossPostTargets: CrossPostTarget[]
  tags: string[]
  tools: string[]
  hint: string
  sourceUrls: string[]
  draftUrl?: string
  publishedUrl?: string
  publishingDate?: string
  createdAt: string
  updatedAt: string
}

export interface Candidate {
  title: string
  hint: string
  tags?: string[]
  tools?: string[]
  sourceUrls: string[]
  rationale: string
}

export interface DiscoveryOutput {
  blogCandidates: Candidate[]
  ytCandidates: Candidate[]
}

export interface YTScriptBlocks {
  hook: string
  script: string
  onScreenText: Array<{ timestampSeconds: number; text: string }>
  bRoll: Array<{ timestampSeconds: number; description: string }>
  thumbnailPrompt: string
  titleVariants: string[]
  hashtags: string[]
}

export interface CommitInfo {
  repo: string // e.g. "shariqh/lognote"
  sha: string
  message: string
  date: string
  filesChanged: string[]
  url: string
}

export interface TrendingItem {
  source: 'gh-trending' | 'hn'
  title: string
  url: string
  hint?: string // e.g. HN score, GH stars-this-week
}

export interface YouTubeStat {
  videoId: string
  title: string
  views: number
  likes: number
  publishedAt: string
}
```

- [ ] **Step 2: Type-check**

Run:

```bash
npx tsc --noEmit scripts/agent/lib/types.ts
```

Expected: no output (clean compile).

- [ ] **Step 3: Commit**

```bash
git add scripts/agent/lib/types.ts
git commit -m "add agent shared types"
```

---

## Phase 2: Notion redesign + migration

### Task 2.1: Restructure the CMS Notion DB schema in place

**This is a manual user action in the Notion UI.** Pause for the user to do this before the migration script (Task 2.6) runs.

The existing CMS DB stays — same ID, same rows, same URLs. We restructure the schema instead of cloning to a new DB.

- [ ] **Step 1: Rename `Status` → `Stage`**

In Notion, on the CMS DB:

- Click the Status property header → ⋯ → Edit property → rename to `Stage`
- Notion preserves all existing row values automatically

- [ ] **Step 2: Rename Status options to new Stage values**

For each existing option, edit and rename:

- `Prepping` → `Idea`
- `Ready To Record` → `Ready`
- `Recording` → `Recorded`
- `Post-Processing` → `Edited`
- `Published` stays `Published`
- `Abandoned` stays `Abandoned`
- `✅` → re-tag any rows using ✅ to `Published`, then delete the ✅ option

- [ ] **Step 3: Add new Stage options**

Add: `Proposed`, `Drafted`. These are agent states that don't exist yet.

- [ ] **Step 4: Add a new property `Kind`**

- Type: Select (single)
- Options: `blog`, `YT short`, `YT long`, `podcast`, `presentation`, `IG reel`, `stand up`
- Leave empty — migration will backfill from Medium.

- [ ] **Step 5: Add Origin options**

To the existing `Origin` property, add: `Agent Proposed`, `Derivative`. Keep `OC`, `x-post:bundle`, `x-post:blog`.

- [ ] **Step 6: Add 5 new properties**

- `Source Row` — Relation, target: this same CMS DB, limit 1
- `Cross-post Targets` — Multi-select, options: `blog`, `YT short`, `YT long`
- `Tools` — Multi-select (empty pool)
- `Hint` — Text
- `Draft URL` — URL

- [ ] **Step 6.5: (Recommended) Add a `Site` property for future multi-site support**

- Type: Select (single)
- Options: `shariq.dev` (set as default for all existing rows)
- Cost today: ~10 seconds in the UI; cost later: trivial agent filter when a second site (e.g., lognote) joins. The agent doesn't read this property in v1, but adding it now means future multi-site is a drop-in instead of a schema-migration project. Skip if you're sure no other sites will publish through this DB.

- [ ] **Step 7: Optionally rename `Published Link` → `Published URL`**

Cosmetic. The migration script reads either name.

- [ ] **Step 8: Capture the DB ID**

The CMS DB URL contains the ID — `https://www.notion.so/<DB_ID>?v=...`. It's `d25e9f1c0a3345589592fce32f7bc02b` if you haven't moved the page.

Add to your local `.env.local`:

```
NOTION_CMS_DB_ID=d25e9f1c0a3345589592fce32f7bc02b
```

And in GitHub:

```bash
gh variable set NOTION_CMS_DB_ID --body "d25e9f1c0a3345589592fce32f7bc02b"
```

### Task 2.2: TDD `scripts/agent/lib/dedupe.ts`

**Files:**

- Create: `scripts/agent/lib/dedupe.ts`
- Test: `scripts/agent/tests/dedupe.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// scripts/agent/tests/dedupe.test.ts
import { describe, it, expect } from 'vitest'
import { isTitleDuplicate, hasFullToolsOverlap } from '../lib/dedupe'

describe('isTitleDuplicate', () => {
  it('treats identical titles as duplicates', () => {
    expect(isTitleDuplicate('Claude Code agents in CI', ['Claude Code agents in CI'])).toBe(true)
  })

  it('treats titles differing only by case as duplicates', () => {
    expect(isTitleDuplicate('claude code agents in ci', ['Claude Code agents in CI'])).toBe(true)
  })

  it('treats near-identical titles (>80% similar) as duplicates', () => {
    expect(
      isTitleDuplicate('Claude Code agents in CI workflows', ['Claude Code agents in CI'])
    ).toBe(true)
  })

  it('does not flag unrelated titles', () => {
    expect(isTitleDuplicate('A totally different post', ['Claude Code agents in CI'])).toBe(false)
  })

  it('returns false for empty existing list', () => {
    expect(isTitleDuplicate('Anything', [])).toBe(false)
  })
})

describe('hasFullToolsOverlap', () => {
  it('returns true when all proposed tools are covered', () => {
    expect(hasFullToolsOverlap(['claude-code'], [['claude-code', 'cursor']])).toBe(true)
  })

  it('returns true when proposed tools are subset of any one row', () => {
    expect(
      hasFullToolsOverlap(['claude-code', 'cursor'], [['claude-code', 'cursor', 'gemini']])
    ).toBe(true)
  })

  it('returns false when proposed tools partially covered across multiple rows', () => {
    expect(hasFullToolsOverlap(['claude-code', 'cursor'], [['claude-code'], ['cursor']])).toBe(
      false
    )
  })

  it('returns false for empty proposed tools', () => {
    expect(hasFullToolsOverlap([], [['claude-code']])).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

Run:

```bash
npx vitest run scripts/agent/tests/dedupe.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `dedupe.ts`**

```typescript
// scripts/agent/lib/dedupe.ts

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[m][n]
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Returns true if `candidate` is within 20% normalized edit distance of any
 * title in `existing`. Used to skip re-proposing similar candidates.
 */
export function isTitleDuplicate(candidate: string, existing: string[]): boolean {
  if (existing.length === 0) return false
  const cand = normalize(candidate)
  for (const ex of existing) {
    const a = cand
    const b = normalize(ex)
    const maxLen = Math.max(a.length, b.length)
    if (maxLen === 0) continue
    const ratio = levenshtein(a, b) / maxLen
    if (ratio <= 0.2) return true
  }
  return false
}

/**
 * Returns true if every tool in `proposed` is contained in at least one row's
 * tool list in `existingRows`. (One row must cover the whole proposed set.)
 */
export function hasFullToolsOverlap(proposed: string[], existingRows: string[][]): boolean {
  if (proposed.length === 0) return false
  const propSet = new Set(proposed.map((t) => t.toLowerCase()))
  for (const row of existingRows) {
    const rowSet = new Set(row.map((t) => t.toLowerCase()))
    let allIn = true
    for (const t of propSet) {
      if (!rowSet.has(t)) {
        allIn = false
        break
      }
    }
    if (allIn) return true
  }
  return false
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npx vitest run scripts/agent/tests/dedupe.test.ts
```

Expected: PASS — all 9 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/agent/lib/dedupe.ts scripts/agent/tests/dedupe.test.ts
git commit -m "add dedupe lib: title similarity + tools overlap"
```

### Task 2.3: Write Notion HTTP client (`scripts/agent/lib/notion.ts`)

**Files:**

- Create: `scripts/agent/lib/notion.ts`
- Test: `scripts/agent/tests/notion.test.ts`

Test focuses on the pure row-mapping function (no network). The HTTP wrappers are exercised in integration tests later.

- [ ] **Step 1: Write the failing tests**

```typescript
// scripts/agent/tests/notion.test.ts
import { describe, it, expect } from 'vitest'
import { pageToContentRow } from '../lib/notion'

const samplePage = {
  id: '2467cc75-7fe9-8052-b08e-e9327ac7fbf1',
  created_time: '2025-08-05T10:32:00.000Z',
  last_edited_time: '2025-08-12T16:36:00.000Z',
  properties: {
    Title: { type: 'title', title: [{ plain_text: 'A test row' }] },
    Kind: { type: 'select', select: { name: 'blog' } },
    Stage: { type: 'select', select: { name: 'Proposed' } },
    Origin: { type: 'select', select: { name: 'Agent Proposed' } },
    'Source Row': { type: 'relation', relation: [] },
    'Cross-post Targets': {
      type: 'multi_select',
      multi_select: [{ name: 'YT short' }],
    },
    Tags: { type: 'multi_select', multi_select: [{ name: 'ai' }, { name: 'cli' }] },
    Tools: { type: 'multi_select', multi_select: [{ name: 'claude-code' }] },
    Hint: { type: 'rich_text', rich_text: [{ plain_text: 'a one-line angle' }] },
    'Source URLs': { type: 'rich_text', rich_text: [{ plain_text: 'https://example.com' }] },
    'Draft URL': { type: 'url', url: null },
    'Published URL': { type: 'url', url: 'https://shariq.dev/blog/x' },
    Publishing: { type: 'date', date: { start: '2026-06-10' } },
  },
}

describe('pageToContentRow', () => {
  it('maps a fully-populated page to a ContentRow', () => {
    const row = pageToContentRow(samplePage as never)
    expect(row.title).toBe('A test row')
    expect(row.kind).toBe('blog')
    expect(row.stage).toBe('Proposed')
    expect(row.origin).toBe('Agent Proposed')
    expect(row.crossPostTargets).toEqual(['YT short'])
    expect(row.tags).toEqual(['ai', 'cli'])
    expect(row.tools).toEqual(['claude-code'])
    expect(row.hint).toBe('a one-line angle')
    expect(row.sourceUrls).toEqual(['https://example.com'])
    expect(row.draftUrl).toBeUndefined()
    expect(row.publishedUrl).toBe('https://shariq.dev/blog/x')
    expect(row.publishingDate).toBe('2026-06-10')
  })

  it('handles empty Source URLs as empty array', () => {
    const empty = {
      ...samplePage,
      properties: {
        ...samplePage.properties,
        'Source URLs': { type: 'rich_text', rich_text: [] },
      },
    }
    expect(pageToContentRow(empty as never).sourceUrls).toEqual([])
  })

  it('splits comma-or-newline-separated Source URLs', () => {
    const multi = {
      ...samplePage,
      properties: {
        ...samplePage.properties,
        'Source URLs': {
          type: 'rich_text',
          rich_text: [{ plain_text: 'https://a.com\nhttps://b.com' }],
        },
      },
    }
    expect(pageToContentRow(multi as never).sourceUrls).toEqual(['https://a.com', 'https://b.com'])
  })

  it('returns sourceRowId when relation has an entry', () => {
    const withRel = {
      ...samplePage,
      properties: {
        ...samplePage.properties,
        'Source Row': { type: 'relation', relation: [{ id: 'abc123' }] },
      },
    }
    expect(pageToContentRow(withRel as never).sourceRowId).toBe('abc123')
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npx vitest run scripts/agent/tests/notion.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `notion.ts`**

```typescript
// scripts/agent/lib/notion.ts
import { CONFIG } from './config'
import type { ContentRow, Kind, Stage, Origin, CrossPostTarget } from './types'

const BASE = 'https://api.notion.com/v1'
const VERSION = '2025-09-03'

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: `Bearer ${CONFIG.notionToken}`,
    'Notion-Version': VERSION,
    'Content-Type': 'application/json',
    ...extra,
  }
}

async function fetchJson(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Notion ${init?.method ?? 'GET'} ${path} ${res.status}: ${body}`)
  }
  return res.json()
}

// ---------- Row mapping ----------

type AnyProp = { type: string; [k: string]: unknown }
type NotionPage = {
  id: string
  created_time: string
  last_edited_time: string
  properties: Record<string, AnyProp>
}

function textOf(prop: AnyProp | undefined): string {
  if (!prop) return ''
  if (prop.type === 'title') {
    return ((prop as { title: Array<{ plain_text: string }> }).title ?? [])
      .map((t) => t.plain_text)
      .join('')
  }
  if (prop.type === 'rich_text') {
    return ((prop as { rich_text: Array<{ plain_text: string }> }).rich_text ?? [])
      .map((t) => t.plain_text)
      .join('')
  }
  return ''
}

function selectName<T extends string>(prop: AnyProp | undefined): T | undefined {
  if (!prop || prop.type !== 'select') return undefined
  const sel = (prop as { select: { name: string } | null }).select
  return sel ? (sel.name as T) : undefined
}

function multiSelectNames<T extends string>(prop: AnyProp | undefined): T[] {
  if (!prop || prop.type !== 'multi_select') return []
  return ((prop as { multi_select: Array<{ name: string }> }).multi_select ?? []).map(
    (m) => m.name as T
  )
}

function urlOf(prop: AnyProp | undefined): string | undefined {
  if (!prop || prop.type !== 'url') return undefined
  const v = (prop as { url: string | null }).url
  return v ?? undefined
}

function dateStartOf(prop: AnyProp | undefined): string | undefined {
  if (!prop || prop.type !== 'date') return undefined
  return (prop as { date: { start: string } | null }).date?.start
}

function relationFirstId(prop: AnyProp | undefined): string | undefined {
  if (!prop || prop.type !== 'relation') return undefined
  const rel = (prop as { relation: Array<{ id: string }> }).relation
  return rel?.[0]?.id
}

export function pageToContentRow(page: NotionPage): ContentRow {
  const p = page.properties
  const sourceUrlsRaw = textOf(p['Source URLs']).trim()
  const sourceUrls = sourceUrlsRaw
    ? sourceUrlsRaw
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : []
  return {
    id: page.id,
    title: textOf(p['Title']),
    kind: (selectName<Kind>(p['Kind']) ?? 'blog') as Kind,
    stage: (selectName<Stage>(p['Stage']) ?? 'Idea') as Stage,
    origin: (selectName<Origin>(p['Origin']) ?? 'OC') as Origin,
    sourceRowId: relationFirstId(p['Source Row']),
    crossPostTargets: multiSelectNames<CrossPostTarget>(p['Cross-post Targets']),
    tags: multiSelectNames<string>(p['Tags']),
    tools: multiSelectNames<string>(p['Tools']),
    hint: textOf(p['Hint']),
    sourceUrls,
    draftUrl: urlOf(p['Draft URL']),
    publishedUrl: urlOf(p['Published URL']),
    publishingDate: dateStartOf(p['Publishing']),
    createdAt: page.created_time,
    updatedAt: page.last_edited_time,
  }
}

// ---------- Public DB ops ----------

export async function queryContentRows(filter: object, sorts?: object[]): Promise<ContentRow[]> {
  const dataSourceId = await getDataSourceIdForDb(CONFIG.notionCmsDbId)
  const rows: ContentRow[] = []
  let cursor: string | undefined
  do {
    const body = JSON.stringify({ filter, sorts, start_cursor: cursor, page_size: 100 })
    const data = (await fetchJson(`/data_sources/${dataSourceId}/query`, {
      method: 'POST',
      body,
    })) as { results: NotionPage[]; has_more: boolean; next_cursor?: string }
    rows.push(...data.results.map(pageToContentRow))
    cursor = data.has_more ? data.next_cursor : undefined
  } while (cursor)
  return rows
}

async function getDataSourceIdForDb(dbId: string): Promise<string> {
  const db = (await fetchJson(`/databases/${dbId}`)) as {
    data_sources: Array<{ id: string }>
  }
  const ds = db.data_sources?.[0]
  if (!ds) throw new Error(`No data source for DB ${dbId}`)
  return ds.id
}

export interface CreateRowInput {
  title: string
  kind: Kind
  stage: Stage
  origin: Origin
  crossPostTargets?: CrossPostTarget[]
  tags?: string[]
  tools?: string[]
  hint?: string
  sourceUrls?: string[]
  draftUrl?: string
  publishedUrl?: string
  sourceRowId?: string
  publishingDate?: string
}

export async function createContentRow(input: CreateRowInput): Promise<string> {
  const dataSourceId = await getDataSourceIdForDb(CONFIG.notionCmsDbId)
  const body = {
    parent: { type: 'data_source_id', data_source_id: dataSourceId },
    properties: buildPropertiesPayload(input),
  }
  const data = (await fetchJson('/pages', { method: 'POST', body: JSON.stringify(body) })) as {
    id: string
  }
  return data.id
}

export async function updateContentRow(
  pageId: string,
  patch: Partial<CreateRowInput>
): Promise<void> {
  const body = { properties: buildPropertiesPayload(patch) }
  await fetchJson(`/pages/${pageId}`, { method: 'PATCH', body: JSON.stringify(body) })
}

function buildPropertiesPayload(input: Partial<CreateRowInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (input.title !== undefined)
    out['Title'] = { title: [{ type: 'text', text: { content: input.title } }] }
  if (input.kind !== undefined) out['Kind'] = { select: { name: input.kind } }
  if (input.stage !== undefined) out['Stage'] = { select: { name: input.stage } }
  if (input.origin !== undefined) out['Origin'] = { select: { name: input.origin } }
  if (input.crossPostTargets !== undefined)
    out['Cross-post Targets'] = {
      multi_select: input.crossPostTargets.map((n) => ({ name: n })),
    }
  if (input.tags !== undefined) out['Tags'] = { multi_select: input.tags.map((n) => ({ name: n })) }
  if (input.tools !== undefined)
    out['Tools'] = { multi_select: input.tools.map((n) => ({ name: n })) }
  if (input.hint !== undefined)
    out['Hint'] = { rich_text: [{ type: 'text', text: { content: input.hint } }] }
  if (input.sourceUrls !== undefined)
    out['Source URLs'] = {
      rich_text: [{ type: 'text', text: { content: input.sourceUrls.join('\n') } }],
    }
  if (input.draftUrl !== undefined) out['Draft URL'] = { url: input.draftUrl }
  if (input.publishedUrl !== undefined) out['Published URL'] = { url: input.publishedUrl }
  if (input.sourceRowId !== undefined) out['Source Row'] = { relation: [{ id: input.sourceRowId }] }
  if (input.publishingDate !== undefined)
    out['Publishing'] = { date: { start: input.publishingDate } }
  return out
}

export async function appendBlocks(pageId: string, blocks: unknown[]): Promise<void> {
  await fetchJson(`/blocks/${pageId}/children`, {
    method: 'PATCH',
    body: JSON.stringify({ children: blocks }),
  })
}

export async function replacePageBody(pageId: string, blocks: unknown[]): Promise<void> {
  // Fetch existing children and archive each, then append new.
  const existing = (await fetchJson(`/blocks/${pageId}/children?page_size=100`)) as {
    results: Array<{ id: string }>
  }
  for (const child of existing.results) {
    await fetchJson(`/blocks/${child.id}`, {
      method: 'DELETE',
    })
  }
  if (blocks.length > 0) await appendBlocks(pageId, blocks)
}

export async function addPageComment(pageId: string, text: string): Promise<void> {
  const body = {
    parent: { page_id: pageId },
    rich_text: [{ type: 'text', text: { content: text } }],
  }
  await fetchJson('/comments', { method: 'POST', body: JSON.stringify(body) })
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npx vitest run scripts/agent/tests/notion.test.ts
```

Expected: PASS — all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/agent/lib/notion.ts scripts/agent/tests/notion.test.ts
git commit -m "add Notion HTTP client + row mapper"
```

### Task 2.4: TDD CMS-to-Content row mapper

**Files:**

- Create: `scripts/agent/tests/migrate.test.ts`
- Modify: `scripts/agent/lib/types.ts` (add `CmsRow` type)
- Create: `scripts/agent/lib/migrate-mapping.ts` (pure logic, no I/O)

- [ ] **Step 1: Add `CmsRow` type to `lib/types.ts`**

Append to `scripts/agent/lib/types.ts`:

```typescript
export type LegacyStatus =
  | 'Prepping'
  | 'Ready To Record'
  | 'Recording'
  | 'Post-Processing'
  | 'Published'
  | 'Abandoned'
  | '✅'

export type LegacyMedium =
  | 'blog'
  | 'youtube'
  | 'YT short'
  | 'podcast'
  | 'presentation'
  | 'IG reel'
  | 'stand up'

export type LegacyOrigin = 'OC' | 'x-post:bundle' | 'x-post:blog'

export interface CmsRow {
  id: string
  title: string
  status?: LegacyStatus
  medium: LegacyMedium[]
  origin?: LegacyOrigin
  tags: string[]
  type?: string
  keywords: string
  sources: string
  publishedLink?: string
  publishing?: string
  no?: number
}

export interface MappedRow {
  // The new row's intended properties (no ID — caller assigns)
  title: string
  kind: Kind
  stage: Stage
  origin: Origin
  crossPostTargets: CrossPostTarget[]
  tags: string[]
  tools: string[]
  hint: string
  sourceUrls: string[]
  publishedUrl?: string
  publishingDate?: string
  // Bookkeeping for derivatives:
  // If the row was split, the first piece keeps the original Notion page ID
  // and this is null. The subsequent piece(s) are NEW rows; this points at
  // the original page ID to install as Source Row after creation.
  sourceRowOriginalPageId?: string
}

export interface MigrationReport {
  totalInputRows: number
  rowsKept: number
  rowsSplit: number
  newRowsCreated: number
  abandoned: number
  unresolvedXPostBlog: string[] // titles where Source Row couldn't be matched
}
```

- [ ] **Step 2: Write the failing tests**

```typescript
// scripts/agent/tests/migrate.test.ts
import { describe, it, expect } from 'vitest'
import { mapCmsRowToContentRows, statusToStage, mediumToKind } from '../lib/migrate-mapping'
import type { CmsRow } from '../lib/types'

const baseRow: CmsRow = {
  id: 'orig-page-1',
  title: 'Sample',
  status: 'Prepping',
  medium: ['blog'],
  origin: 'OC',
  tags: ['ai'],
  keywords: '',
  sources: '',
}

describe('statusToStage', () => {
  it('maps each legacy status', () => {
    expect(statusToStage('Prepping')).toBe('Idea')
    expect(statusToStage('Ready To Record')).toBe('Ready')
    expect(statusToStage('Recording')).toBe('Recorded')
    expect(statusToStage('Post-Processing')).toBe('Edited')
    expect(statusToStage('Published')).toBe('Published')
    expect(statusToStage('✅')).toBe('Published')
    expect(statusToStage('Abandoned')).toBe('Abandoned')
    expect(statusToStage(undefined)).toBe('Idea')
  })
})

describe('mediumToKind', () => {
  it('maps youtube to YT short by default', () => {
    expect(mediumToKind('youtube')).toBe('YT short')
  })
  it('preserves explicit kinds', () => {
    expect(mediumToKind('YT short')).toBe('YT short')
    expect(mediumToKind('blog')).toBe('blog')
    expect(mediumToKind('podcast')).toBe('podcast')
  })
})

describe('mapCmsRowToContentRows', () => {
  it('produces one row when medium has a single entry', () => {
    const out = mapCmsRowToContentRows(baseRow)
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('blog')
    expect(out[0].stage).toBe('Idea')
    expect(out[0].origin).toBe('OC')
    expect(out[0].sourceRowOriginalPageId).toBeUndefined() // first piece keeps original ID
  })

  it('splits multi-medium rows into one row per kind, linking subsequents to first via sourceRowOriginalPageId', () => {
    const row: CmsRow = { ...baseRow, medium: ['blog', 'YT short'] }
    const out = mapCmsRowToContentRows(row)
    expect(out).toHaveLength(2)
    expect(out[0].kind).toBe('blog')
    expect(out[0].origin).toBe('OC')
    expect(out[0].crossPostTargets).toEqual(['YT short'])
    expect(out[1].kind).toBe('YT short')
    expect(out[1].origin).toBe('Derivative')
    expect(out[1].sourceRowOriginalPageId).toBe('orig-page-1')
  })

  it('maps x-post:bundle origin to OC + populates Cross-post Targets from other media', () => {
    const row: CmsRow = { ...baseRow, origin: 'x-post:bundle', medium: ['blog', 'YT short'] }
    const out = mapCmsRowToContentRows(row)
    expect(out[0].origin).toBe('OC')
    expect(out[0].crossPostTargets).toEqual(['YT short'])
  })

  it('maps x-post:blog origin to Derivative', () => {
    const row: CmsRow = { ...baseRow, origin: 'x-post:blog' }
    const out = mapCmsRowToContentRows(row)
    expect(out[0].origin).toBe('Derivative')
  })

  it('appends Keywords to Hint when both present', () => {
    const row: CmsRow = { ...baseRow, keywords: 'tdd, claude' }
    expect(mapCmsRowToContentRows(row)[0].hint).toContain('tdd, claude')
  })

  it('splits Source(s) on commas and newlines', () => {
    const row: CmsRow = { ...baseRow, sources: 'https://a.com,\nhttps://b.com' }
    expect(mapCmsRowToContentRows(row)[0].sourceUrls).toEqual(['https://a.com', 'https://b.com'])
  })

  it('carries Published Link through to Published URL', () => {
    const row: CmsRow = { ...baseRow, publishedLink: 'https://example.com' }
    expect(mapCmsRowToContentRows(row)[0].publishedUrl).toBe('https://example.com')
  })
})
```

- [ ] **Step 3: Run tests, verify they fail**

```bash
npx vitest run scripts/agent/tests/migrate.test.ts
```

Expected: FAIL — `migrate-mapping` not found.

- [ ] **Step 4: Implement `migrate-mapping.ts`**

```typescript
// scripts/agent/lib/migrate-mapping.ts
import type {
  CmsRow,
  Kind,
  Stage,
  Origin,
  CrossPostTarget,
  LegacyStatus,
  LegacyMedium,
  MappedRow,
} from './types'

const STATUS_MAP: Record<LegacyStatus, Stage> = {
  Prepping: 'Idea',
  'Ready To Record': 'Ready',
  Recording: 'Recorded',
  'Post-Processing': 'Edited',
  Published: 'Published',
  Abandoned: 'Abandoned',
  '✅': 'Published',
}

const MEDIUM_TO_KIND: Record<LegacyMedium, Kind> = {
  blog: 'blog',
  youtube: 'YT short', // default YouTube to short; user can adjust
  'YT short': 'YT short',
  podcast: 'podcast',
  presentation: 'presentation',
  'IG reel': 'IG reel',
  'stand up': 'stand up',
}

export function statusToStage(s?: LegacyStatus): Stage {
  if (!s) return 'Idea'
  return STATUS_MAP[s] ?? 'Idea'
}

export function mediumToKind(m: LegacyMedium): Kind {
  return MEDIUM_TO_KIND[m] ?? 'blog'
}

function splitSources(s: string): string[] {
  if (!s) return []
  return s
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
}

function buildHint(row: CmsRow): string {
  const parts: string[] = []
  if (row.keywords) parts.push(row.keywords.trim())
  return parts.join(' · ')
}

function isCrossPostTarget(k: Kind): k is CrossPostTarget {
  return k === 'blog' || k === 'YT short' || k === 'YT long'
}

export function mapCmsRowToContentRows(row: CmsRow): MappedRow[] {
  const mediums = row.medium.length > 0 ? row.medium : (['blog'] as LegacyMedium[])
  const kinds = mediums.map(mediumToKind)
  const stage = statusToStage(row.status)
  const hint = buildHint(row)
  const sourceUrls = splitSources(row.sources)
  const baseOrigin: Origin = row.origin === 'x-post:blog' ? 'Derivative' : 'OC'

  // x-post:bundle → primary row's Cross-post Targets gets the *other* kinds
  // When splitting multi-medium without bundle, the primary still gets Cross-post Targets
  // so the future agent run can recognize the relationship.
  const crossPostsForPrimary: CrossPostTarget[] = kinds.slice(1).filter(isCrossPostTarget)

  const primary: MappedRow = {
    title: row.title,
    kind: kinds[0],
    stage,
    origin: baseOrigin,
    crossPostTargets: crossPostsForPrimary,
    tags: row.tags,
    tools: [],
    hint,
    sourceUrls,
    publishedUrl: row.publishedLink || undefined,
    publishingDate: row.publishing,
    // primary keeps the original Notion page ID — no source row marker needed
  }

  const derivatives: MappedRow[] = kinds.slice(1).map((k) => ({
    title: row.title,
    kind: k,
    stage,
    origin: 'Derivative' as Origin,
    crossPostTargets: [],
    tags: row.tags,
    tools: [],
    hint,
    sourceUrls,
    publishingDate: row.publishing,
    sourceRowOriginalPageId: row.id,
  }))

  return [primary, ...derivatives]
}
```

- [ ] **Step 5: Run tests, verify they pass**

```bash
npx vitest run scripts/agent/tests/migrate.test.ts
```

Expected: PASS — all 11 tests.

- [ ] **Step 6: Commit**

```bash
git add scripts/agent/lib/migrate-mapping.ts scripts/agent/lib/types.ts scripts/agent/tests/migrate.test.ts
git commit -m "add CMS-to-Content row mapping with tests"
```

### Task 2.5: Write `migrate-cms.ts` (in-place rewrite)

**Files:**

- Create/modify: `scripts/agent/migrate-cms.ts`

The script is an in-place migration: source and destination are the same CMS DB. See the file itself for inline comments on the algorithm. Key points:

- Reads `CONFIG.notionCmsDbId` (was `notionContentDbId`)
- Idempotent: rows where `Kind` is already set are skipped
- Single-Medium rows: PATCH the existing page with Kind, Hint, Source URLs
- Multi-Medium rows: PATCH the primary + CREATE sibling pages with `Origin=Derivative` and `Source Row` → primary's page ID
- `x-post:blog` rows get `Origin` upgraded to `Derivative`

- [ ] **Step 1: Write the script**

See `scripts/agent/migrate-cms.ts` — the file reflects the current (in-place) implementation.

- [ ] **Step 2: Test dry-run mode locally**

Run:

```bash
npm run migrate:cms -- --dry-run
```

Expected: prints `=== Migration plan ===` with total rows, already-migrated count, rows to PATCH, siblings to CREATE. No Notion writes.

- [ ] **Step 3: Commit**

```bash
git add scripts/agent/migrate-cms.ts
git commit -m "refactor migrate-cms.ts: in-place CMS rewrite (patch existing rows, create siblings)"
```

### Task 2.6: Run the migration (one-time human action)

- [ ] **Step 1: Dry-run, review output**

```bash
npm run migrate:cms -- --dry-run
```

Confirm:

- "Total rows in CMS" matches your row count
- "Already migrated" is 0 (first run) or non-zero if you've already partially migrated
- Splits make sense (e.g., a multi-Medium row shows the primary Kind and the sibling Kinds you'd expect)

- [ ] **Step 2: Execute**

```bash
npm run migrate:cms -- --execute
```

Expected: prints "Patched N rows, created M sibling rows."

- [ ] **Step 3: Spot-check in Notion**

In the CMS DB:

- Every row should now have `Kind` populated
- A multi-Medium row's primary should have `Cross-post Targets` listing the other Mediums
- New sibling rows should have `Origin=Derivative` and `Source Row` linking to the primary
- Stage values should match the renamed options
- Legacy properties (Medium, Type, Keywords, Source(s)) are still present on rows — they're not deleted

- [ ] **Step 4: Build new agent-facing views**

These views don't replace your existing CMS views; they augment for the agent workflow:

| View        | Filter                                      | Sort                        |
| ----------- | ------------------------------------------- | --------------------------- |
| Triage      | Stage in [Proposed, Ready]                  | Created desc                |
| In flight   | Stage in [Ready, Drafted, Recorded, Edited] | Updated desc                |
| Ideas inbox | Stage = Idea                                | Created desc                |
| By Kind     | (no filter)                                 | grouped by Kind, then Stage |

---

## Phase 3: Shared lib — sources + claude wrapper

### Task 3.1: Refactor `src/content.config.ts` to export the schema standalone

**Files:**

- Modify: `src/content.config.ts`

- [ ] **Step 1: Edit to export `writingSchema`**

Replace `src/content.config.ts` contents with:

```typescript
import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

export const writingSchema = z.object({
  title: z.string(),
  date: z.coerce.date(),
  tags: z.array(z.string()).default([]),
  summary: z.string().max(280),
  hero: z
    .object({
      // Path served from /public/ (e.g. /static/images/blog/<slug>/hero.png).
      // Rendered as a plain <img> in PostHeader. Skips Astro's image
      // optimization, which is fine for v1 — banner PNGs are already small.
      image: z.string(),
      alt: z.string(),
      prompt: z.string().optional(),
      background: z.enum(['ink', 'ink-soft', 'ochre', 'terracotta', 'paper']).optional(),
      titleStyle: z.enum(['italic', 'upper-mono', 'serif-display']).optional(),
    })
    .optional(),
  draft: z.boolean().default(false),
  updatedAt: z.coerce.date().optional(),
  canonical: z.string().url().optional(),
})

const writing = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/writing' }),
  schema: () => writingSchema,
})

export const collections = { writing }
```

- [ ] **Step 2: Verify site still builds**

Run:

```bash
npm run astro check
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/content.config.ts
git commit -m "export writingSchema standalone so agent can reuse Zod validator"
```

### Task 3.2: Write `scripts/agent/lib/validate.ts` (TDD)

**Files:**

- Create: `scripts/agent/lib/validate.ts`
- Test: `scripts/agent/tests/validate.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// scripts/agent/tests/validate.test.ts
import { describe, it, expect } from 'vitest'
import { validateMdxFrontmatter } from '../lib/validate'

describe('validateMdxFrontmatter', () => {
  it('passes a valid post', () => {
    const mdx = `---
title: A test post
date: 2026-06-01
tags: ['ai', 'engineering']
summary: A short summary under 280 chars.
---

Body goes here.
`
    const result = validateMdxFrontmatter(mdx)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.title).toBe('A test post')
      expect(result.data.tags).toEqual(['ai', 'engineering'])
    }
  })

  it('fails when summary too long', () => {
    const mdx = `---
title: x
date: 2026-06-01
summary: ${'a'.repeat(300)}
---
body`
    const result = validateMdxFrontmatter(mdx)
    expect(result.ok).toBe(false)
  })

  it('fails when title missing', () => {
    const mdx = `---
date: 2026-06-01
summary: hi
---
body`
    expect(validateMdxFrontmatter(mdx).ok).toBe(false)
  })

  it('fails when date is unparseable', () => {
    const mdx = `---
title: x
date: not-a-date
summary: hi
---
body`
    expect(validateMdxFrontmatter(mdx).ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npx vitest run scripts/agent/tests/validate.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `validate.ts`**

```typescript
// scripts/agent/lib/validate.ts
import matter from 'gray-matter'
import { writingSchema } from '../../../src/content.config'
import { spawnSync } from 'node:child_process'

export type ValidationResult =
  | { ok: true; data: ReturnType<typeof writingSchema.parse> }
  | { ok: false; error: string }

export function validateMdxFrontmatter(mdx: string): ValidationResult {
  let parsed
  try {
    parsed = matter(mdx)
  } catch (e) {
    return { ok: false, error: `gray-matter parse failed: ${(e as Error).message}` }
  }
  const result = writingSchema.safeParse(parsed.data)
  if (!result.success) {
    return { ok: false, error: result.error.toString() }
  }
  return { ok: true, data: result.data }
}

export interface ValeFinding {
  line: number
  column: number
  rule: string
  severity: 'error' | 'warning' | 'suggestion'
  message: string
}

/**
 * Runs Vale on a single file. Returns parsed findings (empty array if clean).
 * If Vale is not installed, returns []. Failure to invoke Vale is non-fatal.
 */
export function runVale(filePath: string): ValeFinding[] {
  const proc = spawnSync('vale', ['--output=JSON', filePath], { encoding: 'utf8' })
  if (proc.error) return [] // Vale not installed
  if (!proc.stdout) return []
  let json: Record<
    string,
    Array<{ Line: number; Span: number[]; Check: string; Severity: string; Message: string }>
  >
  try {
    json = JSON.parse(proc.stdout)
  } catch {
    return []
  }
  const findings: ValeFinding[] = []
  for (const file of Object.values(json)) {
    for (const f of file) {
      findings.push({
        line: f.Line,
        column: f.Span?.[0] ?? 0,
        rule: f.Check,
        severity: (f.Severity ?? 'warning').toLowerCase() as ValeFinding['severity'],
        message: f.Message,
      })
    }
  }
  return findings
}

export function formatValeReport(findings: ValeFinding[]): string {
  if (findings.length === 0) return '_(Vale clean)_'
  const groups = {
    error: [] as ValeFinding[],
    warning: [] as ValeFinding[],
    suggestion: [] as ValeFinding[],
  }
  for (const f of findings) groups[f.severity].push(f)
  const lines: string[] = []
  for (const sev of ['error', 'warning', 'suggestion'] as const) {
    if (groups[sev].length === 0) continue
    lines.push(`**${sev}** (${groups[sev].length}):`)
    for (const f of groups[sev]) {
      lines.push(`- L${f.line}: \`${f.rule}\` — ${f.message}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npx vitest run scripts/agent/tests/validate.test.ts
```

Expected: PASS — all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/agent/lib/validate.ts scripts/agent/tests/validate.test.ts
git commit -m "add MDX frontmatter validator + Vale runner"
```

### Task 3.3: Write `scripts/agent/lib/claude.ts` (Agent SDK wrapper)

**Files:**

- Create: `scripts/agent/lib/claude.ts`
- Test: (skipped — wraps an external SDK; covered by integration smoke)

- [ ] **Step 1: Write the wrapper**

````typescript
// scripts/agent/lib/claude.ts
import { query } from '@anthropic-ai/claude-agent-sdk'

export interface PromptOptions {
  systemPrompt: string
  userPrompt: string
  model?: string
  maxTurns?: number
}

/**
 * Runs a one-shot Claude prompt via the Agent SDK using subscription OAuth.
 * Returns the assistant's full text response.
 *
 * Auth: reads CLAUDE_CODE_OAUTH_TOKEN from env (set by config import side effect
 * via 'dotenv/config' in callers' lib/config.ts).
 */
export async function runPrompt(opts: PromptOptions): Promise<string> {
  const result = query({
    prompt: opts.userPrompt,
    options: {
      systemPrompt: opts.systemPrompt,
      model: opts.model ?? 'claude-sonnet-4-6',
      // Disable file/bash tools — we feed all context in the prompt.
      allowedTools: [],
      maxTurns: opts.maxTurns ?? 1,
    },
  })

  let text = ''
  for await (const message of result) {
    if (message.type === 'assistant' && Array.isArray(message.message.content)) {
      for (const block of message.message.content) {
        if (block.type === 'text') text += block.text
      }
    }
  }
  return text.trim()
}

/**
 * Parses a Claude response we expect to be JSON. The model often wraps JSON in
 * markdown code fences; this strips those before parsing.
 */
export function parseJsonResponse<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)```/)
  const raw = fenced ? fenced[1] : text
  return JSON.parse(raw.trim()) as T
}
````

- [ ] **Step 2: Smoke-test with a trivial prompt**

Run (requires real `CLAUDE_CODE_OAUTH_TOKEN`):

```bash
npx tsx -e "import('./scripts/agent/lib/claude.ts').then(async m => { const r = await m.runPrompt({ systemPrompt: 'Reply with exactly the word OK.', userPrompt: 'go' }); console.log(JSON.stringify(r)) })"
```

Expected: prints `"OK"` (or close to it — model may add punctuation; that's fine).

If you hit rate limits, log and skip — the wrapper works regardless.

- [ ] **Step 3: Commit**

```bash
git add scripts/agent/lib/claude.ts
git commit -m "add Claude Agent SDK wrapper using subscription OAuth"
```

### Task 3.4: Write `scripts/agent/lib/editorial.ts`

**Files:**

- Create: `scripts/agent/lib/editorial.ts`

- [ ] **Step 1: Write the module**

```typescript
// scripts/agent/lib/editorial.ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = join(__dirname, '..', '..', '..')

export function loadEditorialGuide(): string {
  return readFileSync(join(REPO_ROOT, 'docs', 'EDITORIAL.md'), 'utf8')
}

export function loadShortsStyleGuide(): string {
  return readFileSync(join(REPO_ROOT, 'docs', 'SHORTS-STYLE.md'), 'utf8')
}
```

Note: `tsx` provides `__dirname` even in ESM. If your build complains, replace with:

```typescript
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
```

- [ ] **Step 2: Quick verify**

```bash
npx tsx -e "import('./scripts/agent/lib/editorial.ts').then(m => console.log(m.loadEditorialGuide().length))"
```

Expected: prints a number > 1000 (the length of EDITORIAL.md).

- [ ] **Step 3: Commit**

```bash
git add scripts/agent/lib/editorial.ts
git commit -m "add editorial guide loaders"
```

### Task 3.5: Write `scripts/agent/lib/git-scan.ts`

**Files:**

- Create: `scripts/agent/lib/git-scan.ts`

- [ ] **Step 1: Write the module**

```typescript
// scripts/agent/lib/git-scan.ts
import { CONFIG } from './config'
import type { CommitInfo } from './types'

interface GhCommit {
  sha: string
  html_url: string
  commit: { message: string; author: { date: string } }
}

interface GhCommitFile {
  filename: string
}

interface GhRepo {
  name: string
  pushed_at: string
  private: boolean
}

const GH_API = 'https://api.github.com'

function ghHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${CONFIG.agentGhToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

/**
 * Returns commits across all repos in scope from the last N days.
 * Scope = always-on repos (CONFIG.scanRepoInclude) + any public repo under
 * CONFIG.scanRepoOrg with a push in the last CONFIG.scanRepoActiveDays days.
 */
export async function recentCommits(daysBack: number = 7): Promise<CommitInfo[]> {
  const since = new Date(Date.now() - daysBack * 86_400_000).toISOString()
  const repos = await reposInScope()
  const allCommits: CommitInfo[] = []
  for (const repo of repos) {
    try {
      const commits = await fetchCommits(repo, since)
      allCommits.push(...commits)
    } catch (err) {
      console.warn(`Failed to fetch commits for ${repo}: ${(err as Error).message}`)
    }
  }
  return allCommits
}

async function reposInScope(): Promise<string[]> {
  const always = CONFIG.scanRepoInclude.map((r) => `${CONFIG.scanRepoOrg}/${r}`)
  const opportunistic = await activeRepos()
  const set = new Set<string>([...always, ...opportunistic])
  return [...set]
}

async function activeRepos(): Promise<string[]> {
  const url = `${GH_API}/users/${CONFIG.scanRepoOrg}/repos?per_page=100&sort=pushed&type=public`
  const res = await fetch(url, { headers: ghHeaders() })
  if (!res.ok) {
    console.warn(`Failed to list ${CONFIG.scanRepoOrg} repos: ${res.status}`)
    return []
  }
  const repos = (await res.json()) as GhRepo[]
  const cutoff = Date.now() - CONFIG.scanRepoActiveDays * 86_400_000
  return repos
    .filter((r) => !r.private && new Date(r.pushed_at).getTime() >= cutoff)
    .map((r) => `${CONFIG.scanRepoOrg}/${r.name}`)
}

async function fetchCommits(repo: string, sinceISO: string): Promise<CommitInfo[]> {
  const url = `${GH_API}/repos/${repo}/commits?since=${sinceISO}&per_page=50`
  const res = await fetch(url, { headers: ghHeaders() })
  if (!res.ok) throw new Error(`${res.status}`)
  const commits = (await res.json()) as GhCommit[]
  const results: CommitInfo[] = []
  for (const c of commits) {
    const files = await fetchFiles(repo, c.sha)
    results.push({
      repo,
      sha: c.sha,
      message: c.commit.message,
      date: c.commit.author.date,
      filesChanged: files.slice(0, 10),
      url: c.html_url,
    })
  }
  return results
}

async function fetchFiles(repo: string, sha: string): Promise<string[]> {
  const url = `${GH_API}/repos/${repo}/commits/${sha}`
  const res = await fetch(url, { headers: ghHeaders() })
  if (!res.ok) return []
  const data = (await res.json()) as { files?: GhCommitFile[] }
  return (data.files ?? []).map((f) => f.filename)
}
```

- [ ] **Step 2: Smoke-test**

```bash
npx tsx -e "import('./scripts/agent/lib/git-scan.ts').then(async m => { const c = await m.recentCommits(7); console.log('commits:', c.length); console.log(c.slice(0, 2)) })"
```

Expected: prints commit count and 2 sample commits.

- [ ] **Step 3: Commit**

```bash
git add scripts/agent/lib/git-scan.ts
git commit -m "add git-scan lib for recent commits across active repos"
```

### Task 3.6: Write `scripts/agent/lib/trending.ts`

**Files:**

- Create: `scripts/agent/lib/trending.ts`

- [ ] **Step 1: Write the module**

```typescript
// scripts/agent/lib/trending.ts
import type { TrendingItem } from './types'

const HN_TOP = 'https://hacker-news.firebaseio.com/v0/topstories.json'
const HN_ITEM = (id: number): string => `https://hacker-news.firebaseio.com/v0/item/${id}.json`

const HN_KEYWORDS = [
  'cli',
  'agent',
  'claude',
  'gemini',
  'copilot',
  'codex',
  'cursor',
  'tool',
  'mcp',
]

export async function fetchTrending(extraTools: string[] = []): Promise<TrendingItem[]> {
  const [hn, gh] = await Promise.all([
    fetchHnFiltered([...HN_KEYWORDS, ...extraTools]),
    fetchGhTrending(),
  ])
  return [...hn, ...gh]
}

async function fetchHnFiltered(keywords: string[]): Promise<TrendingItem[]> {
  try {
    const topRes = await fetch(HN_TOP)
    if (!topRes.ok) return []
    const ids = (await topRes.json()) as number[]
    const sample = ids.slice(0, 100) // top 100 stories
    const items: TrendingItem[] = []
    const kws = keywords.map((k) => k.toLowerCase())
    for (const id of sample) {
      const itemRes = await fetch(HN_ITEM(id))
      if (!itemRes.ok) continue
      const it = (await itemRes.json()) as {
        title?: string
        url?: string
        score?: number
        type?: string
      }
      if (it.type !== 'story' || !it.title) continue
      const title = it.title
      const lower = title.toLowerCase()
      if (!kws.some((k) => lower.includes(k))) continue
      items.push({
        source: 'hn',
        title,
        url: it.url ?? `https://news.ycombinator.com/item?id=${id}`,
        hint: it.score ? `HN ${it.score} points` : undefined,
      })
      if (items.length >= 10) break
    }
    return items
  } catch (err) {
    console.warn(`HN fetch failed: ${(err as Error).message}`)
    return []
  }
}

async function fetchGhTrending(): Promise<TrendingItem[]> {
  const langs = ['typescript', 'python', 'rust']
  const items: TrendingItem[] = []
  for (const lang of langs) {
    try {
      const url = `https://github.com/trending/${lang}?since=weekly`
      const res = await fetch(url, {
        headers: { 'User-Agent': 'shariq-dev-agent/1.0' },
      })
      if (!res.ok) continue
      const html = await res.text()
      // Match the standard trending repo card structure
      const matches = html.match(/href="\/[^\/\s]+\/[^\/\s"]+"[^>]*>\s*<svg/g) ?? []
      const seen = new Set<string>()
      for (const m of matches) {
        const path = m.match(/href="(\/[^\/]+\/[^\/"]+)"/)?.[1]
        if (!path) continue
        if (seen.has(path)) continue
        seen.add(path)
        items.push({
          source: 'gh-trending',
          title: path.slice(1),
          url: `https://github.com${path}`,
          hint: `trending ${lang}`,
        })
        if (items.length >= 15) break
      }
    } catch (err) {
      console.warn(`GH trending ${lang} failed: ${(err as Error).message}`)
    }
  }
  return items
}
```

- [ ] **Step 2: Smoke-test**

```bash
npx tsx -e "import('./scripts/agent/lib/trending.ts').then(async m => { const t = await m.fetchTrending(); console.log('trending:', t.length); console.log(t.slice(0, 3)) })"
```

Expected: prints some trending items. HN may be empty if no AI keywords match top stories; GH trending should have ~15 items.

- [ ] **Step 3: Commit**

```bash
git add scripts/agent/lib/trending.ts
git commit -m "add trending lib: GH trending scrape + HN filtered feed"
```

### Task 3.7: Write `scripts/agent/lib/youtube.ts`

**Files:**

- Create: `scripts/agent/lib/youtube.ts`

- [ ] **Step 1: Write the module**

```typescript
// scripts/agent/lib/youtube.ts
import { CONFIG } from './config'
import type { YouTubeStat } from './types'

const YT = 'https://www.googleapis.com/youtube/v3'

interface YtVideo {
  id: string
  snippet: { title: string; publishedAt: string }
  statistics: { viewCount?: string; likeCount?: string }
}

interface YtSearchItem {
  id: { videoId?: string }
  snippet: { publishedAt: string }
}

/**
 * Returns view + like stats for the channel's videos published in the last N days.
 */
export async function recentChannelStats(daysBack: number = 30): Promise<YouTubeStat[]> {
  const publishedAfter = new Date(Date.now() - daysBack * 86_400_000).toISOString()
  const searchUrl = `${YT}/search?part=id,snippet&channelId=${CONFIG.youtubeChannelId}&type=video&order=date&publishedAfter=${publishedAfter}&maxResults=50&key=${CONFIG.youtubeApiKey}`
  const searchRes = await fetch(searchUrl)
  if (!searchRes.ok) {
    console.warn(`YT search failed: ${searchRes.status}`)
    return []
  }
  const search = (await searchRes.json()) as { items: YtSearchItem[] }
  const ids = search.items.map((i) => i.id.videoId).filter((x): x is string => !!x)
  if (ids.length === 0) return []

  const videosUrl = `${YT}/videos?part=snippet,statistics&id=${ids.join(',')}&key=${CONFIG.youtubeApiKey}`
  const vidRes = await fetch(videosUrl)
  if (!vidRes.ok) return []
  const vids = (await vidRes.json()) as { items: YtVideo[] }
  return vids.items.map((v) => ({
    videoId: v.id,
    title: v.snippet.title,
    views: parseInt(v.statistics.viewCount ?? '0', 10),
    likes: parseInt(v.statistics.likeCount ?? '0', 10),
    publishedAt: v.snippet.publishedAt,
  }))
}
```

- [ ] **Step 2: Smoke-test**

```bash
npx tsx -e "import('./scripts/agent/lib/youtube.ts').then(async m => { const s = await m.recentChannelStats(30); console.log('videos:', s.length); console.log(s.slice(0, 3)) })"
```

Expected: prints stats for recent videos.

- [ ] **Step 3: Commit**

```bash
git add scripts/agent/lib/youtube.ts
git commit -m "add YouTube Data API v3 stats client"
```

### Task 3.8: Write `scripts/agent/lib/pr.ts`

**Files:**

- Create: `scripts/agent/lib/pr.ts`

- [ ] **Step 1: Write the module**

```typescript
// scripts/agent/lib/pr.ts
import { spawnSync } from 'node:child_process'

export interface PrInput {
  branchName: string
  commitMessage: string
  prTitle: string
  prBody: string
}

export interface PrResult {
  branch: string
  prUrl: string
}

function run(cmd: string, args: string[]): { code: number; stdout: string; stderr: string } {
  const proc = spawnSync(cmd, args, { encoding: 'utf8' })
  return {
    code: proc.status ?? 1,
    stdout: proc.stdout ?? '',
    stderr: proc.stderr ?? '',
  }
}

/**
 * Creates a branch from the current HEAD, commits whatever's staged, pushes,
 * and opens a PR via `gh`. Returns the PR URL.
 *
 * Caller is responsible for `git add`ing the relevant files before calling.
 */
export function createBranchAndPr(input: PrInput): PrResult {
  // Create branch
  const co = run('git', ['checkout', '-b', input.branchName])
  if (co.code !== 0) throw new Error(`git checkout -b failed: ${co.stderr}`)

  // Commit
  const commit = run('git', ['commit', '-m', input.commitMessage])
  if (commit.code !== 0) throw new Error(`git commit failed: ${commit.stderr}`)

  // Push
  const push = run('git', ['push', '-u', 'origin', input.branchName])
  if (push.code !== 0) throw new Error(`git push failed: ${push.stderr}`)

  // PR
  const pr = run('gh', [
    'pr',
    'create',
    '--title',
    input.prTitle,
    '--body',
    input.prBody,
    '--label',
    'agent-draft',
  ])
  if (pr.code !== 0) throw new Error(`gh pr create failed: ${pr.stderr}`)
  const url = pr.stdout.trim().split('\n').pop() ?? ''
  if (!url.startsWith('https://')) {
    throw new Error(`Unexpected gh pr create output: ${pr.stdout}`)
  }
  return { branch: input.branchName, prUrl: url }
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/agent/lib/pr.ts
git commit -m "add gh CLI PR-creation wrapper"
```

### Task 3.9: Write `scripts/agent/lib/bucket.ts`

**Files:**

- Create: `scripts/agent/lib/bucket.ts`

- [ ] **Step 1: Re-export**

```typescript
// scripts/agent/lib/bucket.ts
export { resolveBucket, BUCKETS } from '../../../src/lib/buckets'
export type { Bucket, BucketKey } from '../../../src/lib/buckets'
```

- [ ] **Step 2: Verify import works**

```bash
npx tsx -e "import('./scripts/agent/lib/bucket.ts').then(m => console.log(m.resolveBucket(['ai'])))"
```

Expected: prints `{ key: 'ai', label: 'AI' }`.

- [ ] **Step 3: Commit**

```bash
git add scripts/agent/lib/bucket.ts
git commit -m "add bucket re-export so agent shares src/lib/buckets logic"
```

---

## Phase 4: Drafting — blog branch

### Task 4.1: Write blog-drafting prompt builder + tests

**Files:**

- Create: `scripts/agent/lib/draft-blog.ts`
- Test: `scripts/agent/tests/draft-blog.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// scripts/agent/tests/draft-blog.test.ts
import { describe, it, expect } from 'vitest'
import { buildBlogSystemPrompt, buildBlogUserPrompt, slugify } from '../lib/draft-blog'

describe('slugify', () => {
  it('lowercases and dashes a title', () => {
    expect(slugify('Claude Code agents in CI')).toBe('claude-code-agents-in-ci')
  })
  it('strips punctuation', () => {
    expect(slugify('Why TDD? It works.')).toBe('why-tdd-it-works')
  })
  it('collapses multiple dashes', () => {
    expect(slugify('a -- b')).toBe('a-b')
  })
})

describe('buildBlogSystemPrompt', () => {
  it('includes EDITORIAL guide and bucket map', () => {
    const sp = buildBlogSystemPrompt({ editorialMd: 'EDITORIAL CONTENT', isDerivative: false })
    expect(sp).toContain('EDITORIAL CONTENT')
    expect(sp).toContain('Leadership')
    expect(sp).toContain('Engineering')
  })

  it('adds derivative instructions when isDerivative=true', () => {
    const sp = buildBlogSystemPrompt({
      editorialMd: 'x',
      isDerivative: true,
      sourceVideoUrl: 'https://youtu.be/abc',
    })
    expect(sp).toContain('<Youtube id="abc" />')
  })
})

describe('buildBlogUserPrompt', () => {
  it('embeds title, hint, source URLs, and commit context', () => {
    const up = buildBlogUserPrompt({
      title: 'A post',
      hint: 'angle here',
      sourceUrls: ['https://x.com'],
      tags: ['ai'],
      commits: [
        {
          repo: 'shariqh/lognote',
          sha: 'abc',
          message: 'feat: add logging',
          date: '2026-06-01T00:00:00Z',
          filesChanged: ['src/log.ts'],
          url: 'https://github.com/shariqh/lognote/commit/abc',
        },
      ],
    })
    expect(up).toContain('A post')
    expect(up).toContain('angle here')
    expect(up).toContain('https://x.com')
    expect(up).toContain('feat: add logging')
    expect(up).toContain('src/log.ts')
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npx vitest run scripts/agent/tests/draft-blog.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `draft-blog.ts`**

````typescript
// scripts/agent/lib/draft-blog.ts
import { BUCKETS } from './bucket'
import type { CommitInfo } from './types'

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export interface BlogSystemPromptInput {
  editorialMd: string
  isDerivative: boolean
  sourceVideoUrl?: string
}

export function buildBlogSystemPrompt(input: BlogSystemPromptInput): string {
  const bucketSummary = Object.entries(BUCKETS)
    .map(
      ([key, b]) =>
        `- **${b.label}** (key: \`${key}\`) — tags: ${b.tags.join(', ') || '(catch-all)'}`
    )
    .join('\n')

  const derivativeBlock = input.isDerivative
    ? `

## DERIVATIVE POST FROM YOUTUBE

This post derives from a YouTube video. Open the MDX with the video embedded at the very top via:

\`\`\`mdx
<Youtube id="${extractYoutubeId(input.sourceVideoUrl ?? '')}" />
\`\`\`

After the embed, write what you couldn't fit in 60 seconds — context, longer demos, gotchas, where it fits in the broader stack.
`
    : ''

  return `You are the drafting agent for shariq.dev. Your job is to produce one MDX file ready to publish, following the editorial guide below verbatim.

OUTPUT: Just the MDX file contents. No prose explanation, no markdown fences around the file. Start with the YAML frontmatter, end with the body.

# Buckets

Posts are categorized by tags into one of five buckets:

${bucketSummary}

Pick tags appropriate for the post. The bucket resolver in src/lib/buckets.ts will assign the visual treatment automatically.

# Editorial guide (verbatim — follow these rules)

${input.editorialMd}
${derivativeBlock}`
}

function extractYoutubeId(url: string): string {
  const m = url.match(/(?:youtu\.be\/|v=)([A-Za-z0-9_-]{11})/)
  return m?.[1] ?? ''
}

export interface BlogUserPromptInput {
  title: string
  hint: string
  sourceUrls: string[]
  tags: string[]
  commits: CommitInfo[]
  sourceVideoUrl?: string
  sourceScript?: string
}

export function buildBlogUserPrompt(input: BlogUserPromptInput): string {
  const lines: string[] = []
  lines.push(`# Draft this post`)
  lines.push('')
  lines.push(`**Working title:** ${input.title}`)
  lines.push(`**Angle:** ${input.hint || '(none provided — derive from sources)'}`)
  if (input.tags.length) lines.push(`**Suggested tags:** ${input.tags.join(', ')}`)
  lines.push('')

  if (input.sourceVideoUrl) {
    lines.push('## Source video')
    lines.push(input.sourceVideoUrl)
    lines.push('')
  }
  if (input.sourceScript) {
    lines.push('## Original YouTube script (basis to expand from)')
    lines.push('```')
    lines.push(input.sourceScript)
    lines.push('```')
    lines.push('')
  }
  if (input.sourceUrls.length) {
    lines.push('## Source URLs')
    for (const u of input.sourceUrls) lines.push(`- ${u}`)
    lines.push('')
  }
  if (input.commits.length) {
    lines.push('## Recent commits (context)')
    for (const c of input.commits) {
      lines.push(
        `- \`${c.repo}@${c.sha.slice(0, 7)}\` (${c.date.slice(0, 10)}) — ${c.message.split('\n')[0]}`
      )
      if (c.filesChanged.length) lines.push(`  files: ${c.filesChanged.slice(0, 5).join(', ')}`)
    }
    lines.push('')
  }

  lines.push(`Today's date: ${new Date().toISOString().slice(0, 10)}`)
  lines.push('')
  lines.push('Write the MDX now. Frontmatter first, body second.')

  return lines.join('\n')
}
````

- [ ] **Step 4: Run tests, verify they pass**

```bash
npx vitest run scripts/agent/tests/draft-blog.test.ts
```

Expected: PASS — all 7 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/agent/lib/draft-blog.ts scripts/agent/tests/draft-blog.test.ts
git commit -m "add blog-drafting prompt builders + slugify"
```

### Task 4.2: Write `scripts/agent/draft.ts` (blog branch only, YT stubbed)

**Files:**

- Create: `scripts/agent/draft.ts`

- [ ] **Step 1: Write the script**

```typescript
// scripts/agent/draft.ts
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CONFIG } from './lib/config'
import { runPrompt } from './lib/claude'
import { queryContentRows, updateContentRow, addPageComment } from './lib/notion'
import { recentCommits } from './lib/git-scan'
import { loadEditorialGuide } from './lib/editorial'
import { buildBlogSystemPrompt, buildBlogUserPrompt, slugify } from './lib/draft-blog'
import { validateMdxFrontmatter, runVale, formatValeReport } from './lib/validate'
import { createBranchAndPr } from './lib/pr'
import type { ContentRow, CommitInfo } from './lib/types'

const READY_FILTER = {
  property: 'Stage',
  select: { equals: 'Ready' },
}

async function main(): Promise<void> {
  const rows = await queryContentRows(READY_FILTER)
  console.log(`Found ${rows.length} Ready row(s).`)
  if (rows.length === 0) return

  // Fetch shared context once
  const allCommits = await recentCommits(7)
  const editorialMd = loadEditorialGuide()

  let succeeded = 0
  let failed = 0
  for (const row of rows) {
    try {
      if (row.kind === 'blog') {
        await draftBlogRow(row, allCommits, editorialMd)
        succeeded++
      } else if (row.kind === 'YT short' || row.kind === 'YT long') {
        // Stubbed — implemented in Phase 5
        console.log(`Skipping YT row (Phase 5 not yet implemented): ${row.title}`)
      } else {
        console.log(`Skipping unsupported Kind=${row.kind}: ${row.title}`)
      }
    } catch (err) {
      failed++
      const msg = (err as Error).message
      console.error(`Row ${row.id} (${row.title}) failed: ${msg}`)
      try {
        await addPageComment(row.id, `Agent drafting failed: ${msg}`)
      } catch (commentErr) {
        console.error(`Also failed to post Notion comment: ${(commentErr as Error).message}`)
      }
    }
  }
  console.log(`Done. Succeeded: ${succeeded}, Failed: ${failed}`)
}

async function draftBlogRow(
  row: ContentRow,
  allCommits: CommitInfo[],
  editorialMd: string
): Promise<void> {
  // Filter commits relevant to this row (mentioned by SHA in Source URLs)
  const relevantShas = new Set(
    row.sourceUrls.map((u) => u.match(/\/commit\/([a-f0-9]+)/)?.[1]).filter((x): x is string => !!x)
  )
  const commits = allCommits.filter((c) => relevantShas.has(c.sha))

  const isDerivative = row.origin === 'Derivative'
  const sourceVideoUrl = isDerivative
    ? row.sourceUrls.find((u) => /youtu\.be|youtube\.com/.test(u))
    : undefined

  const systemPrompt = buildBlogSystemPrompt({
    editorialMd,
    isDerivative,
    sourceVideoUrl,
  })

  const userPrompt = buildBlogUserPrompt({
    title: row.title,
    hint: row.hint,
    sourceUrls: row.sourceUrls,
    tags: row.tags,
    commits,
    sourceVideoUrl,
    sourceScript: undefined, // populated below in YT-derivative case if we add it later
  })

  console.log(`Calling Claude for: ${row.title}`)
  const mdx = await runPrompt({ systemPrompt, userPrompt })

  // Validate
  const valid = validateMdxFrontmatter(mdx)
  if (!valid.ok) {
    throw new Error(`Frontmatter validation failed: ${valid.error}`)
  }

  // Write file
  const slug = slugify(row.title)
  const filePath = join('src', 'content', 'writing', `${slug}.mdx`)
  writeFileSync(filePath, mdx)

  // Vale
  const findings = runVale(filePath)
  const valeReport = formatValeReport(findings)

  // Stage the file
  const { spawnSync } = await import('node:child_process')
  const stageRes = spawnSync('git', ['add', filePath], { encoding: 'utf8' })
  if (stageRes.status !== 0) throw new Error(`git add failed: ${stageRes.stderr}`)

  // Create branch + PR
  const branchName = `agent/draft/${slug}`
  const commitMsg = `draft: ${row.title} (proposed by agent)`
  const prBody = renderPrBody(row, valeReport)
  const { prUrl } = createBranchAndPr({
    branchName,
    commitMessage: commitMsg,
    prTitle: commitMsg,
    prBody,
  })

  // Update Notion
  await updateContentRow(row.id, { stage: 'Drafted', draftUrl: prUrl })

  // Return to main branch so the next iteration starts clean
  spawnSync('git', ['checkout', '-'], { encoding: 'utf8' })

  console.log(`✓ Drafted ${row.title} → ${prUrl}`)
}

function renderPrBody(row: ContentRow, valeReport: string): string {
  return `## AI-drafted post

Drafted by the Plan B agent from Notion row [\`${row.title}\`](https://www.notion.so/${row.id.replace(/-/g, '')}).

### Source
- Hint: ${row.hint || '_(none)_'}
- Tags: ${row.tags.join(', ') || '_(none)_'}
- Source URLs: ${row.sourceUrls.length ? row.sourceUrls.join(', ') : '_(none)_'}

### Pre-publish checklist (from docs/EDITORIAL.md)

- [ ] Voice check — sounds like me, not a press release
- [ ] Accuracy — every claim reflects something I actually did/saw/built
- [ ] AI-tell sweep (read it out loud)
- [ ] Length matches bucket
- [ ] Frontmatter complete
- [ ] Cloudflare preview reviewed (mobile too)

### Vale report

${valeReport}

---

_When this PR merges to main, please update the Notion row's Published URL to the live shariq.dev URL._
`
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Commit**

```bash
git add scripts/agent/draft.ts
git commit -m "add draft.ts entry (blog branch implemented, YT stubbed)"
```

### Task 4.3: Write `.github/workflows/agent-draft.yml`

**Files:**

- Create: `.github/workflows/agent-draft.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: Agent — draft

on:
  schedule:
    - cron: '0 2 * * *' # Daily 02:00 UTC
  workflow_dispatch:

jobs:
  draft:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.AGENT_GH_TOKEN }}

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm

      - run: npm ci

      - name: Install Vale
        run: |
          curl -fsSL -o vale.tar.gz https://github.com/errata-ai/vale/releases/download/v3.14.2/vale_3.14.2_Linux_64-bit.tar.gz
          tar -xzf vale.tar.gz vale
          sudo mv vale /usr/local/bin/

      - name: Configure git
        run: |
          git config user.name "shariq-dev-agent"
          git config user.email "agent@shariq.dev"

      - name: Run drafting
        env:
          CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          NOTION_TOKEN: ${{ secrets.NOTION_TOKEN }}
          NOTION_CMS_DB_ID: ${{ vars.NOTION_CMS_DB_ID }}
          YOUTUBE_API_KEY: ${{ secrets.YOUTUBE_API_KEY }}
          YOUTUBE_CHANNEL_ID: ${{ vars.YOUTUBE_CHANNEL_ID }}
          AGENT_GH_TOKEN: ${{ secrets.AGENT_GH_TOKEN }}
          GH_TOKEN: ${{ secrets.AGENT_GH_TOKEN }}
          SCAN_REPO_ORG: ${{ vars.SCAN_REPO_ORG }}
          SCAN_REPO_INCLUDE: ${{ vars.SCAN_REPO_INCLUDE }}
          SCAN_REPO_ACTIVE_DAYS: ${{ vars.SCAN_REPO_ACTIVE_DAYS }}
        run: npm run agent:draft
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/agent-draft.yml
git commit -m "add agent-draft GH Actions workflow"
```

### Task 4.4: Smoke-test the blog drafting flow

**This is a human-action task.**

- [ ] **Step 1: Add required secrets and variables to GH**

```bash
gh secret set CLAUDE_CODE_OAUTH_TOKEN --body "$(cat ~/.config/claude/auth.json | jq -r .oauth_token)" # adjust to actual location
gh secret set NOTION_TOKEN --body "<your notion token>"
gh secret set YOUTUBE_API_KEY --body "<your YT key>"
gh secret set AGENT_GH_TOKEN --body "<your fine-grained PAT>"

gh variable set NOTION_CMS_DB_ID --body "d25e9f1c0a3345589592fce32f7bc02b"
gh variable set YOUTUBE_CHANNEL_ID --body "<your channel id>"
gh variable set SCAN_REPO_ORG --body "shariqh"
gh variable set SCAN_REPO_INCLUDE --body "blog-site,lognote"
gh variable set SCAN_REPO_ACTIVE_DAYS --body "30"
```

- [ ] **Step 2: Manually set a CMS row to Stage=Ready**

In Notion, pick a CMS row with Kind=blog. Set Stage=Ready.

- [ ] **Step 3: Trigger the workflow manually**

```bash
gh workflow run agent-draft.yml
gh run watch
```

Expected: workflow runs, calls Claude, writes MDX, opens a PR. The PR should appear in `gh pr list`.

- [ ] **Step 4: Verify outputs**

- PR exists with correct title/body
- Notion row Stage=Drafted, Draft URL points at the PR
- Cloudflare Pages preview deploys successfully on the PR

---

## Phase 5: Drafting — YT branch

### Task 5.1: Write YT script-to-Notion-blocks renderer + tests

**Files:**

- Create: `scripts/agent/lib/draft-yt.ts`
- Test: `scripts/agent/tests/draft-yt.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// scripts/agent/tests/draft-yt.test.ts
import { describe, it, expect } from 'vitest'
import { buildYtSystemPrompt, buildYtUserPrompt, renderYtScriptToBlocks } from '../lib/draft-yt'
import type { YTScriptBlocks } from '../lib/types'

const sample: YTScriptBlocks = {
  hook: 'Cursor rewrote my git config.',
  script: 'Here is what happened…',
  onScreenText: [{ timestampSeconds: 2, text: 'WAIT' }],
  bRoll: [{ timestampSeconds: 5, description: 'screen recording of git config diff' }],
  thumbnailPrompt: 'Terminal with red diff, calm face',
  titleVariants: ['Cursor broke my git', 'Heads up on Cursor', 'A weird thing Cursor did'],
  hashtags: ['ai', 'cursor', 'developer', 'cli'],
}

describe('renderYtScriptToBlocks', () => {
  it('renders all 7 sections as Notion blocks', () => {
    const blocks = renderYtScriptToBlocks(sample)
    const headings = blocks.filter((b: { type?: string }) => b.type === 'heading_2')
    expect(headings).toHaveLength(7)
  })

  it('preserves timestamps in on-screen-text bullets', () => {
    const blocks = renderYtScriptToBlocks(sample)
    const serialized = JSON.stringify(blocks)
    expect(serialized).toContain('2s — WAIT')
  })
})

describe('buildYtSystemPrompt', () => {
  it('includes SHORTS-STYLE guide and tools', () => {
    const sp = buildYtSystemPrompt({
      shortsStyleMd: 'SHORTS GUIDE',
      kind: 'YT short',
      tools: ['claude-code'],
    })
    expect(sp).toContain('SHORTS GUIDE')
    expect(sp).toContain('claude-code')
  })
})

describe('buildYtUserPrompt', () => {
  it('embeds title, hint, source URLs, and YT performance signal', () => {
    const up = buildYtUserPrompt({
      title: 'A short',
      hint: 'angle',
      sourceUrls: ['https://x.com'],
      tools: ['claude-code'],
      perfSignal: 'Past videos on claude-code averaged 4k views',
    })
    expect(up).toContain('A short')
    expect(up).toContain('claude-code')
    expect(up).toContain('4k views')
  })
})
```

- [ ] **Step 2: Run, verify failure**

```bash
npx vitest run scripts/agent/tests/draft-yt.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `draft-yt.ts`**

```typescript
// scripts/agent/lib/draft-yt.ts
import type { YTScriptBlocks, Kind } from './types'

export interface YtSystemPromptInput {
  shortsStyleMd: string
  kind: Kind
  tools: string[]
}

export function buildYtSystemPrompt(input: YtSystemPromptInput): string {
  return `You are the drafting agent for the shariq.dev YouTube channel. Produce one script in the structured JSON format below, following the style guide verbatim.

OUTPUT: Valid JSON only. No markdown fences, no commentary, no preamble.

# Kind
${input.kind}

# Tools covered
${input.tools.length ? input.tools.join(', ') : '(none specified — infer from sources)'}

# Style guide

${input.shortsStyleMd}

# Output schema

\`\`\`json
{
  "hook": "string (≤3s of dialogue)",
  "script": "string (full body, ~50s for short, ~5min for long)",
  "on_screen_text": [{"timestamp_seconds": number, "text": "string ≤6 words"}],
  "b_roll": [{"timestamp_seconds": number, "description": "string"}],
  "thumbnail_prompt": "string (one sentence)",
  "title_variants": ["string", "string", "string"],
  "hashtags": ["string", "string", "..."]
}
\`\`\`
`
}

export interface YtUserPromptInput {
  title: string
  hint: string
  sourceUrls: string[]
  tools: string[]
  perfSignal?: string
}

export function buildYtUserPrompt(input: YtUserPromptInput): string {
  const lines: string[] = []
  lines.push(`# Write this script`)
  lines.push('')
  lines.push(`**Working title:** ${input.title}`)
  lines.push(`**Angle:** ${input.hint || '(none — derive)'}`)
  if (input.tools.length) lines.push(`**Tools:** ${input.tools.join(', ')}`)
  if (input.sourceUrls.length) {
    lines.push('')
    lines.push('## Source URLs')
    for (const u of input.sourceUrls) lines.push(`- ${u}`)
  }
  if (input.perfSignal) {
    lines.push('')
    lines.push('## Performance signal')
    lines.push(input.perfSignal)
  }
  lines.push('')
  lines.push('Return the JSON now.')
  return lines.join('\n')
}

interface NotionBlock {
  object?: 'block'
  type: string
  [k: string]: unknown
}

function rtText(content: string): unknown[] {
  return [{ type: 'text', text: { content } }]
}

function heading2(text: string): NotionBlock {
  return { object: 'block', type: 'heading_2', heading_2: { rich_text: rtText(text) } }
}

function paragraph(text: string): NotionBlock {
  return { object: 'block', type: 'paragraph', paragraph: { rich_text: rtText(text) } }
}

function bullet(text: string): NotionBlock {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: { rich_text: rtText(text) },
  }
}

export function renderYtScriptToBlocks(s: YTScriptBlocks): NotionBlock[] {
  const blocks: NotionBlock[] = []

  blocks.push(heading2('Hook'))
  blocks.push(paragraph(s.hook))

  blocks.push(heading2('Script'))
  for (const para of s.script.split(/\n\s*\n/)) blocks.push(paragraph(para))

  blocks.push(heading2('On-screen text'))
  for (const ost of s.onScreenText) blocks.push(bullet(`${ost.timestampSeconds}s — ${ost.text}`))

  blocks.push(heading2('B-roll'))
  for (const b of s.bRoll) blocks.push(bullet(`${b.timestampSeconds}s — ${b.description}`))

  blocks.push(heading2('Thumbnail'))
  blocks.push(paragraph(s.thumbnailPrompt))

  blocks.push(heading2('Title variants'))
  for (const t of s.titleVariants) blocks.push(bullet(t))

  blocks.push(heading2('Hashtags'))
  blocks.push(paragraph(s.hashtags.map((h) => `#${h}`).join(' ')))

  return blocks
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
npx vitest run scripts/agent/tests/draft-yt.test.ts
```

Expected: PASS — all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/agent/lib/draft-yt.ts scripts/agent/tests/draft-yt.test.ts
git commit -m "add YT drafting: prompt builders + Notion block renderer"
```

### Task 5.2: Wire YT branch into `draft.ts`

**Files:**

- Modify: `scripts/agent/draft.ts`

- [ ] **Step 1: Add YT imports and branch**

In `scripts/agent/draft.ts`, replace the existing YT stub section with a real implementation. Update imports at top:

```typescript
import { loadShortsStyleGuide } from './lib/editorial'
import { buildYtSystemPrompt, buildYtUserPrompt, renderYtScriptToBlocks } from './lib/draft-yt'
import { recentChannelStats } from './lib/youtube'
import { parseJsonResponse } from './lib/claude'
import { replacePageBody } from './lib/notion'
import type { YTScriptBlocks } from './lib/types'
```

Replace the YT branch in `main()`:

```typescript
} else if (row.kind === 'YT short' || row.kind === 'YT long') {
  await draftYtRow(row)
  succeeded++
```

Add the function below `draftBlogRow`:

```typescript
async function draftYtRow(row: ContentRow): Promise<void> {
  const shortsStyleMd = loadShortsStyleGuide()
  const stats = await recentChannelStats(30)
  const perfSignal = buildPerfSignal(row.tools, stats)

  const systemPrompt = buildYtSystemPrompt({
    shortsStyleMd,
    kind: row.kind,
    tools: row.tools,
  })
  const userPrompt = buildYtUserPrompt({
    title: row.title,
    hint: row.hint,
    sourceUrls: row.sourceUrls,
    tools: row.tools,
    perfSignal,
  })

  console.log(`Calling Claude for YT: ${row.title}`)
  const json = await runPrompt({ systemPrompt, userPrompt })
  const parsed = parseJsonResponse<RawYtScript>(json)
  const blocks: YTScriptBlocks = {
    hook: parsed.hook,
    script: parsed.script,
    onScreenText: parsed.on_screen_text.map((o) => ({
      timestampSeconds: o.timestamp_seconds,
      text: o.text,
    })),
    bRoll: parsed.b_roll.map((b) => ({
      timestampSeconds: b.timestamp_seconds,
      description: b.description,
    })),
    thumbnailPrompt: parsed.thumbnail_prompt,
    titleVariants: parsed.title_variants,
    hashtags: parsed.hashtags,
  }
  const notionBlocks = renderYtScriptToBlocks(blocks)
  await replacePageBody(row.id, notionBlocks)
  await updateContentRow(row.id, { stage: 'Drafted' })

  console.log(`✓ YT script drafted for ${row.title}`)
}

interface RawYtScript {
  hook: string
  script: string
  on_screen_text: Array<{ timestamp_seconds: number; text: string }>
  b_roll: Array<{ timestamp_seconds: number; description: string }>
  thumbnail_prompt: string
  title_variants: string[]
  hashtags: string[]
}

function buildPerfSignal(tools: string[], stats: { title: string; views: number }[]): string {
  if (stats.length === 0) return 'No recent video stats available.'
  const lines: string[] = ['Recent video performance (last 30 days):']
  for (const s of stats.slice(0, 10)) {
    lines.push(`- "${s.title}" — ${s.views} views`)
  }
  if (tools.length > 0) {
    lines.push('')
    lines.push(`Tools this script covers: ${tools.join(', ')}.`)
  }
  return lines.join('\n')
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/agent/draft.ts
git commit -m "wire YT drafting branch into draft.ts"
```

### Task 5.3: Smoke-test the YT drafting flow

**This is a human-action task.**

- [ ] **Step 1: Set a CMS row Kind=YT short Stage=Ready in Notion**

- [ ] **Step 2: Trigger workflow_dispatch and watch**

```bash
gh workflow run agent-draft.yml
gh run watch
```

- [ ] **Step 3: Verify outputs**

- Notion row Stage=Drafted, body replaced with the structured script (7 H2 sections)
- No PR created (correct — YT lives in Notion)

---

## Phase 6: Discovery workflow

### Task 6.1: Write discovery script

**Files:**

- Create: `scripts/agent/discover.ts`

- [ ] **Step 1: Write the script**

```typescript
// scripts/agent/discover.ts
import { CONFIG } from './lib/config'
import { runPrompt, parseJsonResponse } from './lib/claude'
import { queryContentRows, createContentRow } from './lib/notion'
import { recentCommits } from './lib/git-scan'
import { fetchTrending } from './lib/trending'
import { recentChannelStats } from './lib/youtube'
import { loadEditorialGuide, loadShortsStyleGuide } from './lib/editorial'
import { isTitleDuplicate, hasFullToolsOverlap } from './lib/dedupe'
import type { ContentRow, Candidate, DiscoveryOutput } from './lib/types'

async function main(): Promise<void> {
  console.log('Discovery: gathering source material...')
  const [ideaRows, allRows, commits, trending, ytStats] = await Promise.all([
    queryContentRows({ property: 'Stage', select: { equals: 'Idea' } }),
    queryContentRows({
      and: [{ property: 'Stage', select: { does_not_equal: 'Abandoned' } }],
    }),
    recentCommits(7),
    fetchTrending(
      extractKnownTools(
        await queryContentRows({ property: 'Tools', multi_select: { is_not_empty: true } })
      )
    ),
    recentChannelStats(30),
  ])

  const publishedYtRows = allRows.filter(
    (r) => r.stage === 'Published' && (r.kind === 'YT short' || r.kind === 'YT long')
  )

  console.log(
    `Sources: ${ideaRows.length} ideas, ${commits.length} commits, ${trending.length} trending, ${ytStats.length} YT stats`
  )

  const editorialMd = loadEditorialGuide()
  const shortsStyleMd = loadShortsStyleGuide()

  const systemPrompt = `You are the discovery agent for shariq.dev. Propose up to 3 new blog candidates and up to 3 new YouTube short candidates that are worth drafting.

Empty arrays are fine — do not propose mediocre candidates to fill slots.

OUTPUT: Valid JSON only, matching this schema:

\`\`\`json
{
  "blog_candidates": [
    {"title": "string", "hint": "string", "tags": ["string"], "source_urls": ["string"], "rationale": "string"}
  ],
  "yt_candidates": [
    {"title": "string", "hint": "string", "tools": ["string"], "source_urls": ["string"], "rationale": "string"}
  ]
}
\`\`\`

# Editorial guide (for blog candidates)

${editorialMd}

# Shorts style (for YT candidates)

${shortsStyleMd}
`

  const userPrompt = buildDiscoveryUserPrompt({
    ideaRows,
    publishedYtRows,
    commits,
    trending,
    ytStats,
  })

  console.log('Calling Claude for ranking...')
  const raw = await runPrompt({ systemPrompt, userPrompt })
  const out = parseJsonResponse<{
    blog_candidates: Candidate[]
    yt_candidates: Candidate[]
  }>(raw)

  // Dedupe + upsert
  const recentTitles = allRows
    .filter((r) => Date.now() - new Date(r.createdAt).getTime() < 60 * 86_400_000)
    .map((r) => r.title)

  let blogCreated = 0
  for (const c of out.blog_candidates) {
    if (isTitleDuplicate(c.title, recentTitles)) {
      console.log(`Skipping blog dupe: ${c.title}`)
      continue
    }
    await createCandidateRow(c, 'blog')
    blogCreated++
  }

  const publishedYtToolsByRow = publishedYtRows.map((r) => r.tools)
  let ytCreated = 0
  for (const c of out.yt_candidates) {
    if (isTitleDuplicate(c.title, recentTitles)) {
      console.log(`Skipping YT dupe (title): ${c.title}`)
      continue
    }
    if (c.tools && hasFullToolsOverlap(c.tools, publishedYtToolsByRow)) {
      console.log(`Skipping YT dupe (tools covered): ${c.title}`)
      continue
    }
    await createCandidateRow(c, 'YT short')
    ytCreated++
  }

  console.log(`Discovery done. Created ${blogCreated} blog + ${ytCreated} YT candidate rows.`)
}

function extractKnownTools(rowsWithTools: ContentRow[]): string[] {
  const set = new Set<string>()
  for (const r of rowsWithTools) for (const t of r.tools) set.add(t.toLowerCase())
  return [...set]
}

interface DiscoveryUserPromptInput {
  ideaRows: ContentRow[]
  publishedYtRows: ContentRow[]
  commits: {
    repo: string
    sha: string
    message: string
    date: string
    filesChanged: string[]
    url: string
  }[]
  trending: { source: string; title: string; url: string; hint?: string }[]
  ytStats: { title: string; views: number; likes: number; publishedAt: string }[]
}

function buildDiscoveryUserPrompt(input: DiscoveryUserPromptInput): string {
  const lines: string[] = []
  lines.push(`# Source material for discovery`)
  lines.push('')

  lines.push('## Existing ideas in Notion (not yet drafted)')
  if (input.ideaRows.length === 0) lines.push('(none)')
  for (const r of input.ideaRows.slice(0, 20)) {
    lines.push(
      `- **${r.title}** (Kind: ${r.kind}; tags: ${r.tags.join(',') || '–'}) — ${r.hint || ''}`
    )
  }
  lines.push('')

  lines.push('## Recent commits (last 7 days, across active repos)')
  if (input.commits.length === 0) lines.push('(none)')
  for (const c of input.commits.slice(0, 40)) {
    const first = c.message.split('\n')[0]
    lines.push(
      `- \`${c.repo}@${c.sha.slice(0, 7)}\` — ${first} (${c.filesChanged.slice(0, 3).join(', ')})`
    )
  }
  lines.push('')

  lines.push('## Trending (GH + HN, AI/dev tool keywords)')
  if (input.trending.length === 0) lines.push('(none)')
  for (const t of input.trending.slice(0, 20)) {
    lines.push(`- [${t.source}] **${t.title}** — ${t.url}${t.hint ? ` (${t.hint})` : ''}`)
  }
  lines.push('')

  lines.push('## YouTube performance (channel, last 30 days)')
  if (input.ytStats.length === 0) lines.push('(no recent uploads)')
  for (const s of input.ytStats.slice(0, 20)) {
    lines.push(
      `- "${s.title}" — ${s.views} views, ${s.likes} likes (${s.publishedAt.slice(0, 10)})`
    )
  }
  lines.push('')

  lines.push(`Today's date: ${new Date().toISOString().slice(0, 10)}`)
  lines.push('')
  lines.push('Propose candidates now. Return JSON only.')

  return lines.join('\n')
}

async function createCandidateRow(c: Candidate, kind: 'blog' | 'YT short'): Promise<void> {
  await createContentRow({
    title: c.title,
    kind,
    stage: 'Proposed',
    origin: 'Agent Proposed',
    tags: c.tags ?? [],
    tools: c.tools ?? [],
    hint: c.hint,
    sourceUrls: c.sourceUrls,
  })
  console.log(`+ ${kind}: ${c.title}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Commit**

```bash
git add scripts/agent/discover.ts
git commit -m "add discovery script"
```

### Task 6.2: Write `.github/workflows/agent-discover.yml`

**Files:**

- Create: `.github/workflows/agent-discover.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: Agent — discover

on:
  schedule:
    - cron: '0 3 * * 0' # Sunday 03:00 UTC
  workflow_dispatch:

jobs:
  discover:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm

      - run: npm ci

      - name: Run discovery
        env:
          CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          NOTION_TOKEN: ${{ secrets.NOTION_TOKEN }}
          NOTION_CMS_DB_ID: ${{ vars.NOTION_CMS_DB_ID }}
          YOUTUBE_API_KEY: ${{ secrets.YOUTUBE_API_KEY }}
          YOUTUBE_CHANNEL_ID: ${{ vars.YOUTUBE_CHANNEL_ID }}
          AGENT_GH_TOKEN: ${{ secrets.AGENT_GH_TOKEN }}
          SCAN_REPO_ORG: ${{ vars.SCAN_REPO_ORG }}
          SCAN_REPO_INCLUDE: ${{ vars.SCAN_REPO_INCLUDE }}
          SCAN_REPO_ACTIVE_DAYS: ${{ vars.SCAN_REPO_ACTIVE_DAYS }}
        run: npm run agent:discover
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/agent-discover.yml
git commit -m "add agent-discover GH Actions workflow"
```

### Task 6.3: Smoke-test discovery

**Human-action task.**

- [ ] **Step 1: Trigger manually**

```bash
gh workflow run agent-discover.yml
gh run watch
```

- [ ] **Step 2: Verify candidates in Notion**

Open the `Triage` view. New rows with `Stage=Proposed Origin=Agent Proposed` should appear (up to 3 blog + 3 YT). Each should have a title, hint, source URLs, and tags/tools.

If no candidates created, check workflow logs — could be that no sources had material, which is a valid outcome.

---

## Phase 7: Promotion workflow

### Task 7.1: Write promotion script + tests

**Files:**

- Create: `scripts/agent/promote.ts`
- Create: `scripts/agent/lib/promote.ts` (pure logic)
- Test: `scripts/agent/tests/promote.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// scripts/agent/tests/promote.test.ts
import { describe, it, expect } from 'vitest'
import { selectRowsNeedingPromotion, buildDerivativeRowInput } from '../lib/promote'
import type { ContentRow } from '../lib/types'

const baseRow: ContentRow = {
  id: 'row-1',
  title: 'A short',
  kind: 'YT short',
  stage: 'Published',
  origin: 'OC',
  crossPostTargets: ['blog'],
  tags: ['ai'],
  tools: ['claude-code'],
  hint: '',
  sourceUrls: [],
  publishedUrl: 'https://youtu.be/abc12345678',
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-02T00:00:00Z',
}

describe('selectRowsNeedingPromotion', () => {
  it('selects published YT rows with blog target and no existing derivative', () => {
    const out = selectRowsNeedingPromotion([baseRow], [])
    expect(out).toHaveLength(1)
  })

  it('skips rows without blog target', () => {
    const r = { ...baseRow, crossPostTargets: [] }
    expect(selectRowsNeedingPromotion([r], [])).toHaveLength(0)
  })

  it('skips rows that already have a derivative', () => {
    const derivative: ContentRow = {
      ...baseRow,
      id: 'row-2',
      kind: 'blog',
      origin: 'Derivative',
      sourceRowId: 'row-1',
    }
    expect(selectRowsNeedingPromotion([baseRow], [derivative])).toHaveLength(0)
  })

  it('skips non-published YT rows', () => {
    const r = { ...baseRow, stage: 'Drafted' as const }
    expect(selectRowsNeedingPromotion([r], [])).toHaveLength(0)
  })

  it('skips non-YT rows even if they have blog target', () => {
    const r = { ...baseRow, kind: 'blog' as const }
    expect(selectRowsNeedingPromotion([r], [])).toHaveLength(0)
  })
})

describe('buildDerivativeRowInput', () => {
  it('mints a blog derivative carrying tags, tools, and YT URL forward', () => {
    const out = buildDerivativeRowInput(baseRow)
    expect(out.kind).toBe('blog')
    expect(out.stage).toBe('Proposed')
    expect(out.origin).toBe('Derivative')
    expect(out.sourceRowId).toBe('row-1')
    expect(out.tags).toEqual(['ai'])
    expect(out.tools).toEqual(['claude-code'])
    expect(out.sourceUrls).toContain('https://youtu.be/abc12345678')
    expect(out.hint).toContain('Blog-length treatment')
  })
})
```

- [ ] **Step 2: Run, verify failure**

```bash
npx vitest run scripts/agent/tests/promote.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/promote.ts`**

```typescript
// scripts/agent/lib/promote.ts
import type { ContentRow } from './types'
import type { CreateRowInput } from './notion'

export function selectRowsNeedingPromotion(
  allRows: ContentRow[],
  existingDerivatives: ContentRow[]
): ContentRow[] {
  const promotedSourceIds = new Set(
    existingDerivatives
      .filter((r) => r.origin === 'Derivative' && r.kind === 'blog' && r.sourceRowId)
      .map((r) => r.sourceRowId as string)
  )
  return allRows.filter(
    (r) =>
      (r.kind === 'YT short' || r.kind === 'YT long') &&
      r.stage === 'Published' &&
      r.crossPostTargets.includes('blog') &&
      !promotedSourceIds.has(r.id)
  )
}

export function buildDerivativeRowInput(source: ContentRow): CreateRowInput {
  const ytUrl = source.publishedUrl ?? ''
  const sourceUrls = [...source.sourceUrls]
  if (ytUrl && !sourceUrls.includes(ytUrl)) sourceUrls.unshift(ytUrl)

  return {
    title: source.title,
    kind: 'blog',
    stage: 'Proposed',
    origin: 'Derivative',
    sourceRowId: source.id,
    tags: source.tags,
    tools: source.tools,
    hint: `Blog-length treatment of YT video ${ytUrl}. Expand on: setup, full demo, what surprised me, where this fits.`,
    sourceUrls,
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
npx vitest run scripts/agent/tests/promote.test.ts
```

Expected: PASS — all 6 tests.

- [ ] **Step 5: Write `scripts/agent/promote.ts`**

```typescript
// scripts/agent/promote.ts
import { queryContentRows, createContentRow, addPageComment } from './lib/notion'
import { selectRowsNeedingPromotion, buildDerivativeRowInput } from './lib/promote'

async function main(): Promise<void> {
  const allRows = await queryContentRows({
    property: 'Stage',
    select: { does_not_equal: 'Abandoned' },
  })
  const toPromote = selectRowsNeedingPromotion(allRows, allRows)
  if (toPromote.length === 0) {
    console.log('Nothing to promote.')
    return
  }
  console.log(`Promoting ${toPromote.length} row(s)...`)
  for (const source of toPromote) {
    try {
      const input = buildDerivativeRowInput(source)
      const newId = await createContentRow(input)
      const newUrl = `https://www.notion.so/${newId.replace(/-/g, '')}`
      await addPageComment(source.id, `Created derivative blog row: ${newUrl}`)
      console.log(`✓ ${source.title} → ${newUrl}`)
    } catch (err) {
      console.error(`Failed to promote ${source.title}: ${(err as Error).message}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 6: Commit**

```bash
git add scripts/agent/lib/promote.ts scripts/agent/promote.ts scripts/agent/tests/promote.test.ts
git commit -m "add promotion: lib (TDD'd) + entry script"
```

### Task 7.2: Write `.github/workflows/agent-promote.yml`

**Files:**

- Create: `.github/workflows/agent-promote.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: Agent — promote

on:
  schedule:
    - cron: '0 4 * * *' # Daily 04:00 UTC (2h after draft)
  workflow_dispatch:

jobs:
  promote:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm

      - run: npm ci

      - name: Run promotion
        env:
          NOTION_TOKEN: ${{ secrets.NOTION_TOKEN }}
          NOTION_CMS_DB_ID: ${{ vars.NOTION_CMS_DB_ID }}
          # The rest are unused but required by config.ts:
          CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          YOUTUBE_API_KEY: ${{ secrets.YOUTUBE_API_KEY }}
          YOUTUBE_CHANNEL_ID: ${{ vars.YOUTUBE_CHANNEL_ID }}
          AGENT_GH_TOKEN: ${{ secrets.AGENT_GH_TOKEN }}
        run: npm run agent:promote
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/agent-promote.yml
git commit -m "add agent-promote GH Actions workflow"
```

### Task 7.3: Smoke-test promotion

**Human-action task.**

- [ ] **Step 1: Set up test scenario**

In Notion: pick (or create) a CMS row with Kind=YT short, Stage=Published, Cross-post Targets=blog. Confirm no existing derivative row points at it.

- [ ] **Step 2: Trigger workflow**

```bash
gh workflow run agent-promote.yml
gh run watch
```

- [ ] **Step 3: Verify**

- New row in Notion with Kind=blog, Stage=Proposed, Origin=Derivative, Source Row pointing at the YT row
- Comment posted on the YT row linking to the new derivative

---

## Phase 8: Cutover

### Task 8.1: Update CLAUDE.md with agent docs

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Add a new section before `## Deploy`**

In `CLAUDE.md`, add this section between `## Writing posts` and `## Deploy`:

````markdown
## AI drafting agent (Plan B)

Three GHA workflows under `.github/workflows/agent-*.yml` run on cron:

- **agent-discover** — Sunday 03:00 UTC: scans Notion ideas, recent commits, GH trending, HN, and YT performance; proposes up to 3 blog + 3 YT candidates as Notion rows.
- **agent-draft** — Daily 02:00 UTC: picks up CMS rows with `Stage=Ready`. Blog rows → MDX file + PR. YT rows → script blocks written to the Notion row body.
- **agent-promote** — Daily 04:00 UTC: for published YT rows with `Cross-post Targets` includes `blog`, mints a linked blog derivative row in `Stage=Proposed`.

Source of truth for content: Notion CMS DB (see `docs/superpowers/specs/2026-06-02-plan-b-ai-drafting-agent-design.md`).

Local invocation (for prompt iteration without burning CI):

```sh
npm run agent:discover
npm run agent:draft
npm run agent:promote
```
````

Each reads `.env.local` (see `.env.local.example`).

Style contracts:

- Blog: `docs/EDITORIAL.md`
- YouTube: `docs/SHORTS-STYLE.md`

````

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "document AI drafting agent in CLAUDE.md"
````

### Task 8.2: Update README with agent section

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Append a short section**

Add to `README.md` (location: near the end, after deploy section):

```markdown
## Drafting pipeline

Posts and YouTube scripts are drafted by a Claude-based agent that reads from a Notion DB of ideas + my recent commits + AI/dev tool trends. The agent never publishes — every blog post goes through PR review on Cloudflare Pages preview; every YouTube script lives in Notion for me to record manually.

See [`docs/superpowers/specs/2026-06-02-plan-b-ai-drafting-agent-design.md`](docs/superpowers/specs/2026-06-02-plan-b-ai-drafting-agent-design.md) for the design.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "add drafting pipeline section to README"
```

### Task 8.3: Final smoke + crons enabled

The crons defined in the workflow files run automatically once merged to `main`. After merge, monitor the first scheduled run:

- [ ] **Step 1: Merge agent PR to main**

After review:

```bash
gh pr merge --squash <pr-number>
```

- [ ] **Step 2: Wait for first scheduled discover run (next Sunday 03:00 UTC)**

Or trigger manually for confidence:

```bash
gh workflow run agent-discover.yml
gh workflow run agent-draft.yml
gh workflow run agent-promote.yml
```

- [ ] **Step 3: Update Solo todo**

Mark Solo todo #37 (Plan B) complete.

```bash
# Or via Solo MCP
```

---

## Done

The agent is live. Going forward:

- Drop ideas in the Notion CMS DB with `Kind`, `Stage=Idea`
- Each Sunday morning, check the `Triage` view for new candidates
- Flip `Stage=Ready` on anything you want drafted
- Wake up Monday to a PR (blog) or filled-in script (YT) waiting for you
- After publishing a YT short, set `Cross-post Targets=blog` to auto-mint a blog derivative

---

## Open follow-ups (out of scope for v1, tracked in spec's "Open questions")

- Tools registry as separate DB (if the multi-select grows past ~30 entries)
- YT performance window tuning
- PR auto-labeling beyond `agent-draft`
- Blog → YT script derivative direction
- Hero image generation
- Notion webhook for sub-minute draft trigger
