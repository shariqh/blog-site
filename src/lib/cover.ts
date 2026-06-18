import { resolveBucket, type BucketKey } from './buckets'

type Cover =
  | { kind: 'image'; src: string; alt: string }
  | { kind: 'placeholder'; bucket: BucketKey }

// Only same-origin, root-relative paths are trusted as cover images. The drafting
// agent ingests untrusted external content, so reject absolute/scheme URLs
// (https:, data:, javascript:) and protocol-relative ('//host') to avoid emitting
// attacker-controlled <img src> that leaks reader metadata or loads hostile content.
function isLocalImagePath(src: string): boolean {
  // Frontmatter (incl. agent-drafted) is untrusted. Confine cover images to the
  // site's static image dir. Reject scheme/protocol-relative URLs and query/hash,
  // then check the BROWSER-NORMALIZED pathname (so '/static/../admin' can't slip
  // through) against a strict prefix plus a raster image extension.
  if (!src.startsWith('/') || src.startsWith('//')) return false
  if (src.includes('?') || src.includes('#') || src.includes('\\')) return false
  let pathname: string
  try {
    pathname = new URL(src, 'https://shariq.dev').pathname
  } catch {
    return false
  }
  return pathname.startsWith('/static/images/') && /\.(png|jpe?g|webp|avif|gif)$/i.test(pathname)
}

export function resolveCover(data: {
  hero?: { image?: string; alt?: string }
  tags?: string[]
}): Cover {
  const image = data.hero?.image
  if (image && isLocalImagePath(image)) {
    return { kind: 'image', src: image, alt: data.hero?.alt ?? '' }
  }
  return { kind: 'placeholder', bucket: resolveBucket(data.tags ?? []).key }
}
