import { handleReadCountRequest } from '../../src/lib/read-count-proxy'

interface Context {
  request: Request
}

export function onRequest({ request }: Context): Promise<Response> {
  return handleReadCountRequest(request)
}
