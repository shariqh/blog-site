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
  it('sanitizes newlines and control chars in title and summary, caps length', () => {
    const dirtyTitle = 'My Title\nWith\r\nNewlines\x00And\x1fControls'
    const longSummary = 'x'.repeat(5000)
    const { prompt, style } = buildCoverPrompt({
      title: dirtyTitle,
      summary: longSummary,
      tags: ['ai'],
    })
    // Concept: line must be a single line (no embedded newlines)
    const conceptLine = prompt.split('\n').find((l) => l.startsWith('Concept:'))
    expect(conceptLine).toBeDefined()
    expect(conceptLine).not.toMatch(/\n|\r/)
    // Title portion is cleaned and shorter than original
    expect(conceptLine).toContain('My Title')
    // Summary is capped at 400 chars
    const afterConcept = conceptLine!.replace(/^Concept:.*?\. /, '')
    expect(afterConcept.length).toBeLessThanOrEqual(400)
    // Style still resolved correctly
    expect(style).toBe('line-art')
  })
})
