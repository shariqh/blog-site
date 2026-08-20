import { describe, expect, it } from 'vitest'
import {
  buildReadCountCacheKey,
  READ_COUNT_CACHE_FETCHED_AT_HEADER,
  READ_COUNT_CACHE_STATUS_HEADER,
  type ReadCountCache,
} from '../../src/lib/read-count-proxy'
import { onRequest } from './read-count'

const ARTICLE_PATH = '/blog/example/'
const REQUEST_URL = `https://shariq.dev/api/read-count?path=${encodeURIComponent(ARTICLE_PATH)}`

describe('read-count Pages Function', () => {
  it('passes caches.default to the proxy handler', async () => {
    let matchedUrl: string | undefined
    const cache: ReadCountCache = {
      async match(request) {
        matchedUrl = request.url
        return new Response(JSON.stringify({ count: '123' }), {
          headers: {
            'content-type': 'application/json; charset=utf-8',
            [READ_COUNT_CACHE_FETCHED_AT_HEADER]: String(Date.now()),
          },
        })
      },
      async put() {
        throw new Error('fresh cache hits must not write')
      },
      async delete() {
        throw new Error('fresh cache hits must not delete')
      },
    }
    const originalCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches')
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: { default: cache },
    })

    try {
      const response = await onRequest({ request: new Request(REQUEST_URL) })

      expect(response.status).toBe(200)
      expect(response.headers.get(READ_COUNT_CACHE_STATUS_HEADER)).toBe('fresh')
      expect(await response.json()).toEqual({ count: '123' })
      expect(matchedUrl).toBe(
        buildReadCountCacheKey(REQUEST_URL, ARTICLE_PATH).url,
      )
    } finally {
      if (originalCaches) {
        Object.defineProperty(globalThis, 'caches', originalCaches)
      } else {
        Reflect.deleteProperty(globalThis, 'caches')
      }
    }
  })
})
