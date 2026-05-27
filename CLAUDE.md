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
