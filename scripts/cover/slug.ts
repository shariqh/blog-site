// A safe post slug: non-empty, only URL-safe characters, no traversal.
// Each segment must start with [a-z0-9] then contain only [a-z0-9_-].
// Segments are joined by a single '/'. No leading/trailing slash, no '..'
// no '.'-only segments, no backslashes, no absolute paths.
const SEGMENT_RE = /^[a-z0-9][a-z0-9_-]*$/

export function assertSafeSlug(slug: string): string {
  if (!slug || typeof slug !== 'string') throw new Error(`Invalid slug: empty or non-string`)
  if (slug.startsWith('/') || slug.startsWith('\\')) {
    throw new Error(`Invalid slug "${slug}": must not be an absolute path or start with a slash`)
  }
  if (slug.includes('\\')) throw new Error(`Invalid slug "${slug}": backslashes are not allowed`)
  const segments = slug.split('/')
  for (const seg of segments) {
    if (seg === '' ) throw new Error(`Invalid slug "${slug}": empty segment (double slash or trailing slash)`)
    if (seg === '.' || seg === '..') throw new Error(`Invalid slug "${slug}": path traversal segment "${seg}"`)
    if (!SEGMENT_RE.test(seg)) {
      throw new Error(`Invalid slug "${slug}": segment "${seg}" contains invalid characters (only a-z0-9_- allowed, must start with a-z0-9)`)
    }
  }
  return slug
}
