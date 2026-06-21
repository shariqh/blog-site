import { describe, it, expect, vi } from 'vitest'
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
      Buffer.from('gen')
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
      Buffer.from('fallback')
    )
    expect(r).toMatchObject({ attempts: 3, usedFallback: true })
  })

  it('honors an explicit style override', async () => {
    const r = await generateCover({ ...input, style: 'conceptual' }, deps())
    expect(r.style).toBe('conceptual')
  })
})
