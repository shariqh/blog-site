import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/lib/og/render', () => ({
  renderOg: vi.fn(async (data: any) => {
    // Capture the OgData the fallback passes through.
    ;(globalThis as any).__lastOg = data
    return Buffer.from('fake-png')
  }),
}))

import { renderFallbackCover } from './fallback'

describe('renderFallbackCover', () => {
  it('renders via renderOg with no cover and a bucket eyebrow', async () => {
    const buf = await renderFallbackCover({ title: 'Managing Your Lows', tags: ['insights'] })
    expect(buf.toString()).toBe('fake-png')
    const og = (globalThis as any).__lastOg
    expect(og.cover).toBeNull()
    expect(og.title).toBe('Managing Your Lows')
    expect(og.eyebrow).toBe('Leadership · shariq.dev')
  })
})
