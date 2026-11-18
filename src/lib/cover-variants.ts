import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { safeLocalImage } from './cover'

/**
 * Resized WebP copies of post covers, generated at build by
 * src/pages/covers/[w]/[...path].webp.ts. The generated covers in
 * public/static/images/blog/<slug>/cover.png are 1536×1024 PNGs of 2–3 MB, far
 * more than a 340px card needs. The originals stay untouched (the cover
 * pipeline and the OG renderer read them); pages serve these variants instead.
 */
export const COVER_WIDTHS = [640, 1280] as const
export type CoverWidth = (typeof COVER_WIDTHS)[number]

// Formats sharp can decode and that we'd ever ship as a cover.
const CONVERTIBLE = /\.(png|jpe?g|webp)$/i

/** Absolute path of a validated /static/images path, or null if it escapes or is missing. */
export function publicImagePath(src: string): string | null {
  const safe = safeLocalImage(src)
  if (!safe || !CONVERTIBLE.test(safe)) return null
  try {
    const base = realpathSync(`${process.cwd()}/public/static/images`)
    const abs = `${process.cwd()}/public${safe}`
    if (!existsSync(abs)) return null
    const real = realpathSync(abs)
    if (!real.startsWith(base + '/')) return null
    return real
  } catch {
    return null
  }
}

/** "/static/images/blog/x/cover.png" → "static/images/blog/x/cover" (the endpoint's rest param). */
export function variantKey(safeSrc: string): string {
  return safeSrc.replace(/^\//, '').replace(CONVERTIBLE, '')
}

export function variantUrl(safeSrc: string, width: CoverWidth): string {
  return `/covers/${width}/${variantKey(safeSrc)}.webp`
}

/**
 * src/srcset for a cover. Falls back to the original file (no srcset) when it
 * can't be converted, so a bad or missing cover never 404s.
 */
export function coverSources(safeSrc: string): { src: string; srcset?: string } {
  if (!publicImagePath(safeSrc)) return { src: safeSrc }
  return {
    src: variantUrl(safeSrc, 1280),
    srcset: COVER_WIDTHS.map((w) => `${variantUrl(safeSrc, w)} ${w}w`).join(', '),
  }
}

export function readPublicImage(src: string): Buffer | null {
  const abs = publicImagePath(src)
  return abs ? readFileSync(abs) : null
}
