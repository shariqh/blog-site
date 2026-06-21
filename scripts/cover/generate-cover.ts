import { mkdirSync, realpathSync, openSync, writeFileSync, closeSync, constants } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { buildCoverPrompt, type CoverStyle } from './prompt'
import { generateImage as defaultGenerate } from './azure'
import { hasText as defaultHasText } from './text-check'
import { renderFallbackCover } from './fallback'
import { assertSafeSlug } from './slug'

const MAX_ATTEMPTS = 3

export type CoverResult = {
  imagePath: string
  alt: string
  prompt: string
  style: CoverStyle
  attempts: number
  usedFallback: boolean
}

export type CoverDeps = {
  generateImage: (prompt: string) => Promise<Buffer>
  hasText: (png: Buffer) => Promise<boolean>
  renderFallback: (args: { title: string; tags: string[] }) => Promise<Buffer>
  writeImage: (absPath: string, data: Buffer, realRoot?: string) => void
}

function writeToDisk(absPath: string, data: Buffer, realRoot?: string): void {
  const dir = dirname(absPath)
  mkdirSync(dir, { recursive: true })
  // Symlink-safe: resolve the real path of the directory AFTER mkdirSync and
  // confirm it stays inside the allowed root. realpathSync throws on dangling
  // symlinks, which surfaces as an error (desired behavior).
  if (realRoot !== undefined) {
    const realDir = realpathSync(dir)
    if (realDir !== realRoot && !realDir.startsWith(realRoot + sep)) {
      throw new Error(
        `Symlink containment violation: "${realDir}" escapes blog image root "${realRoot}"`
      )
    }
  }
  // O_NOFOLLOW: if absPath itself is a symlink, openSync throws ELOOP.
  // This prevents a pre-planted cover.png symlink from redirecting the write.
  const fd = openSync(absPath, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o644)
  // writeFileSync(fd, ...) writes the whole buffer (loops internally), unlike a
  // single writeSync which may short-write and silently truncate a large PNG.
  try { writeFileSync(fd, data) } finally { closeSync(fd) }
}

const DEFAULTS: CoverDeps = {
  generateImage: defaultGenerate,
  hasText: defaultHasText,
  renderFallback: renderFallbackCover,
  writeImage: writeToDisk,
}

export async function generateCover(
  input: {
    slug: string
    title: string
    summary?: string
    tags: string[]
    style?: CoverStyle
    publicDir?: string
  },
  deps: Partial<CoverDeps> = {}
): Promise<CoverResult> {
  // Security choke point: reject any slug that isn't a safe post slug.
  assertSafeSlug(input.slug)

  const { generateImage, hasText, renderFallback, writeImage } = { ...DEFAULTS, ...deps }
  const publicDir = input.publicDir ?? 'public'
  const imagePath = `/static/images/blog/${input.slug}/cover.png`
  const absPath = `${publicDir}${imagePath}`

  // Defense-in-depth: lexical containment — ensure the resolved path stays inside
  // the allowed tree (catches traversal in publicDir itself).
  const allowedRoot = resolve(publicDir, 'static/images/blog')
  const resolvedAbs = resolve(absPath)
  if (!resolvedAbs.startsWith(allowedRoot + sep) && resolvedAbs !== allowedRoot) {
    throw new Error(`Path containment violation: "${resolvedAbs}" escapes "${allowedRoot}"`)
  }

  // Symlink-safe: compute the real path of the blog image root so writeToDisk
  // can verify the final write directory after mkdirSync follows any symlinks.
  // realpathSync throws if any component doesn't exist yet; we fall back to
  // realpathSync on the nearest existing ancestor (publicDir at minimum).
  let realRoot: string
  try {
    realRoot = realpathSync(allowedRoot)
  } catch {
    // allowedRoot doesn't exist yet — resolve up to publicDir (which must exist).
    realRoot = realpathSync(resolve(publicDir)) + sep + 'static' + sep + 'images' + sep + 'blog'
  }

  const alt = `Cover illustration for "${input.title}".`

  const { prompt, style } = buildCoverPrompt({
    title: input.title,
    summary: input.summary,
    tags: input.tags,
    style: input.style,
  })

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const png = await generateImage(prompt)
    if (!(await hasText(png))) {
      writeImage(absPath, png, realRoot)
      return { imagePath, alt, prompt, style, attempts: attempt, usedFallback: false }
    }
  }

  // Exhausted retries — ship the deterministic branded cover.
  const fallback = await renderFallback({ title: input.title, tags: input.tags })
  writeImage(absPath, fallback, realRoot)
  return { imagePath, alt, prompt, style, attempts: MAX_ATTEMPTS, usedFallback: true }
}
