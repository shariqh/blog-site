import type { APIRoute } from 'astro'
import { getCollection, type CollectionEntry } from 'astro:content'
import { buildOgData } from '../../lib/og/data'
import { renderOgSafe } from '../../lib/og/render'

export async function getStaticPaths() {
  const posts = await getCollection('writing', ({ data }) => !data.draft)
  return posts.map((post) => ({
    params: { slug: post.id.replace(/\.mdx$/, '') },
    props: { post },
  }))
}

export const GET: APIRoute = async ({ props }) => {
  const { post } = props as { post: CollectionEntry<'writing'> }
  const png = await renderOgSafe(buildOgData(post))
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600, must-revalidate',
    },
  })
}
