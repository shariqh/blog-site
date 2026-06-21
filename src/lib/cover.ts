import { resolveBucket, type BucketKey } from './buckets'

type Cover =
  | { kind: 'image'; src: string; alt: string }
  | { kind: 'placeholder'; bucket: BucketKey }

// Frontmatter (incl. agent-drafted) is untrusted. Confine cover images to the
// site's static image dir. Reject scheme/protocol-relative URLs, query/hash,
// backslashes, and percent-encoding (which could smuggle encoded traversal),
// then validate the BROWSER-NORMALIZED pathname against a strict prefix + raster
// extension, and return that normalized path (never the raw input) as the src.
export function safeLocalImage(src: string): string | null {
  if (!src.startsWith('/') || src.startsWith('//')) return null
  if (/[%\\?#]/.test(src)) return null
  let pathname: string
  try {
    pathname = new URL(src, 'https://shariq.dev').pathname
  } catch {
    return null
  }
  if (!pathname.startsWith('/static/images/')) return null
  if (!/\.(png|jpe?g|webp|avif|gif)$/i.test(pathname)) return null
  return pathname
}

export function resolveCover(data: {
  hero?: { image?: string; alt?: string }
  tags?: string[]
}): Cover {
  const image = data.hero?.image
  if (image) {
    const safe = safeLocalImage(image)
    if (safe) return { kind: 'image', src: safe, alt: data.hero?.alt ?? '' }
  }
  return { kind: 'placeholder', bucket: resolveBucket(data.tags ?? []).key }
}
