import { describe, it, expect } from 'vitest'
import { buildOgData, loadCoverDataUri } from './data'

function fakePost(over: { body?: string; [k: string]: unknown } = {}) {
  const { body, ...dataOver } = over
  return {
    id: 'x.mdx',
    body: body ?? 'word '.repeat(400),
    data: {
      title: 'Rewriting Our Engine',
      summary: 'A summary.',
      tags: ['ai'],
      date: new Date('2026-06-08T00:00:00Z'),
      ...dataOver,
    },
  } as any
}

describe('buildOgData', () => {
  it('derives eyebrow from the resolved bucket + site', () => {
    expect(buildOgData(fakePost()).eyebrow).toBe('AI · shariq.dev')
  })
  it('formats the date as "Mon YYYY"', () => {
    expect(buildOgData(fakePost()).dateLabel).toBe('Jun 2026')
  })
  it('formats reading time as "<n> min"', () => {
    expect(buildOgData(fakePost()).readingLabel).toMatch(/^\d+ min$/)
  })
  it('clamps a very short post to "1 min"', () => {
    expect(buildOgData(fakePost({ body: 'hello world' })).readingLabel).toBe('1 min')
  })
  it('cover is null when there is no hero', () => {
    expect(buildOgData(fakePost()).cover).toBeNull()
  })
})

describe('loadCoverDataUri', () => {
  it('returns null for undefined', () => {
    expect(loadCoverDataUri(undefined)).toBeNull()
  })
  it('returns null for an off-origin/invalid path (rejected by safeLocalImage)', () => {
    expect(loadCoverDataUri('https://evil.example.com/x.png')).toBeNull()
  })
  it('returns null when the validated file does not exist on disk', () => {
    expect(loadCoverDataUri('/static/images/blog/__missing__/cover.png')).toBeNull()
  })
})
