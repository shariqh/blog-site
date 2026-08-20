import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildReadCountCacheKey,
  handleReadCountRequest,
  READ_COUNT_BROWSER_MAX_AGE_SECONDS,
  READ_COUNT_CACHE_FRESH_SECONDS,
  READ_COUNT_CACHE_FETCHED_AT_HEADER,
  READ_COUNT_CACHE_RETENTION_SECONDS,
  READ_COUNT_CACHE_STATUS_HEADER,
  READ_COUNT_SHARED_MAX_AGE_SECONDS,
  READ_COUNT_STALE_BROWSER_MAX_AGE_SECONDS,
  READ_COUNT_STALE_SHARED_MAX_AGE_SECONDS,
  type ReadCountCache,
} from './read-count-proxy'

const ARTICLE_PATH = '/blog/example/'
const REQUEST_URL = `https://shariq.dev/api/read-count?path=${encodeURIComponent(ARTICLE_PATH)}`
const NOW = Date.parse('2026-08-20T19:00:00.000Z')
const INVALID_CACHE_CASES: {
  cacheProblem: string
  body: object
  headers: Record<string, string>
}[] = [
  {
    cacheProblem: 'a malformed payload',
    body: { count: 'many' },
    headers: {},
  },
  {
    cacheProblem: 'untrusted fetch metadata',
    body: { count: '123' },
    headers: { [READ_COUNT_CACHE_FETCHED_AT_HEADER]: 'not-a-timestamp' },
  },
]

function request(url = REQUEST_URL, method = 'GET'): Request {
  return new Request(url, { method })
}

function upstreamResponse(
  body: object | string,
  init: ResponseInit = {},
): Response {
  return new Response(
    typeof body === 'string' ? body : JSON.stringify(body),
    init,
  )
}

class MemoryReadCountCache implements ReadCountCache {
  readonly entries = new Map<string, Response>()
  readonly matchCalls: string[] = []
  readonly putCalls: string[] = []
  failMatch = false
  failPut = false

  async match(request: Request): Promise<Response | undefined> {
    this.matchCalls.push(request.url)
    if (this.failMatch) throw new Error('cache match failed')
    return this.entries.get(request.url)?.clone()
  }

  async put(request: Request, response: Response): Promise<void> {
    this.putCalls.push(request.url)
    if (this.failPut) throw new Error('cache put failed')
    this.entries.set(request.url, response.clone())
  }
}

function cacheKey(path = ARTICLE_PATH): string {
  return buildReadCountCacheKey(REQUEST_URL, path).url
}

function seedCache(
  cache: MemoryReadCountCache,
  {
    body = { count: '123' },
    fetchedAt = NOW - 60 * 60 * 1_000,
    headers = {},
    status = 200,
  }: {
    body?: object | string
    fetchedAt?: number
    headers?: Record<string, string>
    status?: number
  } = {},
): void {
  cache.entries.set(
    cacheKey(),
    upstreamResponse(body, {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        [READ_COUNT_CACHE_FETCHED_AT_HEADER]: String(fetchedAt),
        ...headers,
      },
    }),
  )
}

describe('handleReadCountRequest', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows only GET', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    const response = await handleReadCountRequest(
      request(REQUEST_URL, 'POST'),
      {
        fetch: fetchMock,
      },
    )

    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ error: 'method_not_allowed' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    'https://shariq.dev/api/read-count',
    `https://shariq.dev/api/read-count?path=${encodeURIComponent(ARTICLE_PATH)}&path=${encodeURIComponent(ARTICLE_PATH)}`,
    `https://shariq.dev/api/read-count?path=${encodeURIComponent(ARTICLE_PATH)}&extra=1`,
    'https://shariq.dev/api/read-count?path=blog%2Fexample%2F',
    'https://shariq.dev/api/read-count?path=%2Fprojects%2F',
    'https://shariq.dev/api/read-count?path=%2Fblog%2Fexample',
    'https://shariq.dev/api/read-count?path=%2Fblog%2F..%2Fsecret%2F',
    'https://shariq.dev/api/read-count?path=%2Fblog%2F%252e%252e%2Fsecret%2F',
    'https://shariq.dev/api/read-count?path=%2Fblog%2F%252Fsecret%2F',
    'https://shariq.dev/api/read-count?path=%2Fblog%2Fbad%25path%2F',
  ])('rejects invalid request URL %s', async (url) => {
    const fetchMock = vi.fn<typeof fetch>()
    const response = await handleReadCountRequest(request(url), {
      fetch: fetchMock,
    })

    expect(response.status).toBe(400)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ error: 'invalid_path' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects article paths over the length bound', async () => {
    const path = `/blog/${'a'.repeat(512)}/`
    const fetchMock = vi.fn<typeof fetch>()
    const response = await handleReadCountRequest(
      request(
        `https://shariq.dev/api/read-count?path=${encodeURIComponent(path)}`,
      ),
      { fetch: fetchMock },
    )

    expect(response.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches the exact encoded upstream path and returns minimal cached JSON', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(upstreamResponse({ count: '1,234' }))

    const response = await handleReadCountRequest(request(), {
      fetch: fetchMock,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://shariq-blog.goatcounter.com/counter/%2Fblog%2Fexample%2F.json',
      expect.objectContaining({
        credentials: 'omit',
        headers: { accept: 'application/json' },
        signal: expect.any(AbortSignal),
      }),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe(
      'application/json; charset=utf-8',
    )
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('cache-control')).toBe(
      `public, max-age=${READ_COUNT_BROWSER_MAX_AGE_SECONDS}, s-maxage=${READ_COUNT_SHARED_MAX_AGE_SECONDS}`,
    )
    expect(response.headers.get(READ_COUNT_CACHE_FETCHED_AT_HEADER)).toBeNull()
    expect(await response.json()).toEqual({ count: '1234' })
  })

  it.each([
    { upstream: 403, expected: 502, error: 'unavailable' },
    { upstream: 404, expected: 404, error: 'not_found' },
  ])(
    'maps upstream $upstream to $expected',
    async ({ upstream, expected, error }) => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: upstream }))

      const response = await handleReadCountRequest(request(), {
        fetch: fetchMock,
      })

      expect(response.status).toBe(expected)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(await response.json()).toEqual({ error })
    },
  )

  it.each([upstreamResponse('{'), upstreamResponse({ count: 'many' })])(
    'maps malformed upstream responses to 502',
    async (upstream) => {
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(upstream)
      const response = await handleReadCountRequest(request(), {
        fetch: fetchMock,
      })

      expect(response.status).toBe(502)
      expect(await response.json()).toEqual({ error: 'unavailable' })
    },
  )

  it('maps upstream network failures to 502', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError('Failed to fetch'))
    const response = await handleReadCountRequest(request(), {
      fetch: fetchMock,
    })

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'unavailable' })
  })

  it('maps unexpected upstream failures to 502', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('upstream body failed'))
    const response = await handleReadCountRequest(request(), {
      fetch: fetchMock,
    })

    expect(response.status).toBe(502)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ error: 'unavailable' })
  })

  it('maps upstream timeout to 504', async () => {
    vi.useFakeTimers()
    const fetchMock: typeof fetch = async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        )
      })

    const responsePromise = handleReadCountRequest(request(), {
      fetch: fetchMock,
      timeoutMs: 50,
    })
    await vi.advanceTimersByTimeAsync(50)
    const response = await responsePromise

    expect(response.status).toBe(504)
    expect(await response.json()).toEqual({ error: 'unavailable' })
  })

  it('returns a fresh cache hit without calling upstream', async () => {
    const cache = new MemoryReadCountCache()
    seedCache(cache, { body: { count: '1,234' } })
    const fetchMock = vi.fn<typeof fetch>()

    const response = await handleReadCountRequest(request(), {
      cache,
      fetch: fetchMock,
      now: () => NOW,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get(READ_COUNT_CACHE_STATUS_HEADER)).toBe('fresh')
    expect(response.headers.get('cache-control')).toBe(
      `public, max-age=${READ_COUNT_BROWSER_MAX_AGE_SECONDS}, s-maxage=${
        READ_COUNT_CACHE_FRESH_SECONDS - 60 * 60
      }`,
    )
    expect(await response.json()).toEqual({ count: '1234' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(cache.putCalls).toEqual([])
  })

  it('caps fresh response caching at the remaining freshness window', async () => {
    const cache = new MemoryReadCountCache()
    seedCache(cache, {
      fetchedAt: NOW - (READ_COUNT_CACHE_FRESH_SECONDS * 1_000 - 90_000),
    })
    const fetchMock = vi.fn<typeof fetch>()

    const response = await handleReadCountRequest(request(), {
      cache,
      fetch: fetchMock,
      now: () => NOW,
    })

    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=90, s-maxage=90',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('revalidates freshness after an asynchronous cache lookup', async () => {
    const cache = new MemoryReadCountCache()
    seedCache(cache, { fetchedAt: NOW })
    const freshnessBoundary = NOW + READ_COUNT_CACHE_FRESH_SECONDS * 1_000
    const times = [
      freshnessBoundary - 1,
      freshnessBoundary + 1,
      freshnessBoundary + 1,
    ]
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(upstreamResponse({ count: '456' }))

    const response = await handleReadCountRequest(request(), {
      cache,
      fetch: fetchMock,
      now: () => times.shift() ?? freshnessBoundary + 1,
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(response.headers.get(READ_COUNT_CACHE_STATUS_HEADER)).toBe(
      'refreshed',
    )
    expect(await response.json()).toEqual({ count: '456' })
  })

  it('refreshes a retained stale cache entry from upstream', async () => {
    const cache = new MemoryReadCountCache()
    seedCache(cache, {
      body: { count: '123' },
      fetchedAt: NOW - 5 * 60 * 60 * 1_000,
    })
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(upstreamResponse({ count: '456' }))

    const response = await handleReadCountRequest(request(), {
      cache,
      fetch: fetchMock,
      now: () => NOW,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get(READ_COUNT_CACHE_STATUS_HEADER)).toBe(
      'refreshed',
    )
    expect(await response.json()).toEqual({ count: '456' })
    expect(cache.putCalls).toEqual([cacheKey()])

    const stored = cache.entries.get(cacheKey())
    expect(stored?.headers.get(READ_COUNT_CACHE_FETCHED_AT_HEADER)).toBe(
      String(NOW),
    )
    expect(stored?.headers.get('cache-control')).toBe(
      `public, max-age=${READ_COUNT_CACHE_RETENTION_SECONDS}`,
    )
    expect(await stored?.clone().json()).toEqual({ count: '456' })
  })

  it.each([
    {
      failure: 'network error',
      fetch: async () => {
        throw new TypeError('Failed to fetch')
      },
    },
    {
      failure: 'HTTP 429',
      fetch: async () => new Response(null, { status: 429 }),
    },
    {
      failure: 'HTTP 503',
      fetch: async () => new Response(null, { status: 503 }),
    },
    {
      failure: 'response stream network error',
      fetch: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new TypeError('terminated'))
            },
          }),
        ),
    },
  ] satisfies { failure: string; fetch: typeof fetch }[])(
    'serves retained stale data on $failure',
    async ({ fetch }) => {
      const cache = new MemoryReadCountCache()
      seedCache(cache, {
        body: { count: '321' },
        fetchedAt: NOW - 5 * 60 * 60 * 1_000,
      })
      const fetchMock = vi
        .fn<typeof globalThis.fetch>()
        .mockImplementation(fetch)

      const response = await handleReadCountRequest(request(), {
        cache,
        fetch: fetchMock,
        now: () => NOW,
      })

      expect(response.status).toBe(200)
      expect(response.headers.get(READ_COUNT_CACHE_STATUS_HEADER)).toBe('stale')
      expect(response.headers.get('cache-control')).toBe(
        `public, max-age=${READ_COUNT_STALE_BROWSER_MAX_AGE_SECONDS}, s-maxage=${READ_COUNT_STALE_SHARED_MAX_AGE_SECONDS}`,
      )
      expect(await response.json()).toEqual({ count: '321' })
      expect(fetchMock).toHaveBeenCalledOnce()
      expect(cache.putCalls).toEqual([])
    },
  )

  it('serves retained stale data when upstream times out', async () => {
    vi.useFakeTimers()
    const cache = new MemoryReadCountCache()
    seedCache(cache, {
      body: { count: '321' },
      fetchedAt: NOW - 5 * 60 * 60 * 1_000,
    })
    const fetchMock: typeof fetch = async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        )
      })

    const responsePromise = handleReadCountRequest(request(), {
      cache,
      fetch: fetchMock,
      now: () => NOW,
      timeoutMs: 50,
    })
    await vi.advanceTimersByTimeAsync(50)
    const response = await responsePromise

    expect(response.status).toBe(200)
    expect(response.headers.get(READ_COUNT_CACHE_STATUS_HEADER)).toBe('stale')
    expect(await response.json()).toEqual({ count: '321' })
  })

  it('caps stale response caching at the remaining retention window', async () => {
    const cache = new MemoryReadCountCache()
    seedCache(cache, {
      fetchedAt: NOW - (READ_COUNT_CACHE_RETENTION_SECONDS * 1_000 - 45_000),
    })
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 503 }))

    const response = await handleReadCountRequest(request(), {
      cache,
      fetch: fetchMock,
      now: () => NOW,
    })

    expect(response.headers.get(READ_COUNT_CACHE_STATUS_HEADER)).toBe('stale')
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=45, s-maxage=45',
    )
  })

  it('revalidates retention after an upstream availability failure', async () => {
    const cache = new MemoryReadCountCache()
    seedCache(cache, { fetchedAt: NOW })
    const retentionBoundary = NOW + READ_COUNT_CACHE_RETENTION_SECONDS * 1_000
    const times = [
      retentionBoundary - 1,
      retentionBoundary - 1,
      retentionBoundary + 1,
    ]
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
      seedCache(cache, {
        body: { count: '999' },
        fetchedAt: retentionBoundary,
      })
      return new Response(null, { status: 503 })
    })

    const response = await handleReadCountRequest(request(), {
      cache,
      fetch: fetchMock,
      now: () => times.shift() ?? retentionBoundary + 1,
    })

    expect(response.status).toBe(502)
    expect(response.headers.get(READ_COUNT_CACHE_STATUS_HEADER)).toBe('expired')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ error: 'unavailable' })
    const concurrentEntry = cache.entries.get(cacheKey())
    expect(await concurrentEntry?.clone().json()).toEqual({ count: '999' })
    expect(
      concurrentEntry?.headers.get(READ_COUNT_CACHE_FETCHED_AT_HEADER),
    ).toBe(String(retentionBoundary))
  })

  it('does not serve a cache entry beyond the retention window', async () => {
    const cache = new MemoryReadCountCache()
    seedCache(cache, {
      fetchedAt: NOW - (READ_COUNT_CACHE_RETENTION_SECONDS * 1_000 + 1),
    })
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 503 }))

    const response = await handleReadCountRequest(request(), {
      cache,
      fetch: fetchMock,
      now: () => NOW,
    })

    expect(response.status).toBe(502)
    expect(response.headers.get(READ_COUNT_CACHE_STATUS_HEADER)).toBe('expired')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ error: 'unavailable' })
    expect(cache.entries.has(cacheKey())).toBe(true)
  })

  it('fails closed when upstream fails and the cache is empty', async () => {
    const cache = new MemoryReadCountCache()
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError('Failed to fetch'))

    const response = await handleReadCountRequest(request(), {
      cache,
      fetch: fetchMock,
      now: () => NOW,
    })

    expect(response.status).toBe(502)
    expect(response.headers.get(READ_COUNT_CACHE_STATUS_HEADER)).toBe('miss')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ error: 'unavailable' })
  })

  it.each(INVALID_CACHE_CASES)(
    'ignores $cacheProblem instead of serving it stale',
    async ({ body, headers }) => {
      const cache = new MemoryReadCountCache()
      seedCache(cache, {
        body,
        fetchedAt: NOW - 5 * 60 * 60 * 1_000,
        headers,
      })
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 503 }))

      const response = await handleReadCountRequest(request(), {
        cache,
        fetch: fetchMock,
        now: () => NOW,
      })

      expect(response.status).toBe(502)
      expect(response.headers.get(READ_COUNT_CACHE_STATUS_HEADER)).toBe(
        'invalid',
      )
      expect(await response.json()).toEqual({ error: 'unavailable' })
      expect(cache.entries.has(cacheKey())).toBe(true)
    },
  )

  it('returns fresh upstream data when the cache write fails', async () => {
    const cache = new MemoryReadCountCache()
    cache.failPut = true
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(upstreamResponse({ count: '777' }))

    const response = await handleReadCountRequest(request(), {
      cache,
      fetch: fetchMock,
      now: () => NOW,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get(READ_COUNT_CACHE_STATUS_HEADER)).toBe('miss')
    expect(response.headers.get('x-read-count-cache-write')).toBe('error')
    expect(await response.json()).toEqual({ count: '777' })
  })

  it.each([
    {
      upstream: new Response(null, { status: 404 }),
      expectedStatus: 404,
      expectedBody: { error: 'not_found' },
    },
    {
      upstream: upstreamResponse({ count: 'many' }),
      expectedStatus: 502,
      expectedBody: { error: 'unavailable' },
    },
  ])(
    'rejects stale data when the upstream response is not an availability failure',
    async ({ upstream, expectedStatus, expectedBody }) => {
      const cache = new MemoryReadCountCache()
      seedCache(cache, {
        fetchedAt: NOW - 5 * 60 * 60 * 1_000,
      })
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(upstream)

      const response = await handleReadCountRequest(request(), {
        cache,
        fetch: fetchMock,
        now: () => NOW,
      })

      expect(response.status).toBe(expectedStatus)
      expect(response.headers.get(READ_COUNT_CACHE_STATUS_HEADER)).toBe(
        'stale-rejected',
      )
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(await response.json()).toEqual(expectedBody)
      expect(cache.putCalls).toEqual([])
    },
  )

  it('uses an internal same-origin cache key keyed by canonical path', () => {
    const key = buildReadCountCacheKey(REQUEST_URL, ARTICLE_PATH)
    const url = new URL(key.url)

    expect(url.origin).toBe('https://shariq.dev')
    expect(url.pathname).toBe('/.internal/read-count-cache/v1')
    expect(url.searchParams.get('path')).toBe(ARTICLE_PATH)
    expect(url.pathname).not.toBe('/api/read-count')
  })
})
