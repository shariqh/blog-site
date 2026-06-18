import { resolveBucket, type BucketKey } from './buckets'

type Cover =
  | { kind: 'image'; src: string; alt: string }
  | { kind: 'placeholder'; bucket: BucketKey }

// Only same-origin, root-relative paths are trusted as cover images. The drafting
// agent ingests untrusted external content, so reject absolute/scheme URLs
// (https:, data:, javascript:) and protocol-relative ('//host') to avoid emitting
// attacker-controlled <img src> that leaks reader metadata or loads hostile content.
function isLocalImagePath(src: string): boolean {
  // Trust only same-origin asset paths under /static/ (the documented cover dir).
  // Rejects scheme/protocol-relative/data: URLs AND arbitrary same-origin routes.
  return src.startsWith('/static/')
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
