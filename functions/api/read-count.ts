import {
  handleReadCountRequest,
  type ReadCountCache,
} from '../../src/lib/read-count-proxy'

interface CloudflareCacheStorage {
  default: ReadCountCache
}

declare const caches: CloudflareCacheStorage

interface Context {
  request: Request
}

export function onRequest({ request }: Context): Promise<Response> {
  return handleReadCountRequest(request, { cache: caches.default })
}
