list# Site Redesign (Zine Homepage + Dedicated /blog) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the site into a playful personal "zine" homepage at `/` plus a dedicated ProAgenda-style `/blog` listing, both drawing from one shared design kit.

**Architecture:** Astro 6 static site. A shared "kit" (palette tokens in `global.css`, 3 fonts, shared `Header`/`Footer`/`FeaturedCard`/`CoverImage`) is consumed by a new zine homepage (`index.astro`) and a new blog listing (`blog/index.astro`). Pure logic (featured-post selection, cover resolution, carousel position) lives in `src/lib/` with vitest tests; pages are verified with Playwright smoke tests. The existing post-detail catch-all (`blog/[...slug].astro`) and the about/projects pages keep working, adopting the kit's header/footer/width.

**Tech Stack:** Astro 6, TypeScript (strict), Tailwind 4 (`@theme` tokens + scoped Astro `<style>` for complex components), Fontsource (Fraunces/Inter/JetBrains Mono), Vitest, Playwright.

**Design + visual source of truth:**

- Spec: `docs/superpowers/specs/2026-06-18-site-redesign-zine-homepage-and-blog-design.md`
- Mockups (committed, canonical for exact CSS to port):
  `design-samples/homepage-zine.html`, `design-samples/blog-calm-split.html`.
  When a step says "port styles from `<mockup>` selector `.x`", copy that rule
  verbatim, then apply the **color → CSS-var mapping** below.

## Global Constraints

- **Node:** `>=24`. **Astro:** `^6.3.8`. **Tailwind:** `^4.3.0` (no `tailwind.config.js` — tokens live in `src/styles/global.css` via `@theme`).
- **Prettier:** no semis, single quotes, 100-col, trailing `es5`. `prettier-plugin-astro` for `.astro`. Husky `lint-staged` runs prettier on commit.
- **TS:** strict (`astro/tsconfigs/strict`). `react/prop-types` N/A (no React).
- **Path aliases:** none configured for `src` — components import via **relative paths** (e.g. `../lib/site`), matching existing files. Do NOT introduce `@/` aliases.
- **Post URLs:** `/blog/<filename-without-extension>` (unchanged). The listing MUST move OFF `/` onto `/blog`.
- **Buckets:** `src/lib/buckets.ts` is the single source of truth (5 buckets: Leadership, Engineering, AI, Process, Notes). Do not fork it.
- **Motion:** every animation gated behind `@media (prefers-reduced-motion: reduce)`.
- **Dark mode must keep working:** components reference CSS vars (`--bg`, `--fg`, `--surface`, `--accent`, …), never hardcoded hex, so the `.dark` class inversion continues to work. Pixel-tuning dark is out of scope, but it must not break.
- **Tagline (verbatim):** `I build things, break a few, and write it all down.`
- **Manifesto (verbatim):** `Be a little reckless with new tools. Disciplined about everything else.`
- **Nav (verbatim, in order):** `Blog` · `Projects` · `About`. Logo links to `/`.
- **Footer socials (verbatim, in order):** `X / Twitter` · `GitHub` · `YouTube` · `LinkedIn` · `RSS`. No email.

### Color → CSS-var mapping (apply when porting mockup CSS)

| Mockup hardcoded                                    | Use in real components                                   |
| --------------------------------------------------- | -------------------------------------------------------- |
| `#15233a` / ink                                     | `var(--color-ink)` (panels) or `var(--fg)` (text)        |
| `#2a3f5f`                                           | `var(--color-ink-soft)`                                  |
| `#d49a3a`                                           | `var(--color-ochre)` / `var(--accent)`                   |
| `#b04a3a`                                           | `var(--color-terracotta)` / `var(--accent-alt)`          |
| `#faf8f3` (page bg)                                 | `var(--bg)`                                              |
| `#fff` (cards)                                      | `var(--surface)`                                         |
| `rgba(21,35,58,.06/.12/.2)` (hairlines/chips on bg) | `color-mix(in oklab, var(--fg) 6%/12%/20%, transparent)` |

---

## File structure (created / modified)

**Created**

- `src/lib/featured.ts` — pick the featured (latest non-draft) post.
- `src/lib/featured.test.ts` — tests.
- `src/lib/cover.ts` — resolve a post's card cover (image or bucket placeholder).
- `src/lib/cover.test.ts` — tests.
- `src/lib/carousel.ts` — pure position→class mapping for the portrait deck.
- `src/lib/carousel.test.ts` — tests.
- `src/lib/home.ts` — static homepage content (tagline, manifesto, "right now", "built", tags, portraits, currently).
- `src/components/PortraitDeck.astro` — fanned 5-card photo deck.
- `src/components/FeaturedCard.astro` — shared split dark panel (home + blog).
- `src/components/CoverImage.astro` — blog grid cover (image or placeholder).
- `src/components/FilterPills.astro` — blog bucket filter pills.
- `src/pages/blog/index.astro` — the dedicated blog listing.
- `public/static/images/home/portrait-1.jpg` … `portrait-5.jpg` — placeholder portraits.

**Modified**

- `src/lib/site.ts` — add `youtube` social.
- `src/styles/global.css` — lighter `--bg`, add `--surface` (light + dark).
- `src/layouts/BaseLayout.astro` — add `width?: 'prose' | 'wide'` prop.
- `src/components/Header.astro` — nav rename/reorder.
- `src/components/Footer.astro` — socials per spec.
- `src/components/PostCard.astro` — image-forward calm card.
- `src/pages/index.astro` — rebuilt as the zine homepage.
- `src/pages/blog/[...slug].astro` — cover at top + `width` (cosmetic, keep canonical logic).
- `src/pages/about.astro`, `src/pages/projects.astro` — pass `width` (no content change).
- `tests/smoke.spec.ts` — update homepage assertion, add `/blog` assertions.

---

## Task 1: Shared chrome & design tokens

**Files:**

- Modify: `src/lib/site.ts`
- Modify: `src/styles/global.css:19-56` (the `@layer base` `:root` / `:root.dark` blocks)
- Modify: `src/layouts/BaseLayout.astro:11-22,61-63`
- Modify: `src/components/Header.astro:8-13`
- Modify: `src/components/Footer.astro:4-12`
- Modify: `tests/smoke.spec.ts`

**Interfaces:**

- Produces: `SITE.social.youtube: string`; CSS vars `--surface` (light+dark) and a lighter `--bg`; `BaseLayout` prop `width?: 'prose' | 'wide'` (default `'prose'` → `max-w-3xl`; `'wide'` → `max-w-[1100px]`).

- [ ] **Step 1: Add the failing smoke assertion for the new chrome**

In `tests/smoke.spec.ts`, ADD a new test (leave the existing `homepage renders` test untouched — Task 3 changes that one):

```ts
test('header nav + footer socials', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('header nav')).toContainText(['Blog'])
  await expect(page.locator('header nav')).toContainText(['Projects'])
  const footer = page.locator('footer')
  await expect(footer).toContainText(['GitHub'])
  await expect(footer).toContainText(['YouTube'])
  await expect(footer).toContainText(['LinkedIn'])
})
```

- [ ] **Step 2: Run smoke to verify it fails**

Run: `npm run build && npm run test:smoke -- -g "header nav"`
Expected: FAIL (footer has no GitHub/YouTube yet; nav says "writing").

- [ ] **Step 3: Add YouTube to site config**

In `src/lib/site.ts`, add to the `social` object (after `linkedin`):

```ts
    youtube: 'https://www.youtube.com/@shariqhirani',
```

- [ ] **Step 4: Lighter `--bg` + add `--surface` token (light + dark)**

In `src/styles/global.css`, inside `:root` (light) change the `--bg` line and add `--surface`:

```css
--bg: #faf8f3;
--surface: #ffffff;
```

Inside `:root.dark` add a dark surface (after `--bg-soft`):

```css
--surface: #1c2c44;
```

(Leave all other tokens untouched. `--bg` was `var(--color-paper)`; the lighter value is the intended airier page background.)

- [ ] **Step 5: Add `width` prop to BaseLayout**

In `src/layouts/BaseLayout.astro`, extend `Props` and the destructure:

```ts
interface Props {
  title?: string
  description?: string
  canonical?: string
  width?: 'prose' | 'wide'
}

const {
  title,
  description = SITE.description,
  canonical: canonicalOverride,
  width = 'prose',
} = Astro.props
```

Then change the `<main>` to map the width:

```astro
    <main
      class:list={[
        "mx-auto px-5",
        width === "wide" ? "max-w-[1100px]" : "max-w-3xl",
      ]}
    >
      <slot />
    </main>
```

- [ ] **Step 6: Update Header nav**

In `src/components/Header.astro`, replace the three nav `<a>` links (keep `<ThemeToggle />`):

```astro
      <a href="/blog" class="hover:text-[var(--accent)]">Blog</a>
      <a href="/projects" class="hover:text-[var(--accent)]">Projects</a>
      <a href="/about" class="hover:text-[var(--accent)]">About</a>
```

- [ ] **Step 7: Update Footer to the spec's socials**

Replace the `<p class="flex gap-4">…</p>` block in `src/components/Footer.astro` with:

```astro
    <p class="flex flex-wrap gap-4">
      <a href={SITE.social.twitter} class="hover:text-[var(--accent)]">X / Twitter</a>
      <a href={SITE.social.github} class="hover:text-[var(--accent)]">GitHub</a>
      <a href={SITE.social.youtube} class="hover:text-[var(--accent)]">YouTube</a>
      <a href={SITE.social.linkedin} class="hover:text-[var(--accent)]">LinkedIn</a>
      <a href="/feed.xml" class="hover:text-[var(--accent)]">RSS</a>
    </p>
```

(Removes the `say hi` ContactModal trigger from the footer; the About page keeps its own contact path. `ContactModal` stays imported in BaseLayout — harmless.)

- [ ] **Step 8: Run the gate**

Run: `npm run astro check && npm run build && npm run test:smoke -- -g "header nav"`
Expected: the `header nav + footer socials` test PASSES. (The existing `homepage renders` test still asserts the old listing and remains green until Task 3 rewrites both the page and that test.)

- [ ] **Step 9: Commit**

```bash
git add src/lib/site.ts src/styles/global.css src/layouts/BaseLayout.astro src/components/Header.astro src/components/Footer.astro tests/smoke.spec.ts
git commit -m "feat(kit): shared chrome + tokens (nav, socials, --bg/--surface, width prop)"
```

---

## Task 2: Pure helpers (featured post, cover, carousel, home content) — TDD

**Files:**

- Create: `src/lib/featured.ts`, `src/lib/featured.test.ts`
- Create: `src/lib/cover.ts`, `src/lib/cover.test.ts`
- Create: `src/lib/carousel.ts`, `src/lib/carousel.test.ts`
- Create: `src/lib/home.ts`

**Interfaces:**

- Produces:
  - `pickFeatured<T extends { data: { date: Date; draft?: boolean } }>(posts: T[]): T | undefined` — latest non-draft by date.
  - `resolveCover(data: { hero?: { image?: string; alt?: string }; tags?: string[] }): { kind: 'image'; src: string; alt: string } | { kind: 'placeholder'; bucket: BucketKey }`
  - `deckClass(n: number, i: number, len: number): 'front' | 'next' | 'next2' | 'prev' | 'prev2' | 'hide'`
  - `HOME` (typed object): `{ tagline, manifesto, currently, tags: string[], rightNow: string[], built: {title: string; desc: string}[], portraits: {src: string; alt: string}[] }`

- [ ] **Step 1: Write failing tests for `pickFeatured`**

`src/lib/featured.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { pickFeatured } from './featured'

const p = (id: string, date: string, draft = false) => ({
  id,
  data: { date: new Date(date), draft },
})

describe('pickFeatured', () => {
  it('returns the latest non-draft post', () => {
    const posts = [p('a', '2023-01-01'), p('b', '2024-05-01'), p('c', '2022-01-01')]
    expect(pickFeatured(posts)?.id).toBe('b')
  })
  it('skips drafts', () => {
    const posts = [p('a', '2024-09-01', true), p('b', '2024-05-01')]
    expect(pickFeatured(posts)?.id).toBe('b')
  })
  it('returns undefined for empty input', () => {
    expect(pickFeatured([])).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run — verify fail**

Run: `npm test -- featured`
Expected: FAIL ("Cannot find module './featured'").

- [ ] **Step 3: Implement `src/lib/featured.ts`**

```ts
export function pickFeatured<T extends { data: { date: Date; draft?: boolean } }>(
  posts: T[]
): T | undefined {
  return posts
    .filter((post) => !post.data.draft)
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime())[0]
}
```

- [ ] **Step 4: Run — verify pass**

Run: `npm test -- featured`
Expected: PASS (3 tests).

- [ ] **Step 5: Write failing tests for `resolveCover`**

`src/lib/cover.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveCover } from './cover'

describe('resolveCover', () => {
  it('uses hero.image when present', () => {
    const r = resolveCover({ hero: { image: '/x.png', alt: 'X' }, tags: ['ai'] })
    expect(r).toEqual({ kind: 'image', src: '/x.png', alt: 'X' })
  })
  it('falls back to a bucket placeholder when no image', () => {
    const r = resolveCover({ tags: ['docker'] })
    expect(r).toEqual({ kind: 'placeholder', bucket: 'engineering' })
  })
  it('placeholder bucket is "notes" when tags do not match', () => {
    const r = resolveCover({ tags: ['unmapped'] })
    expect(r).toEqual({ kind: 'placeholder', bucket: 'notes' })
  })
  it('empty alt defaults to empty string', () => {
    const r = resolveCover({ hero: { image: '/x.png' }, tags: [] })
    expect(r).toEqual({ kind: 'image', src: '/x.png', alt: '' })
  })
})
```

- [ ] **Step 6: Run — verify fail**

Run: `npm test -- cover`
Expected: FAIL ("Cannot find module './cover'").

- [ ] **Step 7: Implement `src/lib/cover.ts`**

```ts
import { resolveBucket, type BucketKey } from './buckets'

type Cover =
  | { kind: 'image'; src: string; alt: string }
  | { kind: 'placeholder'; bucket: BucketKey }

export function resolveCover(data: {
  hero?: { image?: string; alt?: string }
  tags?: string[]
}): Cover {
  const image = data.hero?.image
  if (image) return { kind: 'image', src: image, alt: data.hero?.alt ?? '' }
  return { kind: 'placeholder', bucket: resolveBucket(data.tags ?? []).key }
}
```

- [ ] **Step 8: Run — verify pass**

Run: `npm test -- cover`
Expected: PASS (4 tests).

- [ ] **Step 9: Write failing tests for `deckClass`**

`src/lib/carousel.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { deckClass } from './carousel'

describe('deckClass (5 cards)', () => {
  const L = 5
  it('current card is front', () => expect(deckClass(2, 2, L)).toBe('front'))
  it('one ahead is next', () => expect(deckClass(3, 2, L)).toBe('next'))
  it('two ahead is next2', () => expect(deckClass(4, 2, L)).toBe('next2'))
  it('one behind (wraps) is prev', () => expect(deckClass(1, 2, L)).toBe('prev'))
  it('two behind is prev2', () => expect(deckClass(0, 2, L)).toBe('prev2'))
  it('extra cards beyond the fan are hidden', () => {
    expect(deckClass(0, 0, 7)).toBe('front')
    expect(deckClass(3, 0, 7)).toBe('hide')
  })
})
```

- [ ] **Step 10: Run — verify fail**

Run: `npm test -- carousel`
Expected: FAIL ("Cannot find module './carousel'").

- [ ] **Step 11: Implement `src/lib/carousel.ts`**

```ts
export type DeckPos = 'front' | 'next' | 'next2' | 'prev' | 'prev2' | 'hide'

export function deckClass(n: number, i: number, len: number): DeckPos {
  const rel = (n - i + len) % len
  if (rel === 0) return 'front'
  if (rel === 1) return 'next'
  if (rel === 2) return 'next2'
  if (rel === len - 1) return 'prev'
  if (rel === len - 2) return 'prev2'
  return 'hide'
}
```

- [ ] **Step 12: Run — verify pass**

Run: `npm test -- carousel`
Expected: PASS (6 tests).

- [ ] **Step 13: Create `src/lib/home.ts` (static homepage content)**

```ts
export interface BuiltItem {
  title: string
  desc: string
}
export interface Portrait {
  src: string
  alt: string
}

export const HOME = {
  tagline: 'I build things, break a few, and write it all down.',
  manifesto: {
    // Rendered as: Be a little <u>reckless</u> with new tools. <i>Disciplined</i> about everything else.
    lead: 'Be a little ',
    underline: 'reckless',
    mid: ' with new tools. ',
    italic: 'Disciplined',
    tail: ' about everything else.',
  },
  currently: 'lognote',
  tags: ['Engineer', 'Team lead', 'Sci-fi', 'Lifting'],
  rightNow: [
    'Shipping lognote.',
    'Leading a team through the AI shift.',
    'Lifting, sci-fi, over-engineering my desk.',
  ] as string[],
  built: [
    { title: 'lognote', desc: 'Local transcription & summarization. Private by default.' },
    { title: 'this site', desc: 'Astro rebuild — it drafts some of its own posts.' },
    { title: 'a drafting agent', desc: 'Pitches, writes & PRs posts on a cron.' },
  ] as BuiltItem[],
  portraits: [
    { src: '/static/images/home/portrait-1.jpg', alt: 'Shariq Hirani' },
    { src: '/static/images/home/portrait-2.jpg', alt: 'Shariq Hirani' },
    { src: '/static/images/home/portrait-3.jpg', alt: 'Shariq Hirani' },
    { src: '/static/images/home/portrait-4.jpg', alt: 'Shariq Hirani' },
    { src: '/static/images/home/portrait-5.jpg', alt: 'Shariq Hirani' },
  ] as Portrait[],
} as const
```

- [ ] **Step 14: Run full unit suite + typecheck**

Run: `npm test && npm run astro check`
Expected: all pass (incl. existing `buckets`/`schemas` tests).

- [ ] **Step 15: Commit**

```bash
git add src/lib/featured.ts src/lib/featured.test.ts src/lib/cover.ts src/lib/cover.test.ts src/lib/carousel.ts src/lib/carousel.test.ts src/lib/home.ts
git commit -m "feat(lib): featured/cover/carousel helpers + home content (TDD)"
```

---

## Task 3: Zine homepage (`/`)

**Files:**

- Create: `src/components/PortraitDeck.astro`
- Create: `src/components/FeaturedCard.astro`
- Create: `public/static/images/home/portrait-1.jpg` … `portrait-5.jpg`
- Modify: `src/pages/index.astro` (full rewrite)
- Modify: `tests/smoke.spec.ts`

**Interfaces:**

- Consumes: `HOME` (Task 2), `pickFeatured` (Task 2), `deckClass` (Task 2), `resolveBucket` + `EYEBROW_PREFIX` (buckets.ts), `BaseLayout` `width="wide"` (Task 1).
- `FeaturedCard` props: `{ href: string; category: string; title: string; hook: string; cta?: string }` (default `cta="Read it"`). Used here AND in Task 4.
- `PortraitDeck` props: `{ portraits: { src: string; alt: string }[] }`.

- [ ] **Step 1: Create placeholder portraits**

The deck needs 5 images so the fan is full. Reuse the existing avatar as a stand-in (real photos swapped in later):

```bash
mkdir -p public/static/images/home
for n in 1 2 3 4 5; do cp public/static/images/avatar.jpg "public/static/images/home/portrait-$n.jpg"; done
ls public/static/images/home
```

Expected: `portrait-1.jpg … portrait-5.jpg`. (If `public/static/images/avatar.jpg` does not exist, substitute any existing JPG under `public/static/images/`.)

- [ ] **Step 2: Build `FeaturedCard.astro`**

Create `src/components/FeaturedCard.astro`. Port the `.featured` split-panel markup + scoped styles from `design-samples/homepage-zine.html` (selectors `.featured`, `.featured .panel`, `.featured .cat`, `.featured h2`, `.featured .hook`, `.featured .more`, `.featured .more .dot`, `.featured .art`) into an Astro `<style>` block, applying the color→var mapping. Markup:

```astro
---
interface Props {
  href: string;
  category: string;
  title: string;
  hook: string;
  cta?: string;
}
const { href, category, title, hook, cta = "Read it" } = Astro.props;
---
<a class="featured" href={href}>
  <div class="panel">
    <p class="cat">{category}</p>
    <h2>{title}</h2>
    <p class="hook">{hook}</p>
    <span class="more"><span class="dot">→</span> {cta}</span>
  </div>
  <div class="art">
    <svg width="230" height="180" viewBox="0 0 230 180" fill="none" stroke="var(--color-terracotta)" stroke-width="2.5">
      <circle cx="62" cy="62" r="30"></circle>
      <circle cx="158" cy="116" r="22" fill="var(--color-ochre)" stroke="none"></circle>
      <path d="M30 138 q42 -52 94 -22 t76 -30" stroke="var(--color-ink)"></path>
      <rect x="124" y="42" width="52" height="14" rx="7" fill="var(--color-ochre)" stroke="none"></rect>
      <circle cx="42" cy="126" r="4" fill="var(--color-ink)" stroke="none"></circle>
      <circle cx="60" cy="126" r="4" fill="var(--color-ink)" stroke="none"></circle>
      <circle cx="78" cy="126" r="4" fill="var(--color-ink)" stroke="none"></circle>
    </svg>
  </div>
</a>

<style>
  .featured { display: grid; grid-template-columns: 1.1fr 1fr; border-radius: 24px; overflow: hidden; min-height: 300px; box-shadow: 0 26px 58px -34px color-mix(in oklab, var(--fg) 45%, transparent); }
  .panel { background: var(--color-ink); color: var(--color-paper); padding: 46px; display: flex; flex-direction: column; justify-content: center; }
  .cat { font-family: var(--font-mono); font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--color-ochre); margin-bottom: 14px; }
  h2 { font-family: var(--font-display); font-weight: 500; font-size: 34px; line-height: 1.1; letter-spacing: -.01em; }
  .hook { margin-top: 14px; font-size: 15px; line-height: 1.55; opacity: .72; max-width: 34ch; }
  .more { margin-top: 26px; display: inline-flex; align-items: center; gap: 12px; font-size: 13px; font-weight: 500; }
  .more .dot { width: 42px; height: 42px; border-radius: 999px; background: var(--color-ochre); color: var(--color-ink); display: grid; place-items: center; font-size: 18px; transition: transform .15s; }
  .featured:hover .more .dot { transform: translateX(4px); }
  .art { background: linear-gradient(135deg, color-mix(in oklab, var(--color-paper) 88%, var(--color-ink)), var(--color-paper)); display: grid; place-items: center; }
  @media (max-width: 760px) { .featured { grid-template-columns: 1fr; } }
</style>
```

- [ ] **Step 3: Build `PortraitDeck.astro`**

Create `src/components/PortraitDeck.astro`. Port the deck CSS from `design-samples/homepage-zine.html` (selectors `.carousel`, `.carousel .deck`, `.carousel .deck img` and the `.front/.next/.prev/.next2/.prev2/.hide` rules, `.carousel .dots`, `.carousel .dots button`) into the `<style>` block (these reference only geometry + the color→var mapping). Markup + script:

```astro
---
import { deckClass } from "../lib/carousel";
interface Props {
  portraits: { src: string; alt: string }[];
}
const { portraits } = Astro.props;
const len = portraits.length;
---
<div class="carousel" data-deck>
  <div class="deck">
    {
      portraits.map((p, n) => (
        <img class={deckClass(n, 0, len)} src={p.src} alt={p.alt} width="600" height="800" loading="eager" />
      ))
    }
  </div>
  <div class="dots"></div>
</div>

<script>
  import { deckClass } from "../lib/carousel";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelectorAll<HTMLElement>("[data-deck]").forEach((root) => {
    const slides = [...root.querySelectorAll<HTMLImageElement>(".deck img")];
    const dotsWrap = root.querySelector<HTMLElement>(".dots")!;
    const len = slides.length;
    if (!len) return;
    let i = 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    slides.forEach((_, n) => {
      const b = document.createElement("button");
      b.addEventListener("click", () => {
        i = n;
        render();
        restart();
      });
      dotsWrap.appendChild(b);
    });
    const dots = [...dotsWrap.children];
    function render() {
      slides.forEach((s, n) => {
        s.className = deckClass(n, i, len);
      });
      dots.forEach((d, n) => d.classList.toggle("active", n === i));
    }
    function advance() {
      i = (i + 1) % len;
      render();
    }
    function restart() {
      if (reduce) return;
      clearInterval(timer);
      timer = setInterval(advance, 3800);
    }
    render();
    if (!reduce) {
      restart();
      root.addEventListener("mouseenter", () => clearInterval(timer));
      root.addEventListener("mouseleave", restart);
    }
  });
</script>
```

Note: in the `.dots button.active` style, keep the terracotta stretch (`background: var(--color-terracotta); width: 20px;`).

- [ ] **Step 4: Add failing smoke assertions for the homepage**

In `tests/smoke.spec.ts`, replace the existing `homepage renders` test with the full zine set:

```ts
test('homepage renders the zine hero', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('h1')).toContainText(['Shariq'])
  await expect(page.locator('[data-deck] .deck img')).toHaveCount(5)
  await expect(page.locator('.featured')).toBeVisible()
  await expect(page.getByText('I build things, break a few')).toBeVisible()
})
```

- [ ] **Step 5: Run — verify fail**

Run: `npm run build`
Expected: FAIL or the smoke (run after) fails — homepage is still the old listing. (Build may pass; the smoke assertions are the gate.)

- [ ] **Step 6: Rewrite `src/pages/index.astro` as the zine**

Replace the entire file. Compose the sections from the spec using `BaseLayout width="wide"`, `HOME`, `pickFeatured`, `FeaturedCard`, `PortraitDeck`. Port section styles (`.hero`, `.herotext`, `.kicker`, `.tags`, `.manifesto`, `.right-now`, `.built`, `.signoff`) from `design-samples/homepage-zine.html` into a scoped `<style>` (color→var mapping). Structure:

```astro
---
import { getCollection } from "astro:content";
import BaseLayout from "../layouts/BaseLayout.astro";
import PortraitDeck from "../components/PortraitDeck.astro";
import FeaturedCard from "../components/FeaturedCard.astro";
import { HOME } from "../lib/home";
import { pickFeatured } from "../lib/featured";
import { resolveBucket } from "../lib/buckets";

const all = await getCollection("writing", ({ data }) => !data.draft);
const featured = pickFeatured(all);
const fb = featured ? resolveBucket(featured.data.tags) : null;
const m = HOME.manifesto;
---
<BaseLayout width="wide">
  <!-- HERO -->
  <section class="hero">
    <div class="herotext">
      <p class="eyebrow">Shariq Hirani</p>
      <h1>Hi, I'm <span class="i">Shariq.</span></h1>
      <p class="kicker">{HOME.tagline}</p>
      <div class="tags">
        <span class="live">Building {HOME.currently}</span>
        {HOME.tags.map((t) => <span>{t}</span>)}
      </div>
    </div>
    <PortraitDeck portraits={HOME.portraits} />
  </section>

  <p class="manifesto">
    {m.lead}<span class="u">{m.underline}</span>{m.mid}<span class="i">{m.italic}</span>{m.tail}
  </p>

  <section class="right-now">
    <p class="h">Right now</p>
    <ul>
      {HOME.rightNow.map((line, idx) => (
        <li><span class="n">{String(idx + 1).padStart(2, "0")}</span>{line}</li>
      ))}
    </ul>
  </section>

  {featured && fb && (
    <FeaturedCard
      href={`/blog/${featured.id.replace(/\.mdx$/, "")}`}
      category={`${fb.label} · Latest`}
      title={featured.data.title}
      hook={featured.data.summary}
    />
  )}

  <section class="built-wrap">
    <p class="h">Lately I've built</p>
    <ul class="built">
      {HOME.built.map((b) => (
        <li><span class="t">{b.title}</span><span class="d">{b.desc}</span></li>
      ))}
    </ul>
  </section>

  <section class="signoff">
    <h2>Say hello.</h2>
    <p class="sub">X is the best way to reach me — I read everything, and I like hearing what you're building.</p>
  </section>
</BaseLayout>

<style>
  /* PORT from design-samples/homepage-zine.html: .hero, .herotext, h1 (.hero h1),
     .eyebrow (was .mono-label), .kicker, .tags, .manifesto, .right-now, .built-wrap,
     .built, .signoff — applying the color→var mapping. Key reminders:
     - .hero { display:grid; grid-template-columns:1fr auto; gap:76px; align-items:stretch; padding-top:72px; }
     - .tags { margin-top:auto; padding-top:40px; }  (pins pills to column bottom)
     - h1 font 74px Fraunces, .i italic var(--accent-alt); manifesto 46px Fraunces, max-width 26ch, text-wrap:balance;
     - all section spacing (110px) and the @media(max-width:880px) block. */
</style>
```

The `<style>` block must contain the FULL ported rules (the comment marks what to copy — do not ship the comment alone). `featured.data.summary` is the hook (the schema guarantees `summary` ≤ 280 chars).

- [ ] **Step 7: Run the gate**

Run: `npm run astro check && npm run build && npm run test:smoke -- -g "zine hero"`
Expected: PASS — `h1` contains "Shariq", 5 deck imgs, `.featured` visible, tagline present.

- [ ] **Step 8: Commit**

```bash
git add src/components/PortraitDeck.astro src/components/FeaturedCard.astro src/pages/index.astro public/static/images/home tests/smoke.spec.ts
git commit -m "feat(home): zine homepage — hero, portrait deck, manifesto, featured, built"
```

---

## Task 4: Dedicated blog listing (`/blog`)

**Files:**

- Create: `src/components/CoverImage.astro`
- Create: `src/components/FilterPills.astro`
- Create: `src/pages/blog/index.astro`
- Modify: `src/components/PostCard.astro` (full rewrite → image card)
- Modify: `tests/smoke.spec.ts`

**Interfaces:**

- Consumes: `resolveCover` (Task 2), `resolveBucket` (buckets.ts), `formatDate` (formatDate.ts), `FeaturedCard` (Task 3), `pickFeatured` (Task 2), `BUCKETS` (buckets.ts), `BaseLayout width="wide"`.
- `CoverImage` props: `{ data: { hero?: {image?: string; alt?: string}; tags?: string[] } }`.
- `PostCard` props: `{ href: string; title: string; date: Date; bucketKey: BucketKey; bucketLabel: string; summary?: string; coverData: { hero?: {image?: string; alt?: string}; tags?: string[] } }`.
- `FilterPills` props: `{ buckets: { key: string; label: string }[] }` (renders `All` + each; client script filters `[data-bucket]` cards).

- [ ] **Step 1: Add failing smoke assertions for `/blog`**

Append to `tests/smoke.spec.ts`:

```ts
test('blog listing renders + filters', async ({ page }) => {
  await page.goto('/blog')
  await expect(page.locator('h1')).toContainText(['Blog'])
  await expect(page.locator('.featured')).toBeVisible()
  // All + 5 buckets = 6 pills
  await expect(page.locator('[data-filter]')).toHaveCount(6)
  const cards = page.locator('[data-bucket]')
  const total = await cards.count()
  expect(total).toBeGreaterThan(0)
  await page.locator('[data-filter="ai"]').click()
  // after filtering to AI, at least one card hidden (unless every post is AI)
  await expect(page.locator('[data-bucket]:visible').first()).toBeVisible()
})
```

- [ ] **Step 2: Run — verify fail**

Run: `npm run build`
Expected: build FAILS (`/blog` collides only if `[...slug]` emits empty — it won't; failure is actually "page not found" at smoke). Run `npm run test:smoke -- -g "blog listing"` → FAIL (no `/blog`).

- [ ] **Step 3: Build `CoverImage.astro`**

```astro
---
import { resolveCover } from "../lib/cover";
interface Props {
  data: { hero?: { image?: string; alt?: string }; tags?: string[] };
}
const cover = resolveCover(Astro.props.data);
---
{
  cover.kind === "image" ? (
    <img class="cover" src={cover.src} alt={cover.alt} width="600" height="400" loading="lazy" />
  ) : (
    <div class:list={["cover", "ph", `ph-${cover.bucket}`]}>
      <svg viewBox="0 0 120 80" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="34" cy="40" r="18"></circle>
        <path d="M12 70 q26 -30 60 -12 t40 -20"></path>
        <circle cx="92" cy="30" r="9" fill="currentColor" stroke="none"></circle>
      </svg>
    </div>
  )
}

<style>
  .cover { width: 100%; height: 100%; object-fit: cover; display: block; }
  .ph { display: grid; place-items: center; color: var(--color-paper); }
  .ph svg { width: 50%; opacity: 0.6; }
  .ph-leadership { background: var(--color-ink); }
  .ph-engineering { background: var(--color-ochre); color: var(--color-ink); }
  .ph-ai { background: var(--color-terracotta); }
  .ph-process { background: var(--color-ink-soft); }
  .ph-notes { background: var(--color-ink-soft); }
</style>
```

- [ ] **Step 4: Rewrite `PostCard.astro` as the image card**

Replace the file. Port the calm card styles from `design-samples/blog-calm-split.html` (selectors `.card`, `.card .imgwrap`, `.card .body`, `.card .meta`, `.card .cat`, `.card .date`, `.card h3`, `.card p`) into the scoped `<style>` (color→var mapping). It wraps `CoverImage`:

```astro
---
import CoverImage from "./CoverImage.astro";
import { formatDate } from "../lib/formatDate";
import type { BucketKey } from "../lib/buckets";

interface Props {
  href: string;
  title: string;
  date: Date;
  bucketKey: BucketKey;
  bucketLabel: string;
  summary?: string;
  coverData: { hero?: { image?: string; alt?: string }; tags?: string[] };
}
const { href, title, date, bucketKey, bucketLabel, summary, coverData } = Astro.props;
---
<a class="card" href={href} data-bucket={bucketKey}>
  <div class="imgwrap"><CoverImage data={coverData} /></div>
  <div class="body">
    <div class="meta">
      <span class:list={["cat", `cat-${bucketKey}`]}>{bucketLabel}</span>
      <span class="date">{formatDate(date)}</span>
    </div>
    <h3>{title}</h3>
    {summary && <p>{summary}</p>}
  </div>
</a>

<style>
  .card { display: block; }
  .imgwrap { position: relative; overflow: hidden; aspect-ratio: 3 / 2; border-radius: 16px; background: linear-gradient(135deg, var(--color-ink), var(--color-ink-soft)); }
  .imgwrap :global(.cover) { transition: transform .3s; }
  .card:hover .imgwrap :global(.cover) { transform: scale(1.04); }
  .body { padding: 20px 2px 0; }
  .meta { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .cat { font-family: var(--font-mono); font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: var(--color-terracotta); display: inline-flex; align-items: center; gap: 7px; }
  .cat::before { content: ""; width: 6px; height: 6px; border-radius: 999px; background: currentColor; }
  .cat-engineering { color: var(--color-ochre); }
  .cat-leadership { color: var(--fg); }
  .cat-process { color: var(--color-ink-soft); }
  .date { font-family: var(--font-mono); font-size: 10px; letter-spacing: .08em; opacity: .45; }
  h3 { font-size: 19px; line-height: 1.3; font-weight: 600; letter-spacing: -.01em; }
  p { margin-top: 8px; font-size: 14px; line-height: 1.55; opacity: .6; }
</style>
```

- [ ] **Step 5: Build `FilterPills.astro`**

```astro
---
interface Props {
  buckets: { key: string; label: string }[];
}
const { buckets } = Astro.props;
---
<div class="filters" data-filters>
  <button class="pill active" data-filter="all">All</button>
  {buckets.map((b) => <button class="pill" data-filter={b.key}>{b.label}</button>)}
</div>

<script>
  document.querySelectorAll<HTMLElement>("[data-filters]").forEach((bar) => {
    const pills = [...bar.querySelectorAll<HTMLButtonElement>(".pill")];
    const cards = [...document.querySelectorAll<HTMLElement>("[data-bucket]")];
    bar.addEventListener("click", (e) => {
      const pill = (e.target as HTMLElement).closest<HTMLButtonElement>(".pill");
      if (!pill) return;
      const key = pill.dataset.filter!;
      pills.forEach((p) => p.classList.toggle("active", p === pill));
      cards.forEach((c) => {
        c.style.display = key === "all" || c.dataset.bucket === key ? "" : "none";
      });
    });
  });
</script>

<style>
  .filters { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 48px; }
  .pill { font-family: var(--font-mono); font-size: 12px; padding: 8px 16px; border-radius: 999px; border: 1px solid color-mix(in oklab, var(--fg) 18%, transparent); background: none; color: inherit; opacity: .7; cursor: pointer; transition: all .15s; }
  .pill.active { background: var(--color-terracotta); border-color: var(--color-terracotta); color: var(--color-paper); opacity: 1; }
  .pill:not(.active):hover { border-color: var(--fg); opacity: 1; }
</style>
```

- [ ] **Step 6: Create `src/pages/blog/index.astro`**

```astro
---
import { getCollection } from "astro:content";
import BaseLayout from "../../layouts/BaseLayout.astro";
import FeaturedCard from "../../components/FeaturedCard.astro";
import FilterPills from "../../components/FilterPills.astro";
import PostCard from "../../components/PostCard.astro";
import { pickFeatured } from "../../lib/featured";
import { resolveBucket, BUCKETS } from "../../lib/buckets";

const all = await getCollection("writing", ({ data }) => !data.draft);
all.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());

const featured = pickFeatured(all);
const fb = featured ? resolveBucket(featured.data.tags) : null;
const rest = featured ? all.filter((p) => p.id !== featured.id) : all;

const bucketList = Object.entries(BUCKETS).map(([key, def]) => ({ key, label: def.label }));
const slug = (id: string) => `/blog/${id.replace(/\.mdx$/, "")}`;
---
<BaseLayout title="The Blog" width="wide">
  <section class="blogtitle">
    <p class="eyebrow">Writing</p>
    <h1>The Blog</h1>
    <p class="lead">Notes from inside the work — engineering, leading teams, and the AI shift happening in real time.</p>
  </section>

  <FilterPills buckets={bucketList} />

  {featured && fb && (
    <div class="featured-wrap">
      <FeaturedCard
        href={slug(featured.id)}
        category={`${fb.label} · Featured`}
        title={featured.data.title}
        hook={featured.data.summary}
        cta="Read full article"
      />
    </div>
  )}

  <div class="grid3">
    {rest.map((post) => {
      const b = resolveBucket(post.data.tags);
      return (
        <PostCard
          href={slug(post.id)}
          title={post.data.title}
          date={post.data.date}
          bucketKey={b.key}
          bucketLabel={b.label}
          summary={post.data.summary}
          coverData={post.data}
        />
      );
    })}
  </div>
</BaseLayout>

<style>
  .blogtitle { padding: 40px 0 28px; }
  .eyebrow { font-family: var(--font-mono); font-size: 11px; letter-spacing: .2em; text-transform: uppercase; opacity: .55; margin-bottom: 14px; }
  .blogtitle h1 { font-family: var(--font-display); font-size: 56px; font-weight: 600; letter-spacing: -.025em; }
  .blogtitle .lead { margin-top: 14px; font-size: 17px; opacity: .65; max-width: 52ch; line-height: 1.5; }
  .featured-wrap { margin-bottom: 72px; }
  .grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 48px 30px; }
  @media (max-width: 860px) { .grid3 { grid-template-columns: 1fr; } .blogtitle h1 { font-size: 40px; } }
</style>
```

Note: the featured post is excluded from the grid (`rest`). The featured card has no `data-bucket`, so filters only affect the grid — acceptable for v1.

- [ ] **Step 7: Run the gate**

Run: `npm run astro check && npm run build && npm run test:smoke -- -g "blog listing"`
Expected: PASS — `/blog` h1 "The Blog", `.featured` visible, 6 filter pills, grid cards present, AI filter click works.

- [ ] **Step 8: Commit**

```bash
git add src/components/CoverImage.astro src/components/FilterPills.astro src/components/PostCard.astro src/pages/blog/index.astro tests/smoke.spec.ts
git commit -m "feat(blog): dedicated /blog listing — featured, bucket filters, image cards"
```

---

## Task 5: Post detail + interior pages adopt the kit; final gate

**Files:**

- Modify: `src/pages/blog/[...slug].astro` (add cover at top; keep all canonical/SEO logic intact)
- Modify: `src/pages/about.astro:5` and `src/pages/projects.astro` (`BaseLayout` → `width`)
- Modify: `tests/smoke.spec.ts` (no new tests; verify existing post tests still pass)

**Interfaces:**

- Consumes: `CoverImage` (Task 4). No new exports.

- [ ] **Step 1: Read the current post-detail page**

Run: `sed -n '1,60p' src/pages/blog/[...slug].astro`
Identify where the post `<article>`/title renders and where `post.data` is in scope. Do NOT touch the `getStaticPaths`, canonical, or `<Content components={...} />` wiring.

- [ ] **Step 2: Add the cover above the post header**

Immediately inside the article/main wrapper, before the post title, insert (only when a hero image exists, so existing posts without art are unchanged):

```astro
---
// in the frontmatter, alongside existing imports:
import CoverImage from "../../components/CoverImage.astro";
---
{post.data.hero?.image && (
  <div class="post-cover">
    <CoverImage data={post.data} />
  </div>
)}
```

And a scoped style:

```astro
<style>
  .post-cover { aspect-ratio: 16 / 9; border-radius: 18px; overflow: hidden; margin-bottom: 32px; }
</style>
```

(Use the exact variable name the file uses for the entry — if it is `entry` not `post`, match it. Keep `width` as the default `prose` for readable measure.)

- [ ] **Step 3: Interior pages pass through unchanged content**

`src/pages/about.astro` and `src/pages/projects.astro` keep using the existing `Hero` component (do NOT swap it). They already work; leave `BaseLayout` at default `width="prose"`. No change required unless `astro check` flags the new `width` prop — it won't (it is optional). **This step is a verification, not an edit.** Confirm both pages still build.

- [ ] **Step 4: Full gate — typecheck, unit, build, smoke**

Run: `npm run astro check && npm test && npm run build && npm run test:smoke`
Expected: ALL pass — every `/blog/<slug>` renders (status 200, `h1` visible), `/` zine, `/blog` listing, RSS 200, all vitest suites green.

- [ ] **Step 5: Commit**

```bash
git add src/pages/blog/[...slug].astro
git commit -m "feat(post): show cover image on post detail; adopt shared kit"
```

- [ ] **Step 6: Manual visual pass (light + dark)**

Run: `npm run preview` and open `http://localhost:4321/` and `/blog`. Toggle dark mode (the header `ThemeToggle`). Confirm: hero deck fans + auto-advances; manifesto wraps cleanly; featured card CTA hovers; blog filters work; footer socials present; nothing reads broken in dark (tuning deferred, but no unreadable text / invisible cards). Note any dark-mode issues for a follow-up — do not block the merge on dark polish.

---

## Self-review notes (coverage)

- Spec §2 kit → Task 1 (tokens, chrome, width) + per-component scoped styles.
- Spec §3 homepage zine + §3.1 deck → Task 3 (+ helpers in Task 2).
- Spec §4 blog page (featured, filters, grid) → Task 4.
- Spec §5 post detail adopts kit → Task 5.
- Spec §6 cover contract (hero.image + procedural fallback) → `resolveCover` (Task 2) + `CoverImage` (Task 4); placeholder is bucket-colored.
- Spec §6 portrait deck from real photos → `HOME.portraits` + placeholder JPGs (Task 3); real photos swapped later.
- Spec §7 dark-mode-must-work → CSS-var discipline (Global Constraints) + Task 5 Step 6 check.
- 3-font system, nav, footer, tagline, manifesto → Global Constraints (verbatim) + Tasks 1/3.

**Deferred (not in this plan, per spec §7):** AI cover generation (Plan B follow-on), real photos/covers, dark-mode pixel tuning, responsive fine-tuning beyond the included breakpoints.
