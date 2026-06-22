import rss from '@astrojs/rss'
import { getCollection } from 'astro:content'
import { SITE } from '../lib/site'

export async function GET(context: { site: URL }) {
  const posts = await getCollection('writing', ({ data }) => !data.draft)
  posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime())

  // @astrojs/rss escapes the fields it owns (title/description/link), but
  // customData is inserted raw, so escape any attribute value we build there.
  const xmlAttr = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  const items = posts.map((post) => {
    const slug = post.id.replace(/\.mdx$/, '')
    const ogImageUrl = new URL(`/og/${slug}.png`, SITE.url).toString()
    const postUrl = `/blog/${slug}/`

    return {
      title: post.data.title,
      pubDate: post.data.date,
      description: post.data.summary,
      link: postUrl,
      // Summary-only by design — @astrojs/rss v4 wraps this in
      // <content:encoded><![CDATA[...]]>. Full HTML bodies would need Astro's
      // experimental container API (tracked as a follow-up).
      content: post.data.summary,
      customData: `<enclosure url="${xmlAttr(ogImageUrl)}" type="image/png" length="0" />`,
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
