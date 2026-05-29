# Blog Site Rebuild Implementation Plan (Plan A of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing Next.js 11 blog with an Astro 5 + TypeScript + Tailwind 4 rebuild, preserving all 14 posts and their existing `/blog/<slug>` URLs, with a navy + ochre + cream editorial-magazine design system. End state is a working, deployable site that ships to production via Vercel.

**Architecture:** Static Astro site. Content lives as MDX in `src/content/writing/`, validated by Astro Content Collections (Zod). Tags are free-form on posts; a `src/lib/buckets.ts` module maps them to 5 display buckets (Leadership, Engineering, AI, Process, Notes) that drive per-post visual treatment. Work happens on a long-lived `rebuild` branch; production stays on Next.js (main) until cutover.

**Tech Stack:** Astro 5, TypeScript, Tailwind 4 (CSS-first `@theme` config), `@astrojs/mdx`, `@astrojs/sitemap`, `@astrojs/rss`, Shiki (built-in via `@astrojs/markdown-remark`), `rehype-katex` + `remark-math`, Vitest (for unit tests), Playwright (smoke test only), Vercel.

**Out of scope for Plan A** (deferred to Plan B): the AI drafting agent, Notion integration, GitHub Actions cron, hero image generation. Plan A produces a site where you can post manually (write MDX → commit → push → ship).

---

## File structure

Files this plan creates or modifies. Use this as the map; each task points to specific paths.

**Project root (rebuild branch only — main stays Next.js):**

```
package.json                                # Astro project manifest (replaces Next.js)
astro.config.mjs                            # Astro config: integrations, markdown, vite
tsconfig.json                               # TypeScript strict
.prettierrc                                 # Astro + TS formatting
.gitignore                                  # extend to include /dist, .astro/

src/
  content.config.ts                         # Content Collections schema (Zod)

  lib/
    buckets.ts                              # Tag → bucket resolver, bucket metadata
    buckets.test.ts                         # Vitest unit tests for resolver
    site.ts                                 # Site-wide metadata (title, author, etc.)
    formatDate.ts                           # Single date formatter (replaces Next moment.js)

  styles/
    global.css                              # Tailwind 4 + @theme palette tokens + base typography

  layouts/
    BaseLayout.astro                        # <html>, fonts, header, footer, theme script
    PostLayout.astro                        # Wraps post pages

  components/
    Header.astro                            # Site header w/ nav + theme toggle
    Footer.astro                            # Footer w/ reply-via links
    ThemeToggle.astro                       # System/light/dark toggle button
    Hero.astro                              # Cream/navy intro block
    PostCard.astro                          # Colored grid cell, driven by bucket
    PostHeader.astro                        # Eyebrow + italic title + summary + hero image
    Prose.astro                             # MDX body wrapper with typography styles
    mdx/
      Callout.astro                         # Replaces components/Callout.js
      Youtube.astro                         # Replaces components/Youtube.js
      Toc.astro                             # Replaces TOCInline (Astro generates the TOC)
      Image.astro                           # Wrapper around <Image> from astro:assets

  pages/
    index.astro                             # Homepage: cream hero + 4-cell grid
    about.astro                             # About page
    projects.astro                          # Projects page
    404.astro                               # Not found
    blog/
      [...slug].astro                       # Post route — preserves /blog/<slug> URLs
    feed.xml.ts                             # @astrojs/rss endpoint at /feed.xml

  content/
    writing/
      <14 migrated .mdx files>              # Posts, frontmatter conformed to new schema
      _assets/                              # Reserved for hero images (Plan B fills these)

public/
  static/                                   # Existing /static/images/* preserved as-is (linked from migrated posts)
  favicon.svg
  robots.txt

tests/
  smoke.spec.ts                             # Playwright: every post URL returns 200 and renders

.github/workflows/
  ci.yml                                    # Type-check + build on every PR
```

**Deleted from the rebuild branch** (live on main until cutover): `pages/`, `components/`, `data/`, `lib/`, `layouts/`, `scripts/`, `css/`, `next.config.js`, `postcss.config.js`, `tailwind.config.js`, `jsconfig.json`, `.eslintrc.js`, `prettier.config.js`, `solo.yml`.

---

## Phase 0 — Branch setup

### Task 0.1: Create the rebuild branch and prepare the workspace

**Files:**

- No files modified yet; just git plumbing.

- [ ] **Step 1: Confirm clean working tree (or stash pre-existing changes)**

Run: `git status --short`

If `M package.json`, `M package-lock.json`, `?? solo.yml`, or the unfinished 1Password post show up, stash them — they're not part of this plan:

```bash
git stash push -u -m "pre-rebuild stash" -- package.json package-lock.json solo.yml data/blog/storing-and-accessing-environment-variables-in-1password.mdx
```

Expected after: `git status --short` shows only files this plan will touch.

- [ ] **Step 2: Create and switch to the rebuild branch**

```bash
git switch -c rebuild
```

Expected: `Switched to a new branch 'rebuild'`.

- [ ] **Step 3: Push to remote with upstream so Vercel starts producing preview deployments**

```bash
git push -u origin rebuild
```

Expected: a remote tracking branch is created; in Vercel's deployments tab, a preview build kicks off (it will fail with "no changes" or build the existing Next.js — that's fine, we replace next step).

- [ ] **Step 4: Commit a marker for the start of the rebuild**

No file changes; create an empty commit so the branch has a distinct first commit:

```bash
git commit --allow-empty -m "rebuild: start"
git push
```

---

## Phase 1 — Astro scaffold + design tokens + fonts + base layout

### Task 1.1: Replace Next.js with an Astro 5 project

**Files:**

- Delete: most root files (see below)
- Create: `package.json`, `astro.config.mjs`, `tsconfig.json`, `src/pages/index.astro`

- [ ] **Step 1: Remove Next.js artifacts**

```bash
git rm -r pages components data lib layouts css scripts public next.config.js postcss.config.js tailwind.config.js jsconfig.json .eslintrc.js prettier.config.js solo.yml .next 2>/dev/null
# Keep these: .git, .github (we replace ci.yml later), .gitignore (we extend), .gitattributes, .husky (we drop later), LICENSE, README.md (we update later), CLAUDE.md
git rm -r .husky .eslintignore || true
```

The `data/blog/*.mdx` files we just deleted will be restored from git history during Phase 6's migration — don't worry about losing them.

Run: `git status --short`
Expected: a large set of deletions staged.

- [ ] **Step 2: Initialize Astro at the project root using the empty template**

```bash
npm create astro@latest . -- --template minimal --typescript strict --install --no-git --skip-houston --yes
```

Expected: creates `package.json`, `astro.config.mjs`, `tsconfig.json`, `src/pages/index.astro`, `public/favicon.svg`, installs dependencies, no prompts.

- [ ] **Step 3: Add the integrations we need**

```bash
npx astro add tailwind mdx sitemap react --yes
```

Expected: Astro installs `@astrojs/tailwind` (which pulls in Tailwind 4 in current Astro), `@astrojs/mdx`, `@astrojs/sitemap`, `@astrojs/react`, and updates `astro.config.mjs` with the integrations. The React integration is needed for any future interactive island; the rest are content.

- [ ] **Step 4: Add the remaining runtime dependencies**

```bash
npm install @astrojs/rss rehype-katex remark-math rehype-slug rehype-autolink-headings
npm install -D vitest @playwright/test prettier prettier-plugin-astro
```

- [ ] **Step 5: Extend `.gitignore`**

Read the current `.gitignore`, then append the Astro-specific entries. Replace the file's contents with:

```
# dependencies
/node_modules

# astro
/dist
.astro/

# testing
/coverage
/test-results
/playwright-report

# vercel
.vercel

# misc
.DS_Store
.idea
.superpowers/

# debug
*.log
npm-debug.log*

# local env files
.env
.env.local
.env.*.local
```

- [ ] **Step 6: Verify the dev server starts**

```bash
npm run dev
```

Expected: server starts on `http://localhost:4321`. Visit it — you should see the Astro "Hello, Astronaut!" placeholder. Stop the server (Ctrl-C).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "rebuild: scaffold Astro 5 + Tailwind 4 + MDX + integrations"
git push
```

Expected: pushes; Vercel detects Astro (via `package.json`) and produces a preview URL with the placeholder page.

### Task 1.2: Configure the Astro project for our needs

**Files:**

- Modify: `astro.config.mjs`
- Create: `src/lib/site.ts`

- [ ] **Step 1: Create the site metadata module**

Create `src/lib/site.ts`:

```ts
export const SITE = {
  title: 'Shariq Hirani',
  description: 'Musings on leadership and technology.',
  author: 'Shariq Hirani',
  url: 'https://www.shariq.dev',
  email: 'shariq@coreworx.io',
  social: {
    twitter: 'https://twitter.com/ShariqHirani',
    github: 'https://github.com/shariqh',
    linkedin: 'https://www.linkedin.com/in/shariqhirani',
    instagram: 'https://www.instagram.com/shariqhiraniphoto',
  },
} as const
```

- [ ] **Step 2: Replace `astro.config.mjs` with our full config**

Overwrite `astro.config.mjs` with:

```js
import { defineConfig } from 'astro/config'
import mdx from '@astrojs/mdx'
import sitemap from '@astrojs/sitemap'
import react from '@astrojs/react'
import tailwind from '@astrojs/tailwind'

import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'

export default defineConfig({
  site: 'https://www.shariq.dev',
  integrations: [
    tailwind({ applyBaseStyles: false }), // we own base styles in src/styles/global.css
    mdx(),
    sitemap(),
    react(),
  ],
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeSlug, [rehypeAutolinkHeadings, { behavior: 'wrap' }], rehypeKatex],
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      wrap: true,
    },
  },
  vite: {
    css: { devSourcemap: true },
  },
})
```

- [ ] **Step 3: Verify dev server still starts**

Run: `npm run dev`
Expected: no errors. Stop server.

- [ ] **Step 4: Commit**

```bash
git add astro.config.mjs src/lib/site.ts
git commit -m "rebuild: configure Astro integrations + remark/rehype chain"
git push
```

### Task 1.3: Add palette tokens, fonts, and global base styles

**Files:**

- Create: `src/styles/global.css`
- Modify: nothing else yet

- [ ] **Step 1: Create the global stylesheet with Tailwind 4 + design tokens**

Create `src/styles/global.css`:

```css
@import 'tailwindcss';
@import 'katex/dist/katex.min.css';

/* Design tokens */
@theme {
  --color-ink: #15233a;
  --color-ink-soft: #2a3f5f;
  --color-ochre: #d49a3a;
  --color-terracotta: #b04a3a;
  --color-paper: #f3e8d2;
  --color-paper-soft: #faf3e3;

  --font-display: 'Fraunces', Georgia, serif;
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
}

/* Light is default; dark inverts. */
@layer base {
  :root {
    --bg: var(--color-paper);
    --bg-soft: var(--color-paper-soft);
    --fg: var(--color-ink);
    --fg-soft: var(--color-ink-soft);
    --accent: var(--color-ochre);
    --accent-alt: var(--color-terracotta);

    color-scheme: light;
  }

  :root.dark {
    --bg: var(--color-ink);
    --bg-soft: var(--color-ink-soft);
    --fg: var(--color-paper);
    --fg-soft: var(--color-paper-soft);
    --accent: var(--color-ochre);
    --accent-alt: var(--color-terracotta);

    color-scheme: dark;
  }

  html {
    background: var(--bg);
    color: var(--fg);
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  body {
    min-height: 100dvh;
  }

  ::selection {
    background: var(--accent);
    color: var(--color-ink);
  }
}
```

- [ ] **Step 2: Install Fontsource font packages for offline-friendly font shipping**

```bash
npm install @fontsource-variable/fraunces @fontsource-variable/inter @fontsource-variable/jetbrains-mono
```

- [ ] **Step 3: Verify Tailwind still compiles**

Run: `npm run dev`. Visit `/`. Expected: page renders with cream background (`#f3e8d2`) and dark navy text. Stop server.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "rebuild: palette tokens, fonts, and base typography in global.css"
git push
```

### Task 1.4: Create BaseLayout with header, footer, and theme initialization

**Files:**

- Create: `src/layouts/BaseLayout.astro`, `src/components/Header.astro`, `src/components/Footer.astro`, `src/components/ThemeToggle.astro`
- Modify: `src/pages/index.astro` (replace placeholder)

- [ ] **Step 1: Create `src/components/ThemeToggle.astro`**

```astro
---
// Theme is stored in localStorage as 'system' | 'light' | 'dark'.
// 'system' (default) follows prefers-color-scheme.
---
<button
  type="button"
  id="theme-toggle"
  class="font-mono text-xs uppercase tracking-widest underline-offset-4 hover:underline"
  aria-label="Toggle theme"
>
  <span data-theme-label>system</span>
</button>

<script is:inline>
  (function () {
    const root = document.documentElement;
    const stored = localStorage.getItem("theme") || "system";
    const apply = (mode) => {
      const dark =
        mode === "dark" ||
        (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.classList.toggle("dark", dark);
      const label = document.querySelector("[data-theme-label]");
      if (label) label.textContent = mode;
    };
    apply(stored);

    document.addEventListener("click", (e) => {
      const target = e.target;
      if (target && target.id === "theme-toggle") {
        const current = localStorage.getItem("theme") || "system";
        const next = current === "system" ? "light" : current === "light" ? "dark" : "system";
        localStorage.setItem("theme", next);
        apply(next);
      }
    });

    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", () => apply(localStorage.getItem("theme") || "system"));
  })();
</script>
```

- [ ] **Step 2: Create `src/components/Header.astro`**

```astro
---
import ThemeToggle from "./ThemeToggle.astro";
import { SITE } from "../lib/site";
---
<header class="w-full border-b border-[color-mix(in_oklab,var(--fg)_15%,transparent)]">
  <div class="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
    <a href="/" class="font-display text-lg italic tracking-tight">{SITE.title}</a>
    <nav class="flex items-center gap-6 text-sm">
      <a href="/" class="hover:text-[var(--accent)]">writing</a>
      <a href="/about" class="hover:text-[var(--accent)]">about</a>
      <a href="/projects" class="hover:text-[var(--accent)]">projects</a>
      <ThemeToggle />
    </nav>
  </div>
</header>
```

- [ ] **Step 3: Create `src/components/Footer.astro`**

```astro
---
import { SITE } from "../lib/site";
---
<footer class="mt-24 border-t border-[color-mix(in_oklab,var(--fg)_15%,transparent)]">
  <div class="mx-auto flex max-w-3xl flex-col gap-3 px-5 py-8 text-sm sm:flex-row sm:justify-between">
    <p>&copy; {new Date().getFullYear()} {SITE.author}</p>
    <p class="flex gap-4">
      <a href={`mailto:${SITE.email}`} class="hover:text-[var(--accent)]">reply via email</a>
      <a href={SITE.social.twitter} class="hover:text-[var(--accent)]">twitter</a>
      <a href="/feed.xml" class="hover:text-[var(--accent)]">rss</a>
    </p>
  </div>
</footer>
```

- [ ] **Step 4: Create `src/layouts/BaseLayout.astro`**

```astro
---
import "@fontsource-variable/fraunces";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "../styles/global.css";
import Header from "../components/Header.astro";
import Footer from "../components/Footer.astro";
import { SITE } from "../lib/site";

interface Props {
  title?: string;
  description?: string;
}

const { title, description = SITE.description } = Astro.props;
const fullTitle = title ? `${title} — ${SITE.title}` : SITE.title;
const canonical = new URL(Astro.url.pathname, SITE.url).toString();
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{fullTitle}</title>
    <meta name="description" content={description} />
    <link rel="canonical" href={canonical} />
    <link rel="alternate" type="application/rss+xml" title={SITE.title} href="/feed.xml" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta property="og:title" content={fullTitle} />
    <meta property="og:description" content={description} />
    <meta property="og:type" content="website" />
    <meta property="og:url" content={canonical} />
  </head>
  <body>
    <Header />
    <main class="mx-auto max-w-3xl px-5">
      <slot />
    </main>
    <Footer />
  </body>
</html>
```

- [ ] **Step 5: Replace `src/pages/index.astro` with a temporary "proof of life" homepage**

```astro
---
import BaseLayout from "../layouts/BaseLayout.astro";
---
<BaseLayout>
  <section class="py-16">
    <h1 class="font-display text-5xl italic leading-none tracking-tight">
      Musings on leadership<br />and technology.
    </h1>
    <p class="mt-6 max-w-prose font-sans text-base text-[var(--fg-soft)]">
      Site is being rebuilt. Real homepage lands in Phase 5.
    </p>
  </section>
</BaseLayout>
```

- [ ] **Step 6: Verify in browser**

Run: `npm run dev`. Visit `/`. Expected: cream background, dark navy italic-serif headline, header with nav and theme toggle, footer with email/twitter/rss links. Click the theme toggle — page should cycle system → light → dark → system; in dark mode background goes navy, text goes cream. Stop server.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "rebuild: BaseLayout, Header, Footer, ThemeToggle, proof-of-life home"
git push
```

Expected: Vercel preview at the rebuild branch URL now serves the proof-of-life homepage. Open it on your phone to verify mobile breakpoints work.

---

## Phase 2 — Content Collections schema + bucket resolver (TDD)

### Task 2.1: TDD the bucket resolver

The resolver is a pure function: given an array of tags, return the bucket label and key. This is the one place where TDD really pays off — the test is small, the contract is clear, and downstream components rely on it.

**Files:**

- Create: `src/lib/buckets.ts`
- Create: `src/lib/buckets.test.ts`
- Modify: `package.json` (add vitest scripts)

- [ ] **Step 1: Add the vitest config and scripts**

Add to `package.json` (merge into existing `scripts` block):

```json
"scripts": {
  "dev": "astro dev",
  "start": "astro dev",
  "build": "astro build",
  "preview": "astro preview",
  "astro": "astro",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { environment: 'node' },
})
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/buckets.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveBucket, BUCKETS } from './buckets'

describe('resolveBucket', () => {
  it("returns 'leadership' for leadership-family tags", () => {
    expect(resolveBucket(['leadership']).key).toBe('leadership')
    expect(resolveBucket(['management', 'teams']).key).toBe('leadership')
  })

  it("returns 'engineering' for engineering-family tags", () => {
    expect(resolveBucket(['nextjs']).key).toBe('engineering')
    expect(resolveBucket(['docker', 'cloud']).key).toBe('engineering')
  })

  it("returns 'ai' for ai-family tags", () => {
    expect(resolveBucket(['claude']).key).toBe('ai')
    expect(resolveBucket(['mcp', 'agents']).key).toBe('ai')
  })

  it("returns 'process' for process-family tags", () => {
    expect(resolveBucket(['workflow']).key).toBe('process')
    expect(resolveBucket(['how-to']).key).toBe('process')
  })

  it("falls back to 'notes' for unrecognized tags", () => {
    expect(resolveBucket(['random-thing']).key).toBe('notes')
    expect(resolveBucket([]).key).toBe('notes')
  })

  it('first matching tag wins', () => {
    // 'insights' is unknown, 'docker' is engineering -> engineering wins (not notes)
    expect(resolveBucket(['insights', 'docker']).key).toBe('engineering')
  })

  it('exposes labels', () => {
    expect(BUCKETS.leadership.label).toBe('Leadership')
    expect(BUCKETS.ai.label).toBe('AI')
  })
})
```

- [ ] **Step 3: Run the test to confirm it fails**

Run: `npm test`
Expected: `FAIL` — `Cannot find module './buckets'`.

- [ ] **Step 4: Implement `src/lib/buckets.ts`**

```ts
export const BUCKETS = {
  leadership: {
    label: 'Leadership',
    tags: ['leadership', 'management', 'teams', 'culture', 'insights'],
  },
  engineering: {
    label: 'Engineering',
    tags: [
      'nextjs',
      'docker',
      'devops',
      'cloud',
      'architecture',
      'astro',
      'typescript',
      'javascript',
      'engineering',
    ],
  },
  ai: {
    label: 'AI',
    tags: [
      'ai',
      'llm',
      'claude',
      'agents',
      'mcp',
      'claude-code',
      'agent-sdk',
      'anthropic',
      'openai',
      'prompts',
      'rag',
    ],
  },
  process: {
    label: 'Process',
    tags: ['workflow', 'tooling', 'systems', 'how-to', 'guide'],
  },
  notes: {
    label: 'Notes',
    tags: [],
  },
} as const

export type BucketKey = keyof typeof BUCKETS
export type Bucket = { key: BucketKey; label: string }

const TAG_INDEX: Record<string, BucketKey> = (() => {
  const index: Record<string, BucketKey> = {}
  for (const [key, def] of Object.entries(BUCKETS) as [BucketKey, { tags: readonly string[] }][]) {
    for (const tag of def.tags) {
      index[tag.toLowerCase()] = key
    }
  }
  return index
})()

export function resolveBucket(tags: readonly string[]): Bucket {
  for (const tag of tags) {
    const hit = TAG_INDEX[tag.toLowerCase()]
    if (hit) return { key: hit, label: BUCKETS[hit].label }
  }
  return { key: 'notes', label: BUCKETS.notes.label }
}
```

Note: `insights` was the dominant tag on the existing leadership-y posts, so it's intentionally included in the `leadership` bucket. `engineering` (the tag) maps to the `engineering` bucket.

- [ ] **Step 5: Run the test to confirm it passes**

Run: `npm test`
Expected: all 7 tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "rebuild: bucket resolver with unit tests (TDD)"
git push
```

### Task 2.2: Define the content collection schema

**Files:**

- Create: `src/content.config.ts`

- [ ] **Step 1: Create `src/content.config.ts`**

```ts
import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

const writing = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/writing' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      date: z.coerce.date(),
      tags: z.array(z.string()).default([]),
      summary: z.string().max(280),
      hero: z
        .object({
          image: image(),
          alt: z.string(),
          prompt: z.string().optional(),
          background: z.enum(['ink', 'ink-soft', 'ochre', 'terracotta', 'paper']).optional(),
          titleStyle: z.enum(['italic', 'upper-mono', 'serif-display']).optional(),
        })
        .optional(),
      draft: z.boolean().default(false),
      updatedAt: z.coerce.date().optional(),
      canonical: z.string().url().optional(),
    }),
})

export const collections = { writing }
```

`z.coerce.date()` accepts ISO strings, dashes, slashes — robust against frontmatter date formats. `canonical` is included because several existing posts have a `canonical:` field pointing to bundleapps.io syndications.

- [ ] **Step 2: Create the empty content directory**

```bash
mkdir -p src/content/writing/_assets
```

- [ ] **Step 3: Verify Astro accepts the empty collection**

Run: `npm run build`
Expected: build succeeds. There are no posts yet; that's fine — Astro logs "writing: 0 entries" and continues.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "rebuild: content collection schema (Zod)"
git push
```

---

## Phase 3 — MDX custom components

### Task 3.1: Port Callout, Youtube, and Image components

These three are the only custom components the existing posts use. (Verified by grep: `Goal` and `TOCInline` aren't used in any post.) Toc is still worth building because we want it on every long post, but it's not strictly a migration concern.

**Files:**

- Create: `src/components/mdx/Callout.astro`, `src/components/mdx/Youtube.astro`, `src/components/mdx/Image.astro`

- [ ] **Step 1: Create `src/components/mdx/Callout.astro`**

Drops the Next-Link dependency; renders the bordered info-box used in `developer-cheat-sheet.mdx`.

```astro
---
interface Props {
  text: string;
  linkText?: string;
  link?: string;
  postLinkText?: string;
}
const { text, linkText, link, postLinkText } = Astro.props;
---
<div class="my-6 flex gap-3 rounded-xl border border-[color-mix(in_oklab,var(--fg)_20%,transparent)] bg-[var(--bg-soft)] p-4">
  <svg class="h-5 w-5 flex-shrink-0 text-[var(--accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
  <span class="text-sm">
    {text}{linkText && link ? <> <a href={link} class="underline decoration-[var(--accent)] underline-offset-2">{linkText}</a></> : null}{postLinkText}
  </span>
</div>
```

- [ ] **Step 2: Create `src/components/mdx/Youtube.astro`**

```astro
---
interface Props {
  embedId: string;
}
const { embedId } = Astro.props;
---
<div class="my-6 aspect-video w-full">
  <iframe
    class="h-full w-full rounded-lg"
    src={`https://www.youtube.com/embed/${embedId}`}
    title="YouTube video"
    loading="lazy"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
  />
</div>
```

- [ ] **Step 3: Create `src/components/mdx/Image.astro`**

The existing MDX files use a `<Image>` component with `src`, `alt`, `width`, `height`, and sometimes `placeholder`/`blurDataURL`. In Astro, the native `<Image>` from `astro:assets` handles optimization automatically. We wrap it so existing MDX keeps working without edits — `placeholder` and `blurDataURL` are silently ignored (Astro does its own blur via `blur-up`).

```astro
---
import { Image as AstroImage } from "astro:assets";

interface Props {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  placeholder?: string;     // ignored, kept for back-compat with migrated posts
  blurDataURL?: string;     // ignored, kept for back-compat with migrated posts
}
const { src, alt, width = 1200, height = 630 } = Astro.props;
---
{/* External / public-folder images: render as <img>. Astro:assets requires imports for optimization. */}
<img src={src} alt={alt} width={width} height={height} loading="lazy" decoding="async" class="my-6 rounded-lg" />
```

(The simplification: in the current site, hero images live under `/public/static/images/...` and are referenced by string paths. Astro can't optimize string-path images at build time without ESM imports. For Plan A we render them as-is via `<img>`. Plan B's hero-image flow uses `astro:assets` properly via the schema's `image()` helper.)

- [ ] **Step 4: Wire MDX components into the post layout**

Astro doesn't auto-resolve bare component names in MDX (unlike `mdx-bundler`). Two ways to make `<Callout>` work without imports in the MDX file: (a) ask the author to import per-file, (b) provide a single global component map. Option (b) is what we want.

Astro's recommended pattern: a `<Content components={...} />` render in the post page. We'll do this in Phase 5's `[...slug].astro`. For now, just verify the components compile:

```bash
npm run build
```

Expected: build still passes (no posts yet, components aren't rendered).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "rebuild: port Callout, Youtube, Image MDX components to Astro"
git push
```

### Task 3.2: Add a Table-of-Contents component

`TOCInline` from the current site was only used as an optional component; we'll give it as a server-rendered TOC at the top of long posts.

**Files:**

- Create: `src/components/mdx/Toc.astro`

- [ ] **Step 1: Create the TOC component**

```astro
---
import type { MarkdownHeading } from "astro";

interface Props {
  headings: MarkdownHeading[];
  minDepth?: number;
  maxDepth?: number;
}

const { headings, minDepth = 2, maxDepth = 3 } = Astro.props;
const filtered = headings.filter((h) => h.depth >= minDepth && h.depth <= maxDepth);
---
{filtered.length > 0 && (
  <nav class="my-8 border-l-2 border-[var(--accent)] pl-4">
    <p class="mb-2 font-mono text-xs uppercase tracking-widest text-[var(--fg-soft)]">Contents</p>
    <ul class="space-y-1 text-sm">
      {filtered.map((h) => (
        <li class={h.depth === 3 ? "ml-4" : ""}>
          <a href={`#${h.slug}`} class="hover:text-[var(--accent)]">{h.text}</a>
        </li>
      ))}
    </ul>
  </nav>
)}
```

Astro extracts headings from MDX automatically; we'll pass them from the post route in Phase 5.

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "rebuild: server-rendered TOC component"
git push
```

---

## Phase 4 — Design components

### Task 4.1: Hero component

**Files:**

- Create: `src/components/Hero.astro`

- [ ] **Step 1: Create `src/components/Hero.astro`**

```astro
---
interface Props {
  eyebrow?: string;
  /** Marked as italic-serif. Use a string with explicit line break HTML if you need control. */
  title: string;
  subtitle?: string;
}

const { eyebrow, title, subtitle } = Astro.props;
---
<section class="py-16">
  {eyebrow && (
    <p class="mb-4 inline-block bg-[var(--fg)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--bg)]">
      {eyebrow}
    </p>
  )}
  <h1 class="font-display text-5xl italic leading-[0.95] tracking-tight" set:html={title} />
  {subtitle && (
    <p class="mt-6 max-w-prose font-sans text-base text-[var(--fg-soft)]">{subtitle}</p>
  )}
</section>
```

`set:html` is used so titles can include explicit `<br>` for typographic line breaks.

- [ ] **Step 2: Commit**

```bash
git add src/components/Hero.astro
git commit -m "rebuild: Hero component"
git push
```

### Task 4.2: PostCard component (the colored grid cell)

**Files:**

- Create: `src/components/PostCard.astro`

- [ ] **Step 1: Create `src/components/PostCard.astro`**

```astro
---
import type { BucketKey } from "../lib/buckets";
import { formatDate } from "../lib/formatDate";

interface Props {
  href: string;
  title: string;
  date: Date;
  bucket: BucketKey;
  bucketLabel: string;
}

const { href, title, date, bucket, bucketLabel } = Astro.props;

// Each bucket gets a specific Tailwind class set. Inlined (not derived) so Tailwind sees them at build.
const cellClasses: Record<BucketKey, string> = {
  leadership:  "bg-[var(--color-ink)] text-[var(--color-paper)]",
  engineering: "bg-[var(--color-ochre)] text-[var(--color-ink)]",
  ai:          "bg-[var(--color-terracotta)] text-[var(--color-paper)]",
  process:     "bg-[var(--color-ink-soft)] text-[var(--color-paper)]",
  notes:       "bg-[var(--color-paper-soft)] text-[var(--color-ink)] italic font-display",
};

const eyebrowPrefix: Record<BucketKey, string> = {
  leadership: "// ",
  engineering: "",
  ai: "// ",
  process: "",
  notes: "",
};
---
<a
  href={href}
  class:list={[
    "group flex min-h-[180px] flex-col justify-between border border-[var(--color-ink)] p-5 transition-transform hover:-translate-y-0.5",
    cellClasses[bucket],
  ]}
>
  <p class="font-mono text-[10px] uppercase tracking-[0.18em] opacity-80">
    {eyebrowPrefix[bucket]}{bucketLabel.toUpperCase()}
  </p>
  <div>
    <h2 class:list={["text-xl font-semibold leading-tight tracking-tight", bucket === "notes" && "italic"]}>
      {title}
    </h2>
    <p class="mt-2 font-mono text-[10px] uppercase tracking-widest opacity-60">
      {formatDate(date)}
    </p>
  </div>
</a>
```

- [ ] **Step 2: Create `src/lib/formatDate.ts`**

```ts
const FORMATTER = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

export function formatDate(d: Date): string {
  return FORMATTER.format(d)
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "rebuild: PostCard + date formatter"
git push
```

### Task 4.3: PostHeader component

**Files:**

- Create: `src/components/PostHeader.astro`

- [ ] **Step 1: Create `src/components/PostHeader.astro`**

```astro
---
import { formatDate } from "../lib/formatDate";
import type { BucketKey } from "../lib/buckets";

interface Props {
  title: string;
  date: Date;
  bucket: BucketKey;
  bucketLabel: string;
  summary?: string;
  hero?: { image: ImageMetadata; alt: string } | null;
  readingMinutes?: number;
}

const { title, date, bucket, bucketLabel, summary, hero, readingMinutes } = Astro.props;

const eyebrowPrefix: Record<BucketKey, string> = {
  leadership: "// ",
  engineering: "",
  ai: "// ",
  process: "",
  notes: "",
};

const { Image } = await import("astro:assets");
---
<header class="py-12">
  <p class="font-mono text-xs uppercase tracking-[0.22em] text-[var(--fg-soft)]">
    {eyebrowPrefix[bucket]}{bucketLabel.toUpperCase()}
    <span class="mx-2">·</span>
    {formatDate(date)}
    {readingMinutes ? <><span class="mx-2">·</span>{readingMinutes} min read</> : null}
  </p>

  <h1 class="mt-4 font-display text-4xl italic leading-[1.05] tracking-tight sm:text-5xl">{title}</h1>

  {summary && (
    <p class="mt-5 max-w-prose font-sans text-lg text-[var(--fg-soft)]">{summary}</p>
  )}

  {hero && (
    <div class="mt-8">
      <Image src={hero.image} alt={hero.alt} class="w-full rounded-lg" />
    </div>
  )}
</header>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/PostHeader.astro
git commit -m "rebuild: PostHeader component"
git push
```

### Task 4.4: Prose component (MDX body styles)

**Files:**

- Create: `src/components/Prose.astro`

- [ ] **Step 1: Create `src/components/Prose.astro`**

```astro
---
// Owns the long-form reading typography. All styles target descendants
// so MDX content (which has no class hooks) gets styled.
---
<div class="prose">
  <slot />
</div>

<style is:global>
  .prose {
    @apply font-sans text-[17px] leading-[1.7] text-[var(--fg)];
    max-width: 65ch;
  }
  .prose h2 {
    @apply mt-12 mb-4 font-display text-3xl italic leading-tight;
  }
  .prose h3 {
    @apply mt-8 mb-3 font-sans text-xl font-semibold;
  }
  .prose p { @apply my-5; }
  .prose a {
    @apply underline decoration-[var(--accent)] decoration-2 underline-offset-4 transition-colors;
  }
  .prose a:hover { color: var(--accent); }
  .prose strong { @apply font-semibold; }
  .prose ul { @apply my-5 list-disc pl-6; }
  .prose ol { @apply my-5 list-decimal pl-6; }
  .prose li { @apply my-2; }
  .prose blockquote {
    @apply my-6 border-l-2 border-[var(--accent)] pl-4 italic text-[var(--fg-soft)];
  }
  .prose code:not(pre code) {
    @apply rounded bg-[var(--bg-soft)] px-1.5 py-0.5 font-mono text-[0.9em];
  }
  .prose pre {
    @apply my-6 overflow-x-auto rounded-lg p-4 text-sm;
  }
  .prose pre code { @apply font-mono; }
  .prose img { @apply my-6 rounded-lg; }
  .prose hr {
    @apply my-12 border-0 border-t border-[color-mix(in_oklab,var(--fg)_15%,transparent)];
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Prose.astro
git commit -m "rebuild: Prose component for MDX body"
git push
```

---

## Phase 5 — Pages

### Task 5.1: Home page (cream hero + 4-cell grid)

**Files:**

- Modify: `src/pages/index.astro`

- [ ] **Step 1: Replace `src/pages/index.astro`**

```astro
---
import { getCollection } from "astro:content";
import BaseLayout from "../layouts/BaseLayout.astro";
import Hero from "../components/Hero.astro";
import PostCard from "../components/PostCard.astro";
import { resolveBucket } from "../lib/buckets";

const all = await getCollection("writing", ({ data }) => !data.draft);
const posts = all
  .sort((a, b) => b.data.date.getTime() - a.data.date.getTime())
  .slice(0, 4);
---
<BaseLayout>
  <Hero
    eyebrow="Shariq Hirani"
    title="Writing on tech,<br/>leadership,<br/>& shipping."
    subtitle="Notes from inside the work — engineering leadership, product calls, and the weird, fun parts."
  />

  <section class="grid grid-cols-1 gap-0 sm:grid-cols-2">
    {posts.map((post) => {
      const bucket = resolveBucket(post.data.tags);
      return (
        <PostCard
          href={`/blog/${post.id.replace(/\.mdx$/, "")}`}
          title={post.data.title}
          date={post.data.date}
          bucket={bucket.key}
          bucketLabel={bucket.label}
        />
      );
    })}
  </section>

  {all.length > 4 && (
    <section class="mt-16">
      <p class="mb-4 font-mono text-xs uppercase tracking-widest text-[var(--fg-soft)]">More</p>
      <ul class="space-y-2">
        {all.slice(4).map((post) => (
          <li class="flex items-baseline justify-between gap-4 border-b border-[color-mix(in_oklab,var(--fg)_10%,transparent)] py-2">
            <a href={`/blog/${post.id.replace(/\.mdx$/, "")}`} class="text-base hover:text-[var(--accent)]">
              {post.data.title}
            </a>
            <span class="flex-shrink-0 font-mono text-xs text-[var(--fg-soft)]">
              {post.data.date.toISOString().slice(0, 10)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )}
</BaseLayout>
```

- [ ] **Step 2: Verify**

Run: `npm run dev` and visit `/`. There are no posts yet, so the grid renders empty. The hero still renders. (We'll see full output after Phase 6 migration.)

- [ ] **Step 3: Commit**

```bash
git add src/pages/index.astro
git commit -m "rebuild: homepage (hero + 4-cell grid + chronological tail)"
git push
```

### Task 5.2: Post route (`/blog/[...slug]`)

**Files:**

- Create: `src/pages/blog/[...slug].astro`

- [ ] **Step 1: Create the dynamic post route**

```astro
---
import { getCollection, render } from "astro:content";
import BaseLayout from "../../layouts/BaseLayout.astro";
import PostHeader from "../../components/PostHeader.astro";
import Prose from "../../components/Prose.astro";
import Toc from "../../components/mdx/Toc.astro";
import Callout from "../../components/mdx/Callout.astro";
import Youtube from "../../components/mdx/Youtube.astro";
import Image from "../../components/mdx/Image.astro";
import { resolveBucket } from "../../lib/buckets";

export async function getStaticPaths() {
  const posts = await getCollection("writing", ({ data }) => !data.draft);
  return posts.map((post) => ({
    params: { slug: post.id.replace(/\.mdx$/, "") },
    props: { post },
  }));
}

const { post } = Astro.props;
const { Content, headings, remarkPluginFrontmatter } = await render(post);

const bucket = resolveBucket(post.data.tags);
const readingMinutes = remarkPluginFrontmatter?.readingTime
  ? Math.ceil(remarkPluginFrontmatter.readingTime / 60)
  : undefined;
---
<BaseLayout title={post.data.title} description={post.data.summary}>
  <article class="pb-16">
    <PostHeader
      title={post.data.title}
      date={post.data.date}
      bucket={bucket.key}
      bucketLabel={bucket.label}
      summary={post.data.summary}
      hero={post.data.hero ? { image: post.data.hero.image, alt: post.data.hero.alt } : null}
      readingMinutes={readingMinutes}
    />

    {headings.length > 4 && <Toc headings={headings} />}

    <Prose>
      <Content components={{ Callout, Youtube, Image }} />
    </Prose>

    {post.data.canonical && (
      <p class="mt-12 font-mono text-xs uppercase tracking-widest text-[var(--fg-soft)]">
        Originally published at{" "}
        <a href={post.data.canonical} class="underline decoration-[var(--accent)] underline-offset-4">
          {new URL(post.data.canonical).hostname}
        </a>
      </p>
    )}
  </article>
</BaseLayout>
```

- [ ] **Step 2: Add reading-time as a remark plugin**

Astro doesn't ship reading-time by default. Install it:

```bash
npm install reading-time
```

Create `src/lib/remark-reading-time.ts`:

```ts
import getReadingTime from 'reading-time'
import { toString } from 'mdast-util-to-string'

export function remarkReadingTime() {
  return function (tree: any, { data }: any) {
    const textOnPage = toString(tree)
    const readingTime = getReadingTime(textOnPage)
    data.astro.frontmatter.readingTime = readingTime.time / 1000 // seconds
  }
}
```

Install the helper package:

```bash
npm install mdast-util-to-string
```

Update `astro.config.mjs` — add the import and include in `remarkPlugins`:

```js
import { remarkReadingTime } from "./src/lib/remark-reading-time";
// ...
markdown: {
  remarkPlugins: [remarkMath, remarkReadingTime],
  // ...
},
```

- [ ] **Step 3: Verify build (no posts yet, route should compile)**

Run: `npm run build`
Expected: build succeeds with 0 entries for the `writing` collection.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "rebuild: /blog/[...slug] post route + reading-time plugin"
git push
```

### Task 5.3: About and Projects pages

These are content-light placeholders that mirror the existing site. Real content fills in later.

**Files:**

- Create: `src/pages/about.astro`, `src/pages/projects.astro`

- [ ] **Step 1: Create `src/pages/about.astro`**

```astro
---
import BaseLayout from "../layouts/BaseLayout.astro";
import Hero from "../components/Hero.astro";
---
<BaseLayout title="About">
  <Hero title="About." eyebrow="Shariq Hirani" />
  <div class="prose max-w-prose pb-16">
    <p>
      Engineering leader. I write about leading software teams, building product,
      and the in-between of tech and being a person. Currently working at Coreworx
      on the AI side.
    </p>
    <p>
      You can reach me at <a href="mailto:shariq@coreworx.io">shariq@coreworx.io</a>
      or on the various accounts linked in the footer.
    </p>
  </div>

  <style is:global>
    .prose p { @apply my-5 leading-[1.7]; }
    .prose a { @apply underline decoration-[var(--accent)] decoration-2 underline-offset-4; }
  </style>
</BaseLayout>
```

- [ ] **Step 2: Create `src/pages/projects.astro`**

```astro
---
import BaseLayout from "../layouts/BaseLayout.astro";
import Hero from "../components/Hero.astro";
---
<BaseLayout title="Projects">
  <Hero title="Projects." eyebrow="Building" />

  <div class="pb-16">
    <p class="max-w-prose text-[var(--fg-soft)]">
      Things I'm building or have built. (Real content lives in your head — fill this in
      next time you ship something noteworthy.)
    </p>
  </div>
</BaseLayout>
```

- [ ] **Step 3: 404 page**

Create `src/pages/404.astro`:

```astro
---
import BaseLayout from "../layouts/BaseLayout.astro";
import Hero from "../components/Hero.astro";
---
<BaseLayout title="Not found">
  <Hero title="404 / not found." eyebrow="// dead end" />
  <p class="max-w-prose pb-16 text-[var(--fg-soft)]">
    The page you were looking for moved, was deleted, or never existed.
    Head <a href="/" class="underline decoration-[var(--accent)] underline-offset-4">home</a>.
  </p>
</BaseLayout>
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "rebuild: about, projects, 404 pages"
git push
```

### Task 5.4: RSS feed at `/feed.xml`

**Files:**

- Create: `src/pages/feed.xml.ts`

- [ ] **Step 1: Create the RSS endpoint**

```ts
import rss from '@astrojs/rss'
import { getCollection } from 'astro:content'
import { SITE } from '../lib/site'

export async function GET(context: { site: URL }) {
  const posts = await getCollection('writing', ({ data }) => !data.draft)
  posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime())

  return rss({
    title: SITE.title,
    description: SITE.description,
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      description: post.data.summary,
      link: `/blog/${post.id.replace(/\.mdx$/, '')}/`,
    })),
  })
}
```

- [ ] **Step 2: Verify**

Run: `npm run build`
Open: `dist/feed.xml`
Expected: valid RSS XML with 0 items (no posts yet — Phase 6 fills them in).

- [ ] **Step 3: Commit**

```bash
git add src/pages/feed.xml.ts
git commit -m "rebuild: RSS feed at /feed.xml"
git push
```

---

## Phase 6 — Content migration

### Task 6.1: Restore the existing posts from main, normalize frontmatter

**Files:**

- Create: `src/content/writing/*.mdx` (14 files)
- Reference: `git show main:data/blog/*.mdx` (the pre-rebuild source)

- [ ] **Step 1: Check out the existing posts from main into the new location**

```bash
mkdir -p src/content/writing
for f in $(git ls-tree -r --name-only main -- data/blog | grep -E '\.mdx$'); do
  # Strip "data/blog/" prefix; keep nested paths (docker-series/...).
  dest="src/content/writing/${f#data/blog/}"
  mkdir -p "$(dirname "$dest")"
  git show "main:$f" > "$dest"
done
```

Run: `ls src/content/writing/`
Expected: 13 `.mdx` files plus a `docker-series/` directory containing 1 more. 14 posts total.

- [ ] **Step 2: Inspect what fields need normalizing**

The existing frontmatter shape (from inspection):

- `title`, `date`, `tags`, `draft`, `summary` — keep as is
- `images: [...]` — drop (replaced by optional `hero` block; existing posts don't get heroes in Plan A)
- `lastmod` — rename to `updatedAt`
- `canonical` — keep (schema accepts it)
- `authors` — drop (single-author site)
- `layout` — drop (layout is now a component)

- [ ] **Step 3: Normalize each post**

This is mechanical, but there are 14 files; do it as one batch with a small Node script. Create `scripts/migrate-frontmatter.mjs`:

```js
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (p.endsWith('.mdx')) out.push(p)
  }
  return out
}

const files = walk('src/content/writing')

for (const f of files) {
  let body = readFileSync(f, 'utf8')
  if (!body.startsWith('---\n')) continue

  const end = body.indexOf('\n---\n', 4)
  if (end === -1) continue

  const fmRaw = body.slice(4, end)
  const rest = body.slice(end + 5)

  const lines = fmRaw.split('\n').filter((line) => {
    if (line.startsWith('images:')) return false
    if (line.startsWith('authors:')) return false
    if (line.startsWith('layout:')) return false
    return true
  })

  // rename lastmod -> updatedAt
  const renamed = lines.map((line) =>
    line.startsWith('lastmod:') ? line.replace(/^lastmod:/, 'updatedAt:') : line
  )

  const newFm = renamed.join('\n')
  writeFileSync(f, `---\n${newFm}\n---\n${rest}`)
  console.log(`migrated ${f}`)
}
```

Run: `node scripts/migrate-frontmatter.mjs`
Expected: prints `migrated <path>` for each of the 14 files.

- [ ] **Step 4: Build to verify all 14 posts pass Zod**

```bash
npm run build
```

Expected: 14 entries in the `writing` collection; build succeeds. If any post fails Zod (e.g., `summary` over 280 chars, malformed date), fix the offender directly and re-run.

- [ ] **Step 5: Spot-check a post in dev**

Run: `npm run dev` and visit `/blog/managing-your-lows`.
Expected: the post renders with the new design — italic-serif title, eyebrow ("// LEADERSHIP · …"), body in the Prose styles, `<Image>`/`<Youtube>` components render. The hero image (`/static/images/blog/managing-your-lows/banner.png`) is referenced from the MDX as a string — see step 7.

- [ ] **Step 6: Restore the `/public/static/` image directory from main**

Existing posts reference images under `/static/images/blog/...`. These live in the old `/public/static/` directory. Restore them:

```bash
git checkout main -- public/static
mv public/static public_static_temp
mkdir -p public
mv public_static_temp public/static
```

(The `git rm -r public` in Task 1.1 deleted the public directory; this step puts the `static/` subtree back.)

- [ ] **Step 7: Re-build, verify image references resolve**

Run: `npm run build`
Expected: build succeeds. Open `/blog/managing-your-lows` in dev — the banner image renders.

- [ ] **Step 8: Delete the migration script (one-shot, no longer needed)**

```bash
rm scripts/migrate-frontmatter.mjs
rmdir scripts 2>/dev/null || true
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "rebuild: migrate 14 posts and restore /public/static images"
git push
```

Expected: Vercel preview now renders the full rebuilt site with all 14 posts.

### Task 6.2: Verify every existing URL still works

We promised in the spec to preserve `/blog/<slug>` URLs. Verify mechanically.

**Files:**

- Create: `tests/smoke.spec.ts`

- [ ] **Step 1: Initialize Playwright**

```bash
npx playwright install --with-deps chromium
```

Create `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  use: { baseURL: 'http://localhost:4321' },
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
```

- [ ] **Step 2: Write the smoke test**

```ts
import { test, expect } from '@playwright/test'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function walkMdx(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const rel = prefix ? `${prefix}/${name}` : name
    if (statSync(p).isDirectory()) {
      if (name.startsWith('_')) continue
      out.push(...walkMdx(p, rel))
    } else if (rel.endsWith('.mdx')) {
      out.push(rel.replace(/\.mdx$/, ''))
    }
  }
  return out
}

const SLUGS = walkMdx('src/content/writing')

test('homepage renders', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('h1')).toContainText(['Writing'])
})

test('RSS feed serves', async ({ request }) => {
  const res = await request.get('/feed.xml')
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toMatch(/xml/)
})

for (const slug of SLUGS) {
  test(`/blog/${slug} renders`, async ({ page }) => {
    const res = await page.goto(`/blog/${slug}`)
    expect(res?.status()).toBe(200)
    await expect(page.locator('h1')).toBeVisible()
  })
}
```

- [ ] **Step 3: Run the smoke test**

```bash
npm run build && npx playwright test
```

Expected: all 14 post URLs return 200 with a visible `<h1>`; home and RSS pass.

- [ ] **Step 4: Add a smoke npm script**

In `package.json`:

```json
"scripts": {
  "test:smoke": "playwright test"
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "rebuild: Playwright smoke test for every post URL + home + RSS"
git push
```

---

## Phase 7 — Production prep + cutover

### Task 7.1: CI on PRs

**Files:**

- Create: `.github/workflows/ci.yml`
- Delete: old GitHub Actions if any

- [ ] **Step 1: Check what's currently in `.github/workflows/`**

```bash
ls .github/workflows/ 2>/dev/null
```

If there are workflows (e.g., a previous Next.js CI), remove them:

```bash
git rm -r .github/workflows
```

- [ ] **Step 2: Create the new CI workflow**

```yaml
name: CI
on:
  push:
    branches: [main, rebuild]
  pull_request:

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run astro check
      - run: npm test
      - run: npm run build
```

- [ ] **Step 3: Verify by pushing**

```bash
git add .github/workflows/ci.yml
git commit -m "rebuild: CI workflow (type-check + unit tests + build)"
git push
```

Expected: GitHub Actions runs the CI workflow on the `rebuild` branch and it passes.

### Task 7.2: Remove non-portable analytics references and miscellany

The existing site has Plausible analytics referencing `shariq.dev` and references to giscus/utterances/disqus that we agreed to drop.

**Files:**

- Modify: `src/layouts/BaseLayout.astro` to add Plausible script
- Modify: `README.md` (refresh)

- [ ] **Step 1: Add Plausible to `BaseLayout.astro`**

In the `<head>` of `src/layouts/BaseLayout.astro`, before `</head>`, add:

```astro
<script defer data-domain="shariq.dev" src="https://plausible.io/js/script.js"></script>
```

- [ ] **Step 2: Update README**

Replace `README.md` with:

````md
# shariq.dev

Personal blog at [shariq.dev](https://www.shariq.dev). Astro 5 + Tailwind 4 + MDX.

## Develop

```bash
npm install
npm run dev    # http://localhost:4321
```
````

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

````

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "rebuild: Plausible analytics + README refresh"
git push
````

### Task 7.3: Update CLAUDE.md to reflect the new stack

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Replace CLAUDE.md with the new content**

The current CLAUDE.md describes the Next.js setup; it's out of date. Replace with:

```md
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Astro dev server at http://localhost:4321.
- `npm run build` — production build into `dist/`.
- `npm run preview` — serve the built site.
- `npm test` — Vitest unit tests.
- `npm run test:smoke` — Playwright smoke test (run after `npm run build`).
- `npm run astro check` — type-check `.astro` files.

## Architecture

Static Astro 5 + TypeScript + Tailwind 4 site. Content lives as MDX in
`src/content/writing/`, validated by Astro Content Collections (Zod schema
in `src/content.config.ts`).

### Content pipeline

- Tags are free-form on each post.
- `src/lib/buckets.ts` resolves tags to a fixed set of 5 display buckets
  (Leadership, Engineering, AI, Process, Notes). Each bucket has a distinct
  color treatment in `PostCard.astro` and `PostHeader.astro`. Both the site
  and the drafting agent read this module — it's the single source of truth.
- Post URLs are `/blog/<filename-without-extension>`. Nested folders become
  nested routes.

### Design system

- Palette tokens (`ink`, `ink-soft`, `ochre`, `terracotta`, `paper`, `paper-soft`)
  are defined as Tailwind 4 `@theme` tokens in `src/styles/global.css`.
  Dark mode inverts via a `.dark` class on `<html>`; default follows
  `prefers-color-scheme`.
- Typography: Fraunces (display, italic-serif), Inter (sans body),
  JetBrains Mono (eyebrows, code).

### Custom MDX components

`src/components/mdx/` holds `Callout`, `Youtube`, `Image`, `Toc`. They're
injected into MDX via `<Content components={...} />` in
`src/pages/blog/[...slug].astro`.

### Conventions

- Prettier with `prettier-plugin-astro`. Run `npx prettier --write .` to format.
- Strict TypeScript (`tsconfig.json` extends `astro/tsconfigs/strict`).
- Don't use the Tailwind 3 `tailwind.config.js` pattern — tokens live in
  CSS via `@theme`.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "rebuild: update CLAUDE.md for the new stack"
git push
```

### Task 7.4: Pre-cutover review

This is a manual review step. Don't merge until the boxes are checked.

- [ ] **Step 1: Open the rebuild branch's Vercel preview URL on desktop**

Walk through:

- Homepage renders, the 4 most recent posts show in the grid with correct bucket colors.
- Theme toggle cycles system → light → dark → system.
- Each of the 14 posts loads at `/blog/<slug>` and renders.
- RSS feed at `/feed.xml` has 14 items, dates in descending order.
- Sitemap at `/sitemap-index.xml` lists all the pages.
- `/about`, `/projects`, `/404` (manually visit a bad URL) all render.

- [ ] **Step 2: Open the same URL on phone**

Confirm:

- Header nav is readable.
- Post body is comfortably readable at body-text size.
- Theme toggle works.
- Hero image scales correctly.

- [ ] **Step 3: Verify SEO-critical URLs match**

```bash
# List old URLs that were in production
git show main:public/sitemap.xml 2>/dev/null | grep -oE '/blog/[^<]+' | sort -u > /tmp/old-urls.txt
# Compare to what we have now
cd dist && grep -hoE '/blog/[^"<]+' sitemap-*.xml 2>/dev/null | sort -u > /tmp/new-urls.txt && cd ..
diff /tmp/old-urls.txt /tmp/new-urls.txt
```

(If main doesn't have a generated sitemap committed, this is optional; the bigger guarantee comes from the Playwright smoke test in 6.2, which proves all post URLs return 200.)

Expected: no missing URLs.

- [ ] **Step 4: Reply to yourself in the terminal that you're ready to cut over.** (Or back out and address findings.)

### Task 7.5: Cutover

**Files:**

- Merge `rebuild` → `main`

- [ ] **Step 1: Open the PR**

```bash
gh pr create --base main --head rebuild \
  --title "rebuild: Astro 5 + Tailwind 4 + new design system" \
  --body "$(cat <<'EOF'
## Summary

Full rebuild of shariq.dev:

- Next.js 11 → Astro 5
- Tailwind 2 → Tailwind 4 (CSS-first `@theme` tokens)
- JavaScript → TypeScript (strict)
- New navy + ochre + cream + terracotta editorial design system
- Tags resolved to 5 display buckets (Leadership / Engineering / AI / Process / Notes)
- 14 posts migrated; `/blog/<slug>` URLs preserved
- Dropped: `/coffee`, `/api/*`, `/tags/<tag>` index, giscus, Spotify/goals routes

## Test plan
- [x] CI passes (type-check + unit tests + build)
- [x] Playwright smoke test passes (every post URL renders)
- [x] Vercel preview reviewed on desktop and mobile
- [x] RSS feed has all 14 posts at /feed.xml
- [x] Theme toggle cycles system/light/dark
EOF
)"
```

- [ ] **Step 2: Wait for Vercel's preview comment**

The Vercel bot posts a comment with the latest preview URL. Click it; do one final spot-check.

- [ ] **Step 3: Merge the PR**

```bash
gh pr merge --merge
```

(Use `--merge` not `--squash` — the rebuild's commit history is useful to keep.)

Expected: Vercel builds `main`, which is now the Astro site, and deploys to shariq.dev. (DNS unchanged.)

- [ ] **Step 4: Verify production**

Visit https://www.shariq.dev on desktop and mobile. Confirm:

- Homepage hero + grid.
- A few `/blog/<slug>` URLs (open ones you remember).
- `/feed.xml` returns 200 and has all posts.
- Plausible registers a page view (check the Plausible dashboard).

- [ ] **Step 5: Delete the rebuild branch**

```bash
gh api -X DELETE repos/:owner/:repo/git/refs/heads/rebuild || git push origin :rebuild
git branch -d rebuild
```

- [ ] **Step 6: Restore your stashed pre-rebuild changes (if any)**

If you stashed in Task 0.1 Step 1:

```bash
git stash list
# If there's a "pre-rebuild stash" entry:
git stash pop
```

The unfinished 1Password post and the modified `package.json`/`package-lock.json` are now sitting on `main`. They'll need to be reconciled with the new Astro project — that's a follow-up, not part of this plan.

---

## Self-review

**1. Spec coverage:**

- ✅ Astro 5 + TS + Tailwind 4 → Phase 1
- ✅ Content Collections schema (Zod) → Phase 2, Task 2.2
- ✅ Tags + bucket resolver → Phase 2, Task 2.1
- ✅ 5 buckets including AI → Task 2.1
- ✅ Palette tokens (navy + ochre + terracotta + cream) → Task 1.3
- ✅ Typography (Fraunces / Inter / JetBrains Mono) → Task 1.3
- ✅ Dark mode via prefers-color-scheme + manual toggle → Task 1.4
- ✅ Layout primitives (Hero, PostCard, PostHeader, Prose) → Phase 4
- ✅ Per-post art-direction override fields → Task 2.2 (schema includes `hero.background` and `hero.titleStyle`)
- ✅ Pages: home, /blog/[slug], /about, /projects, /feed.xml, sitemap → Phase 5
- ✅ Existing 14 posts migrated → Task 6.1
- ✅ `/blog/<slug>` URLs preserved → Task 6.1 (filename-based slugs) + Task 6.2 (smoke test)
- ✅ Custom MDX components ported → Phase 3
- ✅ Dropped pages: coffee/api/tags-index/giscus → Phase 1 (`git rm`) and never reintroduced
- ✅ Vercel deploy unchanged (auto-detects Astro) → Phase 7
- ✅ RSS at /feed.xml (URL preserved) → Task 5.4
- ✅ Plan B (drafting agent) explicitly out of scope → Header

**2. Placeholder scan:**
No TBDs or "implement appropriate" stubs. The closest thing is the Projects page placeholder copy ("Real content lives in your head…") — that's intentional content, not a plan placeholder.

**3. Type consistency:**

- `BucketKey` defined in `buckets.ts`, used in `PostCard.astro`, `PostHeader.astro`, post route ✅
- `resolveBucket()` returns `{ key, label }`, used consistently ✅
- `hero` schema in `content.config.ts` matches PostHeader's expected shape ✅
- `image()` from Zod's image helper used for typed `ImageMetadata` ✅

No fixes needed.

**4. Ambiguity check:**

- The "delete `git rm -r public`" then "restore public/static" sequence (Task 1.1 → Task 6.1 Step 6) is explicit and ordered.
- The optional `--merge` vs `--squash` choice in Task 7.5 Step 3 is called out.
- The "stash and restore pre-existing changes" is bookended (Task 0.1 Step 1 ↔ Task 7.5 Step 6).
