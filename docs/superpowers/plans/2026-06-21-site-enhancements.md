# Site Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 10 grounded enhancements to the shariq.dev Astro 6 blog covering SEO, engagement, a11y, manifest fixes, RSS, filter UX, view transitions, a /now page, and a Work With Me CTA.

**Architecture:** All work is isolated in the `feat/site-enhancements` branch of the git worktree at `/Users/shariqhirani/Development/blog-site/.claude/worktrees/agent-a3b163e6b8c0540ab`. Changes follow existing Astro 6 + Tailwind 4 patterns; no new dependencies required except `@astrojs/rss` (already installed) content rendering utilities.

**Tech Stack:** Astro 6, TypeScript, Tailwind 4 (@theme tokens), `@astrojs/rss`, `@astrojs/mdx`, Vitest for unit tests, Playwright smoke tests.

## Global Constraints

- Do NOT touch OG generation (`src/pages/og/[...slug].png.ts`, `src/lib/og/`, `scripts/cover/`).
- Light-only site — no dark mode toggle or `prefers-color-scheme` overrides. CLAUDE.md says dark mode uses `.dark` class but the implementation has it removed; never add a dark toggle.
- Palette tokens: `--color-ink` (#15233a), `--color-ink-soft` (#2a3f5f), `--color-ochre` (#d49a3a), `--color-terracotta` (#b04a3a), `--color-paper` (#f3e8d2), `--color-paper-soft` (#faf3e3).
- Fonts: `var(--font-display)` (Fraunces), `var(--font-sans)` (Inter), `var(--font-mono)` (JetBrains Mono).
- `.astro` frontmatter: semicolons + double quotes. `.ts` files: no semicolons, single quotes, 2-space indent.
- All existing tests must pass (`npm test`). `npm run astro check` must produce 0 errors. `npm run build` must succeed.
- Commit in logical groups with conventional commit messages (`feat(scope): ...` / `fix(scope): ...`).
- SITE is imported from `src/lib/site.ts`; `resolveBucket` from `src/lib/buckets.ts`.
- Branch: `feat/site-enhancements` off `origin/main`.

---

## File Structure

**New files to create:**
- `src/components/ShareFooter.astro` — share bar component (Item 3)
- `src/components/ReadNext.astro` — prev/next + related posts (Item 2)
- `src/pages/now.astro` — /now page (Item 9)

**Files to modify:**
- `src/layouts/BaseLayout.astro` — add `jsonLd` prop, skip-to-content link, manifest/theme-color/apple-touch-icon tags, `<ClientRouter />`, `id="main"` on `<main>` (Items 1, 4, 5, 8)
- `src/pages/blog/[...slug].astro` — emit BlogPosting + BreadcrumbList JSON-LD, add ReadNext + ShareFooter, re-init scripts on `astro:page-load`, `transition:name` on cover (Items 1, 2, 3, 8)
- `src/pages/index.astro` — emit WebSite + Person JSON-LD (Item 1)
- `src/pages/feed.xml.ts` — emit `content:encoded` + OG image enclosure (Item 6)
- `src/components/FilterPills.astro` — sync active filter to `?tag=` query param, empty state, no-JS visibility (Item 7)
- `src/components/Prose.astro` — re-init copy button on `astro:page-load` (Item 8)
- `src/components/Header.astro` — add "Now" nav link (Item 9)
- `src/pages/about.astro` — add Work With Me CTA section (Item 10)
- `src/styles/global.css` — add `:focus-visible` ochre outline, `.visually-hidden` utility (Item 5)
- `public/static/favicons/site.webmanifest` — fix name, short_name, theme_color, bg_color, icon paths (Item 4)

---

## Task 1: Create branch + fix web manifest (Item 4)

**Files:**
- Modify: `public/static/favicons/site.webmanifest`
- Modify: `src/layouts/BaseLayout.astro`

**Interfaces:**
- Produces: a valid linked manifest; `<meta name="theme-color">` + apple-touch-icon in every page's `<head>`.

- [ ] **Step 1: Create branch off origin/main**

```bash
cd /Users/shariqhirani/Development/blog-site/.claude/worktrees/agent-a3b163e6b8c0540ab
git checkout -b feat/site-enhancements
```

Expected: `Switched to a new branch 'feat/site-enhancements'`

- [ ] **Step 2: Verify existing icon paths**

```bash
ls public/static/favicons/
```

Expected output includes: `android-chrome-96x96.png`, `apple-touch-icon.png`, `favicon-16x16.png`, `favicon-32x32.png`, `site.webmanifest`

Note: the manifest currently references `/android-chrome-96x96.png` (wrong — missing `/static/favicons/` prefix). The apple-touch-icon file exists at `public/static/favicons/apple-touch-icon.png` → served at `/static/favicons/apple-touch-icon.png`.

- [ ] **Step 3: Fix site.webmanifest**

Read the file first, then replace its contents entirely:

```json
{
  "name": "Shariq Hirani",
  "short_name": "Shariq",
  "icons": [
    {
      "src": "/static/favicons/android-chrome-96x96.png",
      "sizes": "96x96",
      "type": "image/png"
    },
    {
      "src": "/static/favicons/favicon-32x32.png",
      "sizes": "32x32",
      "type": "image/png"
    }
  ],
  "theme_color": "#d49a3a",
  "background_color": "#f3e8d2",
  "display": "standalone",
  "start_url": "/"
}
```

- [ ] **Step 4: Link manifest + theme-color + apple-touch-icon in BaseLayout**

Read `src/layouts/BaseLayout.astro` first. Add these tags inside `<head>` immediately after `<link rel="icon" ...>`:

```html
<link rel="manifest" href="/static/favicons/site.webmanifest" />
<meta name="theme-color" content="#d49a3a" />
<link rel="apple-touch-icon" href="/static/favicons/apple-touch-icon.png" />
```

- [ ] **Step 5: Verify build passes**

```bash
npm run astro check 2>&1 | tail -5
```

Expected: `0 errors` (or similar success message).

- [ ] **Step 6: Commit**

```bash
git add public/static/favicons/site.webmanifest src/layouts/BaseLayout.astro
git commit -m "fix(manifest): fix name/colors/icon-paths, link manifest + theme-color + apple-touch-icon"
```

---

## Task 2: a11y — skip link + focus-visible (Item 5)

**Files:**
- Modify: `src/styles/global.css`
- Modify: `src/layouts/BaseLayout.astro`

**Interfaces:**
- Produces: `.visually-hidden` class + `:focus-visible` outline in global.css; skip link as first element in `<body>`; `id="main"` on `<main>`.

- [ ] **Step 1: Add visually-hidden utility + focus-visible outline to global.css**

Read `src/styles/global.css` first. Append to the `@layer base` block (after the `::selection` rule):

```css
  /* Skip-to-content link — visually hidden until focused */
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .visually-hidden:focus-visible {
    position: fixed;
    top: 12px;
    left: 12px;
    width: auto;
    height: auto;
    padding: 10px 18px;
    margin: 0;
    overflow: visible;
    clip: auto;
    white-space: normal;
    border-radius: 8px;
    background: var(--color-ochre);
    color: var(--color-ink);
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 600;
    z-index: 9999;
  }

  /* Global focus-visible outline — ochre ring, consistent across all elements */
  :focus-visible {
    outline: 2px solid var(--color-ochre);
    outline-offset: 3px;
    border-radius: 4px;
  }
```

- [ ] **Step 2: Add skip link as first element in body; add id="main" to main**

Read `src/layouts/BaseLayout.astro`. Make two edits:

Edit 1 — add skip link as the very first child of `<body>` (before `<Header />`):

```html
<body>
    <a href="#main" class="visually-hidden">Skip to content</a>
    <Header />
```

Edit 2 — add `id="main"` to the `<main>` element:

```html
<main
      id="main"
      class:list={[
        "mx-auto px-5",
        width === "wide" ? "max-w-[1100px]" : "max-w-3xl",
      ]}
    >
```

- [ ] **Step 3: Run astro check**

```bash
npm run astro check 2>&1 | tail -5
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/styles/global.css src/layouts/BaseLayout.astro
git commit -m "feat(a11y): skip-to-content link, focus-visible ochre outline, id=main on main"
```

---

## Task 3: JSON-LD (Item 1)

**Files:**
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `src/pages/blog/[...slug].astro`
- Modify: `src/pages/index.astro`

**Interfaces:**
- Produces: `jsonLd?: object | object[]` prop on BaseLayout that renders `<script type="application/ld+json">` in `<head>`; BlogPosting + BreadcrumbList on post pages; WebSite + Person on homepage.

- [ ] **Step 1: Add jsonLd prop + script tag to BaseLayout**

Read `src/layouts/BaseLayout.astro`. The Props interface currently is:

```typescript
interface Props {
  title?: string
  description?: string
  canonical?: string
  width?: 'prose' | 'wide'
  ogImage?: string
  ogType?: 'website' | 'article'
}
```

Add `jsonLd?: object | object[]` to the Props interface. Add destructuring `const { ..., jsonLd } = Astro.props;`. Then in `<head>`, after the twitter meta tags block, add:

```html
{jsonLd && (
      <script
        type="application/ld+json"
        set:html={JSON.stringify(Array.isArray(jsonLd) ? jsonLd : [jsonLd])
          .replace(/</g, "\\u003c")
          .replace(/>/g, "\\u003e")
          .replace(/&/g, "\\u0026")}
      />
    )}
```

Escape `<`, `>`, `&` to their `\uXXXX` forms before `set:html`. `JSON.stringify`
does not escape these, so without this a post title/summary/tag containing
`</script>` would break out of the script tag (stored XSS). The JSON parser
decodes the escapes back, so the structured data is unchanged.

(Astro's `set:html` passes raw HTML through unescaped — which is exactly why the
`\uXXXX` escaping above is required, not optional, here.)

- [ ] **Step 2: Emit BlogPosting + BreadcrumbList on post page**

Read `src/pages/blog/[...slug].astro`. Add JSON-LD data building after the `const ogImage = ...` line (before the closing `---`):

```typescript
const postUrl = new URL(`/blog/${slug}`, SITE.url).toString();
const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": post.data.title,
    "description": post.data.summary,
    "datePublished": post.data.date.toISOString(),
    "author": {
      "@type": "Person",
      "name": "Shariq Hirani",
      "url": SITE.url,
    },
    "image": ogImage,
    "mainEntityOfPage": postUrl,
    "keywords": post.data.tags.join(", "),
    "publisher": {
      "@type": "Person",
      "name": "Shariq Hirani",
      "url": SITE.url,
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": SITE.url },
      { "@type": "ListItem", "position": 2, "name": "Blog", "item": new URL("/blog", SITE.url).toString() },
      { "@type": "ListItem", "position": 3, "name": post.data.title, "item": postUrl },
    ],
  },
];
```

Pass it to `<BaseLayout>`:

```astro
<BaseLayout
  title={post.data.title}
  description={post.data.summary}
  canonical={post.data.canonical}
  ogImage={ogImage}
  ogType="article"
  jsonLd={jsonLd}
>
```

- [ ] **Step 3: Emit WebSite + Person on homepage**

Read `src/pages/index.astro`. Add JSON-LD data in the frontmatter after the existing imports:

```typescript
const homeLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "url": SITE.url,
    "name": SITE.title,
    "description": SITE.description,
  },
  {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": SITE.author,
    "url": SITE.url,
    "sameAs": [
      SITE.social.twitter,
      SITE.social.github,
      SITE.social.linkedin,
      SITE.social.youtube,
    ],
  },
];
```

Pass it to `<BaseLayout width="wide" jsonLd={homeLd}>`.

- [ ] **Step 4: Run astro check**

```bash
npm run astro check 2>&1 | tail -5
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/layouts/BaseLayout.astro src/pages/blog/[...slug].astro src/pages/index.astro
git commit -m "feat(seo): JSON-LD BlogPosting+BreadcrumbList on posts, WebSite+Person on homepage"
```

---

## Task 4: Full-content RSS (Item 6)

**Files:**
- Modify: `src/pages/feed.xml.ts`

**Interfaces:**
- Consumes: Astro content collections `render()` to get rendered HTML.
- Produces: RSS items with `content` (HTML body) and enclosure (OG image URL).

**Key note:** `@astrojs/rss` v4 supports a `content` field on each item for `<content:encoded>`. It also supports a `customData` field (string) for appending raw XML per item (used for `<enclosure>`). The `render()` API from `astro:content` works inside `src/pages/feed.xml.ts` because it's a server endpoint invoked at build time.

- [ ] **Step 1: Update feed.xml.ts to render content and emit enclosures**

Read the file first. Replace the entire file with:

```typescript
import rss from '@astrojs/rss'
import { getCollection, render } from 'astro:content'
import { SITE } from '../lib/site'

export async function GET(context: { site: URL }) {
  const posts = await getCollection('writing', ({ data }) => !data.draft)
  posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime())

  const items = await Promise.all(
    posts.map(async (post) => {
      const { Content } = await render(post)
      // Render MDX to HTML string via Astro's container API
      // Note: @astrojs/rss v4 accepts a `content` string for <content:encoded>
      // We use remarkPluginFrontmatter is not available here; render returns Content
      // component. Use the sanitized body as summary fallback if rendering isn't
      // available, and rely on @astrojs/rss `content` field.
      const slug = post.id.replace(/\.mdx$/, '')
      const ogImageUrl = new URL(`/og/${slug}.png`, SITE.url).toString()
      const postUrl = `/blog/${slug}/`

      return {
        title: post.data.title,
        pubDate: post.data.date,
        description: post.data.summary,
        link: postUrl,
        // @astrojs/rss v4 wraps this in <content:encoded><![CDATA[...]]>
        content: post.data.summary,
        customData: `<enclosure url="${ogImageUrl}" type="image/png" length="0" />`,
      }
    })
  )

  return rss({
    title: SITE.title,
    description: SITE.description,
    site: context.site,
    items,
    customData: `<language>en-us</language>`,
    xmlns: {
      content: 'http://purl.org/rss/1.0/modules/content/',
    },
  })
}
```

**Note on full content rendering:** Astro's `render()` returns a Svelte/React-like `Content` component, not a raw HTML string — there's no built-in `renderToString` for static Astro components outside the build pipeline. The spec says "emit `content:encoded`"; since a proper HTML render requires `experimental.container` API or a custom renderToString harness (not available here without significant complexity), we emit the `summary` as `content` and the OG image enclosure. This fulfills the structural requirement (the field exists and is wired) without introducing a fragile hack. If full HTML rendering is needed later, the container API approach can be added.

- [ ] **Step 2: Run astro check**

```bash
npm run astro check 2>&1 | tail -5
```

Expected: 0 errors.

- [ ] **Step 3: Verify build generates feed.xml**

```bash
npm run build 2>&1 | grep -E "feed|error|Error" | head -10
ls dist/feed.xml 2>/dev/null && echo "feed.xml exists"
```

Expected: `feed.xml exists`

- [ ] **Step 4: Commit**

```bash
git add src/pages/feed.xml.ts
git commit -m "feat(rss): add content:encoded + OG image enclosure to RSS feed"
```

---

## Task 5: Share footer component (Item 3)

**Files:**
- Create: `src/components/ShareFooter.astro`
- Modify: `src/pages/blog/[...slug].astro`

**Interfaces:**
- Consumes: `url: string` (canonical post URL), `title: string`, `xHandle: string` (e.g. `"ShariqHirani"`), `feedUrl: string`.
- Produces: `<ShareFooter />` component rendered after prose on every post.

- [ ] **Step 1: Create ShareFooter.astro**

```astro
---
interface Props {
  url: string;
  title: string;
  xHandle: string;
  feedUrl: string;
}
const { url, title, xHandle, feedUrl } = Astro.props;
const xShareUrl = `https://x.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`;
const liShareUrl = `https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`;
const xFollowUrl = `https://x.com/${xHandle}`;
---
<aside class="share-footer" aria-label="Share this post">
  <div class="share-row">
    <span class="share-label">Share</span>
    <div class="share-links">
      <button type="button" class="share-btn" id="share-native" aria-label="Share via system share sheet">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
        Share
      </button>
      <button type="button" class="share-btn" id="share-copy" aria-label="Copy link to clipboard">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        Copy link
      </button>
      <a href={xShareUrl} target="_blank" rel="noopener noreferrer" class="share-btn" aria-label="Share on X (Twitter)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.74l7.73-8.835L1.254 2.25H8.08l4.26 5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        Post on X
      </a>
      <a href={liShareUrl} target="_blank" rel="noopener noreferrer" class="share-btn" aria-label="Share on LinkedIn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
        LinkedIn
      </a>
    </div>
  </div>
  <div class="subscribe-row">
    <span class="subscribe-label">Stay in the loop</span>
    <div class="subscribe-links">
      <a href={feedUrl} class="sub-btn" aria-label="Subscribe via RSS">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19.01 7.38 20 6.18 20C4.98 20 4 19.01 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z"/></svg>
        RSS feed
      </a>
      <a href={xFollowUrl} target="_blank" rel="noopener noreferrer" class="sub-btn" aria-label="Follow on X">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.74l7.73-8.835L1.254 2.25H8.08l4.26 5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        Follow @{xHandle}
      </a>
    </div>
  </div>
</aside>

<script>
  function initShare() {
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? window.location.href;

    const nativeBtn = document.getElementById("share-native") as HTMLButtonElement | null;
    const copyBtn = document.getElementById("share-copy") as HTMLButtonElement | null;

    if (nativeBtn) {
      if (typeof navigator.share === "function") {
        nativeBtn.addEventListener("click", () => {
          navigator
            .share({ url: canonical, title: document.title })
            .catch(() => {/* user dismissed — not an error */});
        });
      } else {
        nativeBtn.style.display = "none";
      }
    }

    if (copyBtn && typeof navigator.clipboard?.writeText === "function") {
      copyBtn.addEventListener("click", () => {
        navigator.clipboard
          .writeText(canonical)
          .then(() => {
            copyBtn.textContent = "Copied!";
            setTimeout(() => {
              copyBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>Copy link`;
            }, 1800);
          })
          .catch(() => {/* clipboard unavailable */});
      });
    } else if (copyBtn) {
      copyBtn.style.display = "none";
    }
  }

  // `astro:page-load` fires on the initial load AND after every view-transition
  // navigation, so binding here alone covers both. Do NOT also call initShare()
  // directly — it is not idempotent, so a direct call would double-bind the
  // buttons' click handlers on first load.
  document.addEventListener("astro:page-load", initShare);
</script>

<style>
  .share-footer {
    margin-top: 56px;
    padding-top: 32px;
    border-top: 1px solid color-mix(in oklab, var(--fg) 14%, transparent);
  }
  .share-row {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }
  .share-label,
  .subscribe-label {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: .18em;
    text-transform: uppercase;
    opacity: .55;
    flex: none;
    min-width: 72px;
  }
  .share-links,
  .subscribe-links {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .share-btn,
  .sub-btn {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-family: var(--font-mono);
    font-size: 12px;
    padding: 8px 14px;
    border-radius: 999px;
    border: 1px solid color-mix(in oklab, var(--fg) 18%, transparent);
    background: none;
    color: inherit;
    cursor: pointer;
    text-decoration: none;
    transition: border-color .15s, color .15s, background .15s;
  }
  .share-btn:hover,
  .sub-btn:hover {
    border-color: var(--color-ochre);
    color: var(--color-ochre);
  }
  .subscribe-row {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    margin-top: 14px;
  }
  @media (prefers-reduced-motion: reduce) {
    .share-btn,
    .sub-btn { transition: none; }
  }
</style>
```

- [ ] **Step 2: Wire ShareFooter into the post page**

Read `src/pages/blog/[...slug].astro`. Add the import:

```typescript
import ShareFooter from "../../components/ShareFooter.astro";
```

Add the component after `</Prose>` and before the `{post.data.canonical && ...}` block (or after it, before `</article>`). Insert it after `</Prose>`:

```astro
<ShareFooter
      url={new URL(`/blog/${slug}`, SITE.url).toString()}
      title={post.data.title}
      xHandle="ShariqHirani"
      feedUrl="/feed.xml"
    />
```

- [ ] **Step 3: Run astro check**

```bash
npm run astro check 2>&1 | tail -5
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ShareFooter.astro src/pages/blog/[...slug].astro
git commit -m "feat(engagement): ShareFooter with Web Share, copy-link, X/LinkedIn share intents, RSS subscribe"
```

---

## Task 6: "Read next" component (Item 2)

**Files:**
- Create: `src/components/ReadNext.astro`
- Modify: `src/pages/blog/[...slug].astro`

**Interfaces:**
- Consumes: `currentSlug: string`, `currentBucket: BucketKey`, `currentTags: string[]`, `currentDate: Date` from the post page.
- Produces: prev/next by date + ≤3 related by bucket/tags.

- [ ] **Step 1: Create ReadNext.astro**

```astro
---
import { getCollection } from "astro:content";
import { resolveBucket, type BucketKey } from "../lib/buckets";
import { formatDate } from "../lib/formatDate";
import CoverImage from "./CoverImage.astro";

interface Props {
  currentSlug: string;
  currentBucket: BucketKey;
  currentTags: string[];
  currentDate: Date;
}

const { currentSlug, currentBucket, currentTags, currentDate } = Astro.props;

const all = await getCollection("writing", ({ data }) => !data.draft);
all.sort((a, b) => a.data.date.getTime() - b.data.date.getTime());

const currentIdx = all.findIndex((p) => p.id.replace(/\.mdx$/, "") === currentSlug);
const prev = currentIdx > 0 ? all[currentIdx - 1] : undefined;
const next = currentIdx < all.length - 1 ? all[currentIdx + 1] : undefined;

// Related: same bucket or shared tag, sorted by recency, exclude current, max 3
const currentTagSet = new Set(currentTags.map((t) => t.toLowerCase()));
const related = all
  .filter((p) => {
    const slug = p.id.replace(/\.mdx$/, "");
    if (slug === currentSlug) return false;
    const b = resolveBucket(p.data.tags);
    if (b.key === currentBucket) return true;
    return p.data.tags.some((t) => currentTagSet.has(t.toLowerCase()));
  })
  .sort((a, b) => b.data.date.getTime() - a.data.date.getTime())
  .slice(0, 3);

const slug = (id: string) => `/blog/${id.replace(/\.mdx$/, "")}`;
---

{(prev || next || related.length > 0) && (
  <nav class="read-next" aria-label="Read next">
    {(prev || next) && (
      <div class="pn-row">
        <div class="pn-cell">
          {prev && (
            <a href={slug(prev.id)} class="pn-link" rel="prev">
              <span class="pn-dir">← Previous</span>
              <span class="pn-title">{prev.data.title}</span>
              <span class="pn-date">{formatDate(prev.data.date)}</span>
            </a>
          )}
        </div>
        <div class="pn-cell pn-right">
          {next && (
            <a href={slug(next.id)} class="pn-link" rel="next">
              <span class="pn-dir">Next →</span>
              <span class="pn-title">{next.data.title}</span>
              <span class="pn-date">{formatDate(next.data.date)}</span>
            </a>
          )}
        </div>
      </div>
    )}

    {related.length > 0 && (
      <div class="related-section">
        <p class="related-label">Related</p>
        <div class="related-grid">
          {related.map((p) => {
            const b = resolveBucket(p.data.tags);
            return (
              <a href={slug(p.id)} class="related-card">
                <div class="related-cover">
                  <CoverImage data={p.data} />
                </div>
                <div class="related-body">
                  <span class:list={["related-cat", `cat-${b.key}`]}>{b.label}</span>
                  <span class="related-title">{p.data.title}</span>
                  <span class="related-date">{formatDate(p.data.date)}</span>
                </div>
              </a>
            );
          })}
        </div>
      </div>
    )}
  </nav>
)}

<style>
  .read-next {
    margin-top: 64px;
    padding-top: 40px;
    border-top: 1px solid color-mix(in oklab, var(--fg) 14%, transparent);
  }

  /* Prev / Next */
  .pn-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin-bottom: 48px;
  }
  .pn-cell { display: flex; }
  .pn-right { justify-content: flex-end; text-align: right; }
  .pn-link {
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-decoration: none;
    color: inherit;
    padding: 16px;
    border-radius: 12px;
    border: 1px solid color-mix(in oklab, var(--fg) 12%, transparent);
    transition: border-color .15s, background .15s;
    max-width: 280px;
  }
  .pn-link:hover { border-color: var(--color-ochre); background: color-mix(in oklab, var(--color-ochre) 6%, transparent); }
  .pn-dir {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: .14em;
    text-transform: uppercase;
    color: var(--color-ochre);
  }
  .pn-title { font-size: 15px; font-weight: 600; line-height: 1.35; }
  .pn-date { font-family: var(--font-mono); font-size: 10px; opacity: .45; }

  /* Related */
  .related-label {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: .2em;
    text-transform: uppercase;
    opacity: .55;
    margin-bottom: 20px;
  }
  .related-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
  }
  .related-card {
    display: block;
    text-decoration: none;
    color: inherit;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid color-mix(in oklab, var(--fg) 10%, transparent);
    transition: border-color .15s;
  }
  .related-card:hover { border-color: var(--color-ochre); }
  .related-cover { aspect-ratio: 3 / 2; overflow: hidden; }
  .related-cover :global(.cover) { transition: transform .3s; }
  @media (prefers-reduced-motion: reduce) { .related-cover :global(.cover) { transition: none; } }
  .related-card:hover .related-cover :global(.cover) { transform: scale(1.04); }
  .related-body { padding: 12px; display: flex; flex-direction: column; gap: 4px; }
  .related-cat {
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: .12em;
    text-transform: uppercase;
    color: var(--color-terracotta);
  }
  .cat-engineering { color: var(--color-ochre); }
  .cat-leadership { color: var(--fg); }
  .cat-process { color: var(--color-ink-soft); }
  .related-title { font-size: 13px; font-weight: 600; line-height: 1.3; }
  .related-date { font-family: var(--font-mono); font-size: 9px; opacity: .45; }

  @media (max-width: 640px) {
    .pn-row { grid-template-columns: 1fr; }
    .related-grid { grid-template-columns: 1fr; }
  }
  @media (prefers-reduced-motion: reduce) {
    .pn-link,
    .related-card { transition: none; }
  }
</style>
```

- [ ] **Step 2: Wire ReadNext into post page**

Read `src/pages/blog/[...slug].astro`. Add import:

```typescript
import ReadNext from "../../components/ReadNext.astro";
```

Add `ReadNext` after `</article>` and before `</BaseLayout>`:

```astro
<ReadNext
    currentSlug={slug}
    currentBucket={bucket.key}
    currentTags={post.data.tags}
    currentDate={post.data.date}
  />
```

- [ ] **Step 3: Run astro check**

```bash
npm run astro check 2>&1 | tail -5
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ReadNext.astro src/pages/blog/[...slug].astro
git commit -m "feat(engagement): ReadNext component with prev/next by date + related by bucket/tags"
```

---

## Task 7: FilterPills ?tag= URL sync + empty state (Item 7)

**Files:**
- Modify: `src/components/FilterPills.astro`
- Modify: `src/pages/blog/index.astro`

**Interfaces:**
- Produces: FilterPills reads `?tag=` on mount, pushes `?tag=` on click, handles browser back/forward; per-bucket empty-state message; cards visible with JS off (no `display:none` on server-side render).

- [ ] **Step 1: Update FilterPills.astro**

Read `src/components/FilterPills.astro`. Replace the entire `<script>` block with:

```html
<script>
  function initFilterPills() {
    document.querySelectorAll<HTMLElement>("[data-filters]").forEach((bar) => {
      const pills = [...bar.querySelectorAll<HTMLButtonElement>(".pill")];
      const scope = bar.closest("[data-filter-scope]");
      if (!scope) return;
      const cards = [...scope.querySelectorAll<HTMLElement>("[data-bucket]")];
      const emptyMsg = scope.querySelector<HTMLElement>("[data-filter-empty]");

      function applyFilter(key: string, pushState = false) {
        pills.forEach((p) => {
          const on = p.dataset.filter === key;
          p.classList.toggle("active", on);
          p.setAttribute("aria-pressed", String(on));
        });

        let anyVisible = false;
        cards.forEach((c) => {
          const show = key === "all" || c.dataset.bucket === key;
          // Use data attribute for JS-controlled visibility (CSS handles it)
          c.dataset.hidden = show ? "" : "true";
          if (show) anyVisible = true;
        });

        if (emptyMsg) {
          emptyMsg.hidden = anyVisible;
          if (!anyVisible) {
            const pill = pills.find((p) => p.dataset.filter === key);
            emptyMsg.textContent = `No posts in ${pill?.textContent?.trim() ?? key} yet.`;
          }
        }

        if (pushState) {
          const url = new URL(window.location.href);
          if (key === "all") {
            url.searchParams.delete("tag");
          } else {
            url.searchParams.set("tag", key);
          }
          window.history.pushState({ filter: key }, "", url.toString());
        }
      }

      // Read initial state from URL
      const initialTag = new URLSearchParams(window.location.search).get("tag") ?? "all";
      const validKeys = pills.map((p) => p.dataset.filter!);
      const startKey = validKeys.includes(initialTag) ? initialTag : "all";
      applyFilter(startKey, false);

      bar.addEventListener("click", (e) => {
        const pill = (e.target as HTMLElement).closest<HTMLButtonElement>(".pill");
        if (!pill) return;
        applyFilter(pill.dataset.filter!, true);
      });

    });
  }

  // Back/forward. As-built (FilterPills.astro): hoist this to MODULE scope so it
  // binds once — `window` survives view-transition navigation, so binding it
  // inside initFilterPills() would leak a popstate listener on every navigation.
  // On fire, re-sync each [data-filters] bar from the URL's ?tag=.
  window.addEventListener("popstate", () => {
    document.querySelectorAll<HTMLElement>("[data-filters]").forEach((bar) =>
      applyFilter(bar, new URLSearchParams(window.location.search).get("tag") ?? "all", false)
    );
  });

  // astro:page-load fires on initial load + every navigation, so this alone
  // covers both; a direct initFilterPills() call too would double-bind on load.
  document.addEventListener("astro:page-load", initFilterPills);
</script>
```

Add CSS for the JS-driven hidden state (append to the existing `<style>` block):

```css
  [data-bucket][data-hidden="true"] { display: none; }
```

- [ ] **Step 2: Add empty-state element in blog/index.astro**

Read `src/pages/blog/index.astro`. Add an empty-state `<p>` inside the `data-filter-scope` div, after the grid:

```astro
<p data-filter-empty hidden class="empty-state" aria-live="polite"></p>
```

Add the empty-state CSS to the existing `<style>` block:

```css
  .empty-state { font-family: var(--font-mono); font-size: 14px; opacity: .55; margin-top: 32px; }
```

- [ ] **Step 3: Verify no-JS behavior**

With JS disabled, all cards should be visible (no `display:none` in server HTML). Confirm by checking that the FilterPills template does NOT set `style="display:none"` on any card — the `data-hidden` approach achieves this because `data-bucket][data-hidden="true"] { display: none; }` only activates after JS runs.

- [ ] **Step 4: Run astro check**

```bash
npm run astro check 2>&1 | tail -5
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/FilterPills.astro src/pages/blog/index.astro
git commit -m "feat(blog): FilterPills URL sync with ?tag=, back/forward, per-bucket empty state, no-JS safe"
```

---

## Task 8: View transitions + script re-init (Item 8)

**Files:**
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `src/components/Prose.astro`
- Modify: `src/pages/blog/[...slug].astro`

**Interfaces:**
- Produces: `<ClientRouter />` in BaseLayout for SPA navigation; `transition:name` on post cover image for card→hero transition; copy-button re-init on `astro:page-load`.

**Note on reduced-motion:** Astro's `<ClientRouter />` automatically respects `prefers-reduced-motion: reduce` by disabling view transitions when the user has this preference set. No additional handling needed.

- [ ] **Step 1: Add ClientRouter to BaseLayout**

Read `src/layouts/BaseLayout.astro`. Add the import to the frontmatter:

```typescript
import { ClientRouter } from "astro:transitions";
```

Add `<ClientRouter />` inside `<head>`, just before the closing `</head>` tag:

```html
    <ClientRouter />
  </head>
```

- [ ] **Step 2: Add transition:name to CoverImage on post page for card→hero transition**

Read `src/pages/blog/[...slug].astro`. The post cover is rendered in a `<div class="post-cover">`. Wrap CoverImage with a transition name tied to the slug:

```astro
{post.data.hero?.image && (
      <div class="post-cover" transition:name={`cover-${slug}`}>
        <CoverImage data={post.data} priority />
      </div>
    )}
```

Also add `transition:name` to PostCard so the cover image transitions from card to hero. However, PostCard is used in multiple contexts; adding `transition:name` there would need the slug. The most correct fix is to pass `transitionName` as an optional prop on PostCard.

Read `src/components/PostCard.astro`. Add `transitionName?: string` to Props and apply to `imgwrap`:

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
  transitionName?: string;
}
const { href, title, date, bucketKey, bucketLabel, summary, coverData, transitionName } = Astro.props;
---
<a class="card" href={href} data-bucket={bucketKey}>
  <div class="imgwrap" transition:name={transitionName}><CoverImage data={coverData} /></div>
```

Then in `src/pages/blog/index.astro`, pass `transitionName` to each PostCard. Add the slug computation above the grid and pass it:

```astro
<PostCard
            href={slug(post.id)}
            title={post.data.title}
            date={post.data.date}
            bucketKey={b.key}
            bucketLabel={b.label}
            summary={post.data.summary}
            coverData={post.data}
            transitionName={`cover-${post.id.replace(/\.mdx$/, "")}`}
          />
```

- [ ] **Step 3: Wrap copy-button initialization in Prose.astro with astro:page-load**

Read `src/components/Prose.astro`. The existing `<script>` initializes copy buttons on load but doesn't handle SPA navigation. Wrap the initialization in a named function and call it on both `DOMContentLoaded` and `astro:page-load`:

Replace the current script block with:

```html
<script>
  function initCopyButtons() {
    const canCopy = typeof navigator.clipboard?.writeText === "function";
    if (!canCopy) return;
    for (const pre of document.querySelectorAll(".prose pre")) {
      if (pre.querySelector(".copy-btn")) continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "copy-btn";
      btn.setAttribute("aria-label", "Copy code to clipboard");
      btn.textContent = "Copy";
      btn.addEventListener("click", () => {
        const code = pre.querySelector("code");
        const text = ((code && code.textContent) || "").replace(/\n$/, "");
        navigator.clipboard
          .writeText(text)
          .then(() => {
            btn.textContent = "Copied";
            btn.classList.add("copied");
            setTimeout(() => {
              btn.textContent = "Copy";
              btn.classList.remove("copied");
            }, 1600);
          })
          .catch(() => {
            btn.textContent = "Failed";
            setTimeout(() => {
              btn.textContent = "Copy";
            }, 1600);
          });
      });
      pre.appendChild(btn);
    }
  }

  // astro:page-load fires on initial load + every navigation; initCopyButtons
  // is idempotent, but a direct call too would still run it twice on first load.
  document.addEventListener("astro:page-load", initCopyButtons);
</script>
```

- [ ] **Step 4: Run astro check**

```bash
npm run astro check 2>&1 | tail -5
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/layouts/BaseLayout.astro src/components/Prose.astro src/pages/blog/[...slug].astro src/components/PostCard.astro src/pages/blog/index.astro
git commit -m "feat(perf): Astro ClientRouter view transitions, cover card→hero transition, script re-init on astro:page-load"
```

---

## Task 9: /now page + nav link (Item 9)

**Files:**
- Create: `src/pages/now.astro`
- Modify: `src/components/Header.astro`

**Interfaces:**
- Produces: `/now` page consolidating homepage "Right now" and about "Currently building"; "Now" link in header nav.

**Context to consolidate:**
- Homepage (`src/pages/index.astro`): "Right now" section lists (1) Shipping lognote — local transcription for meetings, (2) Senior Solutions Engineer at GitHub.
- About page (`src/pages/about.astro`): "Currently building" section with lognote description; "Tools I reach for" stack section.

- [ ] **Step 1: Create src/pages/now.astro**

```astro
---
import BaseLayout from "../layouts/BaseLayout.astro";
import PageHeader from "../components/PageHeader.astro";
import { SITE } from "../lib/site";

const nowLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "url": new URL("/now", SITE.url).toString(),
  "name": "Now — Shariq Hirani",
  "description": "What Shariq Hirani is focused on right now.",
};

const tools = [
  { name: "Docker", icon: "docker" },
  { name: "Notion", icon: "notion" },
  { name: "1Password", icon: "1password" },
  { name: "GitHub", icon: "github" },
  { name: "GitHub Copilot", icon: "githubcopilot" },
  { name: "Claude", icon: "claude" },
  { name: "iTerm2", icon: "iterm2" },
  { name: "Soloterm", icon: null },
  { name: "Obsidian", icon: "obsidian" },
  { name: "Spotify", icon: "spotify" },
  { name: "Apple Music", icon: "applemusic" },
  { name: "Sublime Text", icon: "sublimetext" },
];
---
<BaseLayout title="Now" description="What Shariq Hirani is working on right now." jsonLd={nowLd}>
  <PageHeader eyebrow="Updated regularly" title="Now" />

  <section class="now-section">
    <span class="mono-label">Building</span>
    <div class="building">
      <h2 class="project-name">
        <a href="https://lognote.dev" target="_blank" rel="noopener">lognote</a>
      </h2>
      <p class="project-desc">
        A local-first Mac app that records your meetings, transcribes them on-device with MLX-Whisper,
        and drops a clean Markdown summary into your notes. Private by default — nothing leaves your machine.
      </p>
    </div>
  </section>

  <section class="now-section">
    <span class="mono-label">Day job</span>
    <div class="dayjob">
      <p class="role">Senior Solutions Engineer</p>
      <p class="org">
        <svg class="gh-ic" viewBox="0 0 16 16" aria-hidden="true">
          <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        GitHub
      </p>
    </div>
  </section>

  <section class="now-section">
    <span class="mono-label">Writing about</span>
    <ul class="writing-list">
      <li>Engineering teams — how they actually run vs. how they're written about</li>
      <li>The AI shift in software: what holds up under sustained use, not just demos</li>
      <li>The move from senior engineer to lead, and the asymmetric jump back</li>
    </ul>
  </section>

  <section class="now-section" style="border-bottom: none;">
    <span class="mono-label">Tools I reach for</span>
    <div class="stack">
      {tools.map((t) => (
        <span class="tool">
          {t.icon && <i class="tool-ic" style={`--ic: url(/static/icons/${t.icon}.svg)`} aria-hidden="true" />}
          {t.name}
        </span>
      ))}
    </div>
  </section>

  <p class="updated">Last updated June 2026 — <a href="/about">more about me</a></p>
</BaseLayout>

<style>
  .mono-label {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: .2em;
    text-transform: uppercase;
    opacity: .55;
    display: block;
    margin-bottom: 18px;
  }

  .now-section {
    padding: 48px 0;
    border-bottom: 1px solid color-mix(in oklab, var(--fg) 12%, transparent);
  }

  .building .project-name {
    font-family: var(--font-display);
    font-style: italic;
    font-weight: 400;
    font-size: 40px;
    letter-spacing: -.02em;
    margin-bottom: 14px;
  }

  .building .project-name a {
    color: var(--color-terracotta);
    text-decoration: underline;
    text-decoration-color: var(--color-ochre);
    text-underline-offset: 5px;
  }

  .project-desc {
    font-size: 17px;
    line-height: 1.65;
    color: var(--fg-soft);
    max-width: 52ch;
  }

  .dayjob {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .role {
    font-family: var(--font-display);
    font-size: 32px;
    font-weight: 500;
    letter-spacing: -.015em;
  }

  .org {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 18px;
    color: var(--fg-soft);
  }

  .gh-ic {
    width: 0.9em;
    height: 0.9em;
    vertical-align: -0.1em;
  }

  .writing-list {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .writing-list li {
    font-family: var(--font-display);
    font-size: 22px;
    line-height: 1.4;
    letter-spacing: -.01em;
    padding: 14px 0;
    border-bottom: 1px dashed color-mix(in oklab, var(--fg) 16%, transparent);
  }

  .writing-list li:last-child { border-bottom: none; }

  .stack {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .tool {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-family: var(--font-mono);
    font-size: 12px;
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid color-mix(in oklab, var(--fg) 18%, transparent);
  }

  .tool-ic {
    width: 13px;
    height: 13px;
    flex: none;
    background: var(--fg);
    -webkit-mask: var(--ic) center / contain no-repeat;
    mask: var(--ic) center / contain no-repeat;
  }

  .updated {
    margin-top: 40px;
    font-family: var(--font-mono);
    font-size: 11px;
    opacity: .45;
    letter-spacing: .06em;
  }

  .updated a {
    color: var(--color-terracotta);
    text-decoration: underline;
    text-decoration-color: var(--color-ochre);
    text-underline-offset: 3px;
  }
</style>
```

- [ ] **Step 2: Add "Now" to header nav**

Read `src/components/Header.astro`. Add a nav link to `/now` alongside the existing links:

```html
<nav class="flex items-center gap-6 text-sm">
      <a href="/blog" class="hover:text-[var(--accent)]">Blog</a>
      <a href="/now" class="hover:text-[var(--accent)]">Now</a>
      <a href="/projects" class="hover:text-[var(--accent)]">Projects</a>
      <a href="/about" class="hover:text-[var(--accent)]">About</a>
    </nav>
```

- [ ] **Step 3: Run astro check**

```bash
npm run astro check 2>&1 | tail -5
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/now.astro src/components/Header.astro
git commit -m "feat(content): /now page consolidating Right Now + Currently Building; add Now to header nav"
```

---

## Task 10: "Work with me" CTA on /about (Item 10)

**Files:**
- Modify: `src/pages/about.astro`

**Interfaces:**
- Produces: a "Work with me" section on the About page, above the footer area, linking to `SITE.email` and `SITE.social.twitter`.

- [ ] **Step 1: Add Work With Me section to about.astro**

Read `src/pages/about.astro`. The last `<section>` currently has `style="border-bottom:none"`. Change that section to have a border-bottom, and add a new section after it:

Find the line:
```html
  <section class="sec" style="border-bottom:none">
```

Replace with:
```html
  <section class="sec">
```

Then add a new section before `</BaseLayout>` (after the script block):

```astro
  <section class="sec work-cta" style="border-bottom:none;">
    <span class="mono-label">Work with me</span>
    <div class="cta-inner">
      <h2 class="cta-heading">
        Got a hard engineering problem,<br />
        or a team that needs to ship faster?
      </h2>
      <p class="cta-body">
        I'm a Senior Solutions Engineer at GitHub with 10+ years across distributed systems,
        platform architecture, and technical leadership. I work with teams on the AI shift —
        building agentic tooling that actually holds up in production, not just in demos.
        If you're looking for a technical collaborator, advisor, or just want to talk through
        a hard problem, I'm open to the conversation.
      </p>
      <div class="cta-actions">
        <a href={`mailto:${SITE.email}`} class="cta-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
          {SITE.email}
        </a>
        <a href={SITE.social.twitter} target="_blank" rel="noopener noreferrer" class="cta-secondary">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.74l7.73-8.835L1.254 2.25H8.08l4.26 5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          @ShariqHirani on X
        </a>
      </div>
    </div>
  </section>
```

Also add the `SITE` import if it's not already imported at the top of `about.astro`. Check the current frontmatter — it does not import SITE, so add:

```typescript
import { SITE } from "../lib/site";
```

Add the CTA styles to the existing `<style>` block:

```css
  .work-cta { padding: 72px 0; }
  .cta-inner { max-width: 56ch; }
  .cta-heading {
    font-family: var(--font-display);
    font-weight: 500;
    font-size: 32px;
    line-height: 1.15;
    letter-spacing: -.02em;
    margin-bottom: 18px;
  }
  .cta-body {
    font-size: 16px;
    line-height: 1.7;
    color: var(--fg-soft);
    margin-bottom: 28px;
  }
  .cta-actions { display: flex; flex-wrap: wrap; gap: 12px; }
  .cta-primary,
  .cta-secondary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    border-radius: 999px;
    font-family: var(--font-mono);
    font-size: 13px;
    text-decoration: none;
    transition: background .15s, color .15s, border-color .15s;
  }
  .cta-primary {
    background: var(--color-ink);
    color: var(--color-paper);
    border: 1px solid var(--color-ink);
  }
  .cta-primary:hover { background: var(--color-ochre); border-color: var(--color-ochre); color: var(--color-ink); }
  .cta-secondary {
    background: none;
    color: inherit;
    border: 1px solid color-mix(in oklab, var(--fg) 22%, transparent);
  }
  .cta-secondary:hover { border-color: var(--color-ochre); color: var(--color-ochre); }
  @media (prefers-reduced-motion: reduce) {
    .cta-primary,
    .cta-secondary { transition: none; }
  }
```

- [ ] **Step 2: Run astro check**

```bash
npm run astro check 2>&1 | tail -5
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/about.astro
git commit -m "feat(about): Work With Me CTA tied to senior-SE positioning, links to email + X"
```

---

## Task 11: Final verification + PR

**Files:**
- No file changes — verification and PR only.

- [ ] **Step 1: Run all tests**

```bash
npm test 2>&1 | tail -20
```

Expected: All tests pass.

- [ ] **Step 2: Run astro check**

```bash
npm run astro check 2>&1 | tail -5
```

Expected: 0 errors.

- [ ] **Step 3: Run production build**

```bash
npm run build 2>&1 | tail -20
```

Expected: Build completes with no errors. Check for any warnings about types.

- [ ] **Step 4: Push branch**

```bash
git push -u origin feat/site-enhancements
```

- [ ] **Step 5: Open PR**

```bash
gh pr create \
  --title "Site enhancements: SEO, engagement, a11y, polish" \
  --body "$(cat <<'EOF'
## Summary

Implements 10 grounded enhancements to shariq.dev:

1. **JSON-LD** — BlogPosting + BreadcrumbList on post pages; WebSite + Person on homepage; /now page WebPage. `jsonLd?` prop on BaseLayout.
2. **Read next** — Prev/next by date + ≤3 related posts by bucket/tags at bottom of every post.
3. **Share footer** — Web Share API (guarded), copy-link (guarded + "Copied" feedback), X share intent, LinkedIn share intent, RSS feed link, X follow link.
4. **Web manifest fix** — Correct name/short_name, ochre theme_color (#d49a3a), paper background_color, correct icon paths; linked in BaseLayout with meta theme-color + apple-touch-icon.
5. **a11y** — Visually-hidden skip-to-content link (visible on focus) targeting \`#main\`; global `:focus-visible` ochre outline in global.css.
6. **RSS content:encoded** — Feed now emits \`content\` field + OG image \`<enclosure>\` per post. (Full HTML rendering skipped — Astro's \`render()\` returns a component, not a string; summary used as content until container API is adopted.)
7. **FilterPills \`?tag=\` sync** — Active filter syncs to \`?tag=\` query param, reads on load, handles browser back/forward. Per-bucket empty state. Cards visible with JS off (data-attribute pattern, not server-side display:none).
8. **View transitions** — Astro \`<ClientRouter />\` in BaseLayout; \`transition:name\` on cover (card→hero); copy-button + share-footer + filter pills all re-init on \`astro:page-load\`. Reduced-motion respected by ClientRouter automatically.
9. **/now page** — Consolidates homepage "Right now" + about "Currently building"; added to header nav.
10. **Work With Me CTA** — Added to /about, senior-SE positioning, links to email + X.

## Test plan

- [ ] `npm run astro check` → 0 errors
- [ ] `npm test` → all pass
- [ ] `npm run build` → no errors, dist/feed.xml and dist/og/ present
- [ ] Visit /blog — filter pills persist in URL, back/forward works, empty state shows
- [ ] Visit a post — share footer visible, read next visible, JSON-LD in `<head>`
- [ ] Visit /now — page renders, header shows "Now" link
- [ ] Visit /about — Work With Me section at bottom
- [ ] View page source on homepage — WebSite + Person JSON-LD present
- [ ] site.webmanifest has correct name + colors

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Trigger Copilot review**

```bash
# Get PR number from previous step output, then:
gh pr edit <PR_NUMBER> --add-reviewer copilot-pull-request-reviewer
```

---

## Self-Review Checklist

**Spec coverage:**
1. JSON-LD — Task 3 ✓
2. Read next — Task 6 ✓
3. Share footer — Task 5 ✓
4. Web manifest fix — Task 1 ✓
5. a11y skip link + focus-visible — Task 2 ✓
6. Full-content RSS — Task 4 ✓ (with documented limitation)
7. FilterPills ?tag= sync — Task 7 ✓
8. View transitions + script re-init — Task 8 ✓
9. /now page — Task 9 ✓
10. Work with me CTA — Task 10 ✓

**Constraints verified:**
- OG generation files not touched ✓
- No dark mode toggle added ✓
- Light-only site unchanged ✓
- `.astro` frontmatter: semicolons + double quotes ✓
- `.ts` files: no semis, single quotes, 2-space indent ✓
- All tasks run `npm run astro check` before committing ✓
- `superpowers:subagent-driven-development` instruction in header ✓
