import { readFileSync } from 'node:fs'
import readingTime from 'reading-time'
import type { CollectionEntry } from 'astro:content'
import { resolveBucket } from '../buckets'
import { safeLocalImage } from '../cover'

export type OgData = {
  title: string
  eyebrow: string
  dateLabel: string
  readingLabel: string
  cover: string | null
}

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
}

// Validate via the shared guard, then read the file from /public and inline it
// as a data URI (Satori has no filesystem access). Any failure → null → caller
// falls back to the branded template. Never reads an unvalidated path.
export function loadCoverDataUri(image: string | undefined): string | null {
  if (!image) return null
  const safe = safeLocalImage(image)
  if (!safe) return null
  const ext = safe.split('.').pop()!.toLowerCase()
  const mime = MIME[ext]
  if (!mime) return null
  try {
    const bytes = readFileSync(`${process.cwd()}/public${safe}`)
    return `data:${mime};base64,${bytes.toString('base64')}`
  } catch {
    return null
  }
}

export function buildOgData(post: CollectionEntry<'writing'>): OgData {
  const bucket = resolveBucket(post.data.tags)
  // post.body ?? '' — file-based MDX always has a body, but cover generation
  // reuses buildOgData and may pass a synthetic entry; degrade instead of throw.
  const minutes = Math.max(1, Math.ceil(readingTime(post.body ?? '').minutes))
  const dateLabel = post.data.date.toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
  })
  return {
    title: post.data.title,
    eyebrow: `${bucket.label} · shariq.dev`,
    dateLabel,
    readingLabel: `${minutes} min`,
    cover: loadCoverDataUri(post.data.hero?.image),
  }
}
