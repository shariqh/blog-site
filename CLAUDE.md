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

Static Astro 6 + TypeScript + Tailwind 4 site. Content lives as MDX in
`src/content/writing/`, validated by Astro Content Collections (Zod schema
in `src/content.config.ts`). Hosted on Cloudflare Pages (DNS also on
Cloudflare). No analytics, no comments — engagement routes to email / X
via the footer.

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

## Writing posts

Prose for public-facing pages (blog posts, about, projects) follows
`docs/EDITORIAL.md`. When drafting or editing post content, treat that
file as required reading — it documents voice, AI-tell phrases to
avoid, em-dash cap, length-per-bucket, and the pre-publish checklist.

Vale runs the pattern-based rules in CI (`.github/workflows/vale.yml`

- `vale-styles/shariq/`). Lint locally:

```sh
brew install vale
vale src/content/writing
```

Vale warnings/suggestions don't block CI; only errors do (today, only
broken frontmatter). The drafting agent in Plan B is expected to run
Vale before opening its PR.

## Deploy

Cloudflare Pages via `.github/workflows/deploy.yml`. `master` → production
(`shariq.dev`); every PR gets its own preview URL auto-commented on the PR.
Required GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
First push to a branch auto-creates the Pages project — no dashboard work
needed beyond adding the custom domain. The wrangler CLI (`wrangler pages
deployment tail --project-name=shariq-dev` etc.) is useful for ops; see
README for the full command list. Don't conflate `wrangler login` (your
personal OAuth) with `CLOUDFLARE_API_TOKEN` (the CI secret).
