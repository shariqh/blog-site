# Site redesign — personal "zine" homepage + dedicated `/blog` page

**Date:** 2026-06-18
**Status:** Design locked, ready for implementation plan
**Visual source of truth (throwaway mockups):**
`design-samples/homepage-zine.html` (homepage),
`design-samples/blog-calm-split.html` (blog page).
These static HTML files are the canonical reference for layout, spacing, and
motion. They are NOT shipped — they're discarded once the real Astro build matches. These mockups were removed from the repo after the production build matched them; they remain in git history.

---

## 1. Background & goal

The current site is a single page that doubles as a personal landing _and_ the
blog listing, in a bold brutalist-editorial style (hard-bordered text-only
cards, no imagery). Two problems drove this redesign:

1. The aesthetic felt off — we want something cleaner and more image-forward,
   inspired by a ProAgenda blog-page Dribbble shot (soft-rounded cards, pill
   category filters, a split featured card, more whitespace).
2. More importantly, the site should be **mine, not just a blog with my face on
   it**. The homepage should be a _destination_ with personality — content you
   read and explore in place — and the blog should be its own focused room.

**Outcome:** split the site into two distinct expressions of **one shared design
language**:

- **`/` — a personal "zine" homepage.** Playful, terse, visual. Big type and
  whitespace carry it; content lives on the page (not a wall of links).
- **`/blog` — a dedicated blog listing.** The focused, ProAgenda-style
  expression: split featured card, bucket pill filters, image-card grid.

Consistency between the two is a hard requirement: same palette, type, cards,
panels, header, and footer. The blog is the _focused_ form of the homepage's
_playful_ form — not a different site.

---

## 2. Shared design system ("the kit")

This is the single source of truth both pages (and the post detail page) draw
from. Most tokens already exist in `src/styles/global.css` as Tailwind 4
`@theme` values.

### Palette

| Token                | Hex       | Role                                       |
| -------------------- | --------- | ------------------------------------------ |
| `--color-ink`        | `#15233a` | primary text, dark panels                  |
| `--color-ink-soft`   | `#2a3f5f` | secondary text, Process bucket             |
| `--color-ochre`      | `#d49a3a` | primary accent, CTAs, Engineering bucket   |
| `--color-terracotta` | `#b04a3a` | secondary accent, active filter, AI bucket |
| `--color-paper`      | `#f3e8d2` | warm cream (existing)                      |
| `--color-paper-soft` | `#faf3e3` | soft cream                                 |
| **page background**  | `#faf8f3` | **NEW** — a lighter near-white cream       |

**Design decision (token change):** the airy feel depends on a lighter page
background than today's `--color-paper` (`#f3e8d2`, a warm tan). The redesign
sets the light-mode page background to `#faf8f3`. Cards are white; dark panels
use `--color-ink`. Dark mode keeps its inverted tokens (see §6).

### Typography — 3 fonts, each with ONE job (decision: keep all three)

- **Fraunces** (display, italic-capable serif): all headlines, featured titles,
  the manifesto, "Right now" lines, built-item titles, sign-off. The character.
- **Inter** (sans): body, kicker/tagline, hooks, descriptions, nav links.
- **JetBrains Mono** (mono): kept on a tight leash — small metadata labels only
  (eyebrows, section labels, tag pills, dates, category labels, numeric indices,
  logo, footer socials/copy) **and** code blocks in posts.

A 2-font alternative (mono→Inter small-caps) was prototyped
(`design-samples/homepage-zine-2font.html`) and rejected: the mono labels do
real "engineer" identity work and code blocks need mono anyway.

### Shared elements

- **Soft-rounded cards** (≈16–24px radius), subtle soft shadows (no hard
  brutalist offsets).
- **Split dark panel** ("featured card"): ink panel + ochre round CTA + a
  line-art illustration half. Used on BOTH home and blog (shared component).
- **Line-art doodles**: ochre/terracotta/ink SVG, used **only where they do a
  job** (e.g. the featured card's illustration half). No free-floating decorative
  doodles — they read as random.
- **Header**: logo (`◆ shariq.dev`, links home) + nav **Blog · Projects · About**.
- **Footer** (shared, every page): quiet — thin top rule on page bg, no colored
  bar. Logo · socials (**X / GitHub / YouTube / LinkedIn / RSS**) · copyright.
  No email link. No "built with" line necessary.
- **Motion**: subtle only — fanned-deck auto-advance, the "Building lognote"
  pulse dot, card hover lifts. Everything gated behind
  `prefers-reduced-motion: reduce`.

### Buckets (unchanged)

`src/lib/buckets.ts` stays the single source of truth mapping tags → 5 display
buckets (Leadership, Engineering, AI, Process, Notes). Buckets drive the blog
filter pills and per-card category color.

---

## 3. Homepage `/` — the personal zine

Terse and visual; big type + whitespace do the work. Sections, top to bottom:

1. **Header** — shared (logo→home, nav).
2. **Hero** (two columns, bottom-aligned):
   - _Left:_ eyebrow `Shariq Hirani` (mono); **`Hi, I'm Shariq.`** (Fraunces,
     "Shariq" italic terracotta — one line, no forced break); tagline (Inter):
     **"I build things, break a few, and write it all down."**; **tag pills**
     pinned to the column bottom — a live **"Building lognote"** pill (ochre,
     pulse dot) + Engineer · Team lead · Sci-fi · Lifting.
   - _Right:_ the **portrait deck** (see §3.1).
   - The image bottom lines up with the tag-pills bottom (pills live in the left
     column so the two columns share a height).
3. **Manifesto** — one big Fraunces line: _"Be a little **reckless** with new
   tools. Disciplined about everything else."_ ("reckless" underlined ochre,
   "Disciplined" italic). Balanced wrapping, no ragged lines.
4. **Right now** — mono label + 3 terse Fraunces lines (Shipping lognote /
   Leading a team through the AI shift / Lifting, sci-fi, over-engineering my
   desk).
5. **Featured essay** — the shared split dark card linking the latest/featured
   post (category, Fraunces title, one-line hook, round ochre "Read it" CTA,
   line-art half).
6. **Lately I've built** — mono label + 3 dashed-divider rows (Fraunces italic
   title + Inter description): lognote · this site · the drafting agent.
7. **Say hello** — Fraunces sign-off + one Inter line ("X is the best way to
   reach me…").
8. **Footer** — shared.

### 3.1 Portrait deck (the fanned card carousel)

A small set of the user's real photos shown as a **splayed deck**:

- **3:4** cards, front card ~300px wide; the deck spans the hero's height and
  bottom-aligns with the tag pills.
- **5 cards visible**: front (crisp, straight) + two fanned each side
  (±9° / ±18°, scaled .9 / .8), receding via **dim + blur** (depth-of-field),
  **opaque** (no transparency bleed), pivoted from center and pushed up so the
  front card's bottom is the clean baseline.
- Auto-advances ~3.8s (cards rotate through the fan), **hover pauses**, **dots**
  jump to a card, **static under reduced-motion** (shows front only).
- Behavior degrades gracefully with fewer than 5 photos.

---

## 4. Blog `/blog` — dedicated listing

The focused, ProAgenda-style expression. (Today the listing lives on the
homepage; this moves it to its own route.)

1. **Header** — shared (Blog active).
2. **Blog header** — eyebrow `Writing` (mono), **`The Blog`** (Fraunces) + one
   intro line.
3. **Filter pills** — `All` + the 5 buckets; active pill = terracotta. v1:
   client-side filtering of the rendered list (All by default), built as a
   client-side JS enhancement; without JS the grid still renders ALL posts
   (content fully accessible), and JS adds instant bucket filtering.
4. **Featured card** — the shared split dark panel for the latest post (ochre
   round CTA, line-art half).
5. **Grid** — calm 3-column image cards: cover image (3:2, rounded) → category
   (terracotta dot) + date (mono) → **title (Inter 600 — kept sans for grid
   scannability)** → optional one-line excerpt. Soft shadow, hover image-zoom.
6. **Footer** — shared.

**Featured vs grid titles:** the featured split card uses Fraunces (shared
component, matches homepage); grid cards use Inter 600 for density. This is
intentional, not an inconsistency.

---

## 5. Post detail `/blog/[...slug]`

Not mocked, but must adopt the kit: shared header/footer, cover image up top
(`PostHeader`), `Prose` styling consistent with the palette/type, bucket accent.
Detailed layout is a build-time concern; no new structural decisions here. The
canonical/cross-post behavior already shipped stays untouched.

---

## 6. Cover-image & portrait contract (scoping the "image flow")

The redesign is image-forward, so it needs images. We define the **contract**
here; the richer AI generation flow is a follow-on (see below) so this spec
stays focused.

- **Post covers:** reuse the existing `hero.image` / `hero.alt` frontmatter
  field (already in the Zod schema) as the card + featured cover. Path
  convention: `/static/images/blog/<slug>/cover.<ext>`.
- **Graceful fallback (the baseline "generated" cover):** when a post has no
  `hero.image`, the card/featured renders a **procedural on-brand placeholder** —
  a bucket-colored panel with a line-art motif — so the grid never breaks and
  stays on-brand without art. This fallback is part of this build.
- **Portrait deck:** 3–5 of the user's **real** photos at
  `/static/images/home/portrait-N.jpg`, referenced from a small config/data list
  (e.g. `data/` or `siteMetadata`). Not generated; user supplies them.
- **Socials config:** X / GitHub / YouTube / LinkedIn / RSS live in site config
  (`data/siteMetadata.js` or `data/headerNavLinks`-style data), consumed by the
  shared footer.

**Follow-on (out of scope for this build):** AI-generated, richer cover
illustrations — best folded into the Plan B drafting agent's draft step so new
posts get an on-brand cover automatically. The contract above (frontmatter field

- path convention + procedural fallback) makes that pluggable later without
  touching the components.

---

## 7. Out of scope / deferred (tune on the real build, not the mockups)

- **Dark mode** must remain functional (tokens already invert via `.dark`); the
  new lighter page bg needs its dark counterpart wired, but pixel-tuning the new
  components in dark happens during the build — the mockups are light-only.
- **Real photos and real cover images** (content, supplied later).
- **Pixel polish & responsive fine-tuning** — done once, on the real Astro
  render, not duplicated in the static mock.
- **AI cover generation** — follow-on per §6.

---

## 8. Implementation surface (indicative — the plan will detail this)

- `src/styles/global.css` — page-bg token (+ dark counterpart), any new tokens.
- `src/components/` — `Header` (nav rename, logo→home), `Footer` (quiet +
  socials), `Hero` (→ zine hero), **new** `PortraitDeck`, **new** `FeaturedCard`
  (shared split panel), `PostCard` (→ image-forward calm card), **new**
  `FilterPills`, procedural cover-placeholder component.
- `src/pages/index.astro` — rebuilt as the zine homepage.
- `src/pages/blog/index.astro` — **new** dedicated listing (moved off the
  homepage).
- `src/pages/blog/[...slug].astro` — adopt the kit.
- `data/` — socials, portrait list, nav labels.

---

## 9. Locked decisions

- Hybrid direction (ProAgenda structure, my palette/identity). ✅
- Two routes: zine `/` + dedicated `/blog`. ✅
- Homepage = personal **zine** (read/explore in place, terse + visual). ✅
- Portrait **fanned 5-card deck**, 3:4, depth via dim+blur, subtle motion. ✅
- **3 fonts** (Fraunces / Inter / JetBrains Mono), disciplined roles. ✅
- Lighter page background `#faf8f3`. ✅
- Nav **Blog · Projects · About**; logo → home. ✅
- Quiet shared **footer** with socials (X/GitHub/YouTube/LinkedIn/RSS, no email). ✅
- Tagline: **"I build things, break a few, and write it all down."** ✅
- Doodles only when purposeful. ✅
