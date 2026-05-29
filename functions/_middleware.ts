// Cloudflare Pages middleware. Runs on every request before the static
// asset is served. We use it to 301 www.shariq.dev → shariq.dev
// (preserving path + query), since CF Pages' _redirects file doesn't
// support cross-hostname matching the way Netlify's does.

interface Context {
  request: Request
  next: () => Promise<Response>
}

export const onRequest = async ({ request, next }: Context): Promise<Response> => {
  const url = new URL(request.url)
  if (url.hostname === 'www.shariq.dev') {
    url.hostname = 'shariq.dev'
    return Response.redirect(url.toString(), 301)
  }
  return next()
}
