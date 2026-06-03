// scripts/agent/tests/dedupe.test.ts
import { describe, it, expect } from 'vitest'
import { isTitleDuplicate, hasFullToolsOverlap } from '../lib/dedupe'

describe('isTitleDuplicate', () => {
  it('treats identical titles as duplicates', () => {
    expect(isTitleDuplicate('Claude Code agents in CI', ['Claude Code agents in CI'])).toBe(true)
  })

  it('treats titles differing only by case as duplicates', () => {
    expect(isTitleDuplicate('claude code agents in ci', ['Claude Code agents in CI'])).toBe(true)
  })

  it('treats near-identical titles (>80% similar) as duplicates', () => {
    expect(isTitleDuplicate('Claude Code agents in CI/CD', ['Claude Code agents in CI'])).toBe(true)
  })

  it('does not flag unrelated titles', () => {
    expect(isTitleDuplicate('A totally different post', ['Claude Code agents in CI'])).toBe(false)
  })

  it('returns false for empty existing list', () => {
    expect(isTitleDuplicate('Anything', [])).toBe(false)
  })
})

describe('hasFullToolsOverlap', () => {
  it('returns true when all proposed tools are covered', () => {
    expect(hasFullToolsOverlap(['claude-code'], [['claude-code', 'cursor']])).toBe(true)
  })

  it('returns true when proposed tools are subset of any one row', () => {
    expect(
      hasFullToolsOverlap(['claude-code', 'cursor'], [['claude-code', 'cursor', 'gemini']])
    ).toBe(true)
  })

  it('returns false when proposed tools partially covered across multiple rows', () => {
    expect(hasFullToolsOverlap(['claude-code', 'cursor'], [['claude-code'], ['cursor']])).toBe(
      false
    )
  })

  it('returns false for empty proposed tools', () => {
    expect(hasFullToolsOverlap([], [['claude-code']])).toBe(false)
  })
})
