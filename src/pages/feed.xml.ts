import rss from '@astrojs/rss'
import { getCollection } from 'astro:content'
import { SITE } from '../lib/site'

export async function GET(context: { site: URL }) {
  const posts = await getCollection('writing', ({ data }) => !data.draft)
  posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime())

  return rss({
    title: SITE.title,
    description: SITE.description,
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      description: post.data.summary,
      link: `/blog/${post.id.replace(/\.mdx$/, '')}/`,
    })),
  })
}
