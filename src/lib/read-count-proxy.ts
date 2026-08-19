import {
  DEFAULT_READ_COUNT_TIMEOUT_MS,
  fetchGoatCounterReadCount,
  isCanonicalArticlePath,
  type ReadCountFetchOptions,
} from './read-count'

export const READ_COUNT_BROWSER_MAX_AGE_SECONDS = 300
export const READ_COUNT_SHARED_MAX_AGE_SECONDS = 14_400

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
}

export interface ReadCountProxyOptions extends Pick<
  ReadCountFetchOptions,
  'fetch' | 'timeoutMs'
> {}

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

  let result
  try {
    result = await fetchGoatCounterReadCount(paths[0], {
      fetch: options.fetch,
      signal: request.signal,
      timeoutMs: options.timeoutMs ?? DEFAULT_READ_COUNT_TIMEOUT_MS,
    })
  } catch {
    return errorResponse(502, 'unavailable')
  }

  if (result.ok) {
    return jsonResponse(
      { count: String(result.count) },
      200,
      `public, max-age=${READ_COUNT_BROWSER_MAX_AGE_SECONDS}, s-maxage=${READ_COUNT_SHARED_MAX_AGE_SECONDS}`,
    )
  }
  if (result.reason === 'http' && result.status === 404) {
    return errorResponse(404, 'not_found')
  }
  if (result.reason === 'timeout') {
    return errorResponse(504, 'unavailable')
  }
  return errorResponse(502, 'unavailable')
}
