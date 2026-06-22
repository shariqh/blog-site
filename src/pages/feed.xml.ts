import rss from '@astrojs/rss'
import { getCollection } from 'astro:content'
import { SITE } from '../lib/site'

export async function GET(context: { site: URL }) {
  const posts = await getCollection('writing', ({ data }) => !data.draft)
  posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime())

  const items = posts.map((post) => {
    const slug = post.id.replace(/\.mdx$/, '')
    const ogImageUrl = new URL(`/og/${slug}.png`, SITE.url).toString()
    const postUrl = `/blog/${slug}/`

    return {
      title: post.data.title,
      pubDate: post.data.date,
      description: post.data.summary,
      link: postUrl,
      // @astrojs/rss v4 wraps this in <content:encoded><![CDATA[...]]>
      content: post.data.summary,
      customData: `<enclosure url="${ogImageUrl}" type="image/png" length="0" />`,
    }
  })

  return rss({
    title: SITE.title,
    description: SITE.description,
    site: context.site,
    items,
    customData: `<language>en-us</language>`,
    xmlns: {
      content: 'http://purl.org/rss/1.0/modules/content/',
    },
  })
}
