export const GOATCOUNTER_COUNTER_BASE_URL =
  'https://shariq-blog.goatcounter.com/counter'

export const READ_COUNT_API_PATH = '/api/read-count'
export const DEFAULT_READ_COUNT_TIMEOUT_MS = 4_000
export const MAX_ARTICLE_PATH_LENGTH = 512
export const MAX_READ_COUNT_RESPONSE_BYTES = 4_096

const MAX_TIMER_DELAY_MS = 2_147_483_647

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

const INVALID_RAW_PATH_CHARACTERS = /[\u0000-\u0020\u007f\\?#]/
const INVALID_DECODED_SEGMENT_CHARACTERS = /[\u0000-\u001f\u007f\\/]/

export function isCanonicalArticlePath(path: unknown): path is string {
  if (
    typeof path !== 'string' ||
    path.length > MAX_ARTICLE_PATH_LENGTH ||
    !path.startsWith('/blog/') ||
    !path.endsWith('/') ||
    INVALID_RAW_PATH_CHARACTERS.test(path)
  ) {
    return false
  }

  const segments = path.slice(1, -1).split('/')
  if (segments.length < 2 || segments.some((segment) => segment.length === 0)) {
    return false
  }

  return segments.every((segment) => {
    let decoded: string
    try {
      decoded = decodeURIComponent(segment)
    } catch {
      return false
    }

    return (
      decoded !== '.' &&
      decoded !== '..' &&
      !INVALID_DECODED_SEGMENT_CHARACTERS.test(decoded)
    )
  })
}

function assertCanonicalArticlePath(path: string): void {
  if (!isCanonicalArticlePath(path)) {
    throw new TypeError('Read counts require a canonical article pathname')
  }
}

export function buildReadCountUrl(path: string): string {
  assertCanonicalArticlePath(path)
  return `${READ_COUNT_API_PATH}?${new URLSearchParams({ path }).toString()}`
}

// `path` is the exact URL pathname; GoatCounter's route encoding also escapes
// any percent escapes already present in that pathname.
export function buildGoatCounterReadCountUrl(path: string): string {
  assertCanonicalArticlePath(path)
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

class InvalidReadCountResponseError extends Error {}

export async function readLimitedJson(response: Response): Promise<unknown> {
  const contentLength = response.headers.get('content-length')
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength)
    if (
      !Number.isSafeInteger(declaredBytes) ||
      declaredBytes < 0 ||
      declaredBytes > MAX_READ_COUNT_RESPONSE_BYTES
    ) {
      await response.body?.cancel().catch(() => undefined)
      throw new InvalidReadCountResponseError()
    }
  }

  if (!response.body) {
    throw new InvalidReadCountResponseError()
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let body = ''
  let receivedBytes = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break

      receivedBytes += value.byteLength
      if (receivedBytes > MAX_READ_COUNT_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined)
        throw new InvalidReadCountResponseError()
      }

      try {
        body += decoder.decode(value, { stream: true })
      } catch {
        await reader.cancel().catch(() => undefined)
        throw new InvalidReadCountResponseError()
      }
    }
    try {
      body += decoder.decode()
    } catch {
      throw new InvalidReadCountResponseError()
    }
  } finally {
    reader.releaseLock()
  }

  try {
    return JSON.parse(body) as unknown
  } catch {
    throw new InvalidReadCountResponseError()
  }
}

async function fetchReadCountFromUrl(
  url: string,
  options: ReadCountFetchOptions = {},
): Promise<ReadCountResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_READ_COUNT_TIMEOUT_MS
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > MAX_TIMER_DELAY_MS
  ) {
    throw new RangeError(
      `Read count timeouts must be integers from 1 to ${MAX_TIMER_DELAY_MS}`,
    )
  }

  const controller = new AbortController()
  let timedOut = false
  const abortFromCaller = () => controller.abort(options.signal?.reason)
  options.signal?.addEventListener('abort', abortFromCaller, { once: true })
  if (options.signal?.aborted) {
    options.signal.removeEventListener('abort', abortFromCaller)
    return { ok: false, reason: 'aborted' }
  }

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
      controller.abort()
      return { ok: false, reason: 'http', status: response.status }
    }

    let payload: unknown
    try {
      payload = await readLimitedJson(response)
    } catch (error) {
      if (error instanceof InvalidReadCountResponseError) {
        return { ok: false, reason: 'invalid-response' }
      }
      const failure = classifyRequestFailure(
        error,
        timedOut,
        options.signal,
        true,
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

export async function fetchReadCount(
  path: string,
  options: ReadCountFetchOptions = {},
): Promise<ReadCountResult> {
  return fetchReadCountFromUrl(buildReadCountUrl(path), options)
}

export async function fetchGoatCounterReadCount(
  path: string,
  options: ReadCountFetchOptions = {},
): Promise<ReadCountResult> {
  return fetchReadCountFromUrl(buildGoatCounterReadCountUrl(path), options)
}
