import { describe, it, expect } from 'vitest'
import { loadOgFonts } from './fonts'

describe('loadOgFonts', () => {
  it('returns the five expected font cuts as non-empty buffers', () => {
    const fonts = loadOgFonts()
    expect(fonts).toHaveLength(5)
    for (const f of fonts) {
      expect(Buffer.isBuffer(f.data)).toBe(true)
      expect(f.data.length).toBeGreaterThan(10000)
      expect(f.style).toBe('normal')
    }
  })

  it('registers Fraunces 400/600, Inter 400/500, JetBrains Mono 500', () => {
    const fonts = loadOgFonts()
    const sig = fonts.map((f) => `${f.name}:${f.weight}`).sort()
    expect(sig).toEqual([
      'Fraunces:400',
      'Fraunces:600',
      'Inter:400',
      'Inter:500',
      'JetBrains Mono:500',
    ])
  })
})
