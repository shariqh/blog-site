import { describe, it, expect } from 'vitest'
import { selectStyle, buildCoverPrompt, BRAND } from './prompt'

describe('selectStyle', () => {
  it('maps technical buckets to line-art', () => {
    expect(selectStyle(['engineering'])).toBe('line-art')
    expect(selectStyle(['ai'])).toBe('line-art')
    expect(selectStyle(['docker'])).toBe('line-art') // engineering bucket
  })
  it('maps human/narrative buckets to conceptual', () => {
    expect(selectStyle(['insights'])).toBe('conceptual') // leadership bucket
    expect(selectStyle(['unmapped'])).toBe('conceptual') // notes bucket
  })
})

describe('buildCoverPrompt', () => {
  it('uses the bucket default style when none is given', () => {
    const { style } = buildCoverPrompt({ title: 'A CI/CD Flow', tags: ['architecture'] })
    expect(style).toBe('line-art')
  })
  it('honors an explicit style override', () => {
    const { style, prompt } = buildCoverPrompt({ title: 'X', tags: ['ai'], style: 'conceptual' })
    expect(style).toBe('conceptual')
    expect(prompt).toContain('conceptual editorial illustration')
  })
  it('includes the brand spine, the title, and the summary in the subject', () => {
    const { prompt } = buildCoverPrompt({
      title: 'Managing Your Lows',
      summary: 'How to handle the bad days.',
      tags: ['insights'],
    })
    expect(prompt).toContain(BRAND)
    expect(prompt).toContain('Managing Your Lows')
    expect(prompt).toContain('How to handle the bad days.')
  })
  it('forbids text rendering explicitly', () => {
    const { prompt } = buildCoverPrompt({ title: 'X', tags: [] })
    expect(prompt.toLowerCase()).toContain('readable words')
    expect(prompt.toLowerCase()).toContain('no legible prose')
  })
})
