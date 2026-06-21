# Vendored OG fonts

Static TTF instances used only by the build-time OG image renderer
(`src/lib/og/`). Satori cannot read the variable WOFF2 files shipped by the
`@fontsource-variable/*` packages, so these static cuts are vendored here.

Fetched from the Fontsource CDN (`cdn.jsdelivr.net/fontsource/fonts/...`):

- `fraunces-400.ttf`, `fraunces-600.ttf` — Fraunces (SIL OFL 1.1)
- `inter-400.ttf`, `inter-500.ttf` — Inter (SIL OFL 1.1)
- `jetbrains-mono-500.ttf` — JetBrains Mono (SIL OFL 1.1)

All three families are licensed under the SIL Open Font License 1.1.
