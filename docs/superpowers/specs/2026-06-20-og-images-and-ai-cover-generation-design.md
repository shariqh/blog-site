# OG Images + AI Cover Generation — Design Spec

**Date:** 2026-06-20
**Status:** Approved design, pre-plan
**Supersedes:** the "AI-generated cover art (follow-on)" note in §6 of
`2026-06-18-site-redesign-zine-homepage-and-blog-design.md`. That spec defined
the cover contract (`hero.image` + procedural fallback) and deferred AI covers;
this spec folds AI cover generation in and adds build-time OG images.

---

## 1. Goal

Two linked capabilities so the image-forward blog has cohesive art and shows a
real preview anywhere a link is shared:

1. **AI cover generation** — generate an on-brand cover illustration for every
   post via Azure OpenAI `gpt-image-1`, used automatically by the Plan B
   drafting agent for new posts and runnable by hand to backfill the archive.
2. **OG image generation** — render a 1200×630 Open Graph image per post at
   build time (Satori → PNG, no browser). Hybrid: the post's cover under a dark
   scrim + title overlay when a cover exists; a branded template otherwise.

End state: every published post has a house-style cover, every shared link
shows a proper preview card, and new agent-drafted posts get both for free.

## 2. Non-goals

- Runtime/on-request image generation. Everything is build-time or
  agent-draft-time; the deployed site loads no external image services
  (keeps the existing privacy/CI posture — no third-party calls at runtime).
- Animated or video OG.
- Per-platform OG variants (one 1200×630 image serves OG + Twitter/X).
- Replacing the existing manual banner files on disk (we keep them; we only
  repoint `hero.image`). See §9.

## 3. Architecture — two subsystems, one contract

```
                 ┌─────────────────────────────┐
 post frontmatter│  hero.image  (the contract)  │
                 └─────────────────────────────┘
                    ▲                        │
   writes           │                        │ reads
 ┌──────────────────┴───────┐     ┌──────────▼──────────────────┐
 │ A. Cover generation      │     │ B. OG generation            │
 │ (Azure gpt-image-1)      │     │ (Satori + resvg, build-time)│
 │ • agent draft step       │     │ • /og/<slug>.png per post   │
 │ • manual CLI (backfill)  │     │ • hybrid if cover exists    │
 │ • vision-guard + regen   │     │ • branded fallback if not   │
 └──────────────────────────┘     └─────────────────────────────┘
                    │                        │
                    └──── branded template ──┘
                      (shared deterministic fallback)
```

The two subsystems are independently shippable and meet only at `hero.image`.
They become **two implementation plans** (see §12). Cover generation can ship
with zero OG work; OG generation works against whatever covers exist (AI-made,
hand-made, or none).

## 4. Current state (verified 2026-06-20)

- `src/layouts/BaseLayout.astro` — `Props { title?, description?, canonical?, width? }`.
  Head emits `og:title`, `og:description`, `og:type=website`, `og:url`,
  canonical, favicon. **No `og:image`, no Twitter card tags, no image prop.**
- `src/lib/schemas.ts` — `hero` = `{ image: string, alt: string, prompt?, background?, titleStyle? }`,
  optional. Path served from `/public/` (e.g. `/static/images/blog/<slug>/...`).
- `src/lib/cover.ts` — `safeLocalImage(src)` strictly validates `hero.image`:
  must start with single `/`, no `% \ ? #`, must normalize under
  `/static/images/`, must end in a raster image extension; returns the
  normalized pathname or `null`. `resolveCover({hero, tags})` is the exported
  entry used by components. **Reuse both for OG path handling.**
- Cover is consumed by `CoverImage.astro` (PostCard at `aspect-ratio: 3/2`,
  600×400, lazy; blog detail page at `aspect-ratio: 16/9`, eager) and
  `PostHeader.astro` (conditional `<img>`).
- `package.json` — Node ≥24, Astro ^6.3.8, TS ^6. Scripts use `tsx`.
  **Not present:** `satori`, `@resvg/resvg-js`, `sharp`. **Present:**
  `@fontsource-variable/{fraunces,inter,jetbrains-mono}` — **WOFF2 only**.
- Plan B agent: `scripts/agent/draft.ts` → `draftBlogRow()`. Flow: build
  prompts → `runPrompt()` returns MDX → `validateMdxFrontmatter()` →
  `writeFileSync(src/content/writing/<slug>.mdx)` → Vale → git add + PR →
  Notion update. Config/secrets via `src/lib/config.ts` (`dotenv` + `.env.local`).
- 16 posts in `src/content/writing/**`. 13 have a `hero:` block
  (`.../banner.png` or `hero.png`); 3 do not
  (`developer-cheat-sheet`, `rewriting-our-engine-...`,
  `storing-and-accessing-environment-variables-in-1password`).
- No existing OG/Satori code. Greenfield.

---

## 5. Subsystem A — AI cover generation

### 5.1 Module & CLI

- Core module: `scripts/cover/generate-cover.ts` exporting
  `generateCover(input): Promise<CoverResult>` where
  `input = { slug, title, summary, tags, style?, outDir? }` and
  `CoverResult = { imagePath, alt, prompt, style, attempts, usedFallback }`.
- CLI wrapper: `scripts/cover/cli.ts`, wired as `npm run gen:cover`.
  Usage: `npm run gen:cover <slug> [--style line-art|conceptual] [--force]`.
  - Reads the post's MDX frontmatter for title/summary/tags.
  - Writes the cover PNG and updates the post's frontmatter `hero` in place
    (via `gray-matter`, already a devDependency).
  - `--force` regenerates even if a cover already exists.
- Batch backfill: `scripts/cover/backfill.ts` (`npm run gen:cover:all`) iterates
  every published post, calling the core module. Used once for the archive
  (§9); also handy later.

### 5.2 Prompt construction

Prompt = three concatenated parts (validated by the spike):

1. **Style spine** (one of two, see §5.3).
2. **Subject** — derived from the post: a one-sentence concept built from the
   title + summary + resolved bucket. v1 uses a deterministic template
   (`Concept: <title>. <summary>`) lightly normalized; the agent path MAY ask
   its own Claude call to phrase a tighter visual concept (it already has a
   model in hand), but the template is the floor and the CLI default.
3. **Brand spine** (constant): strict palette (ink `#15233a` dominant, ochre
   `#d49a3a`, terracotta `#b04a3a`, cream `#f3e8d2`), warm/calm/editorial,
   **no text/letters/words/numbers/logos/watermarks/UI/realistic faces**, wide
   3:2 with deliberate empty negative space in the **left third** for a title
   overlay.

The exact strings are the spike's `BRAND`, `A_LINE`, `B_CONCEPT` constants
(`design-samples/cover-spike2.mjs`), promoted into
`scripts/cover/prompt.ts` as the single source of truth. The "no text"
clause is strengthened (explicit "do not render any glyphs, captions, or
labels of any kind").

### 5.3 Style selection (A line-art / B conceptual)

Two interchangeable house styles, picked per post:

- **A — flat editorial line-art** (technical-feeling buckets).
- **B — rich conceptual illustration** (human/narrative buckets).

Default mapping by resolved bucket (`src/lib/buckets.ts`):

| Bucket       | Style          |
|--------------|----------------|
| engineering  | A (line-art)   |
| ai           | A (line-art)   |
| process      | A (line-art)   |
| leadership   | B (conceptual) |
| notes        | B (conceptual) |

Override: a new optional `hero.style: 'line-art' | 'conceptual'` in frontmatter,
and `--style` on the CLI. Override wins over the bucket default.

### 5.4 Azure call

- Endpoint `POST {AZURE_OPENAI_ENDPOINT}/openai/deployments/{deployment}/images/generations?api-version=2025-04-01-preview`,
  header `api-key`, body
  `{ prompt, n: 1, size: '1536x1024', quality: 'high', output_format: 'png' }`.
- Response: `data[0].b64_json` → decode to a PNG buffer.
- Resource already provisioned (see memory `project_azure_cover_gen`):
  RG `rg-blog-og`, account `shariq-blog-img-eus2` (eastus2), deployment
  `gpt-image-1`. 1536×1024 (3:2) source crops cleanly to the 3:2 card, 16:9
  detail header, and ~1.9:1 OG.

### 5.5 Text-leak guard

`gpt-image-1` occasionally renders a stray label despite the negative
(observed: "STAKEHOLDERS" baked onto a cover). Guard pipeline:

1. Strengthened no-text negative in every prompt (§5.2).
2. **Vision check** after each generation: `scripts/cover/text-check.ts`
   exposing `hasText(pngBuffer): Promise<boolean>`. Implementation: a cheap
   multimodal model answers a yes/no "does this image contain any readable
   text, letters, words, or numbers?" The CLI/build path uses an Azure
   `gpt-4o-mini` (or equivalent) vision deployment on the same account
   (`AZURE_OPENAI_VISION_*`); the agent path MAY instead use its in-process
   Claude vision. The interface is provider-agnostic.
3. **Regenerate up to 3 attempts** total if text is detected.
4. If all attempts fail the check → **fall back to the branded template**
   (§7) rendered as the cover PNG. Never ship a leaked-text image
   unattended. `CoverResult.usedFallback = true` so callers can flag it.

### 5.6 Output & frontmatter update

- Write to `/public/static/images/blog/<slug>/cover.png`.
- Set/replace frontmatter `hero`:
  - `image: /static/images/blog/<slug>/cover.png`
  - `alt`: a short generated description (the subject sentence, trimmed).
  - `prompt`: the full prompt used (already an optional schema field — useful
    for regeneration and provenance).
  - `style`: the chosen style (new field, §8).
- Existing manual `banner.png`/`hero.png` files are left on disk untouched;
  only `hero.image` is repointed. Reverting a single post to its old art =
  restore that one frontmatter line (curated in the PR, §9).

### 5.7 Agent integration (Plan B draft step)

Hook into `draftBlogRow()` **after** the MDX is written and validated
(`writeFileSync`, before Vale): the slug exists, frontmatter is on disk, and
title/summary/tags are known. Call `generateCover()`, which writes the PNG and
patches the file's `hero`. Then `git add` the new PNG alongside the MDX so the
agent's PR contains both. Cover failure must **not** abort the draft — on
error, log and proceed (the post still gets the branded OG fallback at build).

### 5.8 Secrets / config

Add to `src/lib/config.ts` (and `.env.local.example`, GitHub Actions secrets):

- `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_KEY`, `AZURE_OPENAI_IMAGE_DEPLOYMENT`
  (default `gpt-image-1`).
- `AZURE_OPENAI_VISION_DEPLOYMENT` (+ reuse endpoint/key) for the text check,
  or a flag selecting the Claude path inside the agent.

These are treated as `optional()` in config so a normal `npm run build`/dev
without Azure creds still works (cover-gen is opt-in; the site build never
calls Azure).

---

## 6. Subsystem B — OG image generation

### 6.1 Engine & fonts

- Add `satori` (HTML/JSX → SVG) + `@resvg/resvg-js` (SVG → PNG) as
  devDependencies. No headless browser; runs in CI.
- **Font constraint:** Satori needs `ttf`/`otf`/`woff` buffers; the repo's
  `@fontsource-variable/*` packages ship **WOFF2 only**, which Satori cannot
  read. Resolution: **vendor static font files** the OG renderer needs into
  `src/assets/og-fonts/` — Fraunces (display, ~600), Inter (400/500),
  JetBrains Mono (500) — as `.ttf` (or `.otf`). These are loaded as buffers
  at build. (Vendoring keeps the build hermetic and avoids a WOFF2→TTF
  conversion step.)

### 6.2 Endpoint

- `src/pages/og/[...slug].png.ts` — an Astro endpoint with `getStaticPaths()`
  enumerating all non-draft posts, exporting `GET` that returns the rendered
  PNG (`Content-Type: image/png`). Static at build → `dist/og/<slug>.png`.
- Shared render core: `src/lib/og/render.ts` (`renderOg(data) → Buffer`) and
  `src/lib/og/templates.tsx` (the two Satori layouts). Keep Satori JSX out of
  the endpoint file.

### 6.3 Hybrid template (cover exists)

1200×630. Matches the approved mockup (`design-samples/og-mockup.html`, frame ①):

- Cover full-bleed (`object-fit: cover`). The cover PNG is read from
  `public/<safeLocalImage(hero.image)>` at build and embedded as a base64 data
  URI (Satori has no filesystem). If the path fails `safeLocalImage`, treat as
  "no cover" → fallback.
- Scrim: `linear-gradient(105deg, rgba(21,35,58,.94) 30%, rgba(21,35,58,.55) 58%, rgba(21,35,58,.15) 100%)`.
- 12px terracotta left bar.
- Content pad inset `64 64 56 76`, white text:
  - Eyebrow (JetBrains Mono, 22px, `.18em`, uppercase, ochre):
    `<BucketLabel> · shariq.dev`.
  - Title (Fraunces 600, 78px, `line-height 1.04`, `max-width 17ch`), pinned
    to the bottom (`margin-top: auto`).
  - Foot row: `◆ shariq.dev` mark (JetBrains Mono 24px, `◆` ochre) on the
    left; `"<Mon YYYY> · <N> min"` (JetBrains Mono 19px, 70% opacity) on the
    right. Reading minutes from `reading-time` (already a dependency); date
    from `post.data.date`.

### 6.4 Branded fallback template (no cover)

1200×630. Matches the mockup frame ②:

- Two-column grid `1.25fr / 1fr` on an ink (`#15233a`) field.
- Left column padding `70 56 60 76`, white text: ochre 12px left bar; ochre
  eyebrow `<BucketLabel> · shariq.dev`; Fraunces 80px title (`max-width 15ch`,
  bottom-pinned); `◆ shariq.dev` foot.
- Right "art" panel: ink gradient with a line-art motif. **Satori caveat:**
  arbitrary inline SVG renders poorly. Use a **pre-rendered line-art motif
  PNG** (`src/assets/og/motif.png`) embedded as a data URI, derived from the
  FeaturedCard line-art language (ochre/terracotta/cream shapes on ink). One
  static asset, palette-correct, deterministic.

### 6.5 BaseLayout wiring

- Add `ogImage?: string` to `BaseLayout` Props. When present, emit:
  - `<meta property="og:image" content={ogImage} />`
  - `<meta property="og:image:width" content="1200" />`
  - `<meta property="og:image:height" content="630" />`
  - `<meta name="twitter:card" content="summary_large_image" />`
  - `<meta name="twitter:image" content={ogImage} />`
- Blog post page (`src/pages/blog/[...slug].astro`) passes
  `ogImage={new URL('/og/' + slug + '.png', Astro.site)}` and sets
  `og:type=article` (add an optional `ogType` prop, default `website`).
- Non-post pages may opt into a generic site OG later; out of scope here
  (they simply omit `ogImage` → no image tags, unchanged behavior).

---

## 7. Shared branded template (deterministic fallback)

The §6.4 branded template is the single deterministic fallback used by **both**
subsystems:

- OG generation uses it when a post has no valid cover.
- Cover generation uses it (rendered to a 1536×1024 or cover-appropriate PNG)
  when the text-leak guard exhausts retries.

Implement once in `src/lib/og/templates.tsx` parameterized by output size, so
there is one branded look. It makes zero network calls and always succeeds —
the guarantee that nothing ships blank.

## 8. Data-model change

`src/lib/schemas.ts` `hero`: add
`style: z.enum(['line-art', 'conceptual']).optional()`.
No other schema changes. `image`, `alt`, `prompt` already exist. Backward
compatible (optional, additive).

## 9. Backfill rollout (the cohesion pass)

One-time, run by hand, curated before merge:

1. Run `npm run gen:cover:all` to generate a house-style cover for all 16
   published posts (auto style per bucket), writing `cover.png` per post and
   repointing each `hero.image`.
2. Review the batch: the text-leak guard auto-rejects glyph leaks; then a human
   glance at the 16 covers in the PR. For any post where the old manual banner
   is preferred, restore that single `hero.image` line (originals remain on
   disk). For any cover that's off, `--force` regenerate or set `hero.style`
   and re-run that slug.
3. Merge → every post now has a cohesive cover, and OG renders the hybrid card
   for all of them, so shared links preview correctly.

This pass is gated behind Subsystem A landing; OG (Subsystem B) can land before
or after — posts without a cover yet simply get the branded OG until backfilled.

## 10. Testing

- **Unit (vitest):**
  - `prompt.ts` — style spine selection (bucket→style, override precedence),
    subject derivation, brand spine always appended, no-text clause present.
  - path safety — OG render rejects a `hero.image` that fails `safeLocalImage`
    and routes to fallback (reuse existing `cover.ts`).
  - slug→filename and frontmatter patch (gray-matter round-trips `hero`).
  - text-guard control flow — mock `hasText`: pass-first, fail→regen→pass,
    fail×3→fallback (`usedFallback === true`). The Azure call itself is mocked.
- **OG render:**
  - `renderOg` returns a non-empty PNG buffer with correct magic bytes for a
    cover post and a no-cover post; dimensions 1200×630.
  - endpoint `getStaticPaths` yields one path per non-draft post.
- **Build smoke (playwright, existing `test:smoke`):** after `astro build`,
  assert `dist/og/<slug>.png` exists for a sampled post and the rendered HTML
  contains `og:image` + `twitter:card`.
- Live Azure calls are **never** in the test suite (cost/nondeterminism);
  exercised only via the manual CLI during backfill.

## 11. Risks & decisions

- **Font vendoring (§6.1)** is required, not optional — WOFF2 won't load in
  Satori. Decision: vendor TTFs; document their source/license in the assets dir.
- **Cover regeneration cost** — backfill is 16 images + retries, trivial
  against Azure credits. Ongoing: one per new agent post.
- **Subject quality** — the template subject (`Concept: <title>. <summary>`)
  is the floor; the spike's hand-written subjects were richer. The agent path
  can phrase better concepts; CLI users can pass a better `hero.prompt`. Not a
  blocker.
- **Style drift over time** — palette + style spines are constants in one
  module, so the look stays cohesive; revisiting them is a one-file change.

## 12. Implementation plans (split)

This spec yields **two plans**, in order:

1. **OG image generation** — Satori/resvg deps, vendored fonts, render core +
   two templates, `/og/[...slug].png.ts`, BaseLayout/blog-page wiring, tests.
   Ships value immediately (branded OG for all posts, hybrid for the 13 with
   covers).
2. **AI cover generation** — prompt module, Azure client, text-guard, core
   `generateCover` + CLI + backfill, schema `hero.style`, agent draft-step
   hook, config/secrets, tests. Then run the backfill pass (§9).

OG-first means link previews work right away; cover-gen then upgrades the
hybrid coverage to 100% and automates new posts.

## 13. Future work (out of scope here)

- **Generalize into a reusable service for the user's other sites.** Once
  this is stood up and proven on the blog, extract the cover-gen + OG engine
  into a standalone, configurable service/package (own brand palette, fonts,
  style spines, and Azure binding per site) so it can be reused across
  properties. Includes discovering the right shape: shared npm package vs.
  a small hosted endpoint/API vs. a copy-in template, and how to parameterize
  branding. Tracked separately (see todo / memory `project_cover_service_general`).
- Non-post / generic site OG image.
- Smarter subject phrasing (dedicated concept model) if template covers feel weak.
