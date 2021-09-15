import { MDXLayoutRenderer } from '@/components/MDXComponents'
import { getFileBySlug } from '@/lib/mdx'
import Image from '@/components/Image'
import SocialIcon from '@/components/social-icons'
import TopTracks from '@/components/TopTracks'

const DEFAULT_LAYOUT = 'AuthorLayout'

export async function getStaticProps() {
  const authorDetails = await getFileBySlug('authors', ['default'])
  return { props: { authorDetails } }
}

export default function About({ authorDetails }) {
  const { mdxSource, frontMatter } = authorDetails

  return (
    <div>
      <MDXLayoutRenderer
        layout={frontMatter.layout || DEFAULT_LAYOUT}
        mdxSource={mdxSource}
        frontMatter={frontMatter}
      />
      <div className="items-start space-y-2 xl:grid xl:grid-cols-3 xl:gap-x-8 xl:space-y-0">
        <div className="flex flex-col items-center space-x-2">
          <div></div>
          <h3 className="pt-4 pb-2 text-7xl font-bold leading-8">
            <span role="img" aria-label="Headphones">
              🎧
            </span>
          </h3>
          <h3 className="pt-4 pb-2 text-2xl font-bold leading-8 tracking-tight">Media</h3>
          <div className="text-gray-500 dark:text-gray-400">My most listened to tracks</div>
        </div>
        <TopTracks />
      </div>
    </div>
  )
}
