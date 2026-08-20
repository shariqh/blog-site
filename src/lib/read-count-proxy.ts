import {
  DEFAULT_READ_COUNT_TIMEOUT_MS,
  fetchGoatCounterReadCount,
  isCanonicalArticlePath,
  parseReadCount,
  readLimitedJson,
  type ReadCountFetchOptions,
  type ReadCountResult,
} from './read-count'

export const READ_COUNT_BROWSER_MAX_AGE_SECONDS = 300
export const READ_COUNT_SHARED_MAX_AGE_SECONDS = 14_400
export const READ_COUNT_CACHE_FRESH_SECONDS = READ_COUNT_SHARED_MAX_AGE_SECONDS
export const READ_COUNT_CACHE_RETENTION_SECONDS = 7 * 24 * 60 * 60
export const READ_COUNT_STALE_BROWSER_MAX_AGE_SECONDS = 60
export const READ_COUNT_STALE_SHARED_MAX_AGE_SECONDS = 300
export const READ_COUNT_INTERNAL_CACHE_PATH = '/.internal/read-count-cache/v1'
export const READ_COUNT_CACHE_FETCHED_AT_HEADER =
  'x-read-count-cache-fetched-at'
export const READ_COUNT_CACHE_STATUS_HEADER = 'x-read-count-cache'

const READ_COUNT_CACHE_WRITE_HEADER = 'x-read-count-cache-write'
const READ_COUNT_CACHE_DELETE_HEADER = 'x-read-count-cache-delete'
const JSON_CONTENT_TYPE = 'application/json'

const JSON_HEADERS = {
  'content-type': `${JSON_CONTENT_TYPE}; charset=utf-8`,
  'x-content-type-options': 'nosniff',
}

export interface ReadCountCache {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
  delete(request: Request): Promise<boolean>
}

export interface ReadCountProxyOptions extends Pick<
  ReadCountFetchOptions,
  'fetch' | 'timeoutMs'
> {
  cache?: ReadCountCache
  now?: () => number
}

type ReadCountCacheEntry =
  | {
      state: 'fresh' | 'stale'
      count: string
      remainingSeconds: number
    }
  | { state: 'expired' | 'invalid' }

type ReadCountFailure = Exclude<ReadCountResult, { ok: true }>

type ReadCountCacheLookup =
  | {
      state: 'fresh' | 'stale'
      count: string
      remainingSeconds: number
      deleteFailed: false
    }
  | {
      state: 'bypass' | 'error' | 'expired' | 'invalid' | 'miss'
      deleteFailed: boolean
    }

type PublicReadCountCacheStatus =
  | ReadCountCacheLookup['state']
  | 'refreshed'
  | 'stale-rejected'

function cacheControl(
  stale: boolean,
  remainingSeconds: number | undefined,
): string {
  const browserMaxAge = Math.min(
    stale
      ? READ_COUNT_STALE_BROWSER_MAX_AGE_SECONDS
      : READ_COUNT_BROWSER_MAX_AGE_SECONDS,
    remainingSeconds ?? Number.POSITIVE_INFINITY,
  )
  const sharedMaxAge = Math.min(
    stale
      ? READ_COUNT_STALE_SHARED_MAX_AGE_SECONDS
      : READ_COUNT_SHARED_MAX_AGE_SECONDS,
    remainingSeconds ?? Number.POSITIVE_INFINITY,
  )
  return `public, max-age=${browserMaxAge}, s-maxage=${sharedMaxAge}`
}

function jsonResponse(
  body: object,
  status: number,
  cacheControl: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...JSON_HEADERS,
      'cache-control': cacheControl,
      ...headers,
    },
  })
}

function errorResponse(
  status: number,
  error: 'invalid_path' | 'method_not_allowed' | 'not_found' | 'unavailable',
  headers: Record<string, string> = {},
): Response {
  return jsonResponse({ error }, status, 'no-store', headers)
}

function publicCacheHeaders(
  status: PublicReadCountCacheStatus,
  lookup: ReadCountCacheLookup,
  writeFailed = false,
): Record<string, string> {
  return {
    [READ_COUNT_CACHE_STATUS_HEADER]: status,
    ...(lookup.deleteFailed
      ? { [READ_COUNT_CACHE_DELETE_HEADER]: 'error' }
      : {}),
    ...(writeFailed ? { [READ_COUNT_CACHE_WRITE_HEADER]: 'error' } : {}),
  }
}

function countResponse(
  count: string,
  status: PublicReadCountCacheStatus,
  lookup: ReadCountCacheLookup,
  {
    remainingSeconds,
    stale = false,
    writeFailed = false,
  }: {
    remainingSeconds?: number
    stale?: boolean
    writeFailed?: boolean
  } = {},
): Response {
  return jsonResponse(
    { count },
    200,
    cacheControl(stale, remainingSeconds),
    publicCacheHeaders(status, lookup, writeFailed),
  )
}

export function buildReadCountCacheKey(
  requestUrl: string,
  articlePath: string,
): Request {
  if (!isCanonicalArticlePath(articlePath)) {
    throw new TypeError(
      'Read count cache keys require a canonical article path',
    )
  }

  const url = new URL(READ_COUNT_INTERNAL_CACHE_PATH, requestUrl)
  url.search = new URLSearchParams({ path: articlePath }).toString()
  return new Request(url, { method: 'GET' })
}

export function classifyReadCountCacheEntry(
  payload: unknown,
  fetchedAtHeader: string | null,
  now: number,
): ReadCountCacheEntry {
  const count = parseReadCount(payload)
  if (
    count === null ||
    fetchedAtHeader === null ||
    !/^(?:0|[1-9]\d*)$/.test(fetchedAtHeader)
  ) {
    return { state: 'invalid' }
  }

  const fetchedAt = Number(fetchedAtHeader)
  const age = now - fetchedAt
  if (
    !Number.isSafeInteger(fetchedAt) ||
    !Number.isSafeInteger(now) ||
    fetchedAt < 0 ||
    age < 0
  ) {
    return { state: 'invalid' }
  }

  if (age < READ_COUNT_CACHE_FRESH_SECONDS * 1_000) {
    return {
      state: 'fresh',
      count: String(count),
      remainingSeconds: Math.floor(
        (READ_COUNT_CACHE_FRESH_SECONDS * 1_000 - age) / 1_000,
      ),
    }
  }
  if (age <= READ_COUNT_CACHE_RETENTION_SECONDS * 1_000) {
    return {
      state: 'stale',
      count: String(count),
      remainingSeconds: Math.floor(
        (READ_COUNT_CACHE_RETENTION_SECONDS * 1_000 - age) / 1_000,
      ),
    }
  }
  return { state: 'expired' }
}

async function readCacheEntry(
  response: Response,
  now: number,
): Promise<ReadCountCacheEntry> {
  if (
    response.status !== 200 ||
    response.headers
      .get('content-type')
      ?.split(';', 1)[0]
      ?.trim()
      .toLowerCase() !== JSON_CONTENT_TYPE
  ) {
    return { state: 'invalid' }
  }

  let payload: unknown
  try {
    payload = await readLimitedJson(response)
  } catch {
    return { state: 'invalid' }
  }

  return classifyReadCountCacheEntry(
    payload,
    response.headers.get(READ_COUNT_CACHE_FETCHED_AT_HEADER),
    now,
  )
}

async function lookupReadCountCache(
  cache: ReadCountCache | undefined,
  key: Request,
  now: number,
): Promise<ReadCountCacheLookup> {
  if (!cache) {
    return { state: 'bypass', deleteFailed: false }
  }

  let response: Response | undefined
  try {
    response = await cache.match(key)
  } catch {
    return { state: 'error', deleteFailed: false }
  }
  if (!response) {
    return { state: 'miss', deleteFailed: false }
  }

  const entry = await readCacheEntry(response, now)
  if (entry.state === 'fresh' || entry.state === 'stale') {
    return { ...entry, deleteFailed: false }
  }

  let deleteFailed = false
  try {
    await cache.delete(key)
  } catch {
    deleteFailed = true
  }
  return { state: entry.state, deleteFailed }
}

function cachedResponse(count: number, fetchedAt: number): Response {
  return jsonResponse(
    { count: String(count) },
    200,
    `public, max-age=${READ_COUNT_CACHE_RETENTION_SECONDS}`,
    { [READ_COUNT_CACHE_FETCHED_AT_HEADER]: String(fetchedAt) },
  )
}

async function writeReadCountCache(
  cache: ReadCountCache | undefined,
  key: Request,
  count: number,
  fetchedAt: number,
): Promise<boolean> {
  if (!cache) return false

  try {
    await cache.put(key, cachedResponse(count, fetchedAt))
    return false
  } catch {
    return true
  }
}

export function canServeStaleReadCount(result: ReadCountFailure): boolean {
  return (
    result.reason === 'network' ||
    result.reason === 'timeout' ||
    (result.reason === 'http' &&
      (result.status === 429 ||
        (result.status !== undefined && result.status >= 500)))
  )
}

export async function handleReadCountRequest(
  request: Request,
  options: ReadCountProxyOptions = {},
): Promise<Response> {
  if (request.method !== 'GET') {
    return errorResponse(405, 'method_not_allowed', { allow: 'GET' })
  }

  const url = new URL(request.url)
  const paths = url.searchParams.getAll('path')
  const hasUnexpectedParameter = [...url.searchParams.keys()].some(
    (key) => key !== 'path',
  )
  if (
    paths.length !== 1 ||
    hasUnexpectedParameter ||
    !isCanonicalArticlePath(paths[0])
  ) {
    return errorResponse(400, 'invalid_path')
  }

  const cacheKey = buildReadCountCacheKey(request.url, paths[0])
  const lookup = await lookupReadCountCache(
    options.cache,
    cacheKey,
    (options.now ?? Date.now)(),
  )
  if (lookup.state === 'fresh') {
    return countResponse(lookup.count, 'fresh', lookup, {
      remainingSeconds: lookup.remainingSeconds,
    })
  }

  let result: ReadCountResult
  try {
    result = await fetchGoatCounterReadCount(paths[0], {
      fetch: options.fetch,
      signal: request.signal,
      timeoutMs: options.timeoutMs ?? DEFAULT_READ_COUNT_TIMEOUT_MS,
    })
  } catch {
    return errorResponse(
      502,
      'unavailable',
      publicCacheHeaders(
        lookup.state === 'stale' ? 'stale-rejected' : lookup.state,
        lookup,
      ),
    )
  }

  if (result.ok) {
    const writeFailed = await writeReadCountCache(
      options.cache,
      cacheKey,
      result.count,
      (options.now ?? Date.now)(),
    )
    return countResponse(
      String(result.count),
      lookup.state === 'stale' ? 'refreshed' : lookup.state,
      lookup,
      { writeFailed },
    )
  }
  if (lookup.state === 'stale' && canServeStaleReadCount(result)) {
    return countResponse(lookup.count, 'stale', lookup, {
      remainingSeconds: lookup.remainingSeconds,
      stale: true,
    })
  }

  const headers = publicCacheHeaders(
    lookup.state === 'stale' ? 'stale-rejected' : lookup.state,
    lookup,
  )
  if (result.reason === 'http' && result.status === 404) {
    return errorResponse(404, 'not_found', headers)
  }
  if (result.reason === 'timeout') {
    return errorResponse(504, 'unavailable', headers)
  }
  return errorResponse(502, 'unavailable', headers)
}
