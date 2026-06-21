# OG Image Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a 1200×630 Open Graph image per post at build time so shared links show a real preview card — hybrid (post cover under a dark scrim + title overlay) when a cover exists, branded template otherwise.

**Architecture:** A pure render core (`src/lib/og/`) turns a small `OgData` object into a PNG using Satori (HTML-like tree → SVG) + `@resvg/resvg-js` (SVG → PNG), with no headless browser. An Astro static endpoint `src/pages/og/[...slug].png.ts` enumerates non-draft posts via `getStaticPaths` and writes one PNG each at build. `BaseLayout` gains an `ogImage` prop; the blog post page points it at `/og/<slug>.png`.

**Tech Stack:** Astro 6, TypeScript (strict, ESM), Satori, @resvg/resvg-js, vendored static TTF fonts (Fraunces/Inter/JetBrains Mono), Vitest (unit), Playwright (build smoke).

**Spec:** `docs/superpowers/specs/2026-06-20-og-images-and-ai-cover-generation-design.md` (Subsystem B + §6, §7).

## Global Constraints

- **Canvas:** 1200×630 px. OG meta must also emit `og:image:width=1200`, `og:image:height=630`, `twitter:card=summary_large_image`.
- **Palette (exact hex):** ink `#15233a`, ink-soft `#2a3f5f`, ochre `#d49a3a`, terracotta `#b04a3a`, paper `#f3e8d2`, paper-soft `#faf3e3`.
- **Fonts:** Fraunces (display), Inter (sans), JetBrains Mono (mono/eyebrow). Satori needs `ttf`/`otf` — the repo's `@fontsource-variable/*` are WOFF2 and CANNOT be used; vendor static TTFs (Task 1).
- **No runtime external calls.** All generation is at build time; the deployed site loads no image service. Fonts are vendored into the repo (no CDN at build after Task 1).
- **Untrusted frontmatter:** `hero.image` MUST pass `safeLocalImage` (reuse from `src/lib/cover.ts`) before the file is read/embedded; on failure, render the branded fallback (never read an arbitrary path).
- **Determinism:** the branded fallback template makes zero network calls and always succeeds — nothing ships blank.
- **Code style:** `.ts` files use no semicolons, single quotes, 2-space indent (match `src/lib/cover.ts`, `src/lib/buckets.ts`). `.astro` frontmatter matches existing `BaseLayout.astro` (semicolons, double quotes).
- **Platform:** Node ≥24, Astro ^6.3.8, TypeScript strict. ESM only (`"type": "module"`).

---

### Task 1: Dependencies + vendored fonts + font loader

**Files:**
- Modify: `package.json` (add devDependencies)
- Create: `src/assets/og/fonts/` (5 vendored `.ttf` files)
- Create: `src/assets/og/fonts/SOURCE.md` (provenance/license note)
- Create: `src/lib/og/fonts.ts`
- Test: `src/lib/og/fonts.test.ts`

**Interfaces:**
- Produces: `loadOgFonts(): Array<{ name: string; data: Buffer; weight: 400 | 500 | 600; style: 'normal' }>` — the font set passed to `satori()`. Families: `'Fraunces'` (400, 600), `'Inter'` (400, 500), `'JetBrains Mono'` (500).

- [ ] **Step 1: Install Satori + resvg**

Run:
```bash
npm install -D satori @resvg/resvg-js
```
Expected: both added to `devDependencies`, `package-lock.json` updated, no peer-dep errors.

- [ ] **Step 2: Vendor the five static TTFs**

Run (from repo root):
```bash
mkdir -p src/assets/og/fonts
curl -fsSL "https://cdn.jsdelivr.net/fontsource/fonts/fraunces@latest/latin-400-normal.ttf"        -o src/assets/og/fonts/fraunces-400.ttf
curl -fsSL "https://cdn.jsdelivr.net/fontsource/fonts/fraunces@latest/latin-600-normal.ttf"        -o src/assets/og/fonts/fraunces-600.ttf
curl -fsSL "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf"           -o src/assets/og/fonts/inter-400.ttf
curl -fsSL "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-500-normal.ttf"           -o src/assets/og/fonts/inter-500.ttf
curl -fsSL "https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono@latest/latin-500-normal.ttf"  -o src/assets/og/fonts/jetbrains-mono-500.ttf
ls -l src/assets/og/fonts/
```
Expected: five `.ttf` files, each > 30 KB (`font/ttf`). These are committed so the build never hits the CDN again.

- [ ] **Step 3: Write the provenance note**

Create `src/assets/og/fonts/SOURCE.md`:
```markdown
# Vendored OG fonts

Static TTF instances used only by the build-time OG image renderer
(`src/lib/og/`). Satori cannot read the variable WOFF2 files shipped by the
`@fontsource-variable/*` packages, so these static cuts are vendored here.

Fetched from the Fontsource CDN (`cdn.jsdelivr.net/fontsource/fonts/...`):

- `fraunces-400.ttf`, `fraunces-600.ttf` — Fraunces (SIL OFL 1.1)
- `inter-400.ttf`, `inter-500.ttf` — Inter (SIL OFL 1.1)
- `jetbrains-mono-500.ttf` — JetBrains Mono (SIL OFL 1.1)

All three families are licensed under the SIL Open Font License 1.1.
```

- [ ] **Step 4: Write the failing test**

Create `src/lib/og/fonts.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { loadOgFonts } from './fonts'

describe('loadOgFonts', () => {
  it('returns the five expected font cuts as non-empty buffers', () => {
    const fonts = loadOgFonts()
    expect(fonts).toHaveLength(5)
    for (const f of fonts) {
      expect(Buffer.isBuffer(f.data)).toBe(true)
      expect(f.data.length).toBeGreaterThan(10000)
      expect(f.style).toBe('normal')
    }
  })

  it('registers Fraunces 400/600, Inter 400/500, JetBrains Mono 500', () => {
    const fonts = loadOgFonts()
    const sig = fonts.map((f) => `${f.name}:${f.weight}`).sort()
    expect(sig).toEqual([
      'Fraunces:400',
      'Fraunces:600',
      'Inter:400',
      'Inter:500',
      'JetBrains Mono:500',
    ])
  })
})
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx vitest run src/lib/og/fonts.test.ts`
Expected: FAIL — `Cannot find module './fonts'`.

- [ ] **Step 6: Implement the font loader**

Create `src/lib/og/fonts.ts`:
```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export type OgFont = {
  name: string
  data: Buffer
  weight: 400 | 500 | 600
  style: 'normal'
}

const DIR = fileURLToPath(new URL('../../assets/og/fonts/', import.meta.url))

function read(file: string): Buffer {
  return readFileSync(`${DIR}${file}`)
}

let cache: OgFont[] | null = null

// Loaded once and cached; satori() is called per-post at build.
export function loadOgFonts(): OgFont[] {
  if (cache) return cache
  cache = [
    { name: 'Fraunces', data: read('fraunces-400.ttf'), weight: 400, style: 'normal' },
    { name: 'Fraunces', data: read('fraunces-600.ttf'), weight: 600, style: 'normal' },
    { name: 'Inter', data: read('inter-400.ttf'), weight: 400, style: 'normal' },
    { name: 'Inter', data: read('inter-500.ttf'), weight: 500, style: 'normal' },
    { name: 'JetBrains Mono', data: read('jetbrains-mono-500.ttf'), weight: 500, style: 'normal' },
  ]
  return cache
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run src/lib/og/fonts.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/assets/og/fonts src/lib/og/fonts.ts src/lib/og/fonts.test.ts
git commit -m "feat(og): vendor static TTF fonts + Satori/resvg deps"
```

---

### Task 2: OG data builder

**Files:**
- Modify: `src/lib/cover.ts` (export `safeLocalImage`)
- Create: `src/lib/og/data.ts`
- Test: `src/lib/og/data.test.ts`

**Interfaces:**
- Consumes: `safeLocalImage(src: string): string | null` from `src/lib/cover.ts`; `resolveBucket(tags)` from `src/lib/buckets.ts`.
- Produces:
  - `type OgData = { title: string; eyebrow: string; dateLabel: string; readingLabel: string; cover: string | null }`
  - `buildOgData(post: CollectionEntry<'writing'>): OgData`
  - `loadCoverDataUri(image: string | undefined): string | null`

- [ ] **Step 1: Export `safeLocalImage` from cover.ts**

In `src/lib/cover.ts`, change the function declaration from private to exported (line 12). Replace:
```ts
function safeLocalImage(src: string): string | null {
```
with:
```ts
export function safeLocalImage(src: string): string | null {
```
(No other change — `resolveCover` keeps calling it.)

- [ ] **Step 2: Write the failing test**

Create `src/lib/og/data.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildOgData, loadCoverDataUri } from './data'

function fakePost(over: { body?: string; [k: string]: unknown } = {}) {
  const { body, ...dataOver } = over
  return {
    id: 'x.mdx',
    body: body ?? 'word '.repeat(400),
    data: {
      title: 'Rewriting Our Engine',
      summary: 'A summary.',
      tags: ['ai'],
      date: new Date('2026-06-08T00:00:00Z'),
      ...dataOver,
    },
  } as any
}

describe('buildOgData', () => {
  it('derives eyebrow from the resolved bucket + site', () => {
    expect(buildOgData(fakePost()).eyebrow).toBe('AI · shariq.dev')
  })
  it('formats the date as "Mon YYYY"', () => {
    expect(buildOgData(fakePost()).dateLabel).toBe('Jun 2026')
  })
  it('formats reading time as "<n> min"', () => {
    expect(buildOgData(fakePost()).readingLabel).toMatch(/^\d+ min$/)
  })
  it('clamps a very short post to "1 min"', () => {
    expect(buildOgData(fakePost({ body: 'hello world' })).readingLabel).toBe('1 min')
  })
  it('cover is null when there is no hero', () => {
    expect(buildOgData(fakePost()).cover).toBeNull()
  })
})

describe('loadCoverDataUri', () => {
  it('returns null for undefined', () => {
    expect(loadCoverDataUri(undefined)).toBeNull()
  })
  it('returns null for an off-origin/invalid path (rejected by safeLocalImage)', () => {
    expect(loadCoverDataUri('https://evil.example.com/x.png')).toBeNull()
  })
  it('returns null when the validated file does not exist on disk', () => {
    expect(loadCoverDataUri('/static/images/blog/__missing__/cover.png')).toBeNull()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/og/data.test.ts`
Expected: FAIL — `Cannot find module './data'`.

- [ ] **Step 4: Implement the data builder**

Create `src/lib/og/data.ts`:
```ts
import { readFileSync } from 'node:fs'
import readingTime from 'reading-time'
import type { CollectionEntry } from 'astro:content'
import { resolveBucket } from '../buckets'
import { safeLocalImage } from '../cover'

export type OgData = {
  title: string
  eyebrow: string
  dateLabel: string
  readingLabel: string
  cover: string | null
}

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
}

// Validate via the shared guard, then read the file from /public and inline it
// as a data URI (Satori has no filesystem access). Any failure → null → caller
// falls back to the branded template. Never reads an unvalidated path.
export function loadCoverDataUri(image: string | undefined): string | null {
  if (!image) return null
  const safe = safeLocalImage(image)
  if (!safe) return null
  const ext = safe.split('.').pop()!.toLowerCase()
  const mime = MIME[ext]
  if (!mime) return null
  try {
    const bytes = readFileSync(`${process.cwd()}/public${safe}`)
    return `data:${mime};base64,${bytes.toString('base64')}`
  } catch {
    return null
  }
}

export function buildOgData(post: CollectionEntry<'writing'>): OgData {
  const bucket = resolveBucket(post.data.tags)
  const minutes = Math.max(1, Math.ceil(readingTime(post.body).minutes))
  const dateLabel = post.data.date.toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
  })
  return {
    title: post.data.title,
    eyebrow: `${bucket.label} · shariq.dev`,
    dateLabel,
    readingLabel: `${minutes} min`,
    cover: loadCoverDataUri(post.data.hero?.image),
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/og/data.test.ts src/lib/cover.test.ts`
Expected: PASS (data.test.ts cases + the existing cover.test.ts still green — `safeLocalImage` export is additive).

- [ ] **Step 6: Commit**

```bash
git add src/lib/cover.ts src/lib/og/data.ts src/lib/og/data.test.ts
git commit -m "feat(og): build OgData from a post + safe cover data-URI"
```

---

### Task 3: Hyperscript helper + Satori templates

**Files:**
- Create: `src/lib/og/h.ts`
- Create: `src/lib/og/templates.ts`
- Test: `src/lib/og/templates.test.ts`

**Interfaces:**
- Consumes: `OgData` from `./data`.
- Produces:
  - `h(type, props, ...children)` — returns a Satori-compatible element node `{ type, props: { ...props, children } }`.
  - `hybridTemplate(d: OgData): OgNode` and `fallbackTemplate(d: OgData): OgNode`. `OgNode` is the element type returned by `h`.

**Why a hyperscript helper:** the repo has no React/JSX toolchain. Satori accepts plain React-element-shaped objects `{ type, props }`, so `h()` lets us write templates as readable nested calls without adding JSX.

- [ ] **Step 1: Write the failing test**

Create `src/lib/og/templates.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { h } from './h'
import { hybridTemplate, fallbackTemplate } from './templates'

const data = {
  title: 'Rewriting Our Engine',
  eyebrow: 'AI · shariq.dev',
  dateLabel: 'Jun 2026',
  readingLabel: '8 min',
  cover: 'data:image/png;base64,iVBORw0KGgo=',
}

// Recursively collect every string leaf in the tree.
function texts(node: any, out: string[] = []): string[] {
  if (typeof node === 'string') out.push(node)
  else if (Array.isArray(node)) node.forEach((n) => texts(n, out))
  else if (node && node.props) texts(node.props.children, out)
  return out
}

describe('h', () => {
  it('builds a {type, props:{children}} node', () => {
    const n = h('div', { style: { color: 'red' } }, 'hi')
    expect(n.type).toBe('div')
    expect(n.props.style).toEqual({ color: 'red' })
    expect(n.props.children).toEqual(['hi'])
  })
})

describe('hybridTemplate', () => {
  it('is a root div containing the title, eyebrow, date and reading labels', () => {
    const node = hybridTemplate(data)
    expect(node.type).toBe('div')
    const all = texts(node).join(' | ')
    expect(all).toContain('Rewriting Our Engine')
    expect(all).toContain('AI · shariq.dev')
    expect(all).toContain('Jun 2026 · 8 min')
  })
  it('embeds the cover as an img src', () => {
    const node = hybridTemplate(data)
    const imgs: string[] = []
    const walk = (n: any) => {
      if (n && n.type === 'img') imgs.push(n.props.src)
      if (n && n.props) [].concat(n.props.children ?? []).forEach(walk)
    }
    walk(node)
    expect(imgs).toContain(data.cover)
  })
})

describe('fallbackTemplate', () => {
  it('renders title + eyebrow and no cover img', () => {
    const node = fallbackTemplate({ ...data, cover: null })
    const all = texts(node).join(' | ')
    expect(all).toContain('Rewriting Our Engine')
    expect(all).toContain('AI · shariq.dev')
    let hasImg = false
    const walk = (n: any) => {
      if (n && n.type === 'img') hasImg = true
      if (n && n.props) [].concat(n.props.children ?? []).forEach(walk)
    }
    walk(node)
    expect(hasImg).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/og/templates.test.ts`
Expected: FAIL — `Cannot find module './h'`.

- [ ] **Step 3: Implement the hyperscript helper**

Create `src/lib/og/h.ts`:
```ts
export type OgNode = {
  type: string
  props: Record<string, unknown> & { children: unknown }
}

// Satori consumes React-element-shaped objects. Children are flattened so
// callers can pass strings, nodes, or arrays interchangeably.
export function h(
  type: string,
  props: Record<string, unknown> | null,
  ...children: unknown[]
): OgNode {
  return { type, props: { ...(props ?? {}), children: children.flat() } }
}
```

- [ ] **Step 4: Implement the templates**

Create `src/lib/og/templates.ts`:
```ts
import { h, type OgNode } from './h'
import type { OgData } from './data'

const INK = '#15233a'
const OCHRE = '#d49a3a'
const TERRACOTTA = '#b04a3a'
const PAPER = '#f3e8d2'
const WHITE = '#ffffff'

// The mark: "◆ shariq.dev" with an ochre diamond.
function mark(): OgNode {
  return h(
    'div',
    { style: { display: 'flex', alignItems: 'center', fontFamily: 'JetBrains Mono', fontSize: 24, color: WHITE } },
    h('div', { style: { color: OCHRE, marginRight: 10 } }, '◆'),
    h('div', { style: { display: 'flex' } }, 'shariq.dev')
  )
}

// ---------- Hybrid: post HAS a cover ----------
export function hybridTemplate(d: OgData): OgNode {
  return h(
    'div',
    {
      style: {
        position: 'relative',
        width: 1200,
        height: 630,
        display: 'flex',
        background: INK,
        fontFamily: 'Inter',
      },
    },
    h('img', {
      src: d.cover as string,
      style: { position: 'absolute', top: 0, left: 0, width: 1200, height: 630, objectFit: 'cover' },
    }),
    h('div', {
      style: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: 1200,
        height: 630,
        backgroundImage:
          'linear-gradient(105deg, rgba(21,35,58,0.94) 30%, rgba(21,35,58,0.55) 58%, rgba(21,35,58,0.15) 100%)',
      },
    }),
    h('div', { style: { position: 'absolute', top: 0, left: 0, bottom: 0, width: 12, background: TERRACOTTA } }),
    h(
      'div',
      {
        style: {
          position: 'absolute',
          top: 64,
          left: 76,
          right: 64,
          bottom: 56,
          display: 'flex',
          flexDirection: 'column',
          color: WHITE,
        },
      },
      h(
        'div',
        {
          style: {
            display: 'flex',
            fontFamily: 'JetBrains Mono',
            fontSize: 22,
            letterSpacing: 4,
            textTransform: 'uppercase',
            color: OCHRE,
          },
        },
        d.eyebrow
      ),
      h(
        'div',
        {
          style: {
            display: 'flex',
            marginTop: 'auto',
            maxWidth: 700,
            fontFamily: 'Fraunces',
            fontWeight: 600,
            fontSize: 78,
            lineHeight: 1.04,
            letterSpacing: -1,
          },
        },
        d.title
      ),
      h(
        'div',
        { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 34 } },
        mark(),
        h(
          'div',
          { style: { display: 'flex', fontFamily: 'JetBrains Mono', fontSize: 19, color: 'rgba(255,255,255,0.7)' } },
          `${d.dateLabel} · ${d.readingLabel}`
        )
      )
    )
  )
}

// ---------- Fallback: post has NO cover ----------
export function fallbackTemplate(d: OgData): OgNode {
  return h(
    'div',
    { style: { width: 1200, height: 630, display: 'flex', background: INK, fontFamily: 'Inter' } },
    // left text column (1.25fr of 2.25 → 667px)
    h(
      'div',
      {
        style: {
          position: 'relative',
          width: 667,
          height: 630,
          display: 'flex',
          flexDirection: 'column',
          padding: '70px 56px 60px 76px',
          color: WHITE,
        },
      },
      h('div', { style: { position: 'absolute', top: 0, left: 0, bottom: 0, width: 12, background: OCHRE } }),
      h(
        'div',
        {
          style: {
            display: 'flex',
            fontFamily: 'JetBrains Mono',
            fontSize: 22,
            letterSpacing: 4,
            textTransform: 'uppercase',
            color: OCHRE,
          },
        },
        d.eyebrow
      ),
      h(
        'div',
        {
          style: {
            display: 'flex',
            marginTop: 'auto',
            maxWidth: 480,
            fontFamily: 'Fraunces',
            fontWeight: 600,
            fontSize: 76,
            lineHeight: 1.04,
            letterSpacing: -1,
          },
        },
        d.title
      ),
      h('div', { style: { display: 'flex', marginTop: 34 } }, mark())
    ),
    // right art panel (1fr → 533px) with palette geometric motif
    h(
      'div',
      {
        style: {
          position: 'relative',
          width: 533,
          height: 630,
          display: 'flex',
          backgroundImage: 'linear-gradient(135deg, #1b2c44, #15233a)',
        },
      },
      h('div', {
        style: { position: 'absolute', top: 150, left: 120, width: 150, height: 150, borderRadius: 999, border: `7px solid ${OCHRE}` },
      }),
      h('div', {
        style: { position: 'absolute', top: 300, left: 300, width: 90, height: 90, borderRadius: 999, background: TERRACOTTA },
      }),
      h('div', {
        style: { position: 'absolute', top: 200, left: 330, width: 70, height: 18, borderRadius: 9, background: OCHRE },
      }),
      h('div', {
        style: { position: 'absolute', top: 430, left: 150, width: 22, height: 22, borderRadius: 999, background: PAPER },
      }),
      h('div', {
        style: { position: 'absolute', top: 430, left: 195, width: 22, height: 22, borderRadius: 999, background: PAPER },
      })
    )
  )
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/og/templates.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/og/h.ts src/lib/og/templates.ts src/lib/og/templates.test.ts
git commit -m "feat(og): hyperscript helper + hybrid/fallback Satori templates"
```

---

### Task 4: Render core (Satori → resvg → PNG)

**Files:**
- Create: `src/lib/og/render.ts`
- Test: `src/lib/og/render.test.ts`

**Interfaces:**
- Consumes: `loadOgFonts()`, `hybridTemplate`/`fallbackTemplate`, `OgData`.
- Produces: `renderOg(data: OgData): Promise<Buffer>` — a 1200×630 PNG. Uses the hybrid template when `data.cover` is set, otherwise the fallback.

- [ ] **Step 1: Write the failing test**

Create `src/lib/og/render.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { renderOg } from './render'

// 1×1 transparent PNG, enough for the hybrid <img> path.
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function pngSize(buf: Buffer) {
  // PNG: 8-byte sig, then IHDR length(4)+type(4), then width(4)+height(4) BE.
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

const base = {
  title: 'Rewriting Our Engine with Claude Opus 4.8',
  eyebrow: 'AI · shariq.dev',
  dateLabel: 'Jun 2026',
  readingLabel: '8 min',
}

describe('renderOg', () => {
  it('renders a 1200×630 PNG for the fallback (no cover)', async () => {
    const png = await renderOg({ ...base, cover: null })
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a') // PNG magic
    expect(pngSize(png)).toEqual({ width: 1200, height: 630 })
  })

  it('renders a 1200×630 PNG for the hybrid (with cover)', async () => {
    const png = await renderOg({ ...base, cover: TINY_PNG })
    expect(pngSize(png)).toEqual({ width: 1200, height: 630 })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/og/render.test.ts`
Expected: FAIL — `Cannot find module './render'`.

- [ ] **Step 3: Implement the render core**

Create `src/lib/og/render.ts`:
```ts
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import { loadOgFonts } from './fonts'
import { hybridTemplate, fallbackTemplate } from './templates'
import type { OgData } from './data'

const WIDTH = 1200
const HEIGHT = 630

export async function renderOg(data: OgData): Promise<Buffer> {
  const element = data.cover ? hybridTemplate(data) : fallbackTemplate(data)
  const svg = await satori(element as Parameters<typeof satori>[0], {
    width: WIDTH,
    height: HEIGHT,
    fonts: loadOgFonts(),
  })
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: WIDTH },
  })
    .render()
    .asPng()
  return png
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/og/render.test.ts`
Expected: PASS (2 tests). If `@resvg/resvg-js` fails to load its native binary, run `npm rebuild @resvg/resvg-js` and retry.

- [ ] **Step 5: Run the full unit suite**

Run: `npm test`
Expected: PASS — all existing tests plus the new `src/lib/og/*` tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/og/render.ts src/lib/og/render.test.ts
git commit -m "feat(og): render core — Satori SVG to resvg PNG at 1200x630"
```

---

### Task 5: Static OG endpoint

**Files:**
- Create: `src/pages/og/[...slug].png.ts`

**Interfaces:**
- Consumes: `getCollection('writing')`, `buildOgData`, `renderOg`.
- Produces: one static file `dist/og/<slug>.png` per non-draft post. URL: `/og/<slug>.png`.

**Note:** `[...slug]` is a rest param so nested posts (e.g. `docker-series/pt-1-...`) map to `/og/docker-series/pt-1-....png`. This endpoint is thin (no logic worth a unit test in isolation — `getCollection` needs the Astro runtime); it is verified by building and by the Task 6 smoke test.

- [ ] **Step 1: Implement the endpoint**

Create `src/pages/og/[...slug].png.ts`:
```ts
import type { APIRoute } from 'astro'
import { getCollection, type CollectionEntry } from 'astro:content'
import { buildOgData } from '../../lib/og/data'
import { renderOg } from '../../lib/og/render'

export async function getStaticPaths() {
  const posts = await getCollection('writing', ({ data }) => !data.draft)
  return posts.map((post) => ({
    params: { slug: post.id.replace(/\.mdx$/, '') },
    props: { post },
  }))
}

export const GET: APIRoute = async ({ props }) => {
  const { post } = props as { post: CollectionEntry<'writing'> }
  const png = await renderOg(buildOgData(post))
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
```

- [ ] **Step 2: Build and verify PNGs are emitted**

Run:
```bash
npm run build
ls dist/og/
```
Expected: build succeeds; `dist/og/` contains one `.png` per non-draft post (16 today, including `dist/og/docker-series/pt-1-installing-docker-and-docker-compose.png`).

- [ ] **Step 3: Spot-check one image**

Run:
```bash
file dist/og/rewriting-our-engine-with-anthropic-claude-opus-4-8-and-dynamic-workflows.png
```
Expected: `PNG image data, 1200 x 630`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/og/[...slug].png.ts
git commit -m "feat(og): static /og/<slug>.png endpoint via getStaticPaths"
```

---

### Task 6: Wire OG meta into BaseLayout + blog page, with build smoke

**Files:**
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `src/pages/blog/[...slug].astro`
- Test: `tests/smoke.spec.ts`

**Interfaces:**
- Consumes: the `/og/<slug>.png` files from Task 5; `SITE.url` from `src/lib/site.ts`.
- Produces: `<meta property="og:image">` (+ width/height), `<meta name="twitter:card">`, `<meta name="twitter:image">` on post pages; new `BaseLayout` props `ogImage?: string` and `ogType?: 'website' | 'article'`.

- [ ] **Step 1: Add props + meta to BaseLayout**

In `src/layouts/BaseLayout.astro`, extend the `Props` interface (currently lines 10–15) to:
```ts
interface Props {
  title?: string
  description?: string
  canonical?: string
  width?: 'prose' | 'wide'
  ogImage?: string
  ogType?: 'website' | 'article'
}
```
Extend the destructure (currently lines 17–22) to include the new props:
```ts
const {
  title,
  description = SITE.description,
  canonical: canonicalOverride,
  width = 'prose',
  ogImage,
  ogType = 'website',
} = Astro.props;
```
Replace the `og:type` line (currently line 39) and add image tags. Change:
```astro
    <meta property="og:type" content="website" />
    <meta property="og:url" content={pageUrl} />
```
to:
```astro
    <meta property="og:type" content={ogType} />
    <meta property="og:url" content={pageUrl} />
    {ogImage && (
      <>
        <meta property="og:image" content={ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={ogImage} />
      </>
    )}
```

- [ ] **Step 2: Pass ogImage from the blog post page**

In `src/pages/blog/[...slug].astro`, add the SITE import after the existing imports (after line 11):
```astro
import { SITE } from "../../lib/site";
```
Compute the slug + OG URL in the frontmatter (after line 27, before the closing `---`):
```astro
const slug = post.id.replace(/\.mdx$/, "");
const ogImage = new URL(`/og/${slug}.png`, SITE.url).toString();
```
Update the `<BaseLayout>` open tag (currently lines 29–33) to pass them:
```astro
<BaseLayout
  title={post.data.title}
  description={post.data.summary}
  canonical={post.data.canonical}
  ogImage={ogImage}
  ogType="article"
>
```

- [ ] **Step 3: Extend the build smoke test**

In `tests/smoke.spec.ts`, add a test asserting a post page exposes the OG tags and the image file exists in the build. Append:
```ts
import { existsSync } from 'node:fs'

test('blog post exposes OG image meta and the PNG is built', async ({ page }) => {
  const slug = 'rewriting-our-engine-with-anthropic-claude-opus-4-8-and-dynamic-workflows'
  await page.goto(`/blog/${slug}/`)

  const ogImage = page.locator('meta[property="og:image"]')
  await expect(ogImage).toHaveAttribute('content', new RegExp(`/og/${slug}\\.png$`))
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute('content', '1200')
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image')

  expect(existsSync(`dist/og/${slug}.png`)).toBe(true)
})
```
(If `tests/smoke.spec.ts` does not already `import { test, expect } from '@playwright/test'`, confirm it does — the existing file establishes the pattern; reuse its imports rather than redeclaring.)

- [ ] **Step 4: Build and run the smoke test**

Run:
```bash
npm run build
npm run test:smoke
```
Expected: build succeeds; Playwright smoke passes including the new OG assertion.

- [ ] **Step 5: Commit**

```bash
git add src/layouts/BaseLayout.astro src/pages/blog/[...slug].astro tests/smoke.spec.ts
git commit -m "feat(og): emit og:image + twitter card on post pages"
```

---

## Self-Review

**Spec coverage (Subsystem B + §6/§7):**
- §6.1 engine + fonts → Task 1 (Satori/resvg + vendored TTFs; documents the WOFF2 limitation).
- §6.2 endpoint → Task 5 (`/og/[...slug].png.ts`, `getStaticPaths`, shared render core in `src/lib/og/`).
- §6.3 hybrid template (scrim/bar/eyebrow/title/foot, cover embed, `safeLocalImage` gate) → Task 3 (template) + Task 2 (`loadCoverDataUri` validation) + Task 4 (render).
- §6.4 fallback template → Task 3 (`fallbackTemplate`); deviates from the spec's "pre-rendered motif PNG" by using palette div-shapes instead — asset-free and deterministic, which §6.4/the Satori notes explicitly allow ("basic shapes"). Recorded here so the reviewer doesn't flag it as missing.
- §6.5 BaseLayout wiring (og:image + dims + twitter card, article type) → Task 6.
- §7 shared deterministic fallback → `fallbackTemplate`, used by `renderOg` whenever `cover` is null; zero network calls.
- Testing (§10) → unit tests in Tasks 1–4; build smoke in Task 6.

**Out of scope here (Subsystem A, separate plan):** AI cover generation, `hero.style` schema field, agent hook, backfill. OG renders the branded fallback for the 3 cover-less posts until that lands.

**Placeholder scan:** none — every code step contains complete content.

**Type consistency:** `OgData` (Task 2) is consumed unchanged by Tasks 3/4. `loadOgFonts` shape (Task 1) matches Satori's `fonts` option used in Task 4. `h`/`OgNode` (Task 3) is what `renderOg` casts into `satori()`. `ogImage`/`ogType` prop names match between BaseLayout and the blog page (Task 6).

**One known fragility:** `reading-time` runs on `post.body` (raw MDX), so the OG foot's minutes may differ by ±1 from the on-page value (which uses the remark plugin over rendered text). Cosmetic; accepted in the spec (§5.2/§11 note on subject/labels being approximate).
```
