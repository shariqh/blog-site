# Copilot repository instructions

## Runtime and commands

- Use Node.js 24 or newer and npm.
- On a fresh checkout, run `npm ci`, then `npx playwright install chromium` before Playwright or `tests/screenshot.mjs`.
- `npm run dev` starts Astro at `http://localhost:4321`.
- `npm run build` creates the static site in `dist/`; `npm run preview` serves that build.
- `npm run astro check` type-checks Astro and TypeScript. TypeScript is strict.
- `npm test` runs all Vitest unit tests once; `npm run test:watch` runs Vitest in watch mode.
- Run one unit test file with `npm test -- src/lib/buckets.test.ts`.
- Run one named unit test with `npm test -- src/lib/buckets.test.ts -t "<test name substring>"`.
- `npm run build && npm run test:smoke` runs Playwright against the built preview site. The Playwright config starts `npm run preview` automatically.
- Run one smoke test with `npm run build && npm run test:smoke -- tests/smoke.spec.ts -g "RSS feed serves"`.
- Build before smoke tests or screenshotting the production preview. Use `node tests/screenshot.mjs <url> <out.png> [width] [height] [clip-height]` for bounded visual evidence.
- Run `npm run astro check`, `npm test`, `npm run build`, and smoke tests sequentially in one worktree. Do not run Astro check and build concurrently: they share `.astro` temporary state and can collide.
- Preserve local formatting in existing hand-compacted `.astro` pages. Do not routinely run Prettier over an entire existing Astro page because it expands CSS and markup, creating unrelated churn.
- For intentional Astro formatting, run `npx prettier --plugin=prettier-plugin-astro --write <file.astro>`. For intentional SVG formatting, run `npx prettier --parser html --write <file.svg>`.
- Format TypeScript and Markdown selectively according to the local file style. Always inspect `git diff --stat` and `git diff --check` afterward; use `npx prettier --check .` for a repository-wide format check.
- Lint public prose with `vale src/content/writing` or a single MDX path. Vale is an external binary, not an npm script; warnings and suggestions are review feedback, while errors fail CI.
- CI runs `npm run astro check`, `npm test`, `npm run build`, then Playwright smoke tests.

Cover and drafting commands read `.env.local` (see `.env.local.example`):

- `npm run gen:cover <slug> [--style line-art|conceptual] [--concept "..."] [--force]`
- `npm run gen:cover:all [--force]`
- `npm run agent:discover`, `npm run agent:draft`, and `npm run agent:promote`

Cover generation additionally requires `IMAGE_GATEWAY_URL` and `IMAGE_GATEWAY_TOKEN`; normal site builds do not.

## Architecture

This is a mostly static Astro 6 site using MDX, strict TypeScript, and Tailwind 4. Astro builds pages, RSS, the sitemap, and per-post Open Graph PNGs for Cloudflare Pages. The only request-time code is `functions/_middleware.ts`, which redirects `www.shariq.dev` to the apex domain. `main` deploys to production; pull requests receive Cloudflare preview deployments.

### Content and rendering

- Blog posts are MDX entries in the `writing` content collection. `src/content.config.ts` loads them, while the shared Zod contract lives in `src/lib/schemas.ts` so both Astro and Node-based drafting scripts can validate the same frontmatter.
- `src/pages/blog/[...slug].astro` turns each content ID into `/blog/<id>`, including nested paths, and excludes `draft: true` entries at collection-query time.
- That route injects `Callout`, `Youtube`, and `Image` into `<Content>` and renders `Toc` only for longer heading lists. Adding an MDX component requires both a component under `src/components/mdx/` and explicit registration in this route.
- `astro.config.mjs` wires math, heading anchors, syntax highlighting, and `remarkReadingTime`. The remark plugin stores seconds; the blog route converts that value to displayed minutes.
- Frontmatter tags remain free-form. `src/lib/buckets.ts` maps the first matching tag, case-insensitively, into the five display buckets and falls back to Notes. UI components and the drafting agent consume this module; change the taxonomy there rather than duplicating it.
- `src/lib/projects.ts` is the primary project inventory. When current project information changes, audit its derived/current surfaces together: the homepage `Right now` and `Lately built` sections, `/now`, `/projects`, and the factual/current-building blocks on About.
- Verify every public GitHub or product link as an unauthenticated visitor before publishing it. `Project.repo` is only for publicly accessible/open-source repositories; list private projects without a repository link or with a verified public product site.
- Remove retired projects from the public inventory rather than silently leaving them as Side quests.
- Preserve historical product names in old posts. Clarify the current name or domain at a natural first mention instead of globally rewriting history.

### Images

- Open Graph images are generated locally at build time by Satori and Resvg in `src/lib/og/`, then emitted by `src/pages/og/[...slug].png.ts` as `dist/og/<slug>.png`. Posts with a hero image use the hybrid template; others use the branded fallback.
- Satori needs TTF/OTF files, so OG fonts are vendored in `src/assets/og/fonts/`; the WOFF2 webfont packages are not substitutes.
- `BaseLayout.astro` must emit absolute `og:image` and Twitter image URLs.
- AI cover generation is an authoring-time pipeline in `scripts/cover/`, not part of `astro build`. The shared orchestrator calls the external image-gateway, checks generated images for readable text, falls back deterministically after failed attempts, writes `public/static/images/blog/<slug>/cover.png`, and patches frontmatter.
- The CLI, backfill, drafting hook, and `.github/workflows/attach-cover.yml` all use that canonical cover pipeline. External drafting systems should dispatch the workflow rather than reimplementing prompts, style selection, text checks, fallbacks, or paths.
- `public/favicon.svg` is the canonical merged SH mark: separated, staggered S/H paths with no bridge or touching. Its light colors are terracotta S `#b04a3a` and ink H `#15233a`; its dark/app colors are ochre S `#d49a3a` and paper H `#f3e8d2` on an ink background.
- The header and footer consume the canonical SVG. OG templates must duplicate its path geometry for Satori, and tests guard that duplication; keep all three synchronized when the mark changes.
- Isolate future logo or favicon redesigns in a separate draft PR from factual/content changes. Settle the monochrome shape before color, render true 16px and 32px comparisons, require immediate recognition of the intended letters, and do not propagate a provisional mark to other site surfaces before explicit approval.

### Content automation

The scheduled `agent-discover`, `agent-draft`, and `agent-promote` workflows use the Notion CMS as their control plane. Discovery proposes candidates; drafting turns `Stage=Ready` blog rows into MDX pull requests and YouTube rows into Notion script blocks; promotion creates proposed blog derivatives from published videos. Nothing publishes automatically, and a cover-generation failure is non-fatal to drafting.

## Repository-specific conventions

- Tailwind 4 is configured through `@tailwindcss/vite`. Brand tokens and fonts live in the `@theme` block in `src/styles/global.css`; do not introduce a Tailwind 3 `tailwind.config.js`.
- The page UI is intentionally light-only; do not add `.dark` or `prefers-color-scheme` behavior to page styling unless the product direction changes. Browser and platform assets such as `public/favicon.svg` may provide explicit dark-chrome variants.
- OG templates cannot consume CSS custom properties. When changing the brand palette, keep `src/styles/global.css`, the constants in `src/lib/og/templates.ts`, and the browser theme color in `BaseLayout.astro` aligned.
- Treat agent-authored frontmatter as untrusted. Reuse `resolveCover()` / `safeLocalImage()` for local hero paths instead of rendering or reading raw values. Canonical URLs are HTTPS-only and restricted by `CANONICAL_ALLOWED_HOSTS` in `src/lib/schemas.ts`; adding a host is a deliberate security-sensitive change.
- Post frontmatter requires `title`, ISO `date`, `summary` of at most 280 characters, and lowercase free-form `tags`. A `hero`, `canonical`, `updatedAt`, and `draft` are optional; `hero.style` is only `line-art` or `conceptual`.
- Before editing blog posts, summaries, About, or Projects prose, read `docs/EDITORIAL.md`; it is authoritative for voice, lived-experience claims, forbidden AI-tell phrases, punctuation limits, bucket-specific length, and pre-publish review. YouTube scripts instead follow `docs/SHORTS-STYLE.md`.
- Unit tests are `*.test.ts` files collocated with source and scripts. Playwright specs live under `tests/`; `vitest.config.ts` deliberately excludes that directory.
- `scripts/social/post-thread.ts` is dry-run by default. Only the explicit `--post` flag publishes to X.
