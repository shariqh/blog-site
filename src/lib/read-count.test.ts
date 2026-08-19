import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildReadCountUrl,
  fetchReadCount,
  formatReadCount,
  parseReadCount,
} from './read-count'

describe('buildReadCountUrl', () => {
  it('encodes the exact URL pathname for GoatCounter', () => {
    expect(buildReadCountUrl('/blog/nested/an%20article')).toBe(
      'https://shariq-blog.goatcounter.com/counter/%2Fblog%2Fnested%2Fan%2520article.json',
    )
  })

  it.each(['/blog/post?source=home', '/blog/post#section', 'blog/post'])(
    'rejects non-canonical path %s',
    (path) => {
      expect(() => buildReadCountUrl(path)).toThrow(TypeError)
    },
  )
})

describe('parseReadCount', () => {
  it('parses plain and comma-formatted counts', () => {
    expect(parseReadCount({ count: '0' })).toBe(0)
    expect(parseReadCount({ count: '999' })).toBe(999)
    expect(parseReadCount({ count: '1,234,567' })).toBe(1_234_567)
  })

  it.each([
    '1.234.567',
    "1'234'567",
    '1 234 567',
    '1\u00a0234\u00a0567',
    '1\u202f234\u202f567',
  ])('parses GoatCounter separator format %s', (count) => {
    expect(parseReadCount({ count })).toBe(1_234_567)
  })

  it.each([
    null,
    {},
    { count: 12 },
    { count: '' },
    { count: '1,23' },
    { count: '1,234.567' },
    { count: '-1' },
    { count: '12 views' },
    { count: '9,007,199,254,740,992' },
  ])('rejects malformed payload %#', (payload) => {
    expect(parseReadCount(payload)).toBeNull()
  })
})

describe('formatReadCount', () => {
  it('formats zero, one, and many views precisely', () => {
    expect(formatReadCount(0)).toBe('0 views')
    expect(formatReadCount(1)).toBe('1 view')
    expect(formatReadCount(1_234)).toBe('1,234 views')
  })

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid count %s',
    (count) => {
      expect(() => formatReadCount(count)).toThrow(RangeError)
    },
  )
})

describe('fetchReadCount', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns a parsed count and omits credentials', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ count: '2,345' }), {
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(
      fetchReadCount('/blog/post', { fetch: fetchMock }),
    ).resolves.toEqual({ ok: true, count: 2_345 })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://shariq-blog.goatcounter.com/counter/%2Fblog%2Fpost.json',
      expect.objectContaining({
        credentials: 'omit',
        headers: { accept: 'application/json' },
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it.each([403, 404])(
    'returns an HTTP failure for status %s',
    async (status) => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status }))

      await expect(
        fetchReadCount('/blog/post', { fetch: fetchMock }),
      ).resolves.toEqual({ ok: false, reason: 'http', status })
    },
  )

  it('returns an invalid response for malformed JSON', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{', { status: 200 }))

    await expect(
      fetchReadCount('/blog/post', { fetch: fetchMock }),
    ).resolves.toEqual({ ok: false, reason: 'invalid-response' })
  })

  it('returns an invalid response for a malformed count', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ count: 'many' })))

    await expect(
      fetchReadCount('/blog/post', { fetch: fetchMock }),
    ).resolves.toEqual({ ok: false, reason: 'invalid-response' })
  })

  it('returns a network failure for fetch errors', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(
      fetchReadCount('/blog/post', { fetch: fetchMock }),
    ).resolves.toEqual({ ok: false, reason: 'network' })
  })

  it('aborts and returns a timeout failure', async () => {
    vi.useFakeTimers()
    const fetchMock: typeof fetch = async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        )
      })

    const result = fetchReadCount('/blog/post', {
      fetch: fetchMock,
      timeoutMs: 50,
    })
    await vi.advanceTimersByTimeAsync(50)

    await expect(result).resolves.toEqual({ ok: false, reason: 'timeout' })
  })

  it('does not fetch when the caller signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchMock = vi.fn<typeof fetch>()

    await expect(
      fetchReadCount('/blog/post', {
        fetch: fetchMock,
        signal: controller.signal,
      }),
    ).resolves.toEqual({ ok: false, reason: 'aborted' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([0, -1, 1.5, 2_147_483_648, Number.POSITIVE_INFINITY])(
    'rejects unsupported timeout %s',
    async (timeoutMs) => {
      const fetchMock = vi.fn<typeof fetch>()

      await expect(
        fetchReadCount('/blog/post', { fetch: fetchMock, timeoutMs }),
      ).rejects.toThrow(RangeError)
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it('does not swallow unexpected programming errors', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('broken fetch adapter'))

    await expect(
      fetchReadCount('/blog/post', { fetch: fetchMock }),
    ).rejects.toThrow('broken fetch adapter')
  })

  it('does not classify response processing TypeErrors as network failures', async () => {
    const response = new Response(JSON.stringify({ count: '1' }))
    Object.defineProperty(response, 'ok', {
      get() {
        throw new TypeError('broken response adapter')
      },
    })
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response)

    await expect(
      fetchReadCount('/blog/post', { fetch: fetchMock }),
    ).rejects.toThrow('broken response adapter')
  })
})
