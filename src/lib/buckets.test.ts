import { describe, it, expect } from 'vitest'
import { resolveBucket, BUCKETS } from './buckets'

describe('resolveBucket', () => {
  it("returns 'leadership' for leadership-family tags", () => {
    expect(resolveBucket(['leadership']).key).toBe('leadership')
    expect(resolveBucket(['management', 'teams']).key).toBe('leadership')
    expect(resolveBucket(['insights']).key).toBe('leadership')
  })

  it("returns 'engineering' for engineering-family tags", () => {
    expect(resolveBucket(['nextjs']).key).toBe('engineering')
    expect(resolveBucket(['docker', 'cloud']).key).toBe('engineering')
  })

  it("returns 'ai' for ai-family tags", () => {
    expect(resolveBucket(['claude']).key).toBe('ai')
    expect(resolveBucket(['mcp', 'agents']).key).toBe('ai')
  })

  it("returns 'process' for process-family tags", () => {
    expect(resolveBucket(['workflow']).key).toBe('process')
    expect(resolveBucket(['how-to']).key).toBe('process')
  })

  it("falls back to 'notes' for unrecognized tags", () => {
    expect(resolveBucket(['random-thing']).key).toBe('notes')
    expect(resolveBucket([]).key).toBe('notes')
  })

  it('first matching tag wins', () => {
    // 'foobar' is unknown, 'docker' is engineering -> engineering wins (not notes)
    expect(resolveBucket(['foobar', 'docker']).key).toBe('engineering')
  })

  it('exposes labels', () => {
    expect(BUCKETS.leadership.label).toBe('Leadership')
    expect(BUCKETS.ai.label).toBe('AI')
  })
})
