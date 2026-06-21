import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listPostFiles, slugFromPath, runBackfill } from './backfill'
import type { BackfillDeps } from './backfill'

// ─── listPostFiles / slugFromPath ────────────────────────────────────────────

let dir: string
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'cov-'))
  writeFileSync(join(dir, 'a.mdx'), '---\ntitle: A\n---\n')
  mkdirSync(join(dir, 'series'), { recursive: true })
  writeFileSync(join(dir, 'series', 'pt-1.mdx'), '---\ntitle: P1\n---\n')
  writeFileSync(join(dir, 'notes.txt'), 'ignore me')
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('listPostFiles', () => {
  it('finds .mdx files recursively and ignores non-mdx', () => {
    const files = listPostFiles(dir).map((f) => f.replace(dir + '/', '')).sort()
    expect(files).toEqual(['a.mdx', 'series/pt-1.mdx'])
  })
})

describe('slugFromPath', () => {
  it('keeps nested folders and drops the extension', () => {
    expect(slugFromPath(dir, join(dir, 'series', 'pt-1.mdx'))).toBe('series/pt-1')
    expect(slugFromPath(dir, join(dir, 'a.mdx'))).toBe('a')
  })
})

// ─── runBackfill ─────────────────────────────────────────────────────────────

function makeCoverResult(overrides: Partial<{
  imagePath: string; alt: string; prompt: string; style: 'line-art' | 'conceptual'; attempts: number; usedFallback: boolean
}> = {}) {
  return {
    imagePath: '/static/images/blog/post-a/cover.png',
    alt: 'Cover for Post A',
    prompt: 'some prompt',
    style: 'line-art' as const,
    attempts: 1,
    usedFallback: false,
    ...overrides,
  }
}

function postFrontmatter(fields: Record<string, unknown> = {}): string {
  const fm = { title: 'Post A', tags: ['ai'], ...fields }
  return `---\n${Object.entries(fm).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n')}\n---\nBody.\n`
}

describe('runBackfill', () => {
  it('(a) isolates per-post failures: one post rejects, subsequent posts still generate and setHero is called', async () => {
    const fileA = 'src/content/writing/post-a.mdx'
    const fileB = 'src/content/writing/post-b.mdx'
    const files = [fileA, fileB]

    const generateCover = vi.fn()
      .mockRejectedValueOnce(new Error('azure 429'))
      .mockResolvedValueOnce(makeCoverResult({ imagePath: '/static/images/blog/post-b/cover.png' }))

    const setHero = vi.fn()
    const readFile = vi.fn((p: string) =>
      p === fileA ? postFrontmatter({ title: 'Post A' }) : postFrontmatter({ title: 'Post B' })
    )

    const deps: BackfillDeps = { force: false, readFile, generateCover, setHero }
    const result = await runBackfill(files, deps)

    expect(result.failed).toBe(1)
    expect(result.made).toBeGreaterThanOrEqual(1)
    // setHero must have been called for the second (successful) post
    expect(setHero).toHaveBeenCalledTimes(1)
    expect(setHero).toHaveBeenCalledWith(fileB, expect.objectContaining({ image: '/static/images/blog/post-b/cover.png' }))
  })

  it('(b) draft: true posts are skipped (counted in skipped, generateCover never called)', async () => {
    const fileDraft = 'src/content/writing/draft-post.mdx'
    const generateCover = vi.fn().mockResolvedValue(makeCoverResult())
    const setHero = vi.fn()
    const readFile = vi.fn(() => postFrontmatter({ draft: true }))

    const deps: BackfillDeps = { force: false, readFile, generateCover, setHero }
    const result = await runBackfill([fileDraft], deps)

    expect(result.skipped).toBe(1)
    expect(result.made).toBe(0)
    expect(generateCover).not.toHaveBeenCalled()
    expect(setHero).not.toHaveBeenCalled()
  })

  it('(c) existing hero.image skips when force=false but regenerates when force=true', async () => {
    const fileWithHero = 'src/content/writing/has-hero.mdx'
    const generateCover = vi.fn().mockResolvedValue(makeCoverResult())
    const setHero = vi.fn()
    const readFile = vi.fn(() =>
      postFrontmatter({ hero: { image: '/static/images/blog/old/cover.png', alt: 'old' } })
    )

    // force=false → skip
    const skipResult = await runBackfill([fileWithHero], {
      force: false, readFile, generateCover, setHero,
    })
    expect(skipResult.skipped).toBe(1)
    expect(skipResult.made).toBe(0)
    expect(generateCover).not.toHaveBeenCalled()

    generateCover.mockClear()
    setHero.mockClear()

    // force=true → regenerate
    const forceResult = await runBackfill([fileWithHero], {
      force: true, readFile, generateCover, setHero,
    })
    expect(forceResult.made).toBe(1)
    expect(forceResult.skipped).toBe(0)
    expect(generateCover).toHaveBeenCalledTimes(1)
    expect(setHero).toHaveBeenCalledTimes(1)
  })

  it('counts usedFallback into fellBack', async () => {
    const fileA = 'src/content/writing/fallback-post.mdx'
    const generateCover = vi.fn().mockResolvedValue(makeCoverResult({ usedFallback: true }))
    const setHero = vi.fn()
    const readFile = vi.fn(() => postFrontmatter())

    const result = await runBackfill([fileA], { force: false, readFile, generateCover, setHero })
    expect(result.made).toBe(1)
    expect(result.fellBack).toBe(1)
  })
})
