# Social Agent — Phase 1 (Spine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `social-agent` service so that publishing a blog post produces a `Proposed` X thread in a Notion Social Queue, and flipping that row to `Approved` posts the thread to X — the full propose→approve→post spine, wired to one source.

**Architecture:** A Node 22 + TypeScript (strict) Hono service in its own repo. Two webhook legs: `/hook/blog` (GitHub push → Claude drafts a thread → writes a `Proposed` Notion row with the parts as divider-split page blocks) and `/hook/notion/:token` (a Notion automation on `Status=Approved` → read the blocks → validate ≤280 → post the reply-chain to X → write `Posted` + URL back). It reuses the merged `post-thread` core and fetches the `EDITORIAL.md` voice from `blog-site` raw. Deployed via Docker Compose on `ubi-prod` behind a Cloudflare Tunnel (no open ports).

**Tech Stack:** Node ≥22, TypeScript strict, Hono + `@hono/node-server`, `twitter-api-v2` (OAuth 1.0a), `@anthropic-ai/claude-agent-sdk` (subscription OAuth), Notion HTTP API `2025-09-03` via `fetch`, Vitest, Docker Compose + `cloudflared`, 1Password (`op`).

## Global Constraints

Every task implicitly includes these (exact values copied from the spec):

- **Node ≥ 22**, `"type": "module"`, TypeScript `strict`. tsconfig mirrors askdocs: `target ES2022`, `module ESNext`, `moduleResolution Bundler`, `noUncheckedIndexedAccess`, `noEmit`.
- **Never auto-post.** Nothing reaches X without a human setting a row to `Approved`. This invariant is load-bearing.
- **280 characters per part** is the hard X limit (free tier; threading, no Premium). `tweetLength` accounts for t.co URL wrapping (23 chars).
- **Notion-Version header is exactly `2025-09-03`.** In this version you create a *database* but query/append-to its *data source* — resolve `data_sources[0].id` from the database id before querying.
- **Voice contract:** the drafter fetches `docs/EDITORIAL.md` from `blog-site` raw GitHub (`main`) at draft time. The X-specific rules live in this repo as `SOCIAL-STYLE.md`. No vendored copy of EDITORIAL.
- **Secrets via 1Password.** No secret literals in the repo. `.env.tpl` holds `op://` references; deploy renders `.env` with `op inject`.
- **No open inbound ports on `ubi-prod`.** The only ingress is the Cloudflare Tunnel.
- **X credentials** are OAuth 1.0a: `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`. Reuse the `op://dev-env-vars/X API/*` item.

## Shared types & interfaces (pinned across tasks)

These signatures are fixed; tasks must match them exactly.

```ts
// src/config.ts
export interface XCreds { appKey: string; appSecret: string; accessToken: string; accessSecret: string }
export interface Config {
  x: XCreds
  notionToken: string
  socialQueueDbId: string
  claudeOauthToken: string
  githubWebhookSecret: string
  notionWebhookToken: string
  blogRepo: string        // "shariqh/blog-site"
  blogBaseUrl: string     // "https://shariq.dev"
  parentPageId: string    // Notion page the Social Queue DB lives under (setup only)
  port: number
}

// src/notion/blocks.ts
export interface NotionBlock { type: string; paragraph?: { rich_text: Array<{ plain_text?: string }> } }
export function partsToBlocks(parts: string[]): unknown[]
export function blocksToParts(blocks: NotionBlock[]): string[]

// src/notion/client.ts
export interface NotionRow { id: string; status: string; postedUrl: string | null; type: string; source: string }
export interface ProposedRowInput {
  title: string; type: 'Thread' | 'Standalone'; source: string; sourceLink: string; parts: string[]
}
export interface NotionClient {
  resolveDataSourceId(): Promise<string>
  createDatabase(parentPageId: string, title: string, properties: Record<string, unknown>): Promise<{ dbId: string; dataSourceId: string }>
  queryByStatus(status: string): Promise<NotionRow[]>
  getRow(rowId: string): Promise<NotionRow>
  getBlockChildren(pageId: string): Promise<NotionBlock[]>
  createProposedRow(input: ProposedRowInput): Promise<string>
  patchStatus(rowId: string, status: string, extra?: { postedUrl?: string; error?: string }): Promise<void>
  addComment(pageId: string, text: string): Promise<void>
}
export function createNotionClient(token: string, dbId: string): NotionClient
export function socialQueueSchema(): Record<string, unknown>

// src/x/post-thread.ts
export class ThreadPostError extends Error { posted: number; lastTweetId?: string }
export function tweetLength(text: string): number
export function sanitize(text: string): string
export function validateParts(parts: string[]): Array<{ index: number; len: number }>  // [] = all valid
export function postThread(parts: string[], creds: XCreds): Promise<{ firstUrl: string; count: number; username: string }>

// src/draft/draft-thread.ts
export interface PostInput { title: string; url: string; body: string }
export interface DraftResult { thread: string[]; standalone: string }
export type RunPrompt = (opts: { systemPrompt: string; userPrompt: string }) => Promise<string>
export function parseJsonResponse<T>(text: string): T
export function draftThreadFromPost(post: PostInput, styleDocs: string, run: RunPrompt): Promise<DraftResult>

// src/webhooks/github-verify.ts
export function verifyGithubSignature(rawBody: string, signatureHeader: string | undefined, secret: string): boolean

// src/webhooks/blog-hook.ts
export interface PushFile { added: string[]; modified: string[] }
export function extractPublishedPosts(payload: unknown): Array<{ slug: string; path: string }>

// src/app.ts — dependency bundle injected for testability
export interface Deps {
  config: Config
  notion: NotionClient
  postThread: typeof import('./x/post-thread.js').postThread
  draft: (post: PostInput) => Promise<DraftResult>
  fetchPostMdx: (path: string) => Promise<string>
  styleDocs: () => Promise<string>
}
export function createApp(deps: Deps): import('hono').Hono
```

## File structure

```
social-agent/
  package.json            # type:module, Node>=22, deps + scripts
  tsconfig.json           # strict, ES2022/ESNext/Bundler, noEmit
  vitest.config.ts
  .gitignore              # .env*, node_modules, dist
  .env.example            # local dev (real values, gitignored copy)
  .env.tpl                # op:// references for deploy
  Dockerfile
  docker-compose.yml      # app + cloudflared
  README.md               # setup + deploy runbook
  SOCIAL-STYLE.md         # X-specific voice/format contract
  src/
    config.ts             # loadConfig(env): Config
    server.ts             # wires real deps, serve()
    app.ts                # createApp(deps): Hono — routes
    x/post-thread.ts      # tweetLength, sanitize, validateParts, postThread
    notion/blocks.ts      # partsToBlocks, blocksToParts
    notion/client.ts      # createNotionClient, socialQueueSchema
    draft/voice.ts        # fetchEditorial() (raw GitHub + cache)
    draft/draft-thread.ts # runPrompt, parseJsonResponse, draftThreadFromPost
    webhooks/github-verify.ts
    webhooks/blog-hook.ts # extractPublishedPosts, handleBlogPush
    webhooks/notion-hook.ts # handleApproval
    scripts/setup-db.ts   # one-shot Social Queue DB provisioning
  test/
    config.test.ts  post-thread.test.ts  blocks.test.ts  draft.test.ts
    github-verify.test.ts  blog-hook.test.ts  notion-hook.test.ts  app.test.ts
```

---

### Task 1: Repo scaffold + config loader

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `.env.example`, `src/config.ts`
- Test: `test/config.test.ts`

**Interfaces:**
- Produces: `loadConfig(env)`, `Config`, `XCreds` (see Shared types).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "social-agent",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "tsx src/server.ts",
    "start": "tsx src/server.ts",
    "setup:db": "tsx src/scripts/setup-db.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.3.161",
    "@hono/node-server": "^1.13.7",
    "dotenv": "^16.4.7",
    "hono": "^4.6.14",
    "twitter-api-v2": "^1.29.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node"],
    "noEmit": true
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`, `.gitignore`**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node' } })
```

`.gitignore`:
```
node_modules/
dist/
.env
.env.local
.env.social
*.log
```

- [ ] **Step 4: Write the failing test** — `test/config.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { loadConfig } from '../src/config.js'

const full = {
  X_API_KEY: 'a', X_API_SECRET: 'b', X_ACCESS_TOKEN: 'c', X_ACCESS_SECRET: 'd',
  NOTION_TOKEN: 'n', SOCIAL_QUEUE_DB_ID: 'db', CLAUDE_CODE_OAUTH_TOKEN: 'cc',
  GITHUB_WEBHOOK_SECRET: 'gh', NOTION_WEBHOOK_TOKEN: 'nw',
  BLOG_REPO: 'shariqh/blog-site', BLOG_BASE_URL: 'https://shariq.dev',
  NOTION_PARENT_PAGE_ID: 'pp', PORT: '8080',
}

describe('loadConfig', () => {
  it('returns a typed config from a full env', () => {
    const c = loadConfig(full)
    expect(c.x.appKey).toBe('a')
    expect(c.socialQueueDbId).toBe('db')
    expect(c.port).toBe(8080)
    expect(c.blogRepo).toBe('shariqh/blog-site')
  })

  it('throws naming the missing var', () => {
    const { NOTION_TOKEN, ...partial } = full
    expect(() => loadConfig(partial)).toThrow(/NOTION_TOKEN/)
  })

  it('defaults PORT to 8080 when absent', () => {
    const { PORT, ...noPort } = full
    expect(loadConfig(noPort).port).toBe(8080)
  })
})
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm install && npm test -- config`
Expected: FAIL — `Cannot find module '../src/config.js'`.

- [ ] **Step 6: Implement `src/config.ts`**

```ts
export interface XCreds {
  appKey: string; appSecret: string; accessToken: string; accessSecret: string
}
export interface Config {
  x: XCreds
  notionToken: string
  socialQueueDbId: string
  claudeOauthToken: string
  githubWebhookSecret: string
  notionWebhookToken: string
  blogRepo: string
  blogBaseUrl: string
  parentPageId: string
  port: number
}

type Env = Record<string, string | undefined>

function req(env: Env, key: string): string {
  const v = env[key]
  if (!v) throw new Error(`Missing required env var: ${key}`)
  return v
}

export function loadConfig(env: Env): Config {
  return {
    x: {
      appKey: req(env, 'X_API_KEY'),
      appSecret: req(env, 'X_API_SECRET'),
      accessToken: req(env, 'X_ACCESS_TOKEN'),
      accessSecret: req(env, 'X_ACCESS_SECRET'),
    },
    notionToken: req(env, 'NOTION_TOKEN'),
    socialQueueDbId: req(env, 'SOCIAL_QUEUE_DB_ID'),
    claudeOauthToken: req(env, 'CLAUDE_CODE_OAUTH_TOKEN'),
    githubWebhookSecret: req(env, 'GITHUB_WEBHOOK_SECRET'),
    notionWebhookToken: req(env, 'NOTION_WEBHOOK_TOKEN'),
    blogRepo: req(env, 'BLOG_REPO'),
    blogBaseUrl: req(env, 'BLOG_BASE_URL'),
    parentPageId: env.NOTION_PARENT_PAGE_ID ?? '',
    port: env.PORT ? parseInt(env.PORT, 10) : 8080,
  }
}
```

Note: `parentPageId` is only required by the setup script (Task 4), so it is read but not `req`'d here.

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- config`
Expected: PASS (3 tests). Also run `npm run typecheck` — expected: clean.

- [ ] **Step 8: Create `.env.example`** (gitignored values; documents the keys)

```
X_API_KEY=
X_API_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_SECRET=
NOTION_TOKEN=
SOCIAL_QUEUE_DB_ID=
CLAUDE_CODE_OAUTH_TOKEN=
GITHUB_WEBHOOK_SECRET=
NOTION_WEBHOOK_TOKEN=
BLOG_REPO=shariqh/blog-site
BLOG_BASE_URL=https://shariq.dev
NOTION_PARENT_PAGE_ID=
PORT=8080
```

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore .env.example src/config.ts test/config.test.ts
git commit -m "feat: scaffold social-agent + config loader"
```

---

### Task 2: X posting core

**Files:**
- Create: `src/x/post-thread.ts`
- Test: `test/post-thread.test.ts`

**Interfaces:**
- Consumes: `XCreds` from `src/config.ts`.
- Produces: `tweetLength`, `sanitize`, `validateParts`, `postThread`, `ThreadPostError` (see Shared types).

This ports the merged `blog-site/scripts/social/post-thread.ts` core (verbatim `tweetLength`/`sanitize`) and reshapes the posting loop to take a `parts` array instead of a file.

- [ ] **Step 1: Write the failing test** — `test/post-thread.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { tweetLength, sanitize, validateParts } from '../src/x/post-thread.js'

describe('tweetLength', () => {
  it('counts a plain string by code points', () => {
    expect(tweetLength('hello')).toBe(5)
  })
  it('wraps a URL to 23 chars', () => {
    expect(tweetLength('see https://example.com/a/very/long/path')).toBe('see '.length + 23)
  })
  it('does not swallow trailing punctuation after a URL', () => {
    // "(see https://x.com)." -> "(see " + 23 + ")."
    expect(tweetLength('(see https://example.com/x).')).toBe('(see '.length + 23 + ').'.length)
  })
})

describe('sanitize', () => {
  it('keeps newlines and printable text', () => {
    expect(sanitize('a\nb')).toBe('a\nb')
  })
  it('strips C0, DEL and C1 control chars', () => {
    expect(sanitize('abcd')).toBe('abcd')
  })
})

describe('validateParts', () => {
  it('returns [] when all parts fit', () => {
    expect(validateParts(['short', 'also short'])).toEqual([])
  })
  it('flags the index and length of an over-limit part', () => {
    const big = 'x'.repeat(290)
    expect(validateParts(['ok', big])).toEqual([{ index: 1, len: 290 }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- post-thread`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/x/post-thread.ts`**

```ts
import { TwitterApi } from 'twitter-api-v2'
import type { XCreds } from '../config.js'

export class ThreadPostError extends Error {
  posted: number
  lastTweetId?: string
  constructor(message: string, posted: number, lastTweetId?: string) {
    super(message)
    this.name = 'ThreadPostError'
    this.posted = posted
    this.lastTweetId = lastTweetId
  }
}

// X wraps every URL to 23 chars (t.co). Match URLs but don't swallow trailing
// punctuation, which X counts as real characters — keeps the estimate conservative.
export function tweetLength(text: string): number {
  return text.replace(/https?:\/\/\S+/g, (match) => {
    const url = match.replace(/[).,!?:;'"\]]+$/, '')
    return 'x'.repeat(23) + match.slice(url.length)
  }).length
}

// Strip C0 (<0x20, except newline), DEL (0x7f), and C1 (0x80-0x9f) control chars.
export function sanitize(text: string): string {
  return Array.from(text)
    .filter((c) => {
      if (c === '\n') return true
      const code = c.codePointAt(0) ?? 0
      return code >= 0x20 && code !== 0x7f && (code < 0x80 || code > 0x9f)
    })
    .join('')
}

export function validateParts(parts: string[]): Array<{ index: number; len: number }> {
  const out: Array<{ index: number; len: number }> = []
  parts.forEach((p, index) => {
    const len = tweetLength(p)
    if (len > 280 || p.trim().length === 0) out.push({ index, len })
  })
  return out
}

export async function postThread(
  parts: string[],
  creds: XCreds
): Promise<{ firstUrl: string; count: number; username: string }> {
  const client = new TwitterApi(creds)
  const username = (await client.v2.me()).data.username
  let replyTo: string | undefined
  let firstId: string | undefined
  for (let i = 0; i < parts.length; i++) {
    try {
      const res = await client.v2.tweet(
        parts[i]!,
        replyTo ? { reply: { in_reply_to_tweet_id: replyTo } } : {}
      )
      replyTo = res.data.id
      if (!firstId) firstId = res.data.id
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new ThreadPostError(`Failed at part ${i + 1}/${parts.length}: ${msg}`, i, replyTo)
    }
  }
  return {
    firstUrl: `https://x.com/${username}/status/${firstId}`,
    count: parts.length,
    username,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- post-thread` → Expected: PASS. Then `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/x/post-thread.ts test/post-thread.test.ts
git commit -m "feat: port X posting core (tweetLength, sanitize, validateParts, postThread)"
```

---

### Task 3: Notion blocks ↔ parts converters

**Files:**
- Create: `src/notion/blocks.ts`
- Test: `test/blocks.test.ts`

**Interfaces:**
- Produces: `partsToBlocks`, `blocksToParts`, `NotionBlock` (see Shared types). These are pure and the heart of the page-body, divider-split design.

- [ ] **Step 1: Write the failing test** — `test/blocks.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { partsToBlocks, blocksToParts, type NotionBlock } from '../src/notion/blocks.js'

describe('partsToBlocks', () => {
  it('interleaves a divider between parts (N parts -> 2N-1 blocks)', () => {
    const blocks = partsToBlocks(['one', 'two', 'three']) as Array<{ type: string }>
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'divider', 'paragraph', 'divider', 'paragraph'])
  })
  it('puts the part text in the paragraph rich_text', () => {
    const blocks = partsToBlocks(['hello']) as Array<{ paragraph?: { rich_text: Array<{ text: { content: string } }> } }>
    expect(blocks[0]!.paragraph!.rich_text[0]!.text.content).toBe('hello')
  })
})

describe('blocksToParts', () => {
  const para = (t: string): NotionBlock => ({ type: 'paragraph', paragraph: { rich_text: [{ plain_text: t }] } })
  const divider: NotionBlock = { type: 'divider' }

  it('splits on dividers and joins paragraph text', () => {
    expect(blocksToParts([para('one'), divider, para('two')])).toEqual(['one', 'two'])
  })
  it('joins consecutive paragraphs in one part with newlines', () => {
    expect(blocksToParts([para('line 1'), para('line 2'), divider, para('next')])).toEqual(['line 1\nline 2', 'next'])
  })
  it('trims and drops empty parts', () => {
    expect(blocksToParts([para('  a  '), divider, para('   '), divider, para('b')])).toEqual(['a', 'b'])
  })
  it('round-trips with partsToBlocks for plain parts', () => {
    const parts = ['alpha', 'beta', 'gamma']
    const blocks = partsToBlocks(parts) as NotionBlock[]
    // partsToBlocks emits {text:{content}}; normalize to plain_text for the read side
    const normalized: NotionBlock[] = blocks.map((b) =>
      b.type === 'divider'
        ? { type: 'divider' }
        : { type: 'paragraph', paragraph: { rich_text: [{ plain_text: (b as any).paragraph.rich_text[0].text.content }] } }
    )
    expect(blocksToParts(normalized)).toEqual(parts)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- blocks` → Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/notion/blocks.ts`**

```ts
export interface NotionBlock {
  type: string
  paragraph?: { rich_text: Array<{ plain_text?: string }> }
}

function paragraph(content: string): unknown {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: [{ type: 'text', text: { content } }] },
  }
}

const DIVIDER = { object: 'block', type: 'divider', divider: {} }

// One paragraph block per part (internal newlines preserved in the content),
// a divider block between parts — the divider is the page-body equivalent of `---`.
export function partsToBlocks(parts: string[]): unknown[] {
  const out: unknown[] = []
  parts.forEach((part, i) => {
    if (i > 0) out.push(DIVIDER)
    out.push(paragraph(part))
  })
  return out
}

// Split the child blocks on dividers; within a group, join paragraph text with
// newlines; trim and drop empty groups. Inverse of partsToBlocks.
export function blocksToParts(blocks: NotionBlock[]): string[] {
  const groups: string[][] = [[]]
  for (const b of blocks) {
    if (b.type === 'divider') {
      groups.push([])
    } else if (b.type === 'paragraph' && b.paragraph) {
      const text = b.paragraph.rich_text.map((r) => r.plain_text ?? '').join('')
      groups[groups.length - 1]!.push(text)
    }
  }
  return groups.map((g) => g.join('\n').trim()).filter((s) => s.length > 0)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- blocks` → Expected: PASS. `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/notion/blocks.ts test/blocks.test.ts
git commit -m "feat: parts<->Notion-blocks converters (divider-split)"
```

---

### Task 4: Notion client + Social Queue schema + setup script

**Files:**
- Create: `src/notion/client.ts`, `src/scripts/setup-db.ts`
- Test: `test/notion.test.ts` (covers the pure `socialQueueSchema`)

**Interfaces:**
- Consumes: `partsToBlocks` (Task 3), `Config` (Task 1).
- Produces: `createNotionClient`, `socialQueueSchema`, `NotionClient`, `NotionRow`, `ProposedRowInput` (see Shared types).

The HTTP methods mirror `blog-site/scripts/agent/lib/notion.ts` (same headers, same `2025-09-03` data-source split). Only the pure `socialQueueSchema` is unit-tested; the HTTP paths are exercised in Task 11's manual integration gate.

- [ ] **Step 1: Write the failing test** — `test/notion.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { socialQueueSchema } from '../src/notion/client.js'

describe('socialQueueSchema', () => {
  const schema = socialQueueSchema() as Record<string, any>

  it('defines a title property named Title', () => {
    expect(schema.Title).toEqual({ title: {} })
  })
  it('defines Status with the lifecycle options', () => {
    const names = schema.Status.select.options.map((o: any) => o.name)
    expect(names).toEqual(['Proposed', 'Approved', 'Posting', 'Posted', 'Needs fix', 'Rejected'])
  })
  it('defines Platform, Type, Source selects and url props', () => {
    expect(schema.Platform.select.options.map((o: any) => o.name)).toContain('X')
    expect(schema.Type.select.options.map((o: any) => o.name)).toEqual(['Thread', 'Standalone'])
    expect(schema.Source.select.options.map((o: any) => o.name)).toEqual(['Blog post', 'Seed', 'Dev activity', 'Original take'])
    expect(schema['Source link']).toEqual({ url: {} })
    expect(schema['Posted URL']).toEqual({ url: {} })
    expect(schema.Error).toEqual({ rich_text: {} })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- notion` → Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/notion/client.ts`**

```ts
import { partsToBlocks } from './blocks.js'
import type { NotionBlock } from './blocks.js'

const BASE = 'https://api.notion.com/v1'
const VERSION = '2025-09-03'

export interface NotionRow { id: string; status: string; postedUrl: string | null; type: string; source: string }
export interface ProposedRowInput {
  title: string; type: 'Thread' | 'Standalone'; source: string; sourceLink: string; parts: string[]
}
export interface NotionClient {
  resolveDataSourceId(): Promise<string>
  createDatabase(parentPageId: string, title: string, properties: Record<string, unknown>): Promise<{ dbId: string; dataSourceId: string }>
  queryByStatus(status: string): Promise<NotionRow[]>
  getRow(rowId: string): Promise<NotionRow>
  getBlockChildren(pageId: string): Promise<NotionBlock[]>
  createProposedRow(input: ProposedRowInput): Promise<string>
  patchStatus(rowId: string, status: string, extra?: { postedUrl?: string; error?: string }): Promise<void>
  addComment(pageId: string, text: string): Promise<void>
}

function sel(...names: string[]) {
  return { select: { options: names.map((name) => ({ name })) } }
}

export function socialQueueSchema(): Record<string, unknown> {
  return {
    Title: { title: {} },
    Status: sel('Proposed', 'Approved', 'Posting', 'Posted', 'Needs fix', 'Rejected'),
    Platform: sel('X'),
    Type: sel('Thread', 'Standalone'),
    Source: sel('Blog post', 'Seed', 'Dev activity', 'Original take'),
    'Source link': { url: {} },
    'Posted URL': { url: {} },
    Error: { rich_text: {} },
  }
}

function selectName(page: any, prop: string): string {
  return page?.properties?.[prop]?.select?.name ?? ''
}
function urlVal(page: any, prop: string): string | null {
  return page?.properties?.[prop]?.url ?? null
}

function pageToRow(page: any): NotionRow {
  return {
    id: page.id,
    status: selectName(page, 'Status'),
    postedUrl: urlVal(page, 'Posted URL'),
    type: selectName(page, 'Type'),
    source: selectName(page, 'Source'),
  }
}

export function createNotionClient(token: string, dbId: string): NotionClient {
  const headers = {
    Authorization: `Bearer ${token}`,
    'Notion-Version': VERSION,
    'Content-Type': 'application/json',
  }

  async function fetchJson(path: string, init?: RequestInit): Promise<any> {
    const res = await fetch(`${BASE}${path}`, { ...init, headers })
    if (!res.ok) throw new Error(`Notion ${init?.method ?? 'GET'} ${path} → ${res.status}: ${await res.text()}`)
    return res.status === 200 ? res.json() : {}
  }

  let cachedDsId: string | undefined

  const client: NotionClient = {
    async resolveDataSourceId() {
      if (cachedDsId) return cachedDsId
      const db = await fetchJson(`/databases/${dbId}`)
      cachedDsId = db.data_sources[0].id as string
      return cachedDsId
    },

    async createDatabase(parentPageId, title, properties) {
      const body = {
        parent: { type: 'page_id', page_id: parentPageId },
        title: [{ type: 'text', text: { content: title } }],
        initial_data_source: { properties },
      }
      const db = await fetchJson('/databases', { method: 'POST', body: JSON.stringify(body) })
      return { dbId: db.id, dataSourceId: db.data_sources[0].id }
    },

    async queryByStatus(status) {
      const dsId = await client.resolveDataSourceId()
      const rows: NotionRow[] = []
      let cursor: string | undefined
      do {
        const data = await fetchJson(`/data_sources/${dsId}/query`, {
          method: 'POST',
          body: JSON.stringify({
            filter: { property: 'Status', select: { equals: status } },
            start_cursor: cursor,
            page_size: 100,
          }),
        })
        rows.push(...data.results.map(pageToRow))
        cursor = data.has_more ? data.next_cursor : undefined
      } while (cursor)
      return rows
    },

    async getRow(rowId) {
      return pageToRow(await fetchJson(`/pages/${rowId}`))
    },

    async getBlockChildren(pageId) {
      const blocks: NotionBlock[] = []
      let cursor: string | undefined
      do {
        const q = cursor ? `?start_cursor=${cursor}&page_size=100` : `?page_size=100`
        const data = await fetchJson(`/blocks/${pageId}/children${q}`)
        blocks.push(...data.results)
        cursor = data.has_more ? data.next_cursor : undefined
      } while (cursor)
      return blocks
    },

    async createProposedRow(input) {
      const dsId = await client.resolveDataSourceId()
      const body = {
        parent: { type: 'data_source_id', data_source_id: dsId },
        properties: {
          Title: { title: [{ type: 'text', text: { content: input.title } }] },
          Status: { select: { name: 'Proposed' } },
          Platform: { select: { name: 'X' } },
          Type: { select: { name: input.type } },
          Source: { select: { name: input.source } },
          'Source link': { url: input.sourceLink },
        },
        children: partsToBlocks(input.parts),
      }
      const page = await fetchJson('/pages', { method: 'POST', body: JSON.stringify(body) })
      return page.id as string
    },

    async patchStatus(rowId, status, extra) {
      const properties: Record<string, unknown> = { Status: { select: { name: status } } }
      if (extra?.postedUrl) properties['Posted URL'] = { url: extra.postedUrl }
      if (extra?.error) properties.Error = { rich_text: [{ type: 'text', text: { content: extra.error } }] }
      await fetchJson(`/pages/${rowId}`, { method: 'PATCH', body: JSON.stringify({ properties }) })
    },

    async addComment(pageId, text) {
      await fetchJson('/comments', {
        method: 'POST',
        body: JSON.stringify({ parent: { page_id: pageId }, rich_text: [{ type: 'text', text: { content: text } }] }),
      })
    },
  }
  return client
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- notion` → Expected: PASS. `npm run typecheck` → clean.

- [ ] **Step 5: Write the setup script** — `src/scripts/setup-db.ts`

```ts
import 'dotenv/config'
import { loadConfig } from '../config.js'
import { createNotionClient, socialQueueSchema } from '../notion/client.js'

async function main() {
  const config = loadConfig(process.env)
  if (!config.parentPageId) throw new Error('Set NOTION_PARENT_PAGE_ID to the page the Social Queue DB should live under.')
  // dbId is unknown until creation; pass a placeholder — createDatabase doesn't use it.
  const notion = createNotionClient(config.notionToken, 'unused')
  const { dbId, dataSourceId } = await notion.createDatabase(config.parentPageId, 'Social Queue', socialQueueSchema())
  console.log('Created Social Queue database.')
  console.log(`  SOCIAL_QUEUE_DB_ID=${dbId}`)
  console.log(`  (data source id: ${dataSourceId})`)
  console.log('Put SOCIAL_QUEUE_DB_ID in your .env, then share the DB with your Notion integration.')
}

main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 6: Commit**

```bash
git add src/notion/client.ts src/scripts/setup-db.ts test/notion.test.ts
git commit -m "feat: Notion client + Social Queue schema + setup script"
```

---

### Task 5: Voice fetch + thread drafter + SOCIAL-STYLE.md

**Files:**
- Create: `src/draft/voice.ts`, `src/draft/draft-thread.ts`, `SOCIAL-STYLE.md`
- Test: `test/draft.test.ts`

**Interfaces:**
- Consumes: `validateParts` (Task 2).
- Produces: `parseJsonResponse`, `draftThreadFromPost`, `PostInput`, `DraftResult`, `RunPrompt`, and `runPrompt` (real SDK wrapper) + `fetchEditorial` (see Shared types).

`draftThreadFromPost` takes an injected `RunPrompt` so it is testable without calling the model; `src/draft/draft-thread.ts` also exports the real `runPrompt`.

- [ ] **Step 1: Author `SOCIAL-STYLE.md`** (the X format contract the drafter loads)

```markdown
# SOCIAL-STYLE — X (Twitter) format contract

The voice is defined in blog-site `docs/EDITORIAL.md`, fetched at draft time.
This file adds the X-specific format rules. The drafter follows what is written
here; it does not invent rules.

## Threads
- Each part ≤ 280 characters. Hard limit (free tier, no Premium).
- Part 1 is the hook: it must promise a payoff and stand alone if someone only reads it.
- 6–10 parts for a story-style thread; fewer is fine. Never pad to hit a number.
- One idea per part. Let a part breathe; don't cram two beats into 280 chars.
- Close the loop in the last part — a takeaway or a forward-looking line, not a CTA.
- Link (the blog post) goes in the LAST part, not the first (first-tweet links suppress reach).

## Voice carryover from EDITORIAL
- First person, plain, specific. Real numbers and real moments over abstractions.
- Vary sentence length. Some short lines are fine; not a wall of staccato.
- No exclamation points. No hashtag spam — at most one genuinely relevant tag, usually none.
- No "in this thread 🧵", no "let's dive in", no engagement-bait questions.

## Standalone
- A single ≤280-char post that captures one sharp observation from the source.
- Same voice; no thread scaffolding.
```

- [ ] **Step 2: Implement `src/draft/voice.ts`** (fetch + cache EDITORIAL.md, append SOCIAL-STYLE.md)

```ts
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const EDITORIAL_RAW = 'https://raw.githubusercontent.com/shariqh/blog-site/main/docs/EDITORIAL.md'

let cache: { docs: string; at: number } | undefined
const TTL_MS = 60 * 60 * 1000 // 1h

export async function fetchEditorial(): Promise<string> {
  const res = await fetch(EDITORIAL_RAW)
  if (!res.ok) throw new Error(`Could not fetch EDITORIAL.md: ${res.status}`)
  return res.text()
}

export async function styleDocs(): Promise<string> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.docs
  const editorial = await fetchEditorial()
  const here = dirname(fileURLToPath(import.meta.url))
  const social = await readFile(join(here, '../../SOCIAL-STYLE.md'), 'utf8')
  const docs = `# EDITORIAL.md\n\n${editorial}\n\n---\n\n${social}`
  cache = { docs, at: Date.now() }
  return docs
}
```

- [ ] **Step 3: Write the failing test** — `test/draft.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { parseJsonResponse, draftThreadFromPost, type RunPrompt } from '../src/draft/draft-thread.js'

describe('parseJsonResponse', () => {
  it('parses a fenced json block', () => {
    expect(parseJsonResponse('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })
  it('parses bare json', () => {
    expect(parseJsonResponse('{"b":2}')).toEqual({ b: 2 })
  })
})

describe('draftThreadFromPost', () => {
  const post = { title: 'T', url: 'https://shariq.dev/blog/t', body: 'body' }

  it('returns the parsed thread + standalone', async () => {
    const run: RunPrompt = async () => JSON.stringify({ thread: ['one', 'two'], standalone: 'solo' })
    const r = await draftThreadFromPost(post, 'docs', run)
    expect(r.thread).toEqual(['one', 'two'])
    expect(r.standalone).toBe('solo')
  })

  it('retries once when a part is over 280, then accepts the retry', async () => {
    const tooLong = 'x'.repeat(290)
    let call = 0
    const run: RunPrompt = async () => {
      call++
      return call === 1
        ? JSON.stringify({ thread: [tooLong], standalone: 's' })
        : JSON.stringify({ thread: ['fixed'], standalone: 's' })
    }
    const r = await draftThreadFromPost(post, 'docs', run)
    expect(call).toBe(2)
    expect(r.thread).toEqual(['fixed'])
  })

  it('returns the over-limit draft after one retry (so the caller can flag Needs fix)', async () => {
    const tooLong = 'y'.repeat(300)
    const run: RunPrompt = async () => JSON.stringify({ thread: [tooLong], standalone: 's' })
    const r = await draftThreadFromPost(post, 'docs', run)
    expect(r.thread[0]!.length).toBe(300) // caller validates + flags
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- draft` → Expected: FAIL — module not found.

- [ ] **Step 5: Implement `src/draft/draft-thread.ts`**

```ts
import { query } from '@anthropic-ai/claude-agent-sdk'
import { validateParts } from '../x/post-thread.js'

export interface PostInput { title: string; url: string; body: string }
export interface DraftResult { thread: string[]; standalone: string }
export type RunPrompt = (opts: { systemPrompt: string; userPrompt: string }) => Promise<string>

export function parseJsonResponse<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)```/)
  const raw = fenced ? fenced[1]! : text
  return JSON.parse(raw.trim()) as T
}

// Real SDK wrapper (mirrors blog-site/scripts/agent/lib/claude.ts).
export const runPrompt: RunPrompt = async ({ systemPrompt, userPrompt }) => {
  const result = query({
    prompt: userPrompt,
    options: { systemPrompt, model: 'claude-sonnet-4-6', tools: [], maxTurns: 1 },
  })
  let text = ''
  for await (const message of result) {
    if (message.type === 'assistant' && Array.isArray(message.message.content)) {
      for (const block of message.message.content) if (block.type === 'text') text += block.text
    }
  }
  return text.trim()
}

function userMessage(post: PostInput, note = ''): string {
  return [
    `Draft an X thread and one standalone post promoting this blog post.`,
    `Title: ${post.title}`,
    `URL: ${post.url}`,
    `Put the URL only in the LAST thread part.`,
    note,
    ``,
    `Return ONLY JSON: {"thread": string[], "standalone": string}. Each thread part and the standalone must be <= 280 characters.`,
    ``,
    `--- POST BODY ---`,
    post.body,
  ].filter(Boolean).join('\n')
}

export async function draftThreadFromPost(
  post: PostInput,
  styleDocs: string,
  run: RunPrompt
): Promise<DraftResult> {
  const systemPrompt = `You write social posts in the author's voice. Follow these contracts exactly:\n\n${styleDocs}`
  let out = parseJsonResponse<DraftResult>(await run({ systemPrompt, userPrompt: userMessage(post) }))
  const bad = validateParts(out.thread)
  if (bad.length > 0) {
    const which = bad.map((b) => `part ${b.index + 1} is ${b.len} chars`).join('; ')
    out = parseJsonResponse<DraftResult>(
      await run({ systemPrompt, userPrompt: userMessage(post, `Your previous draft had over-limit parts (${which}). Rewrite so EVERY part is <= 280 characters.`) })
    )
  }
  return out
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- draft` → Expected: PASS (4 tests). `npm run typecheck` → clean.

- [ ] **Step 7: Commit**

```bash
git add SOCIAL-STYLE.md src/draft/voice.ts src/draft/draft-thread.ts test/draft.test.ts
git commit -m "feat: thread drafter (Claude SDK), voice fetch, SOCIAL-STYLE contract"
```

---

### Task 6: GitHub webhook signature verification

**Files:**
- Create: `src/webhooks/github-verify.ts`
- Test: `test/github-verify.test.ts`

**Interfaces:**
- Produces: `verifyGithubSignature(rawBody, signatureHeader, secret)` (see Shared types).

- [ ] **Step 1: Write the failing test** — `test/github-verify.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import { verifyGithubSignature } from '../src/webhooks/github-verify.js'

const secret = 'topsecret'
const body = '{"hello":"world"}'
const good = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')

describe('verifyGithubSignature', () => {
  it('accepts a correct signature', () => {
    expect(verifyGithubSignature(body, good, secret)).toBe(true)
  })
  it('rejects a wrong signature', () => {
    expect(verifyGithubSignature(body, 'sha256=deadbeef', secret)).toBe(false)
  })
  it('rejects a missing header', () => {
    expect(verifyGithubSignature(body, undefined, secret)).toBe(false)
  })
  it('rejects when the body was tampered', () => {
    expect(verifyGithubSignature('{"hello":"mars"}', good, secret)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- github-verify` → Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/webhooks/github-verify.ts`**

```ts
import crypto from 'node:crypto'

export function verifyGithubSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!signatureHeader) return false
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  const a = Buffer.from(signatureHeader)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- github-verify` → Expected: PASS. `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/webhooks/github-verify.ts test/github-verify.test.ts
git commit -m "feat: GitHub webhook HMAC verification"
```

---

### Task 7: Propose leg — extract posts + blog-push handler

**Files:**
- Create: `src/webhooks/blog-hook.ts`
- Test: `test/blog-hook.test.ts`

**Interfaces:**
- Consumes: `Deps`, `NotionClient.createProposedRow`, `draftThreadFromPost`, `PostInput`.
- Produces: `extractPublishedPosts(payload)`, `handleBlogPush(payload, deps)`.

- [ ] **Step 1: Write the failing test** — `test/blog-hook.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest'
import { extractPublishedPosts, handleBlogPush } from '../src/webhooks/blog-hook.js'

const payload = {
  commits: [
    { added: ['src/content/writing/new-post.mdx'], modified: [], removed: [] },
    { added: ['src/components/X.astro'], modified: ['src/content/writing/edited.mdx'], removed: [] },
  ],
}

describe('extractPublishedPosts', () => {
  it('collects added + modified .mdx under src/content/writing, dedup by slug', () => {
    expect(extractPublishedPosts(payload)).toEqual([
      { slug: 'new-post', path: 'src/content/writing/new-post.mdx' },
      { slug: 'edited', path: 'src/content/writing/edited.mdx' },
    ])
  })
  it('ignores non-content files', () => {
    const p = { commits: [{ added: ['README.md'], modified: [], removed: [] }] }
    expect(extractPublishedPosts(p)).toEqual([])
  })
})

describe('handleBlogPush', () => {
  it('drafts and creates a Proposed Thread + Standalone row per new post', async () => {
    const createProposedRow = vi.fn(async () => 'row-id')
    const deps: any = {
      config: { blogBaseUrl: 'https://shariq.dev' },
      notion: { createProposedRow },
      draft: async () => ({ thread: ['a', 'b'], standalone: 'solo' }),
      fetchPostMdx: async () => '---\ntitle: New Post\n---\nhi',
    }
    await handleBlogPush({ commits: [{ added: ['src/content/writing/new-post.mdx'], modified: [], removed: [] }] }, deps)
    expect(createProposedRow).toHaveBeenCalledTimes(2) // thread + standalone
    const types = createProposedRow.mock.calls.map((c) => c[0].type)
    expect(types).toEqual(['Thread', 'Standalone'])
    expect(createProposedRow.mock.calls[0][0].sourceLink).toBe('https://shariq.dev/blog/new-post')
  })

  it('skips posts whose frontmatter has draft: true', async () => {
    const createProposedRow = vi.fn(async () => 'row-id')
    const deps: any = {
      config: { blogBaseUrl: 'https://shariq.dev' },
      notion: { createProposedRow },
      draft: async () => ({ thread: ['a'], standalone: 'solo' }),
      fetchPostMdx: async () => '---\ntitle: Draft\ndraft: true\n---\nhi',
    }
    await handleBlogPush({ commits: [{ added: ['src/content/writing/d.mdx'], modified: [], removed: [] }] }, deps)
    expect(createProposedRow).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- blog-hook` → Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/webhooks/blog-hook.ts`**

```ts
import type { Deps } from '../app.js'

const CONTENT_RE = /^src\/content\/writing\/(.+)\.mdx?$/

export function extractPublishedPosts(payload: unknown): Array<{ slug: string; path: string }> {
  const commits = (payload as { commits?: Array<{ added?: string[]; modified?: string[] }> }).commits ?? []
  const seen = new Set<string>()
  const out: Array<{ slug: string; path: string }> = []
  for (const c of commits) {
    for (const path of [...(c.added ?? []), ...(c.modified ?? [])]) {
      const m = CONTENT_RE.exec(path)
      if (!m) continue
      const slug = m[1]!.split('/').pop()!
      if (seen.has(slug)) continue
      seen.add(slug)
      out.push({ slug, path })
    }
  }
  return out
}

function isDraft(mdx: string): boolean {
  const fm = mdx.match(/^---\n([\s\S]*?)\n---/)
  return !!fm && /(^|\n)draft:\s*true\b/.test(fm[1]!)
}

function titleOf(mdx: string, slug: string): string {
  const fm = mdx.match(/^---\n([\s\S]*?)\n---/)
  const t = fm?.[1]?.match(/(^|\n)title:\s*["']?(.+?)["']?\s*(\n|$)/)
  return t?.[2] ?? slug
}

export async function handleBlogPush(payload: unknown, deps: Deps): Promise<void> {
  for (const { slug, path } of extractPublishedPosts(payload)) {
    try {
      const mdx = await deps.fetchPostMdx(path)
      if (isDraft(mdx)) continue
      const url = `${deps.config.blogBaseUrl}/blog/${slug}`
      const title = titleOf(mdx, slug)
      const result = await deps.draft({ title, url, body: mdx })
      await deps.notion.createProposedRow({ title, type: 'Thread', source: 'Blog post', sourceLink: url, parts: result.thread })
      await deps.notion.createProposedRow({ title, type: 'Standalone', source: 'Blog post', sourceLink: url, parts: [result.standalone] })
      console.log(`[blog-hook] proposed thread + standalone for ${slug}`)
    } catch (err) {
      console.error(`[blog-hook] failed for ${slug}:`, err instanceof Error ? err.message : err)
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- blog-hook` → Expected: PASS (4 tests). `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/webhooks/blog-hook.ts test/blog-hook.test.ts
git commit -m "feat: propose leg — extract posts + draft to Proposed rows"
```

---

### Task 8: Post leg — approval handler (validate + post + idempotency)

**Files:**
- Create: `src/webhooks/notion-hook.ts`
- Test: `test/notion-hook.test.ts`

**Interfaces:**
- Consumes: `Deps`, `NotionClient` (getRow/getBlockChildren/patchStatus/addComment), `blocksToParts`, `validateParts`, `postThread`, `ThreadPostError`.
- Produces: `handleApproval(rowId, deps)`.

- [ ] **Step 1: Write the failing test** — `test/notion-hook.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest'
import { handleApproval } from '../src/webhooks/notion-hook.js'
import { ThreadPostError } from '../src/x/post-thread.js'

function makeDeps(over: Partial<any> = {}) {
  const para = (t: string) => ({ type: 'paragraph', paragraph: { rich_text: [{ plain_text: t }] } })
  const notion = {
    getRow: vi.fn(async () => ({ id: 'r', status: 'Approved', postedUrl: null, type: 'Thread', source: 'Blog post' })),
    getBlockChildren: vi.fn(async () => [para('one'), { type: 'divider' }, para('two')]),
    patchStatus: vi.fn(async () => {}),
    addComment: vi.fn(async () => {}),
  }
  const postThread = vi.fn(async () => ({ firstUrl: 'https://x.com/u/status/1', count: 2, username: 'u' }))
  return {
    deps: { config: { x: {} }, notion, postThread, ...over } as any,
    notion, postThread,
  }
}

describe('handleApproval', () => {
  it('posts the thread and writes Posted + URL', async () => {
    const { deps, notion, postThread } = makeDeps()
    await handleApproval('r', deps)
    expect(notion.patchStatus).toHaveBeenCalledWith('r', 'Posting')
    expect(postThread).toHaveBeenCalledWith(['one', 'two'], deps.config.x)
    expect(notion.patchStatus).toHaveBeenLastCalledWith('r', 'Posted', { postedUrl: 'https://x.com/u/status/1' })
  })

  it('is idempotent — a row already Posted does nothing', async () => {
    const { deps, notion, postThread } = makeDeps()
    notion.getRow.mockResolvedValueOnce({ id: 'r', status: 'Posted', postedUrl: 'x', type: 'Thread', source: 'Blog post' })
    await handleApproval('r', deps)
    expect(postThread).not.toHaveBeenCalled()
    expect(notion.patchStatus).not.toHaveBeenCalled()
  })

  it('flags Needs fix when a part is over 280, without posting', async () => {
    const { deps, notion, postThread } = makeDeps()
    const big = 'x'.repeat(290)
    notion.getBlockChildren.mockResolvedValueOnce([{ type: 'paragraph', paragraph: { rich_text: [{ plain_text: big }] } }])
    await handleApproval('r', deps)
    expect(postThread).not.toHaveBeenCalled()
    expect(notion.patchStatus).toHaveBeenLastCalledWith('r', 'Needs fix', expect.objectContaining({ error: expect.stringContaining('290') }))
  })

  it('on a mid-thread failure writes Needs fix with the partial-post detail', async () => {
    const { deps, notion, postThread } = makeDeps()
    postThread.mockRejectedValueOnce(new ThreadPostError('boom', 1, 'tweet-1'))
    await handleApproval('r', deps)
    expect(notion.patchStatus).toHaveBeenLastCalledWith('r', 'Needs fix', expect.objectContaining({ error: expect.stringContaining('tweet-1') }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- notion-hook` → Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/webhooks/notion-hook.ts`**

```ts
import type { Deps } from '../app.js'
import { blocksToParts } from '../notion/blocks.js'
import { validateParts, ThreadPostError } from '../x/post-thread.js'

export async function handleApproval(rowId: string, deps: Deps): Promise<void> {
  const row = await deps.notion.getRow(rowId)

  // Idempotency: only act on a row that is genuinely Approved and not yet posted.
  if (row.status !== 'Approved' || row.postedUrl) {
    console.log(`[notion-hook] ${rowId} status=${row.status} postedUrl=${row.postedUrl} — skipping`)
    return
  }

  // Interim lock so a concurrent fire bails at the guard above.
  await deps.notion.patchStatus(rowId, 'Posting')

  const blocks = await deps.notion.getBlockChildren(rowId)
  const parts = blocksToParts(blocks)

  if (parts.length === 0) {
    await deps.notion.patchStatus(rowId, 'Needs fix', { error: 'No content found in the row body.' })
    return
  }

  const bad = validateParts(parts)
  if (bad.length > 0) {
    const error = bad.map((b) => `part ${b.index + 1} is ${b.len} chars`).join('; ')
    await deps.notion.patchStatus(rowId, 'Needs fix', { error })
    await deps.notion.addComment(rowId, `Not posted — ${error}. Fix and re-approve.`)
    return
  }

  try {
    const { firstUrl } = await deps.postThread(parts, deps.config.x)
    await deps.notion.patchStatus(rowId, 'Posted', { postedUrl: firstUrl })
    await deps.notion.addComment(rowId, `Posted: ${firstUrl}`)
  } catch (err) {
    const detail =
      err instanceof ThreadPostError
        ? `${err.message}. Posted ${err.posted} part(s); finish manually by replying to ${err.lastTweetId}.`
        : err instanceof Error
          ? err.message
          : String(err)
    await deps.notion.patchStatus(rowId, 'Needs fix', { error: detail })
    await deps.notion.addComment(rowId, `Posting failed — ${detail}`)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- notion-hook` → Expected: PASS (4 tests). `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/webhooks/notion-hook.ts test/notion-hook.test.ts
git commit -m "feat: post leg — approval handler with validation + idempotency"
```

---

### Task 9: Hono app + server wiring

**Files:**
- Create: `src/app.ts`, `src/server.ts`
- Test: `test/app.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `createApp(deps)`, `Deps` (see Shared types).

Routes:
- `GET /health` → `{ ok: true }`
- `POST /hook/blog` → verify HMAC over the **raw** body, then `handleBlogPush`
- `POST /hook/notion/:token` → check token, read `{ rowId }` (or Notion automation payload), then `handleApproval`
- `POST /hook/blog/replay` → `{ sha }` manual re-trigger (fetch that commit's payload is out of scope; replay accepts a posted-style `{ commits }` body for manual use), guarded by the Notion token

- [ ] **Step 1: Write the failing test** — `test/app.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest'
import crypto from 'node:crypto'
import { createApp, type Deps } from '../src/app.js'

const config: any = {
  githubWebhookSecret: 'gh', notionWebhookToken: 'tok', x: {}, blogBaseUrl: 'https://shariq.dev',
}
function baseDeps(over: Partial<Deps> = {}): Deps {
  return {
    config,
    notion: { createProposedRow: vi.fn(async () => 'r'), getRow: vi.fn(), getBlockChildren: vi.fn(), patchStatus: vi.fn(), addComment: vi.fn() } as any,
    postThread: vi.fn(),
    draft: vi.fn(async () => ({ thread: ['a'], standalone: 's' })),
    fetchPostMdx: vi.fn(async () => '---\ntitle: T\n---\nhi'),
    styleDocs: vi.fn(async () => 'docs'),
    ...over,
  } as Deps
}

describe('app', () => {
  it('GET /health → 200', async () => {
    const res = await createApp(baseDeps()).request('/health')
    expect(res.status).toBe(200)
  })

  it('POST /hook/blog rejects a bad signature with 401', async () => {
    const res = await createApp(baseDeps()).request('/hook/blog', {
      method: 'POST', headers: { 'x-hub-signature-256': 'sha256=nope' }, body: '{}',
    })
    expect(res.status).toBe(401)
  })

  it('POST /hook/blog accepts a valid signature and 202s', async () => {
    const body = JSON.stringify({ commits: [] })
    const sig = 'sha256=' + crypto.createHmac('sha256', 'gh').update(body).digest('hex')
    const res = await createApp(baseDeps()).request('/hook/blog', {
      method: 'POST', headers: { 'x-hub-signature-256': sig, 'content-type': 'application/json' }, body,
    })
    expect(res.status).toBe(202)
  })

  it('POST /hook/notion/:token rejects a wrong token with 401', async () => {
    const res = await createApp(baseDeps()).request('/hook/notion/wrong', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rowId: 'r' }),
    })
    expect(res.status).toBe(401)
  })

  it('POST /hook/notion/:token with the right token 202s', async () => {
    const res = await createApp(baseDeps()).request('/hook/notion/tok', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rowId: 'r' }),
    })
    expect(res.status).toBe(202)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- app` → Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/app.ts`**

```ts
import { Hono } from 'hono'
import type { Config } from './config.js'
import type { NotionClient } from './notion/client.js'
import type { PostInput, DraftResult } from './draft/draft-thread.js'
import { verifyGithubSignature } from './webhooks/github-verify.js'
import { handleBlogPush } from './webhooks/blog-hook.js'
import { handleApproval } from './webhooks/notion-hook.js'
import { postThread } from './x/post-thread.js'

export interface Deps {
  config: Config
  notion: NotionClient
  postThread: typeof postThread
  draft: (post: PostInput) => Promise<DraftResult>
  fetchPostMdx: (path: string) => Promise<string>
  styleDocs: () => Promise<string>
}

export function createApp(deps: Deps): Hono {
  const app = new Hono()

  app.get('/health', (c) => c.json({ ok: true }))

  app.post('/hook/blog', async (c) => {
    const raw = await c.req.text()
    if (!verifyGithubSignature(raw, c.req.header('x-hub-signature-256'), deps.config.githubWebhookSecret)) {
      return c.json({ error: 'bad signature' }, 401)
    }
    const payload = JSON.parse(raw)
    // Background: ack fast, draft asynchronously in the long-running container.
    void handleBlogPush(payload, deps).catch((e) => console.error('[blog-hook]', e))
    return c.json({ accepted: true }, 202)
  })

  app.post('/hook/notion/:token', async (c) => {
    if (c.req.param('token') !== deps.config.notionWebhookToken) return c.json({ error: 'forbidden' }, 401)
    const body = (await c.req.json().catch(() => ({}))) as { rowId?: string; data?: { id?: string } }
    const rowId = body.rowId ?? body.data?.id
    if (!rowId) return c.json({ error: 'no rowId' }, 400)
    void handleApproval(rowId, deps).catch((e) => console.error('[notion-hook]', e))
    return c.json({ accepted: true }, 202)
  })

  app.post('/hook/blog/replay', async (c) => {
    if (c.req.header('x-replay-token') !== deps.config.notionWebhookToken) return c.json({ error: 'forbidden' }, 401)
    const payload = await c.req.json().catch(() => ({}))
    void handleBlogPush(payload, deps).catch((e) => console.error('[blog-replay]', e))
    return c.json({ accepted: true }, 202)
  })

  return app
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- app` → Expected: PASS (5 tests). `npm run typecheck` → clean.

- [ ] **Step 5: Implement `src/server.ts`** (wires real deps)

```ts
import 'dotenv/config'
import { serve } from '@hono/node-server'
import { loadConfig } from './config.js'
import { createApp } from './app.js'
import { createNotionClient } from './notion/client.js'
import { postThread } from './x/post-thread.js'
import { draftThreadFromPost, runPrompt } from './draft/draft-thread.js'
import { styleDocs } from './draft/voice.js'

const config = loadConfig(process.env)
const notion = createNotionClient(config.notionToken, config.socialQueueDbId)

async function fetchPostMdx(path: string): Promise<string> {
  const url = `https://raw.githubusercontent.com/${config.blogRepo}/main/${path}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`)
  return res.text()
}

const app = createApp({
  config,
  notion,
  postThread,
  draft: async (post) => draftThreadFromPost(post, await styleDocs(), runPrompt),
  fetchPostMdx,
  styleDocs,
})

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`social-agent listening on :${info.port}`)
})
```

- [ ] **Step 6: Run the server once to smoke it**

Run (with a `.env` present): `npm run dev` then in another shell `curl -s localhost:8080/health`
Expected: `{"ok":true}`. Stop the server.

- [ ] **Step 7: Commit**

```bash
git add src/app.ts src/server.ts test/app.test.ts
git commit -m "feat: Hono app + server wiring (health + two webhook legs)"
```

---

### Task 10: Containerize + Cloudflare Tunnel + deploy docs

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `.env.tpl`, `README.md`

**Interfaces:** none (infra). Deliverable verified by `docker compose config` parsing and a local container health check.

- [ ] **Step 1: Create `Dockerfile`**

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm", "run", "start"]
```

Note: `start` runs `tsx src/server.ts`, so `tsx` must be available at runtime — keep it in `dependencies` for the container, or change the Dockerfile to `npm ci` (with dev) . Decision: move `tsx`, `typescript`, `@types/node` are dev-only for typecheck; `tsx` is needed at runtime. **Move `tsx` to `dependencies`** in `package.json` (edit Task 1's file) so `--omit=dev` still ships it.

- [ ] **Step 2: Move `tsx` to dependencies**

Edit `package.json`: cut `"tsx": "^4.19.2"` from `devDependencies`, add it to `dependencies`. Run `npm install` then `npm test` to confirm nothing broke. Commit is folded into Step 6.

- [ ] **Step 3: Create `docker-compose.yml`**

```yaml
services:
  app:
    build: .
    restart: unless-stopped
    env_file: .env
    expose:
      - "8080"          # compose network only; NOT published to the host

  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      - TUNNEL_TOKEN=${TUNNEL_TOKEN}
    depends_on:
      - app
```

In the Cloudflare Zero Trust dashboard, the tunnel's public hostname (e.g. `social-hooks.shariq.dev`) routes to `http://app:8080` (the compose service name + container port).

- [ ] **Step 4: Create `.env.tpl`** (1Password references; `op inject` renders `.env`)

```
X_API_KEY="op://dev-env-vars/X API/api_key"
X_API_SECRET="op://dev-env-vars/X API/api_secret"
X_ACCESS_TOKEN="op://dev-env-vars/X API/access_token"
X_ACCESS_SECRET="op://dev-env-vars/X API/access_secret"
NOTION_TOKEN="op://dev-env-vars/Notion social-agent/token"
SOCIAL_QUEUE_DB_ID="op://dev-env-vars/Notion social-agent/db_id"
CLAUDE_CODE_OAUTH_TOKEN="op://dev-env-vars/Claude/oauth_token"
GITHUB_WEBHOOK_SECRET="op://dev-env-vars/social-agent/github_webhook_secret"
NOTION_WEBHOOK_TOKEN="op://dev-env-vars/social-agent/notion_webhook_token"
BLOG_REPO="shariqh/blog-site"
BLOG_BASE_URL="https://shariq.dev"
TUNNEL_TOKEN="op://dev-env-vars/social-agent/cloudflare_tunnel_token"
PORT="8080"
```

- [ ] **Step 5: Create `README.md`** (the runbook)

````markdown
# social-agent

Drafts X threads/standalones from your work, queues them in a Notion Social
Queue for approval, and posts on approval. Event-driven; runs on ubi-prod
behind a Cloudflare Tunnel. Design: blog-site `docs/superpowers/specs/2026-06-25-social-agent-design.md`.

## One-time setup

1. **X app** — developer.x.com → app → User auth = Read+Write, OAuth 1.0a →
   generate Access Token & Secret. Store the four values in 1Password (`dev-env-vars` → "X API").
2. **Notion integration** — create an internal integration; copy its token to
   1Password ("Notion social-agent"/token).
3. **Social Queue DB** — set `NOTION_PARENT_PAGE_ID` in a local `.env`, then
   `op inject -i .env.tpl -o .env && npm run setup:db`. Put the printed
   `SOCIAL_QUEUE_DB_ID` into 1Password, and **share the DB with the integration** in Notion.
4. **Cloudflare Tunnel** — create a named tunnel; copy its token to 1Password
   ("social-agent"/cloudflare_tunnel_token). Map public hostname
   `social-hooks.shariq.dev` → `http://app:8080`.
5. **Webhook secrets** — generate two random secrets (`openssl rand -hex 32`) for
   `GITHUB_WEBHOOK_SECRET` and `NOTION_WEBHOOK_TOKEN`; store both in 1Password.
6. **GitHub webhook** — on `shariqh/blog-site`: Settings → Webhooks → add
   `https://social-hooks.shariq.dev/hook/blog`, content-type JSON, secret =
   `GITHUB_WEBHOOK_SECRET`, event = push.
7. **Notion automation** — on the Social Queue DB, add an automation: when
   `Status` becomes `Approved`, send a webhook to
   `https://social-hooks.shariq.dev/hook/notion/<NOTION_WEBHOOK_TOKEN>`.

## Run on ubi-prod

```sh
op inject -i .env.tpl -o .env      # render secrets from 1Password
docker compose up -d --build
docker compose logs -f
```

## Local dev

```sh
op inject -i .env.tpl -o .env   # or hand-fill .env from .env.example
npm run dev                     # http://localhost:8080/health
cloudflared tunnel --url http://localhost:8080   # ephemeral public URL for testing webhooks
```
````

- [ ] **Step 6: Verify + commit**

Run: `docker compose config` (expected: prints the merged config, no error) and `npm run typecheck` (clean).

```bash
git add Dockerfile docker-compose.yml .env.tpl README.md package.json
git commit -m "feat: containerize + Cloudflare Tunnel compose + deploy runbook"
```

---

### Task 11: Deploy + end-to-end verification (webhook-vs-poll decision)

**Files:** none (operational). This is the manual gate the spec calls out. No code unless the Notion automation proves unreliable (then add the poll fallback below).

- [ ] **Step 1: Provision** — run the README one-time setup (steps 1–7). Confirm `npm run setup:db` created the DB and it's shared with the integration.

- [ ] **Step 2: Deploy** — `op inject -i .env.tpl -o .env && docker compose up -d --build` on ubi-prod. `curl https://social-hooks.shariq.dev/health` → `{"ok":true}`.

- [ ] **Step 3: Propose-leg test** — publish (or re-push) a small post under `src/content/writing/` on `blog-site` `main`. Within a few seconds, confirm a `Proposed` Thread row + a `Standalone` row appear in the Social Queue, with the parts as divider-split blocks in each row's body. If nothing appears, check `docker compose logs app` for the `[blog-hook]` line and the GitHub webhook "Recent Deliveries" panel.

- [ ] **Step 4: Post-leg test** — open the Thread row, eyeball the parts, set `Status=Approved`. Confirm the Notion automation fired (Notion shows automation history) and the row flips `Posting → Posted` with a `Posted URL`, and the thread is live on X. **Test against a throwaway X app/account first** if you want a dry run.

- [ ] **Step 5: The decision** — if the Notion automation reliably hits `/hook/notion`, you're done. If it's flaky or unsupported on your plan, add the poll fallback:

  Create `src/poll.ts`:
  ```ts
  import type { Deps } from './app.js'
  import { handleApproval } from './webhooks/notion-hook.js'

  export function startApprovalPoll(deps: Deps, intervalMs = 60_000): NodeJS.Timeout {
    return setInterval(async () => {
      try {
        for (const row of await deps.notion.queryByStatus('Approved')) {
          if (!row.postedUrl) await handleApproval(row.id, deps)
        }
      } catch (e) {
        console.error('[poll]', e instanceof Error ? e.message : e)
      }
    }, intervalMs)
  }
  ```
  Wire it in `src/server.ts` behind an env flag `POST_LEG_MODE=poll`:
  ```ts
  if (process.env.POST_LEG_MODE === 'poll') {
    const { startApprovalPoll } = await import('./poll.js')
    startApprovalPoll({ config, notion, postThread, draft: async (p) => draftThreadFromPost(p, await styleDocs(), runPrompt), fetchPostMdx, styleDocs })
    console.log('[post-leg] polling every 60s for Approved rows')
  }
  ```
  `handleApproval`'s idempotency guard makes the poll safe even if the webhook also fires. Commit:
  ```bash
  git add src/poll.ts src/server.ts
  git commit -m "feat: optional 60s poll fallback for the post leg"
  ```

- [ ] **Step 6: Update CLAUDE.md / notes** with the chosen post-leg mode and the public hostname, and record `SOCIAL_QUEUE_DB_ID` is in 1Password. Phase 1 is done when a published post round-trips to a live X thread through one human approval.

---

## Self-Review

**1. Spec coverage** — every spec section maps to a task:
- Notion Social Queue schema + page-body divider layout → Tasks 3, 4.
- Propose leg `/hook/blog` (HMAC, find new post, draft, Proposed row) → Tasks 6, 7, 9.
- Post leg `/hook/notion` (token, re-fetch, idempotency, validate, post, write-back, Needs fix) → Tasks 8, 9.
- Reuse post-thread core + EDITORIAL voice → Tasks 2, 5.
- Container + Cloudflare Tunnel + 1Password secrets → Tasks 10, 1 (`.env.tpl`, config).
- The Notion-webhook risk + poll fallback → Task 11 Step 5.
- Error/idempotency table → Tasks 8 (Needs fix, lock), 7 (per-post try/catch).
- 280 limit, t.co wrapping → Task 2.
Phase 2/3 (seeds, dev-activity, takes, LinkedIn) are intentionally out of this plan.

**2. Placeholder scan** — no "TBD"/"add error handling here"; every code step carries full code. The only deferred-by-design code is Task 11's poll, which is fully written.

**3. Type consistency** — `Deps`, `NotionClient`, `XCreds`, `PostInput`, `DraftResult`, `ThreadPostError`, `NotionRow`, `ProposedRowInput` are defined once in "Shared types" and used identically across Tasks 7/8/9. `postThread` returns `{ firstUrl, count, username }` everywhere; `validateParts` returns `Array<{ index, len }>` in Tasks 2/5/8; `blocksToParts`/`partsToBlocks` signatures match across Tasks 3/4/8. `draft` (in `Deps`) is `(post) => Promise<DraftResult>`, matching `server.ts`'s wiring around `draftThreadFromPost(post, styleDocs, runPrompt)`.

One intentional Task-1→Task-10 follow-up: `tsx` starts as a devDep in Task 1 and is moved to `dependencies` in Task 10 Step 2 so the production image (`--omit=dev`) still has it.
