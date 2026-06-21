import { describe, it, expect, vi } from 'vitest'

// Mock renderBrandedCover — must be set up before the module is imported.
vi.mock('../../src/lib/og/render', () => ({
  renderBrandedCover: vi.fn(async () => Buffer.from('fake-branded-cover-png')),
}))

import { renderFallbackCover } from './fallback'
import { renderBrandedCover } from '../../src/lib/og/render'

describe('renderFallbackCover', () => {
  it('delegates to renderBrandedCover (no title baked in)', async () => {
    const buf = await renderFallbackCover({ title: 'Managing Your Lows', tags: ['insights'] })
    expect(renderBrandedCover).toHaveBeenCalledTimes(1)
    expect(buf.toString()).toBe('fake-branded-cover-png')
  })

  it('does NOT bake the title into the output', async () => {
    vi.mocked(renderBrandedCover).mockResolvedValueOnce(Buffer.from('generic-cover'))
    const buf = await renderFallbackCover({ title: 'Some Title That Must Not Appear', tags: [] })
    // The returned buffer comes straight from renderBrandedCover with no title mixed in.
    expect(buf.toString()).toBe('generic-cover')
    expect(buf.toString()).not.toContain('Some Title That Must Not Appear')
  })
})
