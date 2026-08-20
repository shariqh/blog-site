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
export const READ_COUNT_INTERNAL_BACKOFF_PATH =
  '/.internal/read-count-backoff/v1'
export const READ_COUNT_FAILURE_BACKOFF_SECONDS = 30
export const READ_COUNT_CACHE_FETCHED_AT_HEADER =
  'x-read-count-cache-fetched-at'
export const READ_COUNT_CACHE_STATUS_HEADER = 'x-read-count-cache'
export const READ_COUNT_BACKOFF_UNTIL_HEADER = 'x-read-count-backoff-until'
export const READ_COUNT_BACKOFF_STATUS_HEADER = 'x-read-count-backoff'

const READ_COUNT_CACHE_WRITE_HEADER = 'x-read-count-cache-write'
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
  coordinator?: ReadCountRefreshCoordinator
  now?: () => number
}

interface ValidReadCountCacheEntry {
  state: 'fresh' | 'stale'
  count: string
  fetchedAt: number
  remainingSeconds: number
}

type ReadCountCacheEntry =
  | ValidReadCountCacheEntry
  | { state: 'expired' | 'invalid' }

type ReadCountFailure = Exclude<ReadCountResult, { ok: true }>

type ReadCountCacheLookup =
  | ValidReadCountCacheEntry
  | { state: 'bypass' | 'error' | 'expired' | 'invalid' | 'miss' }

type PublicReadCountCacheStatus =
  | ReadCountCacheLookup['state']
  | 'preserved'
  | 'refreshed'
  | 'stale-rejected'

type BackoffDiagnostic =
  | 'active'
  | 'clear-error'
  | 'read-error'
  | 'stored'
  | 'write-error'

type ReadCountBackoffLookup =
  | { state: 'active'; status: 502 | 504 }
  | { state: 'bypass' | 'error' | 'expired' | 'invalid' | 'miss' }

type ReadCountRefreshOutcome =
  | {
      ok: true
      backoffClearFailed: boolean
      cacheWriteFailed: boolean
      entry: ValidReadCountCacheEntry
      source: 'cache' | 'upstream'
    }
  | {
      ok: false
      backoffActive: true
      status: 502 | 504
    }
  | {
      ok: false
      backoffActive: false
      backoffWriteFailed: boolean
      result: ReadCountFailure
    }

interface InFlightReadCountRefresh {
  consumers: number
  controller: AbortController
  promise: Promise<ReadCountRefreshOutcome>
}

export interface ReadCountRefreshCoordinator {
  readonly consumers: number
  readonly size: number
  reset(): void
  run(
    key: string,
    signal: AbortSignal,
    refresh: (signal: AbortSignal) => Promise<ReadCountRefreshOutcome>,
  ): Promise<ReadCountRefreshOutcome>
}

function coordinatorFor(
  inFlight: Map<string, InFlightReadCountRefresh>,
): ReadCountRefreshCoordinator {
  return {
    get consumers() {
      let consumers = 0
      for (const refresh of inFlight.values()) {
        consumers += refresh.consumers
      }
      return consumers
    },
    get size() {
      return inFlight.size
    },
    reset() {
      for (const refresh of inFlight.values()) {
        refresh.controller.abort()
      }
      inFlight.clear()
    },
    run(key, signal, refresh) {
      let pending = inFlight.get(key)
      if (pending?.controller.signal.aborted) {
        if (inFlight.get(key) === pending) {
          inFlight.delete(key)
        }
        pending = undefined
      }
      if (!pending) {
        const controller = new AbortController()
        let created: InFlightReadCountRefresh
        const tracked = Promise.resolve()
          .then(() => refresh(controller.signal))
          .finally(() => {
            if (inFlight.get(key) === created) {
              inFlight.delete(key)
            }
          })
        created = { consumers: 0, controller, promise: tracked }
        inFlight.set(key, created)
        void tracked.catch(() => undefined)
        pending = created
      }

      pending.consumers += 1
      return new Promise<ReadCountRefreshOutcome>((resolve, reject) => {
        let active = true
        const release = () => {
          if (!active) return
          active = false
          signal.removeEventListener('abort', onAbort)
          pending.consumers -= 1
          if (pending.consumers === 0 && inFlight.get(key) === pending) {
            pending.controller.abort()
          }
        }
        const onAbort = () => {
          release()
          reject(
            signal.reason instanceof Error
              ? signal.reason
              : new DOMException('Aborted', 'AbortError'),
          )
        }

        if (signal.aborted) {
          onAbort()
          return
        }
        signal.addEventListener('abort', onAbort, { once: true })
        pending.promise.then(
          (value) => {
            release()
            resolve(value)
          },
          (error: unknown) => {
            release()
            reject(error)
          },
        )
      })
    },
  }
}

export function createReadCountRefreshCoordinator(): ReadCountRefreshCoordinator {
  return coordinatorFor(new Map())
}

const inFlightReadCountRefreshes = new Map<string, InFlightReadCountRefresh>()
const defaultReadCountRefreshCoordinator = coordinatorFor(
  inFlightReadCountRefreshes,
)
const coordinationDependencyIds = new WeakMap<object, number>()
let nextCoordinationDependencyId = 1

function coordinationDependencyId(dependency: object | undefined): string {
  if (!dependency) return 'none'

  let id = coordinationDependencyIds.get(dependency)
  if (id === undefined) {
    id = nextCoordinationDependencyId
    nextCoordinationDependencyId += 1
    coordinationDependencyIds.set(dependency, id)
  }
  return String(id)
}

function refreshCoordinationKey(
  cacheKey: Request,
  options: ReadCountProxyOptions,
): string {
  return [
    cacheKey.url,
    coordinationDependencyId(options.cache),
    coordinationDependencyId(options.fetch ?? globalThis.fetch),
    coordinationDependencyId(options.now ?? Date.now),
    String(options.timeoutMs ?? DEFAULT_READ_COUNT_TIMEOUT_MS),
  ].join('|')
}

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
  {
    backoff,
    writeFailed = false,
  }: {
    backoff?: BackoffDiagnostic
    writeFailed?: boolean
  } = {},
): Record<string, string> {
  return {
    [READ_COUNT_CACHE_STATUS_HEADER]: status,
    ...(backoff ? { [READ_COUNT_BACKOFF_STATUS_HEADER]: backoff } : {}),
    ...(writeFailed ? { [READ_COUNT_CACHE_WRITE_HEADER]: 'error' } : {}),
  }
}

function countResponse(
  count: string,
  status: PublicReadCountCacheStatus,
  {
    backoff,
    remainingSeconds,
    stale = false,
    writeFailed = false,
  }: {
    backoff?: BackoffDiagnostic
    remainingSeconds?: number
    stale?: boolean
    writeFailed?: boolean
  } = {},
): Response {
  return jsonResponse(
    { count },
    200,
    cacheControl(stale, remainingSeconds),
    publicCacheHeaders(status, { backoff, writeFailed }),
  )
}

function buildInternalReadCountCacheKey(
  requestUrl: string,
  articlePath: string,
  internalPath: string,
): Request {
  if (!isCanonicalArticlePath(articlePath)) {
    throw new TypeError(
      'Read count cache keys require a canonical article path',
    )
  }

  const url = new URL(internalPath, requestUrl)
  url.search = new URLSearchParams({ path: articlePath }).toString()
  return new Request(url, { method: 'GET' })
}

export function buildReadCountCacheKey(
  requestUrl: string,
  articlePath: string,
): Request {
  return buildInternalReadCountCacheKey(
    requestUrl,
    articlePath,
    READ_COUNT_INTERNAL_CACHE_PATH,
  )
}

export function buildReadCountBackoffKey(
  requestUrl: string,
  articlePath: string,
): Request {
  return buildInternalReadCountCacheKey(
    requestUrl,
    articlePath,
    READ_COUNT_INTERNAL_BACKOFF_PATH,
  )
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
      fetchedAt,
      remainingSeconds: Math.floor(
        (READ_COUNT_CACHE_FRESH_SECONDS * 1_000 - age) / 1_000,
      ),
    }
  }
  if (age <= READ_COUNT_CACHE_RETENTION_SECONDS * 1_000) {
    return {
      state: 'stale',
      count: String(count),
      fetchedAt,
      remainingSeconds: Math.floor(
        (READ_COUNT_CACHE_RETENTION_SECONDS * 1_000 - age) / 1_000,
      ),
    }
  }
  return { state: 'expired' }
}

async function readCacheEntry(
  response: Response,
  now: () => number,
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
    now(),
  )
}

async function readBackoffEntry(
  response: Response,
  now: () => number,
): Promise<ReadCountBackoffLookup> {
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

  const untilHeader = response.headers.get(READ_COUNT_BACKOFF_UNTIL_HEADER)
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('status' in payload) ||
    (payload.status !== 502 && payload.status !== 504) ||
    untilHeader === null ||
    !/^(?:0|[1-9]\d*)$/.test(untilHeader)
  ) {
    return { state: 'invalid' }
  }

  const until = Number(untilHeader)
  const readAt = now()
  const remaining = until - readAt
  if (
    !Number.isSafeInteger(until) ||
    !Number.isSafeInteger(readAt) ||
    remaining > READ_COUNT_FAILURE_BACKOFF_SECONDS * 1_000
  ) {
    return { state: 'invalid' }
  }
  if (remaining <= 0) {
    return { state: 'expired' }
  }
  return { state: 'active', status: payload.status }
}

async function lookupReadCountCache(
  cache: ReadCountCache | undefined,
  key: Request,
  now: () => number,
): Promise<ReadCountCacheLookup> {
  if (!cache) {
    return { state: 'bypass' }
  }

  let response: Response | undefined
  try {
    response = await cache.match(key)
  } catch {
    return { state: 'error' }
  }
  if (!response) {
    return { state: 'miss' }
  }

  return readCacheEntry(response, now)
}

async function lookupReadCountBackoff(
  cache: ReadCountCache | undefined,
  key: Request,
  now: () => number,
): Promise<ReadCountBackoffLookup> {
  if (!cache) {
    return { state: 'bypass' }
  }

  let response: Response | undefined
  try {
    response = await cache.match(key)
  } catch {
    return { state: 'error' }
  }
  if (!response) {
    return { state: 'miss' }
  }
  return readBackoffEntry(response, now)
}

function revalidateReadCountCache(
  lookup: ReadCountCacheLookup,
  now: number,
): ReadCountCacheLookup {
  if (lookup.state !== 'fresh' && lookup.state !== 'stale') {
    return lookup
  }

  return classifyReadCountCacheEntry(
    { count: lookup.count },
    String(lookup.fetchedAt),
    now,
  )
}

function preferLatestValidReadCount(
  latest: ReadCountCacheLookup,
  original: ReadCountCacheLookup,
  now: number,
): ReadCountCacheLookup {
  const revalidatedLatest = revalidateReadCountCache(latest, now)
  if (
    revalidatedLatest.state === 'fresh' ||
    revalidatedLatest.state === 'stale'
  ) {
    return revalidatedLatest
  }

  const revalidatedOriginal = revalidateReadCountCache(original, now)
  return revalidatedOriginal.state === 'fresh' ||
    revalidatedOriginal.state === 'stale'
    ? revalidatedOriginal
    : revalidatedLatest
}

function validReadCountEntry(
  count: number,
  fetchedAt: number,
  now: number,
): ValidReadCountCacheEntry {
  const entry = classifyReadCountCacheEntry(
    { count: String(count) },
    String(fetchedAt),
    now,
  )
  if (entry.state !== 'fresh' && entry.state !== 'stale') {
    throw new RangeError('Read count refresh time must not be in the future')
  }
  return entry
}

function cachedResponse(
  count: number,
  fetchedAt: number,
  storedAt: number,
): Response {
  const remainingRetentionSeconds = Math.max(
    0,
    Math.floor(
      (fetchedAt + READ_COUNT_CACHE_RETENTION_SECONDS * 1_000 - storedAt) /
        1_000,
    ),
  )
  return jsonResponse(
    { count: String(count) },
    200,
    `public, max-age=${remainingRetentionSeconds}`,
    { [READ_COUNT_CACHE_FETCHED_AT_HEADER]: String(fetchedAt) },
  )
}

async function guardedWriteReadCountCache(
  cache: ReadCountCache | undefined,
  key: Request,
  count: number,
  refreshStartedAt: number,
  now: () => number,
): Promise<{
  cacheWriteFailed: boolean
  entry: ValidReadCountCacheEntry
  source: 'cache' | 'upstream'
}> {
  if (!cache) {
    const candidate = validReadCountEntry(count, refreshStartedAt, now())
    return {
      cacheWriteFailed: false,
      entry: candidate,
      source: 'upstream',
    }
  }

  const current = await lookupReadCountCache(cache, key, now)
  const comparedAt = now()
  const candidate = validReadCountEntry(count, refreshStartedAt, comparedAt)
  if (current.state === 'error') {
    return {
      cacheWriteFailed: true,
      entry: candidate,
      source: 'upstream',
    }
  }
  const revalidatedCurrent = revalidateReadCountCache(current, comparedAt)
  if (
    revalidatedCurrent.state === 'fresh' ||
    revalidatedCurrent.state === 'stale'
  ) {
    const currentCount = Number(revalidatedCurrent.count)
    // GoatCounter pageview totals are cumulative; time never authorizes regression.
    if (
      currentCount > count ||
      (currentCount === count &&
        revalidatedCurrent.fetchedAt >= refreshStartedAt)
    ) {
      return {
        cacheWriteFailed: false,
        entry: revalidatedCurrent,
        source: 'cache',
      }
    }
  }

  try {
    await cache.put(key, cachedResponse(count, refreshStartedAt, comparedAt))
    return {
      cacheWriteFailed: false,
      entry: candidate,
      source: 'upstream',
    }
  } catch {
    return {
      cacheWriteFailed: true,
      entry: candidate,
      source: 'upstream',
    }
  }
}

function failureStatus(result: ReadCountFailure): 502 | 504 {
  return result.reason === 'timeout' ? 504 : 502
}

function backoffResponse(result: ReadCountFailure, failedAt: number): Response {
  const until = failedAt + READ_COUNT_FAILURE_BACKOFF_SECONDS * 1_000
  return jsonResponse(
    { status: failureStatus(result) },
    200,
    `public, max-age=${READ_COUNT_FAILURE_BACKOFF_SECONDS}`,
    { [READ_COUNT_BACKOFF_UNTIL_HEADER]: String(until) },
  )
}

async function writeReadCountBackoff(
  cache: ReadCountCache | undefined,
  key: Request,
  result: ReadCountFailure,
  failedAt: number,
): Promise<boolean> {
  if (!cache) return false

  try {
    await cache.put(key, backoffResponse(result, failedAt))
    return false
  } catch {
    return true
  }
}

async function clearReadCountBackoff(
  cache: ReadCountCache | undefined,
  key: Request,
): Promise<boolean> {
  if (!cache) return false

  try {
    await cache.delete(key)
    return false
  } catch {
    return true
  }
}

async function refreshReadCount(
  articlePath: string,
  countCacheKey: Request,
  backoffCacheKey: Request,
  refreshStartedAt: number,
  options: ReadCountProxyOptions,
  signal: AbortSignal,
): Promise<ReadCountRefreshOutcome> {
  const now = options.now ?? Date.now
  const current = revalidateReadCountCache(
    await lookupReadCountCache(options.cache, countCacheKey, now),
    now(),
  )
  if (current.state === 'fresh') {
    return {
      ok: true,
      backoffClearFailed: false,
      cacheWriteFailed: false,
      entry: current,
      source: 'cache',
    }
  }

  const backoff = await lookupReadCountBackoff(
    options.cache,
    backoffCacheKey,
    now,
  )
  if (backoff.state === 'active') {
    return {
      ok: false,
      backoffActive: true,
      status: backoff.status,
    }
  }

  const result = await fetchGoatCounterReadCount(articlePath, {
    fetch: options.fetch,
    signal,
    timeoutMs: options.timeoutMs ?? DEFAULT_READ_COUNT_TIMEOUT_MS,
  })

  if (result.ok) {
    const write = await guardedWriteReadCountCache(
      options.cache,
      countCacheKey,
      result.count,
      refreshStartedAt,
      now,
    )
    const backoffClearFailed = await clearReadCountBackoff(
      options.cache,
      backoffCacheKey,
    )
    return {
      ok: true,
      backoffClearFailed,
      ...write,
    }
  }

  const backoffWriteFailed = canServeStaleReadCount(result)
    ? await writeReadCountBackoff(options.cache, backoffCacheKey, result, now())
    : false
  return {
    ok: false,
    backoffActive: false,
    backoffWriteFailed,
    result,
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

  const articlePath = paths[0]
  const now = options.now ?? Date.now
  const requestStartedAt = now()
  const cacheKey = buildReadCountCacheKey(request.url, articlePath)
  const backoffKey = buildReadCountBackoffKey(request.url, articlePath)
  let lookup = await lookupReadCountCache(options.cache, cacheKey, now)
  lookup = revalidateReadCountCache(lookup, now())
  if (lookup.state === 'fresh') {
    return countResponse(lookup.count, 'fresh', {
      remainingSeconds: lookup.remainingSeconds,
    })
  }

  const backoff = await lookupReadCountBackoff(options.cache, backoffKey, now)
  if (backoff.state === 'active') {
    const latest = await lookupReadCountCache(options.cache, cacheKey, now)
    lookup = preferLatestValidReadCount(latest, lookup, now())
    if (lookup.state === 'fresh') {
      return countResponse(lookup.count, 'fresh', {
        backoff: 'active',
        remainingSeconds: lookup.remainingSeconds,
      })
    }
    if (lookup.state === 'stale') {
      return countResponse(lookup.count, 'stale', {
        backoff: 'active',
        remainingSeconds: lookup.remainingSeconds,
        stale: true,
      })
    }
    return errorResponse(
      backoff.status,
      'unavailable',
      publicCacheHeaders(lookup.state, { backoff: 'active' }),
    )
  }

  let outcome: ReadCountRefreshOutcome
  try {
    outcome = await (
      options.coordinator ?? defaultReadCountRefreshCoordinator
    ).run(refreshCoordinationKey(cacheKey, options), request.signal, (signal) =>
      refreshReadCount(
        articlePath,
        cacheKey,
        backoffKey,
        requestStartedAt,
        options,
        signal,
      ),
    )
  } catch {
    return errorResponse(
      502,
      'unavailable',
      publicCacheHeaders(
        lookup.state === 'stale' ? 'stale-rejected' : lookup.state,
        { backoff: backoff.state === 'error' ? 'read-error' : undefined },
      ),
    )
  }

  if (outcome.ok) {
    const entry = revalidateReadCountCache(outcome.entry, now())
    const backoffDiagnostic = outcome.backoffClearFailed
      ? 'clear-error'
      : backoff.state === 'error'
        ? 'read-error'
        : undefined
    if (entry.state !== 'fresh' && entry.state !== 'stale') {
      return errorResponse(
        502,
        'unavailable',
        publicCacheHeaders(entry.state, { backoff: backoffDiagnostic }),
      )
    }
    return countResponse(
      entry.count,
      outcome.source === 'cache'
        ? 'preserved'
        : lookup.state === 'stale'
          ? 'refreshed'
          : lookup.state,
      {
        backoff: backoffDiagnostic,
        remainingSeconds: entry.remainingSeconds,
        stale: entry.state === 'stale',
        writeFailed: outcome.cacheWriteFailed,
      },
    )
  }

  if (outcome.backoffActive) {
    const latest = await lookupReadCountCache(options.cache, cacheKey, now)
    lookup = preferLatestValidReadCount(latest, lookup, now())
    if (lookup.state === 'fresh') {
      return countResponse(lookup.count, 'fresh', {
        backoff: 'active',
        remainingSeconds: lookup.remainingSeconds,
      })
    }
    if (lookup.state === 'stale') {
      return countResponse(lookup.count, 'stale', {
        backoff: 'active',
        remainingSeconds: lookup.remainingSeconds,
        stale: true,
      })
    }
    return errorResponse(
      outcome.status,
      'unavailable',
      publicCacheHeaders(lookup.state, { backoff: 'active' }),
    )
  }

  const result = outcome.result
  const availabilityFailure = canServeStaleReadCount(result)
  const backoffDiagnostic: BackoffDiagnostic | undefined = availabilityFailure
    ? outcome.backoffWriteFailed
      ? 'write-error'
      : options.cache
        ? 'stored'
        : undefined
    : backoff.state === 'error'
      ? 'read-error'
      : undefined

  if (availabilityFailure) {
    const latest = await lookupReadCountCache(options.cache, cacheKey, now)
    lookup = preferLatestValidReadCount(latest, lookup, now())
    if (lookup.state === 'fresh') {
      return countResponse(lookup.count, 'fresh', {
        backoff: backoffDiagnostic,
        remainingSeconds: lookup.remainingSeconds,
      })
    }
    if (lookup.state === 'stale') {
      return countResponse(lookup.count, 'stale', {
        backoff: backoffDiagnostic,
        remainingSeconds: lookup.remainingSeconds,
        stale: true,
      })
    }
  }

  const headers = publicCacheHeaders(
    lookup.state === 'stale' ? 'stale-rejected' : lookup.state,
    { backoff: backoffDiagnostic },
  )
  if (result.reason === 'http' && result.status === 404) {
    return errorResponse(404, 'not_found', headers)
  }
  if (result.reason === 'timeout') {
    return errorResponse(504, 'unavailable', headers)
  }
  return errorResponse(502, 'unavailable', headers)
}
