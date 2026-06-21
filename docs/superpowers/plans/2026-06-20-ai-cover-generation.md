# AI Cover Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate an on-brand cover illustration for every post via Azure OpenAI `gpt-image-1` — auto-styled per bucket, guarded against text leaks, written to `/public/static/images/blog/<slug>/cover.png` and wired into `hero` frontmatter — runnable by the Plan B agent (new posts) and by hand (CLI + full-archive backfill).

**Architecture:** A small, pure prompt module builds the `gpt-image-1` prompt (brand spine + style spine + per-post subject). A thin Azure client generates the image; a vision check (`hasText`) rejects glyph leaks and the orchestrator retries up to 3× before falling back to the branded OG template. A frontmatter writer points `hero.image` at the new PNG. Three entry points share the orchestrator: a CLI, a backfill script, and a hook in the agent's draft step.

**Tech Stack:** Node ≥24 + TypeScript (ESM, strict), `tsx` runner, Azure OpenAI (`gpt-image-1` images API + `gpt-4o-mini` vision), `gray-matter` (frontmatter), Vitest (unit). Reuses `src/lib/og/` from the OG plan for the deterministic fallback.

**Spec:** `docs/superpowers/specs/2026-06-20-og-images-and-ai-cover-generation-design.md` — Subsystem A (§5), shared fallback (§7), schema (§8), backfill (§9).

**DEPENDENCY — land the OG plan first:** this plan reuses `renderOg` and `fallbackTemplate`/`loadOgFonts` from `src/lib/og/` (created by `docs/superpowers/plans/2026-06-20-og-image-generation.md`). Do not start this plan until the OG plan is merged/green. The fallback cover is produced by the OG `renderOg` at 1200×630 (a fine cover — it cover-crops on the 3:2 card and 16:9 header); we deliberately do NOT re-parameterize the OG template to 1536×1024, to keep the two subsystems decoupled. The rare fallback path (gpt-image-1 fails the text check 3×) accepts that size.

## Global Constraints

- **Image model:** Azure OpenAI `gpt-image-1`. Endpoint `POST {AZURE_OPENAI_ENDPOINT}/openai/deployments/{AZURE_OPENAI_IMAGE_DEPLOYMENT}/images/generations?api-version=2025-04-01-preview`, header `api-key`, body `{ prompt, n: 1, size: '1536x1024', quality: 'high', output_format: 'png' }`, response `data[0].b64_json`. Resource already provisioned: RG `rg-blog-og`, account `shariq-blog-img-eus2` (eastus2), deployment `gpt-image-1` (memory `project_azure_cover_gen`).
- **Vision guard:** Azure `gpt-4o-mini` chat-completions (`api-version=2024-10-21`, vision input). Default deployment name `gpt-4o-mini`.
- **Two house styles:** `line-art` (flat editorial line-art) and `conceptual` (rich conceptual illustration), interchangeable per post. Bucket map: engineering/ai/process → `line-art`; leadership/notes → `conceptual`. Frontmatter/CLI `style` override wins.
- **Brand palette (exact hex, baked into every prompt):** ink `#15233a`, ochre `#d49a3a`, terracotta `#b04a3a`, paper `#f3e8d2`. No text/letters/words/numbers/logos/faces. 3:2 with empty negative space in the LEFT third for a title overlay.
- **Text-leak guard:** strengthened no-text negative → `hasText` vision check → regenerate ≤3 attempts → branded-template fallback. Never ship a leaked-text cover unattended.
- **Output:** `/public/static/images/blog/<slug>/cover.png`; set `hero.image`/`alt`/`prompt`/`style`. Existing manual banner files are left on disk (only `hero.image` is repointed).
- **No live Azure in tests.** Every test mocks `fetch`/the client. Real generation happens only via the manual CLI/backfill and the agent run.
- **Non-fatal in the agent.** A cover failure must not abort a draft.
- **Build independence.** A normal `npm run build`/dev without Azure creds MUST still work — cover config is read lazily and only throws when generation is actually invoked. Do NOT add Azure vars to the agent's `required()` CONFIG.
- **Code style:** `.ts` files — no semicolons, single quotes, 2-space indent (match `src/lib/cover.ts`, `scripts/agent/lib/*`).

---

### Task 1: Prompt module (style selection + prompt builder)

**Files:**
- Create: `scripts/cover/prompt.ts`
- Test: `scripts/cover/prompt.test.ts`

**Interfaces:**
- Consumes: `resolveBucket(tags)` from `src/lib/buckets.ts`.
- Produces:
  - `type CoverStyle = 'line-art' | 'conceptual'`
  - `selectStyle(tags: string[]): CoverStyle`
  - `buildCoverPrompt(input: { title: string; summary?: string; tags: string[]; style?: CoverStyle }): { prompt: string; style: CoverStyle }`
  - exported constants `BRAND`, `A_LINE`, `B_CONCEPT`

- [ ] **Step 1: Write the failing test**

Create `scripts/cover/prompt.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { selectStyle, buildCoverPrompt, BRAND } from './prompt'

describe('selectStyle', () => {
  it('maps technical buckets to line-art', () => {
    expect(selectStyle(['engineering'])).toBe('line-art')
    expect(selectStyle(['ai'])).toBe('line-art')
    expect(selectStyle(['docker'])).toBe('line-art') // engineering bucket
  })
  it('maps human/narrative buckets to conceptual', () => {
    expect(selectStyle(['insights'])).toBe('conceptual') // leadership bucket
    expect(selectStyle(['unmapped'])).toBe('conceptual') // notes bucket
  })
})

describe('buildCoverPrompt', () => {
  it('uses the bucket default style when none is given', () => {
    const { style } = buildCoverPrompt({ title: 'A CI/CD Flow', tags: ['architecture'] })
    expect(style).toBe('line-art')
  })
  it('honors an explicit style override', () => {
    const { style, prompt } = buildCoverPrompt({ title: 'X', tags: ['ai'], style: 'conceptual' })
    expect(style).toBe('conceptual')
    expect(prompt).toContain('conceptual editorial illustration')
  })
  it('includes the brand spine, the title, and the summary in the subject', () => {
    const { prompt } = buildCoverPrompt({
      title: 'Managing Your Lows',
      summary: 'How to handle the bad days.',
      tags: ['insights'],
    })
    expect(prompt).toContain(BRAND)
    expect(prompt).toContain('Managing Your Lows')
    expect(prompt).toContain('How to handle the bad days.')
  })
  it('forbids text rendering explicitly', () => {
    const { prompt } = buildCoverPrompt({ title: 'X', tags: [] })
    expect(prompt.toLowerCase()).toContain('no text')
    expect(prompt.toLowerCase()).toContain('glyphs')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/cover/prompt.test.ts`
Expected: FAIL — `Cannot find module './prompt'`.

- [ ] **Step 3: Implement the prompt module**

Create `scripts/cover/prompt.ts`:
```ts
import { resolveBucket } from '../../src/lib/buckets'

export type CoverStyle = 'line-art' | 'conceptual'

// Promoted verbatim from the validated spike (design-samples/cover-spike2.mjs),
// with a strengthened no-text clause appended to BRAND.
export const BRAND = `Strict, limited color palette ONLY: deep navy ink (#15233a) as the dominant base, warm ochre/mustard (#d49a3a), muted terracotta red (#b04a3a), and soft cream/paper (#f3e8d2). Warm, calm, intelligent, premium editorial feel. Absolutely NO text, letters, words, numbers, logos, watermarks, UI screenshots, or realistic human faces. Do not render any glyphs, captions, labels, signage, or typography of any kind anywhere in the image. Wide 3:2 landscape composition with deliberate empty negative space in the LEFT third so a title can be overlaid later.`

export const A_LINE = `Style: flat abstract shapes combined with loose hand-drawn single-weight line-art (thin, confident strokes), minimal and geometric — a vintage mid-century editorial spot illustration. Flat color fills, subtle paper grain, no gradients, no 3D, no glossy realism.`

export const B_CONCEPT = `Style: rich conceptual editorial illustration, like a Wired or New Yorker feature spread, with one clear central metaphor. Painterly flat shading, depth, texture, sophisticated. Constrained to the palette.`

// engineering/ai/process → line-art; leadership/notes → conceptual.
const STYLE_BY_BUCKET: Record<string, CoverStyle> = {
  engineering: 'line-art',
  ai: 'line-art',
  process: 'line-art',
  leadership: 'conceptual',
  notes: 'conceptual',
}

export function selectStyle(tags: string[]): CoverStyle {
  return STYLE_BY_BUCKET[resolveBucket(tags).key] ?? 'conceptual'
}

export function buildCoverPrompt(input: {
  title: string
  summary?: string
  tags: string[]
  style?: CoverStyle
}): { prompt: string; style: CoverStyle } {
  const style = input.style ?? selectStyle(input.tags)
  const spine = style === 'line-art' ? A_LINE : B_CONCEPT
  const subject = input.summary
    ? `Concept: ${input.title}. ${input.summary}`
    : `Concept: ${input.title}.`
  return { prompt: `${spine}\n\n${subject}\n\n${BRAND}`, style }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/cover/prompt.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/cover/prompt.ts scripts/cover/prompt.test.ts
git commit -m "feat(cover): prompt module — brand/style spines + bucket style map"
```

---

### Task 2: Cover config + env example

**Files:**
- Create: `scripts/cover/config.ts`
- Modify: `.env.local.example`
- Test: `scripts/cover/config.test.ts`

**Interfaces:**
- Produces:
  - `getImageConfig(): { endpoint: string; key: string; deployment: string }` — throws a clear error if endpoint/key are unset.
  - `getVisionConfig(): { endpoint: string; key: string; deployment: string }` — same.

**Why a separate config:** the agent's `scripts/agent/lib/config.ts` calls `required()` for Notion/YouTube tokens at import. Cover-gen must run (and its modules must import) without those, so it gets its own lazy config that only reads `AZURE_*` and only throws when generation is actually invoked.

- [ ] **Step 1: Write the failing test**

Create `scripts/cover/config.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getImageConfig, getVisionConfig } from './config'

const SAVED = { ...process.env }
beforeEach(() => {
  delete process.env.AZURE_OPENAI_ENDPOINT
  delete process.env.AZURE_OPENAI_KEY
  delete process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT
  delete process.env.AZURE_OPENAI_VISION_DEPLOYMENT
})
afterEach(() => {
  process.env = { ...SAVED }
})

describe('getImageConfig', () => {
  it('throws a clear error when creds are missing', () => {
    expect(() => getImageConfig()).toThrow(/AZURE_OPENAI_ENDPOINT/)
  })
  it('returns config with the default deployment when set', () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://x.openai.azure.com'
    process.env.AZURE_OPENAI_KEY = 'k'
    expect(getImageConfig()).toEqual({
      endpoint: 'https://x.openai.azure.com',
      key: 'k',
      deployment: 'gpt-image-1',
    })
  })
})

describe('getVisionConfig', () => {
  it('defaults the vision deployment to gpt-4o-mini', () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://x.openai.azure.com'
    process.env.AZURE_OPENAI_KEY = 'k'
    expect(getVisionConfig().deployment).toBe('gpt-4o-mini')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/cover/config.test.ts`
Expected: FAIL — `Cannot find module './config'`.

- [ ] **Step 3: Implement the config**

Create `scripts/cover/config.ts`:
```ts
import 'dotenv/config'

function trimmed(key: string): string {
  const v = process.env[key]
  return v && v.length > 0 ? v : ''
}

// Strip a single trailing slash so callers can always join paths with a leading slash.
function endpoint(): string {
  return trimmed('AZURE_OPENAI_ENDPOINT').replace(/\/$/, '')
}

function requireCreds(): { endpoint: string; key: string } {
  const ep = endpoint()
  const key = trimmed('AZURE_OPENAI_KEY')
  if (!ep || !key) {
    throw new Error(
      'Cover generation needs AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_KEY (set them in .env.local or the environment).'
    )
  }
  return { endpoint: ep, key }
}

export function getImageConfig(): { endpoint: string; key: string; deployment: string } {
  const { endpoint, key } = requireCreds()
  return { endpoint, key, deployment: trimmed('AZURE_OPENAI_IMAGE_DEPLOYMENT') || 'gpt-image-1' }
}

export function getVisionConfig(): { endpoint: string; key: string; deployment: string } {
  const { endpoint, key } = requireCreds()
  return { endpoint, key, deployment: trimmed('AZURE_OPENAI_VISION_DEPLOYMENT') || 'gpt-4o-mini' }
}
```

- [ ] **Step 4: Append to `.env.local.example`**

Add to the end of `.env.local.example`:
```
# Azure OpenAI for AI cover generation (optional — only needed to run gen:cover / gen:cover:all)
# Resource: rg-blog-og / shariq-blog-img-eus2 (eastus2)
AZURE_OPENAI_ENDPOINT=https://shariq-blog-img-eus2.openai.azure.com
AZURE_OPENAI_KEY=
AZURE_OPENAI_IMAGE_DEPLOYMENT=gpt-image-1
AZURE_OPENAI_VISION_DEPLOYMENT=gpt-4o-mini
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run scripts/cover/config.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add scripts/cover/config.ts scripts/cover/config.test.ts .env.local.example
git commit -m "feat(cover): lazy Azure config + env example"
```

---

### Task 3: Azure image client

**Files:**
- Create: `scripts/cover/azure.ts`
- Test: `scripts/cover/azure.test.ts`

**Interfaces:**
- Consumes: `getImageConfig()` from `./config`.
- Produces: `generateImage(prompt: string): Promise<Buffer>` — the decoded PNG bytes. Throws on a non-OK response or a missing image.

- [ ] **Step 1: Write the failing test**

Create `scripts/cover/azure.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateImage } from './azure'

const SAVED = { ...process.env }
beforeEach(() => {
  process.env.AZURE_OPENAI_ENDPOINT = 'https://x.openai.azure.com'
  process.env.AZURE_OPENAI_KEY = 'k'
  process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT = 'gpt-image-1'
})
afterEach(() => {
  process.env = { ...SAVED }
  vi.restoreAllMocks()
})

const PNG_B64 = Buffer.from('hello-png').toString('base64')

describe('generateImage', () => {
  it('POSTs to the images endpoint and returns decoded PNG bytes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ b64_json: PNG_B64 }] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const buf = await generateImage('a prompt')
    expect(buf.toString()).toBe('hello-png')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(
      'https://x.openai.azure.com/openai/deployments/gpt-image-1/images/generations?api-version=2025-04-01-preview'
    )
    expect(init.headers['api-key']).toBe('k')
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({ prompt: 'a prompt', n: 1, size: '1536x1024', quality: 'high', output_format: 'png' })
  })

  it('throws on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => 'rate limited' }))
    await expect(generateImage('p')).rejects.toThrow(/429/)
  })

  it('throws when no image is returned', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{}] }) }))
    await expect(generateImage('p')).rejects.toThrow(/no image/i)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/cover/azure.test.ts`
Expected: FAIL — `Cannot find module './azure'`.

- [ ] **Step 3: Implement the client**

Create `scripts/cover/azure.ts`:
```ts
import { getImageConfig } from './config'

const API_VERSION = '2025-04-01-preview'

export async function generateImage(prompt: string): Promise<Buffer> {
  const { endpoint, key, deployment } = getImageConfig()
  const url = `${endpoint}/openai/deployments/${deployment}/images/generations?api-version=${API_VERSION}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({
      prompt,
      n: 1,
      size: '1536x1024',
      quality: 'high',
      output_format: 'png',
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`gpt-image-1 request failed: ${res.status} ${detail.slice(0, 300)}`)
  }
  const json = (await res.json()) as { data?: Array<{ b64_json?: string }> }
  const b64 = json.data?.[0]?.b64_json
  if (!b64) throw new Error('gpt-image-1 returned no image')
  return Buffer.from(b64, 'base64')
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/cover/azure.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/cover/azure.ts scripts/cover/azure.test.ts
git commit -m "feat(cover): Azure gpt-image-1 client"
```

---

### Task 4: Text-leak vision check

**Files:**
- Create: `scripts/cover/text-check.ts`
- Test: `scripts/cover/text-check.test.ts`

**Interfaces:**
- Consumes: `getVisionConfig()` from `./config`.
- Produces: `hasText(png: Buffer): Promise<boolean>` — true if the image appears to contain readable text/letters/words/numbers. On an API error, returns `true` (fail-safe: treat an unverifiable image as if it has text, forcing a retry/fallback rather than shipping a possible leak).

- [ ] **Step 1: Write the failing test**

Create `scripts/cover/text-check.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { hasText } from './text-check'

beforeEach(() => {
  process.env.AZURE_OPENAI_ENDPOINT = 'https://x.openai.azure.com'
  process.env.AZURE_OPENAI_KEY = 'k'
  process.env.AZURE_OPENAI_VISION_DEPLOYMENT = 'gpt-4o-mini'
})
afterEach(() => vi.restoreAllMocks())

function reply(content: string) {
  return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) }
}

describe('hasText', () => {
  it('returns true when the model answers yes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply('YES')))
    expect(await hasText(Buffer.from('img'))).toBe(true)
  })
  it('returns false when the model answers no', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply('no')))
    expect(await hasText(Buffer.from('img'))).toBe(false)
  })
  it('sends the image as a base64 data URL in the vision message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply('no'))
    vi.stubGlobal('fetch', fetchMock)
    await hasText(Buffer.from('img'))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    const imagePart = body.messages[0].content.find((p: any) => p.type === 'image_url')
    expect(imagePart.image_url.url).toMatch(/^data:image\/png;base64,/)
  })
  it('fails safe to true on an API error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'err' }))
    expect(await hasText(Buffer.from('img'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/cover/text-check.test.ts`
Expected: FAIL — `Cannot find module './text-check'`.

- [ ] **Step 3: Implement the vision check**

Create `scripts/cover/text-check.ts`:
```ts
import { getVisionConfig } from './config'

const API_VERSION = '2024-10-21'
const QUESTION =
  'Does this image contain any readable text, letters, words, or numbers? Answer with only "yes" or "no".'

// Provider-agnostic in spirit: the agent MAY swap this for its in-process Claude
// vision. The default uses an Azure gpt-4o-mini chat-completions vision call.
export async function hasText(png: Buffer): Promise<boolean> {
  const { endpoint, key, deployment } = getVisionConfig()
  const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${API_VERSION}`
  const dataUrl = `data:image/png;base64,${png.toString('base64')}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        max_tokens: 3,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: QUESTION },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    })
    if (!res.ok) return true
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const answer = (json.choices?.[0]?.message?.content ?? '').trim().toLowerCase()
    return answer.startsWith('y')
  } catch {
    return true
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/cover/text-check.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/cover/text-check.ts scripts/cover/text-check.test.ts
git commit -m "feat(cover): vision text-leak check (fail-safe)"
```

---

### Task 5: Branded fallback cover (reuse OG renderer)

**Files:**
- Create: `scripts/cover/fallback.ts`
- Test: `scripts/cover/fallback.test.ts`

**Interfaces:**
- Consumes: `renderOg` from `src/lib/og/render.ts`; `resolveBucket` from `src/lib/buckets.ts` (both created/exported by the OG plan).
- Produces: `renderFallbackCover(args: { title: string; tags: string[] }): Promise<Buffer>` — a 1200×630 branded PNG (forces the OG fallback template by passing `cover: null`).

- [ ] **Step 1: Write the failing test**

Create `scripts/cover/fallback.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/lib/og/render', () => ({
  renderOg: vi.fn(async (data: any) => {
    // Capture the OgData the fallback passes through.
    ;(globalThis as any).__lastOg = data
    return Buffer.from('fake-png')
  }),
}))

import { renderFallbackCover } from './fallback'

describe('renderFallbackCover', () => {
  it('renders via renderOg with no cover and a bucket eyebrow', async () => {
    const buf = await renderFallbackCover({ title: 'Managing Your Lows', tags: ['insights'] })
    expect(buf.toString()).toBe('fake-png')
    const og = (globalThis as any).__lastOg
    expect(og.cover).toBeNull()
    expect(og.title).toBe('Managing Your Lows')
    expect(og.eyebrow).toBe('Leadership · shariq.dev')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/cover/fallback.test.ts`
Expected: FAIL — `Cannot find module './fallback'`.

- [ ] **Step 3: Implement the fallback**

Create `scripts/cover/fallback.ts`:
```ts
import { renderOg } from '../../src/lib/og/render'
import { resolveBucket } from '../../src/lib/buckets'

// The deterministic fallback when gpt-image-1 keeps leaking text: reuse the OG
// branded template (cover: null forces it). 1200×630 is a fine cover — it
// cover-crops on the 3:2 card and 16:9 header.
export async function renderFallbackCover(args: { title: string; tags: string[] }): Promise<Buffer> {
  const bucket = resolveBucket(args.tags)
  return renderOg({
    title: args.title,
    eyebrow: `${bucket.label} · shariq.dev`,
    dateLabel: '',
    readingLabel: '',
    cover: null,
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/cover/fallback.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add scripts/cover/fallback.ts scripts/cover/fallback.test.ts
git commit -m "feat(cover): branded fallback cover via OG renderer"
```

---

### Task 6: Frontmatter writer (`hero.style` schema + setHero)

**Files:**
- Modify: `src/lib/schemas.ts:32-43` (add `style` to `hero`)
- Modify: `src/lib/schemas.test.ts` (add a case)
- Create: `scripts/cover/frontmatter.ts`
- Test: `scripts/cover/frontmatter.test.ts`

**Interfaces:**
- Produces:
  - `type HeroPatch = { image: string; alt: string; prompt: string; style: 'line-art' | 'conceptual' }`
  - `setHero(mdx: string, hero: HeroPatch): string` — returns the MDX with `hero` set/replaced.
  - `setHeroInFile(filePath: string, hero: HeroPatch): void` — read/transform/write.

- [ ] **Step 1: Add `style` to the hero schema**

In `src/lib/schemas.ts`, inside the `hero` object (after the `titleStyle` line, currently line 41), add:
```ts
      style: z.enum(['line-art', 'conceptual']).optional(),
```

- [ ] **Step 2: Add a schema test**

In `src/lib/schemas.test.ts`, add a test asserting a valid `hero.style` parses and an invalid one fails. Append inside the existing describe block (match the file's existing import of `writingSchema`):
```ts
  it('accepts a hero.style of line-art or conceptual', () => {
    const base = { title: 'T', date: '2026-01-01', summary: 's' }
    expect(
      writingSchema.safeParse({ ...base, hero: { image: '/static/images/x.png', alt: 'a', style: 'line-art' } })
        .success
    ).toBe(true)
    expect(
      writingSchema.safeParse({ ...base, hero: { image: '/static/images/x.png', alt: 'a', style: 'bogus' } }).success
    ).toBe(false)
  })
```
(If `src/lib/schemas.test.ts` does not exist or uses a different structure, create/adjust to its existing pattern — it imports `writingSchema` from `./schemas`.)

- [ ] **Step 3: Write the failing test for the writer**

Create `scripts/cover/frontmatter.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import matter from 'gray-matter'
import { setHero } from './frontmatter'

const MDX = `---
title: "A Post"
date: '2026-06-08'
tags: ['ai']
summary: "A summary."
draft: false
---

# Body here

Some prose.
`

describe('setHero', () => {
  it('adds a hero block with image/alt/prompt/style and preserves body + other fields', () => {
    const out = setHero(MDX, {
      image: '/static/images/blog/a-post/cover.png',
      alt: 'Cover for A Post',
      prompt: 'a prompt',
      style: 'line-art',
    })
    const parsed = matter(out)
    expect(parsed.data.hero).toEqual({
      image: '/static/images/blog/a-post/cover.png',
      alt: 'Cover for A Post',
      prompt: 'a prompt',
      style: 'line-art',
    })
    expect(parsed.data.title).toBe('A Post')
    expect(parsed.data.tags).toEqual(['ai'])
    expect(parsed.content).toContain('# Body here')
  })

  it('replaces an existing hero rather than duplicating it', () => {
    const withHero = setHero(MDX, { image: '/static/images/blog/a/old.png', alt: 'old', prompt: 'p', style: 'conceptual' })
    const replaced = setHero(withHero, { image: '/static/images/blog/a/new.png', alt: 'new', prompt: 'p2', style: 'line-art' })
    const parsed = matter(replaced)
    expect(parsed.data.hero.image).toBe('/static/images/blog/a/new.png')
    expect(parsed.data.hero.style).toBe('line-art')
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run scripts/cover/frontmatter.test.ts`
Expected: FAIL — `Cannot find module './frontmatter'`.

- [ ] **Step 5: Implement the writer**

Create `scripts/cover/frontmatter.ts`:
```ts
import { readFileSync, writeFileSync } from 'node:fs'
import matter from 'gray-matter'

export type HeroPatch = {
  image: string
  alt: string
  prompt: string
  style: 'line-art' | 'conceptual'
}

// Parse, set the hero object, re-serialize. gray-matter re-dumps the YAML, so
// frontmatter formatting may normalize (quotes/key order) — acceptable churn,
// reviewed in the backfill PR.
export function setHero(mdx: string, hero: HeroPatch): string {
  const parsed = matter(mdx)
  const data = { ...parsed.data, hero: { ...hero } }
  return matter.stringify(parsed.content, data)
}

export function setHeroInFile(filePath: string, hero: HeroPatch): void {
  const mdx = readFileSync(filePath, 'utf8')
  writeFileSync(filePath, setHero(mdx, hero))
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run scripts/cover/frontmatter.test.ts src/lib/schemas.test.ts`
Expected: PASS (writer round-trips + schema accepts/rejects `style`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/schemas.ts src/lib/schemas.test.ts scripts/cover/frontmatter.ts scripts/cover/frontmatter.test.ts
git commit -m "feat(cover): hero.style schema + frontmatter writer"
```

---

### Task 7: Orchestrator (`generateCover`)

**Files:**
- Create: `scripts/cover/generate-cover.ts`
- Test: `scripts/cover/generate-cover.test.ts`

**Interfaces:**
- Consumes: `buildCoverPrompt`/`CoverStyle` (Task 1), `generateImage` (Task 3), `hasText` (Task 4), `renderFallbackCover` (Task 5).
- Produces:
  - `type CoverResult = { imagePath: string; alt: string; prompt: string; style: CoverStyle; attempts: number; usedFallback: boolean }`
  - `type CoverDeps = { generateImage: (p: string) => Promise<Buffer>; hasText: (b: Buffer) => Promise<boolean>; renderFallback: (a: { title: string; tags: string[] }) => Promise<Buffer>; writeImage: (absPath: string, data: Buffer) => void }`
  - `generateCover(input: { slug: string; title: string; summary?: string; tags: string[]; style?: CoverStyle; publicDir?: string }, deps?: Partial<CoverDeps>): Promise<CoverResult>`

- [ ] **Step 1: Write the failing test**

Create `scripts/cover/generate-cover.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { generateCover } from './generate-cover'

function deps(over: Record<string, unknown> = {}) {
  return {
    generateImage: vi.fn(async () => Buffer.from('gen')),
    hasText: vi.fn(async () => false),
    renderFallback: vi.fn(async () => Buffer.from('fallback')),
    writeImage: vi.fn(),
    ...over,
  }
}

const input = { slug: 'a-post', title: 'A Post', summary: 's', tags: ['ai'] }

describe('generateCover', () => {
  it('writes the generated image on the first clean attempt', async () => {
    const d = deps()
    const r = await generateCover(input, d)
    expect(d.generateImage).toHaveBeenCalledTimes(1)
    expect(d.writeImage).toHaveBeenCalledWith(
      'public/static/images/blog/a-post/cover.png',
      Buffer.from('gen')
    )
    expect(r).toMatchObject({
      imagePath: '/static/images/blog/a-post/cover.png',
      style: 'line-art',
      attempts: 1,
      usedFallback: false,
    })
    expect(r.alt).toContain('A Post')
    expect(r.prompt).toContain('Concept: A Post. s')
  })

  it('retries when text is detected, then succeeds', async () => {
    const hasText = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    const d = deps({ hasText })
    const r = await generateCover(input, d)
    expect(d.generateImage).toHaveBeenCalledTimes(2)
    expect(r.attempts).toBe(2)
    expect(r.usedFallback).toBe(false)
  })

  it('falls back to the branded cover after 3 failed attempts', async () => {
    const d = deps({ hasText: vi.fn(async () => true) })
    const r = await generateCover(input, d)
    expect(d.generateImage).toHaveBeenCalledTimes(3)
    expect(d.renderFallback).toHaveBeenCalledTimes(1)
    expect(d.writeImage).toHaveBeenCalledWith(
      'public/static/images/blog/a-post/cover.png',
      Buffer.from('fallback')
    )
    expect(r).toMatchObject({ attempts: 3, usedFallback: true })
  })

  it('honors an explicit style override', async () => {
    const r = await generateCover({ ...input, style: 'conceptual' }, deps())
    expect(r.style).toBe('conceptual')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/cover/generate-cover.test.ts`
Expected: FAIL — `Cannot find module './generate-cover'`.

- [ ] **Step 3: Implement the orchestrator**

Create `scripts/cover/generate-cover.ts`:
```ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { buildCoverPrompt, type CoverStyle } from './prompt'
import { generateImage as defaultGenerate } from './azure'
import { hasText as defaultHasText } from './text-check'
import { renderFallbackCover } from './fallback'

const MAX_ATTEMPTS = 3

export type CoverResult = {
  imagePath: string
  alt: string
  prompt: string
  style: CoverStyle
  attempts: number
  usedFallback: boolean
}

export type CoverDeps = {
  generateImage: (prompt: string) => Promise<Buffer>
  hasText: (png: Buffer) => Promise<boolean>
  renderFallback: (args: { title: string; tags: string[] }) => Promise<Buffer>
  writeImage: (absPath: string, data: Buffer) => void
}

function writeToDisk(absPath: string, data: Buffer): void {
  mkdirSync(dirname(absPath), { recursive: true })
  writeFileSync(absPath, data)
}

const DEFAULTS: CoverDeps = {
  generateImage: defaultGenerate,
  hasText: defaultHasText,
  renderFallback: renderFallbackCover,
  writeImage: writeToDisk,
}

export async function generateCover(
  input: {
    slug: string
    title: string
    summary?: string
    tags: string[]
    style?: CoverStyle
    publicDir?: string
  },
  deps: Partial<CoverDeps> = {}
): Promise<CoverResult> {
  const { generateImage, hasText, renderFallback, writeImage } = { ...DEFAULTS, ...deps }
  const publicDir = input.publicDir ?? 'public'
  const imagePath = `/static/images/blog/${input.slug}/cover.png`
  const absPath = `${publicDir}${imagePath}`
  const alt = `Cover illustration for "${input.title}".`

  const { prompt, style } = buildCoverPrompt({
    title: input.title,
    summary: input.summary,
    tags: input.tags,
    style: input.style,
  })

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const png = await generateImage(prompt)
    if (!(await hasText(png))) {
      writeImage(absPath, png)
      return { imagePath, alt, prompt, style, attempts: attempt, usedFallback: false }
    }
  }

  // Exhausted retries — ship the deterministic branded cover.
  const fallback = await renderFallback({ title: input.title, tags: input.tags })
  writeImage(absPath, fallback)
  return { imagePath, alt, prompt, style, attempts: MAX_ATTEMPTS, usedFallback: true }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/cover/generate-cover.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/cover/generate-cover.ts scripts/cover/generate-cover.test.ts
git commit -m "feat(cover): orchestrator — generate, guard, retry, fallback"
```

---

### Task 8: CLI

**Files:**
- Create: `scripts/cover/cli.ts`
- Modify: `package.json` (add `gen:cover` script)
- Test: `scripts/cover/cli.test.ts`

**Interfaces:**
- Consumes: `generateCover` (Task 7), `setHeroInFile` (Task 6), `gray-matter`.
- Produces:
  - `parseCliArgs(argv: string[]): { slug: string; style?: CoverStyle; force: boolean }` (exported, pure, tested)
  - a `main()` that reads `src/content/writing/<slug>.mdx`, generates a cover, and writes the hero. Not unit-tested (needs live Azure); verified by a manual run.

- [ ] **Step 1: Write the failing test (arg parser only)**

Create `scripts/cover/cli.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { parseCliArgs } from './cli'

describe('parseCliArgs', () => {
  it('reads the slug positionally', () => {
    expect(parseCliArgs(['my-post'])).toEqual({ slug: 'my-post', style: undefined, force: false })
  })
  it('reads --style and --force', () => {
    expect(parseCliArgs(['my-post', '--style', 'conceptual', '--force'])).toEqual({
      slug: 'my-post',
      style: 'conceptual',
      force: true,
    })
  })
  it('rejects an invalid --style', () => {
    expect(() => parseCliArgs(['p', '--style', 'bogus'])).toThrow(/style/)
  })
  it('throws when no slug is given', () => {
    expect(() => parseCliArgs(['--force'])).toThrow(/slug/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/cover/cli.test.ts`
Expected: FAIL — `Cannot find module './cli'`.

- [ ] **Step 3: Implement the CLI**

Create `scripts/cover/cli.ts`:
```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import matter from 'gray-matter'
import { generateCover } from './generate-cover'
import { setHeroInFile } from './frontmatter'
import type { CoverStyle } from './prompt'

export function parseCliArgs(argv: string[]): { slug: string; style?: CoverStyle; force: boolean } {
  let slug: string | undefined
  let style: CoverStyle | undefined
  let force = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--force') force = true
    else if (a === '--style') {
      const v = argv[++i]
      if (v !== 'line-art' && v !== 'conceptual') throw new Error(`Invalid --style "${v}" (line-art|conceptual)`)
      style = v
    } else if (!a.startsWith('--') && !slug) slug = a
  }
  if (!slug) throw new Error('Usage: gen:cover <slug> [--style line-art|conceptual] [--force]')
  return { slug, style, force }
}

async function main(): Promise<void> {
  const { slug, style, force } = parseCliArgs(process.argv.slice(2))
  const filePath = join('src', 'content', 'writing', `${slug}.mdx`)
  const fm = matter(readFileSync(filePath, 'utf8'))

  if (fm.data.hero?.image && !force) {
    console.log(`${slug}: already has hero.image (use --force to regenerate). Skipping.`)
    return
  }

  console.log(`Generating cover for ${slug} …`)
  const result = await generateCover({
    slug,
    title: String(fm.data.title ?? slug),
    summary: typeof fm.data.summary === 'string' ? fm.data.summary : undefined,
    tags: Array.isArray(fm.data.tags) ? (fm.data.tags as string[]) : [],
    style,
  })
  setHeroInFile(filePath, {
    image: result.imagePath,
    alt: result.alt,
    prompt: result.prompt,
    style: result.style,
  })
  console.log(
    `✓ ${slug}: ${result.style}${result.usedFallback ? ' (branded fallback — text guard tripped 3×)' : ''} → ${result.imagePath}`
  )
}

// Only run when invoked directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
```

- [ ] **Step 4: Add the npm script**

In `package.json` `scripts`, add:
```json
    "gen:cover": "tsx scripts/cover/cli.ts",
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run scripts/cover/cli.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Manual smoke (requires Azure creds in `.env.local`)**

Run:
```bash
npm run gen:cover -- rewriting-our-engine-with-anthropic-claude-opus-4-8-and-dynamic-workflows --force
file public/static/images/blog/rewriting-our-engine-with-anthropic-claude-opus-4-8-and-dynamic-workflows/cover.png
```
Expected: a `PNG image data, 1536 x 1024`; the post's `hero` block updated. (Skip if creds are not present; the backfill task covers the live path.)

- [ ] **Step 7: Commit**

```bash
git add scripts/cover/cli.ts scripts/cover/cli.test.ts package.json
git commit -m "feat(cover): gen:cover CLI"
```

---

### Task 9: Backfill script

**Files:**
- Create: `scripts/cover/backfill.ts`
- Modify: `package.json` (add `gen:cover:all` script)
- Test: `scripts/cover/backfill.test.ts`

**Interfaces:**
- Consumes: `generateCover` (Task 7), `setHeroInFile` (Task 6), `gray-matter`, `node:fs`.
- Produces:
  - `listPostFiles(dir: string): string[]` (exported, pure-ish over the filesystem, tested against a temp dir) — every `.mdx` under `dir` recursively.
  - `slugFromPath(dir: string, filePath: string): string` (exported, pure, tested) — path relative to `dir`, minus `.mdx`, forward-slashed (so nested posts keep their folder).
  - a `main()` that iterates non-draft posts and generates a cover for each (skipping ones that already have `hero.image` unless `--force`). Not unit-tested live.

- [ ] **Step 1: Write the failing test**

Create `scripts/cover/backfill.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listPostFiles, slugFromPath } from './backfill'

let dir: string
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'cov-'))
  writeFileSync(join(dir, 'a.mdx'), '---\ntitle: A\n---\n')
  mkdirSync(join(dir, 'series'), { recursive: true })
  writeFileSync(join(dir, 'series', 'pt-1.mdx'), '---\ntitle: P1\n---\n')
  writeFileSync(join(dir, 'notes.txt'), 'ignore me')
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('listPostFiles', () => {
  it('finds .mdx files recursively and ignores non-mdx', () => {
    const files = listPostFiles(dir).map((f) => f.replace(dir + '/', '')).sort()
    expect(files).toEqual(['a.mdx', 'series/pt-1.mdx'])
  })
})

describe('slugFromPath', () => {
  it('keeps nested folders and drops the extension', () => {
    expect(slugFromPath(dir, join(dir, 'series', 'pt-1.mdx'))).toBe('series/pt-1')
    expect(slugFromPath(dir, join(dir, 'a.mdx'))).toBe('a')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/cover/backfill.test.ts`
Expected: FAIL — `Cannot find module './backfill'`.

- [ ] **Step 3: Implement the backfill**

Create `scripts/cover/backfill.ts`:
```ts
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import matter from 'gray-matter'
import { generateCover } from './generate-cover'
import { setHeroInFile } from './frontmatter'

const WRITING_DIR = join('src', 'content', 'writing')

export function listPostFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...listPostFiles(full))
    else if (entry.endsWith('.mdx')) out.push(full)
  }
  return out
}

export function slugFromPath(dir: string, filePath: string): string {
  return relative(dir, filePath).replace(/\.mdx$/, '').split(sep).join('/')
}

async function main(): Promise<void> {
  const force = process.argv.slice(2).includes('--force')
  const files = listPostFiles(WRITING_DIR).sort()
  let made = 0
  let skipped = 0
  let fellBack = 0

  for (const filePath of files) {
    const fm = matter(readFileSync(filePath, 'utf8'))
    if (fm.data.draft) {
      skipped++
      continue
    }
    const slug = slugFromPath(WRITING_DIR, filePath)
    if (fm.data.hero?.image && !force) {
      console.log(`• ${slug}: has hero.image — skipping (use --force).`)
      skipped++
      continue
    }
    console.log(`→ ${slug}: generating …`)
    const result = await generateCover({
      slug,
      title: String(fm.data.title ?? slug),
      summary: typeof fm.data.summary === 'string' ? fm.data.summary : undefined,
      tags: Array.isArray(fm.data.tags) ? (fm.data.tags as string[]) : [],
    })
    setHeroInFile(filePath, {
      image: result.imagePath,
      alt: result.alt,
      prompt: result.prompt,
      style: result.style,
    })
    made++
    if (result.usedFallback) fellBack++
    console.log(`  ✓ ${result.style}${result.usedFallback ? ' (fallback)' : ''}`)
  }

  console.log(`\nDone. Generated: ${made}, fell back: ${fellBack}, skipped: ${skipped}.`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
```

- [ ] **Step 4: Add the npm script**

In `package.json` `scripts`, add:
```json
    "gen:cover:all": "tsx scripts/cover/backfill.ts",
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run scripts/cover/backfill.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add scripts/cover/backfill.ts scripts/cover/backfill.test.ts package.json
git commit -m "feat(cover): gen:cover:all archive backfill"
```

---

### Task 10: Agent draft-step hook

**Files:**
- Create: `scripts/cover/attach.ts`
- Modify: `scripts/agent/draft.ts:125-137` (call the hook after the file write, before Vale)
- Test: `scripts/cover/attach.test.ts`

**Interfaces:**
- Consumes: `generateCover` (Task 7), `setHeroInFile` (Task 6).
- Produces: `attachCover(input: { filePath: string; slug: string; title: string; summary?: string; tags: string[] }, deps?: { generate?: typeof generateCover; setHero?: typeof setHeroInFile; stage?: (pngPath: string) => void }): Promise<string | null>` — generates a cover, writes the hero, stages the PNG, and returns the `imagePath` (or `null` on failure — non-fatal).

- [ ] **Step 1: Write the failing test**

Create `scripts/cover/attach.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { attachCover } from './attach'

const input = { filePath: 'src/content/writing/a.mdx', slug: 'a', title: 'A', summary: 's', tags: ['ai'] }

describe('attachCover', () => {
  it('generates, writes hero, stages the PNG, and returns the image path', async () => {
    const generate = vi.fn(async () => ({
      imagePath: '/static/images/blog/a/cover.png',
      alt: 'Cover for A',
      prompt: 'p',
      style: 'line-art' as const,
      attempts: 1,
      usedFallback: false,
    }))
    const setHero = vi.fn()
    const stage = vi.fn()
    const path = await attachCover(input, { generate, setHero, stage })
    expect(path).toBe('/static/images/blog/a/cover.png')
    expect(setHero).toHaveBeenCalledWith('src/content/writing/a.mdx', {
      image: '/static/images/blog/a/cover.png',
      alt: 'Cover for A',
      prompt: 'p',
      style: 'line-art',
    })
    expect(stage).toHaveBeenCalledWith('public/static/images/blog/a/cover.png')
  })

  it('is non-fatal: returns null and does not throw when generation fails', async () => {
    const generate = vi.fn(async () => {
      throw new Error('azure down')
    })
    const path = await attachCover(input, { generate, setHero: vi.fn(), stage: vi.fn() })
    expect(path).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/cover/attach.test.ts`
Expected: FAIL — `Cannot find module './attach'`.

- [ ] **Step 3: Implement the hook helper**

Create `scripts/cover/attach.ts`:
```ts
import { spawnSync } from 'node:child_process'
import { generateCover } from './generate-cover'
import { setHeroInFile } from './frontmatter'

function gitStage(pngPath: string): void {
  spawnSync('git', ['add', pngPath], { encoding: 'utf8' })
}

// Non-fatal: a cover failure must never abort a draft. Returns the imagePath or
// null. The MDX hero edit is applied to filePath (which the caller stages after).
export async function attachCover(
  input: { filePath: string; slug: string; title: string; summary?: string; tags: string[] },
  deps: {
    generate?: typeof generateCover
    setHero?: typeof setHeroInFile
    stage?: (pngPath: string) => void
  } = {}
): Promise<string | null> {
  const generate = deps.generate ?? generateCover
  const setHero = deps.setHero ?? setHeroInFile
  const stage = deps.stage ?? gitStage
  try {
    const result = await generate({
      slug: input.slug,
      title: input.title,
      summary: input.summary,
      tags: input.tags,
    })
    setHero(input.filePath, {
      image: result.imagePath,
      alt: result.alt,
      prompt: result.prompt,
      style: result.style,
    })
    stage(`public${result.imagePath}`)
    return result.imagePath
  } catch (err) {
    console.error(`Cover generation failed (non-fatal): ${(err as Error).message}`)
    return null
  }
}
```

- [ ] **Step 4: Wire the hook into the agent**

In `scripts/agent/draft.ts`, add the import near the top (after line 12, `import { createBranchAndPr } from './lib/pr'`):
```ts
import { attachCover } from '../cover/attach'
```
In `draftBlogRow`, immediately after the file write (currently line 128, `writeFileSync(filePath, mdx)`) and before the Vale call (line 131), insert:
```ts
  // Generate an on-brand cover (non-fatal). Uses row.hint as the subject hint
  // since ContentRow has no summary field.
  await attachCover({
    filePath,
    slug,
    title: row.title,
    summary: row.hint,
    tags: row.tags,
  })
```
The subsequent `git add filePath` (line 136) stages the hero-updated MDX; `attachCover` has already staged the PNG.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run scripts/cover/attach.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Run the full suite + type-check**

Run:
```bash
npm test
npm run astro check
```
Expected: all unit tests pass (cover + existing); no new type errors.

- [ ] **Step 7: Commit**

```bash
git add scripts/cover/attach.ts scripts/cover/attach.test.ts scripts/agent/draft.ts
git commit -m "feat(cover): hook cover generation into the agent draft step"
```

---

## Rollout note (after this plan lands)

Run the cohesion backfill by hand (needs Azure creds in `.env.local`):
```bash
npm run gen:cover:all -- --force
```
Review the 16 generated covers in the PR (the text guard auto-rejects glyph leaks; eyeball the rest). For any post where the original banner is preferred, restore that one `hero.image` line (originals remain on disk). Then merge — every post gets a cohesive cover and, via the OG subsystem, a hybrid link-preview card.

---

## Self-Review

**Spec coverage (Subsystem A / §5, §7, §8, §9):**
- §5.1 module + CLI + backfill → Tasks 7, 8, 9.
- §5.2 prompt (brand/style spines + subject, strengthened no-text) → Task 1.
- §5.3 style selection (bucket map + override) → Task 1 (`selectStyle`, override in `buildCoverPrompt`).
- §5.4 Azure call (exact endpoint/params/response) → Task 3.
- §5.5 text-leak guard (negative + vision check + ≤3 retries + fallback) → Tasks 1 (negative), 4 (`hasText`), 7 (retry/fallback), 5 (branded fallback).
- §5.6 output + frontmatter (image/alt/prompt/style; originals untouched) → Tasks 6, 7.
- §5.7 agent draft hook (after write, non-fatal, stage PNG) → Task 10.
- §5.8 secrets/config (optional, build-independent) → Task 2.
- §7 shared deterministic fallback (reuse OG renderer) → Task 5.
- §8 `hero.style` schema → Task 6.
- §9 backfill rollout → Task 9 + the rollout note.

**Placeholder scan:** none — every code/test step is complete.

**Type consistency:** `CoverStyle` (Task 1) flows unchanged through Tasks 6/7/8/10. `CoverResult` (Task 7) fields (`imagePath`, `alt`, `prompt`, `style`, `attempts`, `usedFallback`) are consumed identically by the CLI, backfill, and `attachCover`. `HeroPatch` (Task 6) matches the object `generateCover`/`attachCover` pass to `setHero*`. `renderFallbackCover` (Task 5) signature matches the `renderFallback` dep in `CoverDeps` (Task 7). `getImageConfig`/`getVisionConfig` (Task 2) are the only consumers used by Tasks 3/4.

**Cross-plan dependency:** Tasks 5 depends on the OG plan's `src/lib/og/render.ts` (`renderOg`) and `src/lib/buckets.ts` `resolveBucket`. Stated in the header; OG plan lands first.

## Decisions / assumptions (flagged for confirmation)

1. **Fallback size:** the branded fallback cover is produced by the OG `renderOg` at **1200×630**, not 1536×1024, to avoid re-parameterizing the OG template and keep the two plans decoupled. It cover-crops fine and only triggers on the rare 3×-text-leak path. (Spec §7 said "cover-appropriate size" — flagging this as the concrete interpretation.)
2. **Agent subject = `row.hint`:** `ContentRow` has no `summary`; the agent passes `row.hint` as the cover subject. CLI/backfill use the post's frontmatter `summary`. Both are optional in `buildCoverPrompt`.
3. **`hasText` fails safe to `true`:** an API error on the vision check is treated as "has text" → forces a retry/fallback rather than risking a leaked-text cover. Costs an occasional unnecessary regen; safer default.
4. **`gray-matter` re-serialization churn:** `setHero` re-dumps YAML, which may normalize quotes/key order across the 16 posts during backfill. Acceptable (reviewed in the PR), but it will produce a larger diff than a surgical edit. Flagging in case you'd prefer a minimal-diff YAML edit instead.
5. **Vision model assumption:** assumes a `gpt-4o-mini` deployment exists on the same Azure account (not yet provisioned — the OG/cover spec noted standing it up when cover-gen starts). The implementer/you will deploy it the same way as `gpt-image-1` before the live backfill.
