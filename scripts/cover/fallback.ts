import { renderOg } from '../../src/lib/og/render'
import { resolveBucket } from '../../src/lib/buckets'

// The deterministic fallback when gpt-image-1 keeps leaking text: reuse the OG
// branded template (cover: null forces it). 1200×630 is a fine cover — it
// cover-crops on the 3:2 card and 16:9 header.
export async function renderFallbackCover(args: { title: string; tags: string[] }): Promise<Buffer> {
  const bucket = resolveBucket(args.tags)
  return renderOg({
    title: args.title,
    eyebrow: `${bucket.label} · shariq.dev`,
    dateLabel: '',
    readingLabel: '',
    cover: null,
  })
}
