import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  handleReadCountRequest,
  READ_COUNT_BROWSER_MAX_AGE_SECONDS,
  READ_COUNT_SHARED_MAX_AGE_SECONDS,
} from './read-count-proxy'

const ARTICLE_PATH = '/blog/example/'
const REQUEST_URL = `https://shariq.dev/api/read-count?path=${encodeURIComponent(ARTICLE_PATH)}`

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
})
