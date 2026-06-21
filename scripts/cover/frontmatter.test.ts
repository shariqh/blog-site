import { describe, it, expect } from 'vitest'
import matter from 'gray-matter'
import { setHero } from './frontmatter'

const MDX = `---
title: "A Post"
date: '2026-06-08'
tags: ['ai']
summary: "A summary."
draft: false
---

# Body here

Some prose.
`

describe('setHero', () => {
  it('adds a hero block with image/alt/prompt/style and preserves body + other fields', () => {
    const out = setHero(MDX, {
      image: '/static/images/blog/a-post/cover.png',
      alt: 'Cover for A Post',
      prompt: 'a prompt',
      style: 'line-art',
    })
    const parsed = matter(out)
    expect(parsed.data.hero).toEqual({
      image: '/static/images/blog/a-post/cover.png',
      alt: 'Cover for A Post',
      prompt: 'a prompt',
      style: 'line-art',
    })
    expect(parsed.data.title).toBe('A Post')
    expect(parsed.data.tags).toEqual(['ai'])
    expect(parsed.content).toContain('# Body here')
  })

  it('replaces an existing hero rather than duplicating it', () => {
    const withHero = setHero(MDX, { image: '/static/images/blog/a/old.png', alt: 'old', prompt: 'p', style: 'conceptual' })
    const replaced = setHero(withHero, { image: '/static/images/blog/a/new.png', alt: 'new', prompt: 'p2', style: 'line-art' })
    const parsed = matter(replaced)
    expect(parsed.data.hero.image).toBe('/static/images/blog/a/new.png')
    expect(parsed.data.hero.style).toBe('line-art')
  })
})
