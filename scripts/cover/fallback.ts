import { renderBrandedCover } from '../../src/lib/og/render'

// The deterministic fallback when gpt-image-1 keeps leaking text: render a
// title-less branded cover (1536×1024, ink background, palette geometric motif,
// no text baked in). The OG hybrid overlays the title later — baking it here
// would produce a double-title.
export async function renderFallbackCover(args: { title: string; tags: string[] }): Promise<Buffer> {
  // title and tags are accepted for API compatibility; the motif is brand-only.
  void args
  return renderBrandedCover()
}
