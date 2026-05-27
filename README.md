# shariq.dev

Personal blog at [shariq.dev](https://www.shariq.dev). Astro 6 + Tailwind 4 + MDX.

## Develop

```bash
npm install
npm run dev    # http://localhost:4321
```

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
