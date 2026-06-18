import { resolveBucket, type BucketKey } from './buckets'

type Cover =
  | { kind: 'image'; src: string; alt: string }
  | { kind: 'placeholder'; bucket: BucketKey }

export function resolveCover(data: {
  hero?: { image?: string; alt?: string }
  tags?: string[]
}): Cover {
  const image = data.hero?.image
  if (image) return { kind: 'image', src: image, alt: data.hero?.alt ?? '' }
  return { kind: 'placeholder', bucket: resolveBucket(data.tags ?? []).key }
}
