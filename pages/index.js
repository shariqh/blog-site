import Link from '@/components/Link'
import { PageSEO } from '@/components/SEO'
import Tag from '@/components/Tag'
import siteMetadata from '@/data/siteMetadata'
import { getAllFilesFrontMatter } from '@/lib/mdx'
import formatDate from '@/lib/utils/formatDate'
import Image from '@/components/Image'
import MediaCard from '@/components/MediaCard'
import TopTracks from '@/components/TopTracks'

const MAX_DISPLAY = 3

export async function getStaticProps() {
  const posts = await getAllFilesFrontMatter('blog')

  return { props: { posts } }
}

export default function Home({ posts }) {
  return (
    <>
      <PageSEO title={siteMetadata.title} description={siteMetadata.description} />
      <div className="divide-y divide-gray-200 dark:divide-gray-700 space-y-8">
        <section>
          <header className="text-center">
            <div className="relative mx-auto h-60 w-60 ring-4 ring-primary-500 rounded-full">
              <Image
                className="rounded-full object-contain"
                placeholder="blur"
                blurDataURL={siteMetadata.image}
                src={siteMetadata.image}
                alt=""
                layout="fill"
              />
            </div>
            <h1 className="pt-6 text-4xl font-bold">{siteMetadata.author}</h1>
            <p className="text-primary-500">he/him</p>
          </header>
        </section>
        <section>
          <div className="pt-6 pb-8">
            <h1 className="text-2xl font-extrabold leading-9 tracking-tight text-gray-900 dark:text-gray-100 sm:leading-10 md:leading-14">
              Recent Blog Posts
            </h1>
            <p className="text-lg leading-7 text-gray-500 dark:text-gray-400">
              <span role="img" aria-label="blogPosts">
                ✍️
              </span>{' '}
              Check out what I've been working on with these posts
            </p>
          </div>
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {!posts.length && 'No posts found.'}
            {posts.slice(0, MAX_DISPLAY).map((frontMatter) => {
              const { slug, date, title, summary, tags } = frontMatter
              return (
                <li key={slug} className="py-4">
                  <article>
                    <div className="space-y-2 xl:grid xl:grid-cols-4 xl:space-y-0 xl:items-baseline">
                      <dl>
                        <dt className="sr-only">Published on</dt>
                        <dd className="text-base font-medium leading-6 text-gray-500 dark:text-gray-400">
                          <time dateTime={date}>{formatDate(date)}</time>
                        </dd>
                      </dl>
                      <div className="space-y-5 xl:col-span-3">
                        <div className="space-y-6">
                          <div>
                            <h2 className="text-xl font-bold leading-8 tracking-tight">
                              <Link
                                href={`/blog/${slug}`}
                                className="text-gray-900 dark:text-gray-100"
                              >
                                {title}
                              </Link>
                            </h2>
                            <div className="flex flex-wrap space-x-3">
                              {tags.map((tag) => (
                                <Tag key={tag} text={tag} />
                              ))}
                            </div>
                          </div>
                          <div className="prose text-gray-500 max-w-none dark:text-gray-400">
                            {summary}
                          </div>
                        </div>
                        <div className="text-base font-medium leading-6">
                          <Link
                            href={`/blog/${slug}`}
                            className="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400"
                            aria-label={`Read "${title}"`}
                          >
                            Read more &rarr;
                          </Link>
                        </div>
                      </div>
                    </div>
                  </article>
                </li>
              )
            })}
          </ul>
          {posts.length > MAX_DISPLAY && (
            <div className="flex justify-end text-base font-medium leading-6">
              <Link
                href="/blog"
                className="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400"
                aria-label="all posts"
              >
                All Posts &rarr;
              </Link>
            </div>
          )}
        </section>
        <section>
          <div className="pt-6 pb-8">
            <h1 className="text-2xl font-extrabold leading-9 tracking-tight text-gray-900 dark:text-gray-100 sm:leading-10 md:leading-14">
              Tools
            </h1>
            <p className="text-lg leading-7 text-gray-500 dark:text-gray-400">
              <span role="img" aria-label="Tools">
                ⚒️
              </span>{' '}
              The tools of the trade that I use most frequently
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 xl:grid-cols-4">
            <Link href="/coffee">
              <a>
                <MediaCard src="/static/images/coffee.jpg" subtext="Rating ⭐⭐⭐⭐" />
              </a>
            </Link>
            <Link href="https://bear.app">
              <a>
                <MediaCard src="/static/images/bear.png" subtext="Rating ⭐⭐⭐" />
              </a>
            </Link>
            <Link href="https://notion.so">
              <a>
                <MediaCard src="/static/images/notion.png" subtext="Rating ⭐⭐⭐⭐⭐" />
              </a>
            </Link>
            <Link href="https://www.jetbrains.com/idea/">
              <a>
                <MediaCard src="/static/images/intellij.png" subtext="Rating ⭐⭐⭐⭐⭐" />
              </a>
            </Link>
          </div>
        </section>
        <section>
          <div className="pt-6 pb-8">
            <h1 className="text-2xl font-extrabold leading-9 tracking-tight text-gray-900 dark:text-gray-100 sm:leading-10 md:leading-14">
              Timeline
            </h1>
            <p className="text-lg leading-7 text-gray-500 dark:text-gray-400">
              <span role="img" aria-label="Headphones">
                🎧
              </span>{' '}
              What's mostly going on inside my head
            </p>
          </div>
          <TopTracks />
        </section>
      </div>
    </>
  )
}
