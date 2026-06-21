import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { generateCover } from './generate-cover'

function deps(over: Record<string, unknown> = {}) {
  return {
    generateImage: vi.fn(async () => Buffer.from('gen')),
    hasText: vi.fn(async () => false),
    renderFallback: vi.fn(async () => Buffer.from('fallback')),
    writeImage: vi.fn(),
    ...over,
  }
}

const input = { slug: 'a-post', title: 'A Post', summary: 's', tags: ['ai'] }

describe('generateCover', () => {
  it('writes the generated image on the first clean attempt', async () => {
    const d = deps()
    const r = await generateCover(input, d)
    expect(d.generateImage).toHaveBeenCalledTimes(1)
    expect(d.writeImage).toHaveBeenCalledWith(
      'public/static/images/blog/a-post/cover.png',
      Buffer.from('gen'),
      expect.any(String) // realRoot (symlink-safe write check)
    )
    expect(r).toMatchObject({
      imagePath: '/static/images/blog/a-post/cover.png',
      style: 'line-art',
      attempts: 1,
      usedFallback: false,
    })
    expect(r.alt).toContain('A Post')
    expect(r.prompt).toContain('Concept: A Post. s')
  })

  it('retries when text is detected, then succeeds', async () => {
    const hasText = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    const d = deps({ hasText })
    const r = await generateCover(input, d)
    expect(d.generateImage).toHaveBeenCalledTimes(2)
    expect(r.attempts).toBe(2)
    expect(r.usedFallback).toBe(false)
  })

  it('falls back to the branded cover after 3 failed attempts', async () => {
    const d = deps({ hasText: vi.fn(async () => true) })
    const r = await generateCover(input, d)
    expect(d.generateImage).toHaveBeenCalledTimes(3)
    expect(d.renderFallback).toHaveBeenCalledTimes(1)
    expect(d.writeImage).toHaveBeenCalledWith(
      'public/static/images/blog/a-post/cover.png',
      Buffer.from('fallback'),
      expect.any(String) // realRoot (symlink-safe write check)
    )
    expect(r).toMatchObject({ attempts: 3, usedFallback: true })
  })

  it('honors an explicit style override', async () => {
    const r = await generateCover({ ...input, style: 'conceptual' }, deps())
    expect(r.style).toBe('conceptual')
  })

  it('propagates a generateImage rejection without swallowing it into the branded fallback', async () => {
    // A generation error (e.g. azure 429) MUST propagate so callers can count failures.
    // It must NOT be caught and silently served as the fallback — backfill relies on the throw.
    const renderFallback = vi.fn(async () => Buffer.from('fallback'))
    const d = deps({
      generateImage: vi.fn().mockRejectedValue(new Error('azure 429')),
      renderFallback,
    })
    await expect(generateCover(input, d)).rejects.toThrow(/429/)
    expect(renderFallback).not.toHaveBeenCalled()
  })
})

describe('generateCover symlink-write safety (real FS)', () => {
  const temps: string[] = []
  afterEach(() => {
    for (const t of temps) {
      try { rmSync(t, { recursive: true, force: true }) } catch { /* ignore */ }
    }
    temps.length = 0
  })

  it('normal slug writes the PNG under the temp blog dir', async () => {
    const publicDir = mkdtempSync(join(tmpdir(), 'cover-test-pub-'))
    temps.push(publicDir)
    // Use real writeToDisk (no writeImage override) by not passing that dep.
    const d = {
      generateImage: vi.fn(async () => Buffer.from('PNGDATA')),
      hasText: vi.fn(async () => false),
      renderFallback: vi.fn(async () => Buffer.from('fallback')),
      // writeImage not overridden — uses the real writeToDisk
    }
    const result = await generateCover({ slug: 'normal-slug', title: 'T', tags: ['ai'], publicDir }, d)
    expect(result.imagePath).toBe('/static/images/blog/normal-slug/cover.png')
    // File should exist at expected path
    const { existsSync } = await import('node:fs')
    expect(existsSync(`${publicDir}/static/images/blog/normal-slug/cover.png`)).toBe(true)
  })

  it('rejects writing when the slug directory is a symlink pointing outside publicDir', async () => {
    // Create temp dirs: one for publicDir, one as the "escape" target.
    const publicDir = mkdtempSync(join(tmpdir(), 'cover-test-pub-'))
    const escapeDir = mkdtempSync(join(tmpdir(), 'cover-test-escape-'))
    temps.push(publicDir, escapeDir)

    // Pre-create the blog parent so we can plant the symlink.
    const blogDir = join(publicDir, 'static', 'images', 'blog')
    mkdirSync(blogDir, { recursive: true })

    // Create a symlink: blog/evil → escape dir (simulates a committed symlink attack).
    symlinkSync(escapeDir, join(blogDir, 'evil'))

    const d = {
      generateImage: vi.fn(async () => Buffer.from('PNGDATA')),
      hasText: vi.fn(async () => false),
      renderFallback: vi.fn(async () => Buffer.from('fallback')),
      // writeImage not overridden — uses the real writeToDisk with symlink check
    }

    // generateCover with slug 'evil' should throw on the symlink containment check.
    await expect(
      generateCover({ slug: 'evil', title: 'T', tags: ['ai'], publicDir }, d)
    ).rejects.toThrow(/[Ss]ymlink|containment/)
  })
})
