import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildReadCountBackoffKey,
  buildReadCountCacheKey,
  createReadCountRefreshCoordinator,
  handleReadCountRequest,
  READ_COUNT_BACKOFF_STATUS_HEADER,
  READ_COUNT_BACKOFF_UNTIL_HEADER,
  READ_COUNT_BROWSER_MAX_AGE_SECONDS,
  READ_COUNT_CACHE_FRESH_SECONDS,
  READ_COUNT_CACHE_FETCHED_AT_HEADER,
  READ_COUNT_CACHE_RETENTION_SECONDS,
  READ_COUNT_CACHE_STATUS_HEADER,
  READ_COUNT_FAILURE_BACKOFF_SECONDS,
  READ_COUNT_INTERNAL_BACKOFF_PATH,
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

function request(
  url = REQUEST_URL,
  method = 'GET',
  signal?: AbortSignal,
): Request {
  return new Request(url, { method, signal })
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

function deferred<T>(): {
  promise: Promise<T>
  reject: (reason?: unknown) => void
  resolve: (value: T) => void
} {
  let reject!: (reason?: unknown) => void
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

class MemoryReadCountCache implements ReadCountCache {
  readonly entries = new Map<string, Response>()
  readonly deleteCalls: string[] = []
  readonly matchCalls: string[] = []
  readonly putCalls: string[] = []
  failBackoffPut = false
  failDelete = false
  failMatch = false
  failPut = false
  onMatch?: (request: Request) => Promise<void> | void

  async match(request: Request): Promise<Response | undefined> {
    this.matchCalls.push(request.url)
    if (this.failMatch) throw new Error('cache match failed')
    await this.onMatch?.(request)
    return this.entries.get(request.url)?.clone()
  }

  async put(request: Request, response: Response): Promise<void> {
    this.putCalls.push(request.url)
    if (
      this.failPut ||
      (this.failBackoffPut &&
        new URL(request.url).pathname === READ_COUNT_INTERNAL_BACKOFF_PATH)
    ) {
      throw new Error('cache put failed')
    }
    this.entries.set(request.url, response.clone())
  }

  async delete(request: Request): Promise<boolean> {
    this.deleteCalls.push(request.url)
    if (this.failDelete) throw new Error('cache delete failed')
    return this.entries.delete(request.url)
  }
}

function cacheKey(path = ARTICLE_PATH): string {
  return buildReadCountCacheKey(REQUEST_URL, path).url
}

function backoffKey(path = ARTICLE_PATH): string {
  return buildReadCountBackoffKey(REQUEST_URL, path).url
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

function seedBackoff(
  cache: MemoryReadCountCache,
  {
    failedAt = NOW,
    status = 502,
  }: { failedAt?: number; status?: 502 | 504 } = {},
): void {
  cache.entries.set(
    backoffKey(),
    upstreamResponse(
      { status },
      {
        headers: {
          'cache-control': `public, max-age=${READ_COUNT_FAILURE_BACKOFF_SECONDS}`,
          'content-type': 'application/json; charset=utf-8',
          [READ_COUNT_BACKOFF_UNTIL_HEADER]: String(
            failedAt + READ_COUNT_FAILURE_BACKOFF_SECONDS * 1_000,
          ),
        },
      },
    ),
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
      now: () => NOW,
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

  it('coalesces concurrent refreshes within one isolate', async () => {
    const cache = new MemoryReadCountCache()
    const coordinator = createReadCountRefreshCoordinator()
    const upstream = deferred<Response>()
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(() => upstream.promise)
    const options = {
      cache,
      coordinator,
      fetch: fetchMock,
      now: () => NOW,
    }

    const first = handleReadCountRequest(request(), options)
    const second = handleReadCountRequest(request(), options)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect(coordinator.size).toBe(1)

    upstream.resolve(upstreamResponse({ count: '456' }))
    const responses = await Promise.all([first, second])

    await expect(responses[0].clone().json()).resolves.toEqual({ count: '456' })
    await expect(responses[1].clone().json()).resolves.toEqual({ count: '456' })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(cache.putCalls).toEqual([cacheKey()])
    expect(coordinator.size).toBe(0)
  })

  it('keeps a shared refresh alive while another consumer remains', async () => {
    const cache = new MemoryReadCountCache()
    const coordinator = createReadCountRefreshCoordinator()
    const firstController = new AbortController()
    const secondController = new AbortController()
    const upstream = deferred<Response>()
    let sharedSignal: AbortSignal | undefined
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation((_input, init) => {
        sharedSignal = init?.signal ?? undefined
        return upstream.promise
      })
    const options = {
      cache,
      coordinator,
      fetch: fetchMock,
      now: () => NOW,
    }

    const first = handleReadCountRequest(
      request(REQUEST_URL, 'GET', firstController.signal),
      options,
    )
    const second = handleReadCountRequest(
      request(REQUEST_URL, 'GET', secondController.signal),
      options,
    )
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(coordinator.consumers).toBe(2))

    firstController.abort()
    const firstResponse = await first
    expect(firstResponse.status).toBe(502)
    expect(sharedSignal?.aborted).toBe(false)
    expect(coordinator.size).toBe(1)
    expect(coordinator.consumers).toBe(1)

    upstream.resolve(upstreamResponse({ count: '456' }))
    const secondResponse = await second
    expect(secondResponse.status).toBe(200)
    expect(await secondResponse.json()).toEqual({ count: '456' })
    expect(coordinator.size).toBe(0)
  })

  it('aborts a shared refresh after its last consumer disconnects', async () => {
    const cache = new MemoryReadCountCache()
    const coordinator = createReadCountRefreshCoordinator()
    const controller = new AbortController()
    let sharedSignal: AbortSignal | undefined
    const fetchMock: typeof fetch = async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        sharedSignal = init?.signal ?? undefined
        sharedSignal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        )
      })

    const responsePromise = handleReadCountRequest(
      request(REQUEST_URL, 'GET', controller.signal),
      {
        cache,
        coordinator,
        fetch: fetchMock,
        now: () => NOW,
      },
    )
    await vi.waitFor(() => expect(sharedSignal).toBeDefined())

    controller.abort()
    const response = await responsePromise

    expect(response.status).toBe(502)
    expect(sharedSignal?.aborted).toBe(true)
    await vi.waitFor(() => expect(coordinator.size).toBe(0))
  })

  it('does not let a new caller join an aborted refresh', async () => {
    const cache = new MemoryReadCountCache()
    const coordinator = createReadCountRefreshCoordinator()
    const controller = new AbortController()
    const abandonedFetch = deferred<Response>()
    let abandonedSignal: AbortSignal | undefined
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementationOnce((_input, init) => {
        abandonedSignal = init?.signal ?? undefined
        return abandonedFetch.promise
      })
      .mockResolvedValueOnce(upstreamResponse({ count: '456' }))
    const options = {
      cache,
      coordinator,
      fetch: fetchMock,
      now: () => NOW,
    }

    const abandoned = handleReadCountRequest(
      request(REQUEST_URL, 'GET', controller.signal),
      options,
    )
    await vi.waitFor(() => expect(abandonedSignal).toBeDefined())
    controller.abort()
    expect((await abandoned).status).toBe(502)
    expect(abandonedSignal?.aborted).toBe(true)
    expect(coordinator.size).toBe(1)

    const recovered = await handleReadCountRequest(request(), options)
    expect(recovered.status).toBe(200)
    expect(await recovered.json()).toEqual({ count: '456' })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    abandonedFetch.reject(new DOMException('Aborted', 'AbortError'))
    await vi.waitFor(() => expect(coordinator.size).toBe(0))
  })

  it('rechecks cache state when a late caller becomes refresh leader', async () => {
    const cache = new MemoryReadCountCache()
    const coordinator = createReadCountRefreshCoordinator()
    const upstream = deferred<Response>()
    const releaseBackoffLookup = deferred<void>()
    let delayNextBackoffLookup = false
    cache.onMatch = (matchedRequest) => {
      if (delayNextBackoffLookup && matchedRequest.url === backoffKey()) {
        delayNextBackoffLookup = false
        return releaseBackoffLookup.promise
      }
    }
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(() => upstream.promise)
    const options = {
      cache,
      coordinator,
      fetch: fetchMock,
      now: () => NOW,
    }

    const first = handleReadCountRequest(request(), options)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())

    delayNextBackoffLookup = true
    const second = handleReadCountRequest(request(), options)
    await vi.waitFor(() => expect(delayNextBackoffLookup).toBe(false))

    upstream.resolve(upstreamResponse({ count: '456' }))
    const firstResponse = await first
    expect(firstResponse.status).toBe(200)
    expect(coordinator.size).toBe(0)

    releaseBackoffLookup.resolve(undefined)
    const secondResponse = await second

    expect(secondResponse.status).toBe(200)
    expect(await secondResponse.json()).toEqual({ count: '456' })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(coordinator.size).toBe(0)
  })

  it('does not coalesce refreshes for different article keys', async () => {
    const cache = new MemoryReadCountCache()
    const coordinator = createReadCountRefreshCoordinator()
    const firstPath = '/blog/first/'
    const secondPath = '/blog/second/'
    const firstUpstream = deferred<Response>()
    const secondUpstream = deferred<Response>()
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation((input) =>
        String(input).includes(encodeURIComponent(firstPath))
          ? firstUpstream.promise
          : secondUpstream.promise,
      )
    const options = {
      cache,
      coordinator,
      fetch: fetchMock,
      now: () => NOW,
    }

    const first = handleReadCountRequest(
      request(
        `https://shariq.dev/api/read-count?path=${encodeURIComponent(firstPath)}`,
      ),
      options,
    )
    const second = handleReadCountRequest(
      request(
        `https://shariq.dev/api/read-count?path=${encodeURIComponent(secondPath)}`,
      ),
      options,
    )
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(coordinator.size).toBe(2)

    firstUpstream.resolve(upstreamResponse({ count: '1' }))
    secondUpstream.resolve(upstreamResponse({ count: '2' }))
    const responses = await Promise.all([first, second])

    expect(await responses[0].json()).toEqual({ count: '1' })
    expect(await responses[1].json()).toEqual({ count: '2' })
    expect(coordinator.size).toBe(0)
  })

  it('does not coalesce the same key across different dependencies', async () => {
    const firstCache = new MemoryReadCountCache()
    const secondCache = new MemoryReadCountCache()
    const coordinator = createReadCountRefreshCoordinator()
    const firstUpstream = deferred<Response>()
    const secondUpstream = deferred<Response>()
    const firstFetch = vi
      .fn<typeof fetch>()
      .mockImplementation(() => firstUpstream.promise)
    const secondFetch = vi
      .fn<typeof fetch>()
      .mockImplementation(() => secondUpstream.promise)
    const clock = () => NOW

    const first = handleReadCountRequest(request(), {
      cache: firstCache,
      coordinator,
      fetch: firstFetch,
      now: clock,
    })
    const second = handleReadCountRequest(request(), {
      cache: secondCache,
      coordinator,
      fetch: secondFetch,
      now: clock,
    })
    await vi.waitFor(() => {
      expect(firstFetch).toHaveBeenCalledOnce()
      expect(secondFetch).toHaveBeenCalledOnce()
    })
    expect(coordinator.size).toBe(2)

    firstUpstream.resolve(upstreamResponse({ count: '1' }))
    secondUpstream.resolve(upstreamResponse({ count: '2' }))
    const responses = await Promise.all([first, second])

    expect(await responses[0].json()).toEqual({ count: '1' })
    expect(await responses[1].json()).toEqual({ count: '2' })
    expect(coordinator.size).toBe(0)
  })

  it('uses request start time as the successful refresh generation', async () => {
    const cache = new MemoryReadCountCache()
    let clock = NOW
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
      clock = NOW + 5_000
      return upstreamResponse({ count: '456' })
    })

    const response = await handleReadCountRequest(request(), {
      cache,
      coordinator: createReadCountRefreshCoordinator(),
      fetch: fetchMock,
      now: () => clock,
    })

    expect(response.status).toBe(200)
    expect(
      cache.entries
        .get(cacheKey())
        ?.headers.get(READ_COUNT_CACHE_FETCHED_AT_HEADER),
    ).toBe(String(NOW))
    expect(response.headers.get('cache-control')).toBe(
      `public, max-age=${READ_COUNT_BROWSER_MAX_AGE_SECONDS}, s-maxage=${
        READ_COUNT_CACHE_FRESH_SECONDS - 5
      }`,
    )
  })

  it('cleans up an in-flight refresh after unexpected failure', async () => {
    const cache = new MemoryReadCountCache()
    const coordinator = createReadCountRefreshCoordinator()
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error('broken upstream adapter'))
      .mockResolvedValueOnce(upstreamResponse({ count: '456' }))

    const failed = await handleReadCountRequest(request(), {
      cache,
      coordinator,
      fetch: fetchMock,
      now: () => NOW,
    })
    expect(failed.status).toBe(502)
    expect(coordinator.size).toBe(0)

    const recovered = await handleReadCountRequest(request(), {
      cache,
      coordinator,
      fetch: fetchMock,
      now: () => NOW,
    })
    expect(recovered.status).toBe(200)
    expect(await recovered.json()).toEqual({ count: '456' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(coordinator.size).toBe(0)
  })

  it('preserves a concurrent higher count over a slower lower refresh', async () => {
    const cache = new MemoryReadCountCache()
    const coordinator = createReadCountRefreshCoordinator()
    let clock = NOW
    seedCache(cache, {
      body: { count: '100' },
      fetchedAt: NOW - 5 * 60 * 60 * 1_000,
    })
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
      clock = NOW + 1_000
      seedCache(cache, { body: { count: '200' }, fetchedAt: clock })
      return upstreamResponse({ count: '150' })
    })

    const response = await handleReadCountRequest(request(), {
      cache,
      coordinator,
      fetch: fetchMock,
      now: () => clock,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get(READ_COUNT_CACHE_STATUS_HEADER)).toBe(
      'preserved',
    )
    expect(await response.json()).toEqual({ count: '200' })
    const stored = cache.entries.get(cacheKey())
    expect(await stored?.clone().json()).toEqual({ count: '200' })
    expect(stored?.headers.get(READ_COUNT_CACHE_FETCHED_AT_HEADER)).toBe(
      String(clock),
    )
    expect(cache.putCalls).toEqual([])
  })

  it('never replaces an older cumulative count with a lower refresh', async () => {
    const cache = new MemoryReadCountCache()
    const fetchedAt = NOW - 5 * 60 * 60 * 1_000
    seedCache(cache, { body: { count: '200' }, fetchedAt })
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(upstreamResponse({ count: '150' }))

    const response = await handleReadCountRequest(request(), {
      cache,
      coordinator: createReadCountRefreshCoordinator(),
      fetch: fetchMock,
      now: () => NOW,
    })

    expect(response.headers.get(READ_COUNT_CACHE_STATUS_HEADER)).toBe(
      'preserved',
    )
    expect(await response.json()).toEqual({ count: '200' })
    expect(
      cache.entries
        .get(cacheKey())
        ?.headers.get(READ_COUNT_CACHE_FETCHED_AT_HEADER),
    ).toBe(String(fetchedAt))
    expect(cache.putCalls).toEqual([])
  })

  it('classifies a concurrent winner with a post-read timestamp', async () => {
    const cache = new MemoryReadCountCache()
    let clock = NOW
    seedCache(cache, {
      body: { count: '100' },
      fetchedAt: NOW - 5 * 60 * 60 * 1_000,
    })
    cache.onMatch = (matchedRequest) => {
      const countMatches = cache.matchCalls.filter(
        (url) => url === cacheKey(),
      ).length
      if (matchedRequest.url === cacheKey() && countMatches === 2) {
        clock = NOW + 1_000
        seedCache(cache, { body: { count: '200' }, fetchedAt: clock })
      }
    }
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(upstreamResponse({ count: '150' }))

    const response = await handleReadCountRequest(request(), {
      cache,
      coordinator: createReadCountRefreshCoordinator(),
      fetch: fetchMock,
      now: () => clock,
    })

    expect(response.headers.get(READ_COUNT_CACHE_STATUS_HEADER)).toBe(
      'preserved',
    )
    expect(await response.json()).toEqual({ count: '200' })
    expect(await cache.entries.get(cacheKey())?.clone().json()).toEqual({
      count: '200',
    })
    expect(cache.putCalls).toEqual([])
  })

  it('preserves newer metadata for an equal concurrent count', async () => {
    const cache = new MemoryReadCountCache()
    const coordinator = createReadCountRefreshCoordinator()
    let clock = NOW
    seedCache(cache, {
      body: { count: '100' },
      fetchedAt: NOW - 5 * 60 * 60 * 1_000,
    })
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
      clock = NOW + 1_000
      seedCache(cache, { body: { count: '150' }, fetchedAt: clock })
      return upstreamResponse({ count: '150' })
    })

    const response = await handleReadCountRequest(request(), {
      cache,
      coordinator,
      fetch: fetchMock,
      now: () => clock,
    })

    expect(response.headers.get(READ_COUNT_CACHE_STATUS_HEADER)).toBe(
      'preserved',
    )
    expect(await response.json()).toEqual({ count: '150' })
    expect(
      cache.entries
        .get(cacheKey())
        ?.headers.get(READ_COUNT_CACHE_FETCHED_AT_HEADER),
    ).toBe(String(clock))
    expect(cache.putCalls).toEqual([])
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
      expect(cache.putCalls).toEqual([backoffKey()])
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
    const marker = cache.entries.get(backoffKey())
    expect(marker?.headers.get('cache-control')).toBe(
      `public, max-age=${READ_COUNT_FAILURE_BACKOFF_SECONDS}`,
    )
    expect(marker?.headers.get(READ_COUNT_BACKOFF_UNTIL_HEADER)).toBe(
      String(NOW + READ_COUNT_FAILURE_BACKOFF_SECONDS * 1_000),
    )
    expect(await marker?.clone().json()).toEqual({ status: 504 })
  })

  it('uses a failure marker to suppress repeated stale refreshes', async () => {
    const cache = new MemoryReadCountCache()
    const coordinator = createReadCountRefreshCoordinator()
    seedCache(cache, {
      body: { count: '321' },
      fetchedAt: NOW - 5 * 60 * 60 * 1_000,
    })
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 503 }))
    const options = {
      cache,
      coordinator,
      fetch: fetchMock,
      now: () => NOW,
    }

    const first = await handleReadCountRequest(request(), options)
    const second = await handleReadCountRequest(request(), options)

    expect(first.headers.get(READ_COUNT_BACKOFF_STATUS_HEADER)).toBe('stored')
    expect(second.headers.get(READ_COUNT_BACKOFF_STATUS_HEADER)).toBe('active')
    expect(second.headers.get(READ_COUNT_CACHE_STATUS_HEADER)).toBe('stale')
    expect(await second.json()).toEqual({ count: '321' })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(cache.entries.has(cacheKey())).toBe(true)
    expect(cache.entries.has(backoffKey())).toBe(true)
    expect(coordinator.size).toBe(0)
  })

  it('keeps a validated stale snapshot when the fallback cache entry is evicted', async () => {
    const cache = new MemoryReadCountCache()
    seedCache(cache, {
      body: { count: '321' },
      fetchedAt: NOW - 5 * 60 * 60 * 1_000,
    })
    cache.onMatch = (matchedRequest) => {
      const countMatches = cache.matchCalls.filter(
        (url) => url === cacheKey(),
      ).length
      if (matchedRequest.url === cacheKey() && countMatches === 3) {
        cache.entries.delete(cacheKey())
      }
    }
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 503 }))

    const response = await handleReadCountRequest(request(), {
      cache,
      coordinator: createReadCountRefreshCoordinator(),
      fetch: fetchMock,
      now: () => NOW,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get(READ_COUNT_CACHE_STATUS_HEADER)).toBe('stale')
    expect(await response.json()).toEqual({ count: '321' })
    expect(cache.entries.has(cacheKey())).toBe(false)
  })

  it('keeps a cold cache unavailable during failure backoff', async () => {
    const cache = new MemoryReadCountCache()
    const coordinator = createReadCountRefreshCoordinator()
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError('Failed to fetch'))
    const options = {
      cache,
      coordinator,
      fetch: fetchMock,
      now: () => NOW,
    }

    const first = await handleReadCountRequest(request(), options)
    const second = await handleReadCountRequest(request(), options)

    expect(first.status).toBe(502)
    expect(first.headers.get(READ_COUNT_BACKOFF_STATUS_HEADER)).toBe('stored')
    expect(second.status).toBe(502)
    expect(second.headers.get(READ_COUNT_BACKOFF_STATUS_HEADER)).toBe('active')
    expect(second.headers.get(READ_COUNT_CACHE_STATUS_HEADER)).toBe('miss')
    expect(await second.json()).toEqual({ error: 'unavailable' })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('refreshes again after failure backoff expires', async () => {
    const cache = new MemoryReadCountCache()
    const coordinator = createReadCountRefreshCoordinator()
    let clock = NOW
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(upstreamResponse({ count: '456' }))
    const options = {
      cache,
      coordinator,
      fetch: fetchMock,
      now: () => clock,
    }

    const failed = await handleReadCountRequest(request(), options)
    expect(failed.status).toBe(502)

    clock += (READ_COUNT_FAILURE_BACKOFF_SECONDS - 1) * 1_000
    const blocked = await handleReadCountRequest(request(), options)
    expect(blocked.status).toBe(502)
    expect(blocked.headers.get(READ_COUNT_BACKOFF_STATUS_HEADER)).toBe('active')
    expect(fetchMock).toHaveBeenCalledOnce()

    clock += 1_000
    const refreshed = await handleReadCountRequest(request(), options)

    expect(refreshed.status).toBe(200)
    expect(await refreshed.json()).toEqual({ count: '456' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(cache.entries.has(backoffKey())).toBe(false)
    expect(cache.deleteCalls).toContain(backoffKey())
  })

  it('keeps stale data available when failure marker writes fail', async () => {
    const cache = new MemoryReadCountCache()
    cache.failBackoffPut = true
    seedCache(cache, {
      body: { count: '321' },
      fetchedAt: NOW - 5 * 60 * 60 * 1_000,
    })
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 503 }))

    const response = await handleReadCountRequest(request(), {
      cache,
      coordinator: createReadCountRefreshCoordinator(),
      fetch: fetchMock,
      now: () => NOW,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get(READ_COUNT_BACKOFF_STATUS_HEADER)).toBe(
      'write-error',
    )
    expect(await response.json()).toEqual({ count: '321' })
  })

  it('returns fresh data when failure marker cleanup fails', async () => {
    const cache = new MemoryReadCountCache()
    cache.failDelete = true
    seedBackoff(cache, {
      failedAt: NOW - (READ_COUNT_FAILURE_BACKOFF_SECONDS + 1) * 1_000,
    })
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(upstreamResponse({ count: '456' }))

    const response = await handleReadCountRequest(request(), {
      cache,
      coordinator: createReadCountRefreshCoordinator(),
      fetch: fetchMock,
      now: () => NOW,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get(READ_COUNT_BACKOFF_STATUS_HEADER)).toBe(
      'clear-error',
    )
    expect(await response.json()).toEqual({ count: '456' })
    expect(cache.entries.has(cacheKey())).toBe(true)
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

  it('uses a concurrent fresh entry after an upstream availability failure', async () => {
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

    expect(response.status).toBe(200)
    expect(response.headers.get(READ_COUNT_CACHE_STATUS_HEADER)).toBe('fresh')
    expect(await response.json()).toEqual({ count: '999' })
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
    const failureKey = buildReadCountBackoffKey(REQUEST_URL, ARTICLE_PATH)
    const url = new URL(key.url)
    const failureUrl = new URL(failureKey.url)

    expect(url.origin).toBe('https://shariq.dev')
    expect(url.pathname).toBe('/.internal/read-count-cache/v1')
    expect(url.searchParams.get('path')).toBe(ARTICLE_PATH)
    expect(url.pathname).not.toBe('/api/read-count')
    expect(failureUrl.origin).toBe(url.origin)
    expect(failureUrl.pathname).toBe('/.internal/read-count-backoff/v1')
    expect(failureUrl.searchParams.get('path')).toBe(ARTICLE_PATH)
    expect(failureKey.url).not.toBe(key.url)
  })
})
