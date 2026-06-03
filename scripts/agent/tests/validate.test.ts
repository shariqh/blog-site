import { describe, it, expect } from 'vitest'
import { validateMdxFrontmatter } from '../lib/validate'

describe('validateMdxFrontmatter', () => {
  it('passes a valid post', () => {
    const mdx = `---
title: A test post
date: 2026-06-01
tags: ['ai', 'engineering']
summary: A short summary under 280 chars.
---

Body goes here.
`
    const result = validateMdxFrontmatter(mdx)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.title).toBe('A test post')
      expect(result.data.tags).toEqual(['ai', 'engineering'])
    }
  })

  it('fails when summary too long', () => {
    const mdx = `---
title: x
date: 2026-06-01
summary: ${'a'.repeat(300)}
---
body`
    const result = validateMdxFrontmatter(mdx)
    expect(result.ok).toBe(false)
  })

  it('fails when title missing', () => {
    const mdx = `---
date: 2026-06-01
summary: hi
---
body`
    expect(validateMdxFrontmatter(mdx).ok).toBe(false)
  })

  it('fails when date is unparseable', () => {
    const mdx = `---
title: x
date: not-a-date
summary: hi
---
body`
    expect(validateMdxFrontmatter(mdx).ok).toBe(false)
  })
})
