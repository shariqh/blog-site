import { describe, it, expect } from 'vitest'
import { renderFallbackCover } from './fallback'

describe('renderFallbackCover', () => {
  it('renders a valid title-less PNG', async () => {
    const buf = await renderFallbackCover({
      title: 'Managing Your Lows',
      tags: ['insights'],
    })
    expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(buf.toString()).not.toContain('Managing Your Lows')
  })

  it('is deterministic per article and differs across articles', async () => {
    const one = await renderFallbackCover({
      title: 'One',
      summary: 'Local models',
      tags: ['ai'],
    })
    const oneAgain = await renderFallbackCover({
      title: 'One',
      summary: 'Local models',
      tags: ['ai'],
    })
    const two = await renderFallbackCover({
      title: 'Two',
      summary: 'Agent workflows',
      tags: ['ai'],
    })
    expect(one.equals(oneAgain)).toBe(true)
    expect(one.equals(two)).toBe(false)
  })
})
