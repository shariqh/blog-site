import type { APIRoute } from 'astro'
import { getCollection } from 'astro:content'
import sharp from 'sharp'
import { resolveCover } from '../../../lib/cover'
import {
  COVER_WIDTHS,
  publicImagePath,
  readPublicImage,
  variantKey,
} from '../../../lib/cover-variants'

// One WebP per (cover, width). See src/lib/cover-variants.ts.
export async function getStaticPaths() {
  const posts = await getCollection('writing', ({ data }) => !data.draft)
  const covers = new Set<string>()
  for (const post of posts) {
    const cover = resolveCover(post.data)
    if (cover.kind === 'image' && publicImagePath(cover.src)) covers.add(cover.src)
  }
  return [...covers].flatMap((src) =>
    COVER_WIDTHS.map((w) => ({
      params: { w: String(w), path: variantKey(src) },
      props: { src, width: w },
    }))
  )
}

export const GET: APIRoute = async ({ props }) => {
  const { src, width } = props as { src: string; width: number }
  const input = readPublicImage(src)
  if (!input) return new Response(null, { status: 404 })
  const webp = await sharp(input)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer()
  return new Response(new Uint8Array(webp), {
    headers: { 'Content-Type': 'image/webp' },
  })
}
