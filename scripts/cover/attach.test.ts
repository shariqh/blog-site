import { describe, it, expect, vi } from 'vitest'
import { attachCover } from './attach'

const input = { filePath: 'src/content/writing/a.mdx', slug: 'a', title: 'A', summary: 's', tags: ['ai'] }

describe('attachCover', () => {
  it('generates, writes hero, stages the PNG, and returns the image path (setHero before stage)', async () => {
    const generate = vi.fn(async () => ({
      imagePath: '/static/images/blog/a/cover.png',
      alt: 'Cover for A',
      prompt: 'p',
      style: 'line-art' as const,
      attempts: 1,
      usedFallback: false,
    }))
    const callOrder: string[] = []
    const setHero = vi.fn(() => { callOrder.push('setHero') })
    const stage = vi.fn(() => { callOrder.push('stage') })
    const path = await attachCover(input, { generate, setHero, stage })
    expect(path).toBe('/static/images/blog/a/cover.png')
    expect(setHero).toHaveBeenCalledWith('src/content/writing/a.mdx', {
      image: '/static/images/blog/a/cover.png',
      alt: 'Cover for A',
      prompt: 'p',
      style: 'line-art',
    })
    expect(stage).toHaveBeenCalledWith('public/static/images/blog/a/cover.png')
    // setHero must be called before stage so a frontmatter failure leaves a clean git index.
    expect(callOrder).toEqual(['setHero', 'stage'])
  })

  it('is non-fatal: returns null and does not throw when generation fails', async () => {
    const generate = vi.fn(async () => {
      throw new Error('azure down')
    })
    const path = await attachCover(input, { generate, setHero: vi.fn(), stage: vi.fn() })
    expect(path).toBeNull()
  })

  it('returns null and does NOT call stage/setHero when generate returns an unsafe imagePath', async () => {
    const generate = vi.fn(async () => ({
      imagePath: '../../evil.png',
      alt: 'Cover for A',
      prompt: 'p',
      style: 'line-art' as const,
      attempts: 1,
      usedFallback: false,
    }))
    const setHero = vi.fn()
    const stage = vi.fn()
    const path = await attachCover(input, { generate, setHero, stage })
    expect(path).toBeNull()
    expect(stage).not.toHaveBeenCalled()
    expect(setHero).not.toHaveBeenCalled()
  })

  it('returns null (non-fatal) and does NOT stage the PNG when setHero throws', async () => {
    // New ordering: setHero runs BEFORE stage, so a setHero failure leaves the git
    // index untouched — no staged PNG to clean up, no git reset required.
    const generate = vi.fn(async () => ({
      imagePath: '/static/images/blog/a/cover.png',
      alt: 'Cover for A',
      prompt: 'p',
      style: 'line-art' as const,
      attempts: 1,
      usedFallback: false,
    }))
    const setHero = vi.fn(() => {
      throw new Error('disk full')
    })
    const stage = vi.fn()
    const path = await attachCover(input, { generate, setHero, stage })
    expect(path).toBeNull()
    // stage must NOT have been called — setHero failed before we reached it.
    expect(stage).not.toHaveBeenCalled()
    // The function returned null — non-fatal contract preserved.
  })
})
