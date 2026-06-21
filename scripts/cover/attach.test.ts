import { describe, it, expect, vi } from 'vitest'
import { attachCover } from './attach'

const input = { filePath: 'src/content/writing/a.mdx', slug: 'a', title: 'A', summary: 's', tags: ['ai'] }

describe('attachCover', () => {
  it('generates, writes hero, stages the PNG, and returns the image path', async () => {
    const generate = vi.fn(async () => ({
      imagePath: '/static/images/blog/a/cover.png',
      alt: 'Cover for A',
      prompt: 'p',
      style: 'line-art' as const,
      attempts: 1,
      usedFallback: false,
    }))
    const setHero = vi.fn()
    const stage = vi.fn()
    const path = await attachCover(input, { generate, setHero, stage })
    expect(path).toBe('/static/images/blog/a/cover.png')
    expect(setHero).toHaveBeenCalledWith('src/content/writing/a.mdx', {
      image: '/static/images/blog/a/cover.png',
      alt: 'Cover for A',
      prompt: 'p',
      style: 'line-art',
    })
    expect(stage).toHaveBeenCalledWith('public/static/images/blog/a/cover.png')
  })

  it('is non-fatal: returns null and does not throw when generation fails', async () => {
    const generate = vi.fn(async () => {
      throw new Error('azure down')
    })
    const path = await attachCover(input, { generate, setHero: vi.fn(), stage: vi.fn() })
    expect(path).toBeNull()
  })
})
