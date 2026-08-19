export const GOATCOUNTER_COUNTER_BASE_URL =
  'https://shariq-blog.goatcounter.com/counter'

export const DEFAULT_READ_COUNT_TIMEOUT_MS = 4_000

export type ReadCountResult =
  | { ok: true; count: number }
  | {
      ok: false
      reason: 'aborted' | 'http' | 'invalid-response' | 'network' | 'timeout'
      status?: number
    }

type ReadCountFailure = Exclude<ReadCountResult, { ok: true }>

export interface ReadCountFetchOptions {
  fetch?: typeof globalThis.fetch
  signal?: AbortSignal
  timeoutMs?: number
}

// `path` is the exact URL pathname; GoatCounter's route encoding also escapes
// any percent escapes already present in that pathname.
export function buildReadCountUrl(path: string): string {
  if (!path.startsWith('/') || path.includes('?') || path.includes('#')) {
    throw new TypeError(
      'Read count paths must be absolute paths without a query or hash',
    )
  }

  return `${GOATCOUNTER_COUNTER_BASE_URL}/${encodeURIComponent(path)}.json`
}

export function parseReadCount(payload: unknown): number | null {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('count' in payload) ||
    typeof payload.count !== 'string'
  ) {
    return null
  }

  const value = payload.count
  if (
    !/^(?:0|[1-9]\d*|[1-9]\d{0,2}([,.'\u0020\u00a0\u202f])\d{3}(?:\1\d{3})*)$/.test(
      value,
    )
  ) {
    return null
  }

  const count = Number(value.replace(/[,.'\u0020\u00a0\u202f]/g, ''))
  return Number.isSafeInteger(count) ? count : null
}

const countFormatter = new Intl.NumberFormat('en-US')

export function formatReadCount(count: number): string {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError('Read counts must be non-negative safe integers')
  }

  return `${countFormatter.format(count)} ${count === 1 ? 'view' : 'views'}`
}

function classifyRequestFailure(
  error: unknown,
  timedOut: boolean,
  signal: AbortSignal | undefined,
  typeErrorIsNetwork: boolean,
): ReadCountFailure | null {
  if (timedOut) {
    return { ok: false, reason: 'timeout' }
  }
  if (signal?.aborted) {
    return { ok: false, reason: 'aborted' }
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { ok: false, reason: 'aborted' }
  }
  if (
    (typeErrorIsNetwork && error instanceof TypeError) ||
    (error instanceof DOMException && error.name === 'NetworkError')
  ) {
    return { ok: false, reason: 'network' }
  }
  return null
}

export async function fetchReadCount(
  path: string,
  options: ReadCountFetchOptions = {},
): Promise<ReadCountResult> {
  const url = buildReadCountUrl(path)
  const timeoutMs = options.timeoutMs ?? DEFAULT_READ_COUNT_TIMEOUT_MS
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('Read count timeouts must be positive finite numbers')
  }

  if (options.signal?.aborted) {
    return { ok: false, reason: 'aborted' }
  }

  const controller = new AbortController()
  let timedOut = false
  const abortFromCaller = () => controller.abort(options.signal?.reason)
  options.signal?.addEventListener('abort', abortFromCaller, { once: true })

  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    let response: Response
    try {
      response = await (options.fetch ?? globalThis.fetch)(url, {
        credentials: 'omit',
        headers: { accept: 'application/json' },
        signal: controller.signal,
      })
    } catch (error) {
      const failure = classifyRequestFailure(
        error,
        timedOut,
        options.signal,
        true,
      )
      if (failure) return failure
      throw error
    }

    if (!response.ok) {
      return { ok: false, reason: 'http', status: response.status }
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch (error) {
      if (error instanceof SyntaxError) {
        return { ok: false, reason: 'invalid-response' }
      }
      const failure = classifyRequestFailure(
        error,
        timedOut,
        options.signal,
        false,
      )
      if (failure) return failure
      throw error
    }

    const count = parseReadCount(payload)
    return count === null
      ? { ok: false, reason: 'invalid-response' }
      : { ok: true, count }
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abortFromCaller)
  }
}
