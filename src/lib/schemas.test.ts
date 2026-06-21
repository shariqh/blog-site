import { describe, it, expect } from 'vitest'
import { writingSchema } from './schemas'

const base = { title: 'T', date: '2024-01-01', summary: 's' }

describe('writingSchema canonical guard', () => {
  it('accepts an https canonical on an allowed host', () => {
    const r = writingSchema.safeParse({
      ...base,
      canonical: 'https://www.bundleapps.io/blog/x',
    })
    expect(r.success).toBe(true)
  })

  it('rejects a canonical on a non-allowed host (SEO-poisoning vector)', () => {
    const r = writingSchema.safeParse({ ...base, canonical: 'https://evil.example.com/x' })
    expect(r.success).toBe(false)
  })

  it('rejects a non-https scheme', () => {
    const r = writingSchema.safeParse({ ...base, canonical: 'http://www.bundleapps.io/x' })
    expect(r.success).toBe(false)
  })

  it('allows omitting canonical (original content stays self-canonical)', () => {
    const r = writingSchema.safeParse(base)
    expect(r.success).toBe(true)
  })
})

describe('writingSchema hero.style', () => {
  it('accepts a hero.style of line-art or conceptual', () => {
    const base = { title: 'T', date: '2026-01-01', summary: 's' }
    expect(
      writingSchema.safeParse({ ...base, hero: { image: '/static/images/x.png', alt: 'a', style: 'line-art' } })
        .success
    ).toBe(true)
    expect(
      writingSchema.safeParse({ ...base, hero: { image: '/static/images/x.png', alt: 'a', style: 'bogus' } }).success
    ).toBe(false)
  })
})
