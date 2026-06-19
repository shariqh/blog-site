import { describe, it, expect } from 'vitest'
import { pickFeatured } from './featured'

const p = (id: string, date: string, draft = false) => ({
  id,
  data: { date: new Date(date), draft },
})

describe('pickFeatured', () => {
  it('returns the latest non-draft post', () => {
    const posts = [p('a', '2023-01-01'), p('b', '2024-05-01'), p('c', '2022-01-01')]
    expect(pickFeatured(posts)?.id).toBe('b')
  })
  it('skips drafts', () => {
    const posts = [p('a', '2024-09-01', true), p('b', '2024-05-01')]
    expect(pickFeatured(posts)?.id).toBe('b')
  })
  it('returns undefined for empty input', () => {
    expect(pickFeatured([])).toBeUndefined()
  })
})
