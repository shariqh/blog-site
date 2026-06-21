import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
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
  writeImage: (absPath: string, data: Buffer) => void
}

function writeToDisk(absPath: string, data: Buffer): void {
  mkdirSync(dirname(absPath), { recursive: true })
  writeFileSync(absPath, data)
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

  // Defense-in-depth: ensure the resolved path stays inside the allowed tree.
  const allowedRoot = resolve(publicDir, 'static/images/blog')
  const resolvedAbs = resolve(absPath)
  if (!resolvedAbs.startsWith(allowedRoot + '/') && resolvedAbs !== allowedRoot) {
    throw new Error(`Path containment violation: "${resolvedAbs}" escapes "${allowedRoot}"`)
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
      writeImage(absPath, png)
      return { imagePath, alt, prompt, style, attempts: attempt, usedFallback: false }
    }
  }

  // Exhausted retries — ship the deterministic branded cover.
  const fallback = await renderFallback({ title: input.title, tags: input.tags })
  writeImage(absPath, fallback)
  return { imagePath, alt, prompt, style, attempts: MAX_ATTEMPTS, usedFallback: true }
}
