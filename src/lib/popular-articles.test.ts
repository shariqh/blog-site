import { describe, expect, it, vi } from 'vitest'
import { buildReadCountUrl } from './read-count'
import {
  POPULAR_ARTICLE_FETCH_CONCURRENCY,
  buildArticlePath,
  fetchPopularArticleCounts,
  rankPopularArticles,
  type CountedPopularArticle,
  type PopularArticleCandidate,
} from './popular-articles'

function candidate(
  id: string,
  publishedAt = Date.parse('2026-01-01T00:00:00Z'),
): PopularArticleCandidate {
  return {
    id,
    path: buildArticlePath(id),
    title: `Article ${id}`,
    bucket: 'Engineering',
    publishedAt,
  }
}

function counted(
  id: string,
  count: number,
  publishedAt?: number,
): CountedPopularArticle {
  return {
    ...candidate(id, publishedAt),
    readCount: { ok: true, count },
  }
}

describe('buildArticlePath', () => {
  it.each([
    ['nested/article.mdx', '/blog/nested/article/'],
    ['an article.mdx', '/blog/an%20article/'],
    ['what?.mdx', '/blog/what%3F/'],
    ['hash#.mdx', '/blog/hash%23/'],
    ['percent%.mdx', '/blog/percent%25/'],
    ['café/日本語.mdx', '/blog/caf%C3%A9/%E6%97%A5%E6%9C%AC%E8%AA%9E/'],
  ])('builds a canonical path for %s', (id, expected) => {
    expect(buildArticlePath(id)).toBe(expected)
  })

  it('preserves encoded pathnames through GoatCounter route encoding', () => {
    const articlePath = buildArticlePath('nested/an article?#%.mdx')

    expect(buildReadCountUrl(articlePath)).toBe(
      'https://shariq-blog.goatcounter.com/counter/%2Fblog%2Fnested%2Fan%2520article%253F%2523%2525%2F.json',
    )
  })
})

describe('rankPopularArticles', () => {
  it('ranks valid counts from highest to lowest', () => {
    const ranked = rankPopularArticles([
      counted('low', 2),
      counted('high', 900),
      counted('middle', 40),
    ])

    expect(ranked.map(({ id, count }) => ({ id, count }))).toEqual([
      { id: 'high', count: 900 },
      { id: 'middle', count: 40 },
      { id: 'low', count: 2 },
    ])
  })

  it('excludes the featured article even when it has the highest count', () => {
    const ranked = rankPopularArticles(
      [counted('featured', 10_000), counted('other', 50)],
      'featured',
    )

    expect(ranked.map((article) => article.id)).toEqual(['other'])
  })

  it('returns at most three articles', () => {
    const ranked = rankPopularArticles([
      counted('one', 4),
      counted('two', 3),
      counted('three', 2),
      counted('four', 1),
    ])

    expect(ranked.map((article) => article.id)).toEqual(['one', 'two', 'three'])
  })

  it('breaks count ties by newer date and then stable id order', () => {
    const older = Date.parse('2025-01-01T00:00:00Z')
    const newer = Date.parse('2026-01-01T00:00:00Z')
    const ranked = rankPopularArticles([
      counted('zeta', 10, newer),
      counted('alpha', 10, newer),
      counted('older', 10, older),
    ])

    expect(ranked.map((article) => article.id)).toEqual([
      'alpha',
      'zeta',
      'older',
    ])
  })

  it('keeps valid partial results and rejects invalid numeric successes', () => {
    const ranked = rankPopularArticles([
      counted('valid', 1),
      {
        ...candidate('failed'),
        readCount: { ok: false, reason: 'http', status: 403 },
      },
      counted('negative', -1),
      counted('unsafe', Number.MAX_SAFE_INTEGER + 1),
    ])

    expect(ranked.map((article) => article.id)).toEqual(['valid'])
  })

  it('returns no articles when every count fails', () => {
    const ranked = rankPopularArticles([
      {
        ...candidate('forbidden'),
        readCount: { ok: false, reason: 'http', status: 403 },
      },
      {
        ...candidate('timed-out'),
        readCount: { ok: false, reason: 'timeout' },
      },
    ])

    expect(ranked).toEqual([])
  })
})

describe('fetchPopularArticleCounts', () => {
  it('bounds count requests to four concurrent fetches', async () => {
    let active = 0
    let peak = 0
    const fetchMock = vi.fn<typeof fetch>(async () => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      return new Response(JSON.stringify({ count: '1' }))
    })
    const candidates = Array.from({ length: 10 }, (_, index) =>
      candidate(`article-${index}`),
    )

    const results = await fetchPopularArticleCounts(candidates, {
      fetch: fetchMock,
    })

    expect(results).toHaveLength(candidates.length)
    expect(fetchMock).toHaveBeenCalledTimes(candidates.length)
    expect(peak).toBe(POPULAR_ARTICLE_FETCH_CONCURRENCY)
  })
})
