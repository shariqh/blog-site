import {
  fetchReadCount,
  type ReadCountFetchOptions,
  type ReadCountResult,
} from './read-count'

export const POPULAR_ARTICLE_LIMIT = 3
export const POPULAR_ARTICLE_FETCH_CONCURRENCY = 4

export interface PopularArticleCandidate {
  id: string
  path: string
  title: string
  bucket: string
  publishedAt: number
}

export interface CountedPopularArticle extends PopularArticleCandidate {
  readCount: ReadCountResult
}

export interface PopularArticle extends PopularArticleCandidate {
  count: number
}

type SuccessfulReadCount = Extract<ReadCountResult, { ok: true }>
type AvailablePopularArticle = CountedPopularArticle & {
  readCount: SuccessfulReadCount
}

function compareIds(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

export function buildArticlePath(id: string): string {
  const slug = id.replace(/\.mdx$/, '')
  const segments = slug.split('/')
  if (
    segments.some(
      (segment) => segment.length === 0 || segment === '.' || segment === '..',
    )
  ) {
    throw new TypeError(
      'Article IDs must contain safe, non-empty path segments',
    )
  }
  return `/blog/${segments.map(encodeURIComponent).join('/')}/`
}

export function hasUniquePopularArticleIds(
  candidates: readonly { id: string }[],
): boolean {
  const ids = new Set<string>()
  for (const candidate of candidates) {
    if (ids.has(candidate.id)) return false
    ids.add(candidate.id)
  }
  return true
}

function hasValidReadCount(
  candidate: CountedPopularArticle,
): candidate is AvailablePopularArticle {
  return (
    candidate.readCount.ok &&
    Number.isSafeInteger(candidate.readCount.count) &&
    candidate.readCount.count >= 0
  )
}

export function rankPopularArticles(
  candidates: readonly CountedPopularArticle[],
  excludedId?: string,
): PopularArticle[] {
  return candidates
    .filter((candidate) => candidate.id !== excludedId)
    .filter(hasValidReadCount)
    .map((candidate) => {
      const { readCount, ...article } = candidate
      return { ...article, count: readCount.count }
    })
    .sort(
      (left, right) =>
        right.count - left.count ||
        right.publishedAt - left.publishedAt ||
        compareIds(left.id, right.id),
    )
    .slice(0, POPULAR_ARTICLE_LIMIT)
}

export async function fetchPopularArticleCounts(
  candidates: readonly PopularArticleCandidate[],
  options: Pick<ReadCountFetchOptions, 'fetch' | 'signal'> = {},
): Promise<CountedPopularArticle[]> {
  const counted: CountedPopularArticle[] = []
  let nextIndex = 0

  async function worker() {
    while (nextIndex < candidates.length) {
      const index = nextIndex
      nextIndex += 1
      const candidate = candidates[index]
      counted[index] = {
        ...candidate,
        readCount: await fetchReadCount(candidate.path, options),
      }
    }
  }

  await Promise.all(
    Array.from(
      {
        length: Math.min(POPULAR_ARTICLE_FETCH_CONCURRENCY, candidates.length),
      },
      () => worker(),
    ),
  )

  return counted
}

export async function resolvePopularArticles(
  candidates: readonly PopularArticleCandidate[],
  excludedId?: string,
  options: Pick<ReadCountFetchOptions, 'fetch' | 'signal'> = {},
): Promise<PopularArticle[]> {
  const counted = await fetchPopularArticleCounts(candidates, options)
  return rankPopularArticles(counted, excludedId)
}
