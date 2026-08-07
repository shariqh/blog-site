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
    const { style } = buildCoverPrompt({
      title: 'A CI/CD Flow',
      tags: ['architecture'],
    })
    expect(style).toBe('line-art')
  })
  it('honors an explicit style override', () => {
    const { style, prompt } = buildCoverPrompt({
      title: 'X',
      tags: ['ai'],
      style: 'conceptual',
    })
    expect(style).toBe('conceptual')
    expect(prompt).toContain('conceptual editorial illustration')
  })
  it('uses the summary as visual subject matter without quoting the title', () => {
    const { prompt } = buildCoverPrompt({
      title: 'Managing Your Lows',
      summary: 'How to handle the bad days.',
      tags: ['insights'],
    })
    expect(prompt).toContain(BRAND)
    expect(prompt).toContain('How to handle the bad days.')
    expect(prompt).not.toContain('Managing Your Lows')
  })
  it('uses an explicit visual concept when supplied', () => {
    const { prompt } = buildCoverPrompt({
      title: 'Agent workflow',
      summary: 'A prose summary that should not be copied.',
      concept: 'A human architect guiding parallel paths through review gates',
      tags: ['ai'],
    })
    expect(prompt).toContain(
      'A human architect guiding parallel paths through review gates',
    )
    expect(prompt).not.toContain('A prose summary that should not be copied.')
  })
  it('forbids text rendering explicitly', () => {
    const { prompt } = buildCoverPrompt({ title: 'X', tags: [] })
    expect(prompt.toLowerCase()).toContain('readable words')
    expect(prompt.toLowerCase()).toContain('letters, numbers')
    expect(prompt.toLowerCase()).toContain('nonverbal diagrams')
  })
  it('sanitizes newlines and control chars in title and summary, caps length', () => {
    const dirtyTitle = 'My Title\nWith\r\nNewlines\x00And\x1fControls'
    const longSummary = 'x'.repeat(5000)
    const { prompt, style } = buildCoverPrompt({
      title: dirtyTitle,
      summary: longSummary,
      tags: ['ai'],
    })
    const conceptLine = prompt
      .split('\n')
      .find((l) => l.startsWith('Visual concept only'))
    expect(conceptLine).toBeDefined()
    expect(conceptLine).not.toMatch(/\n|\r/)
    expect(conceptLine).not.toContain('My Title')
    expect(conceptLine!.length).toBeLessThan(600)
    expect(style).toBe('line-art')
  })
  it('truncates long concepts at a word boundary', () => {
    const { prompt } = buildCoverPrompt({
      title: 'Title',
      concept: 'token '.repeat(80),
      tags: ['ai'],
    })
    const subject = prompt.match(/Visual concept only: (.+)\. Do not depict/)?.[1]
    expect(subject).toBeDefined()
    expect(subject!.length).toBeLessThanOrEqual(400)
    expect(subject!.endsWith('token')).toBe(true)
  })
})
