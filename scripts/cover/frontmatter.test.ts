import { describe, it, expect } from 'vitest'
import matter from 'gray-matter'
import { setHero, toHeroPatch, coverInputFromFrontmatter } from './frontmatter'

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

describe('toHeroPatch', () => {
  it('maps imagePath→image and passes alt/prompt/style through', () => {
    const result = {
      imagePath: '/static/images/blog/my-post/cover.png',
      alt: 'Cover for My Post',
      prompt: 'a prompt',
      style: 'line-art' as const,
      attempts: 2,
      usedFallback: false,
    }
    expect(toHeroPatch(result)).toEqual({
      image: '/static/images/blog/my-post/cover.png',
      alt: 'Cover for My Post',
      prompt: 'a prompt',
      style: 'line-art',
    })
  })

  it('works for the conceptual style too', () => {
    const result = {
      imagePath: '/static/images/blog/other/cover.png',
      alt: 'Cover',
      prompt: 'p',
      style: 'conceptual' as const,
      attempts: 1,
      usedFallback: true,
    }
    expect(toHeroPatch(result).style).toBe('conceptual')
  })
})

describe('coverInputFromFrontmatter', () => {
  it('coerces title from data or falls back to slug', () => {
    expect(coverInputFromFrontmatter({ title: 'My Title', tags: ['ai'] }, 'my-slug').title).toBe('My Title')
    expect(coverInputFromFrontmatter({ tags: [] }, 'my-slug').title).toBe('my-slug')
  })

  it('includes summary only when it is a string', () => {
    expect(coverInputFromFrontmatter({ summary: 'A summary', tags: [] }, 's').summary).toBe('A summary')
    expect(coverInputFromFrontmatter({ summary: 42, tags: [] }, 's').summary).toBeUndefined()
    expect(coverInputFromFrontmatter({}, 's').summary).toBeUndefined()
  })

  it('returns a tags array when present or an empty array when absent/wrong type', () => {
    expect(coverInputFromFrontmatter({ tags: ['ai', 'leadership'] }, 's').tags).toEqual(['ai', 'leadership'])
    expect(coverInputFromFrontmatter({ tags: 'not-array' }, 's').tags).toEqual([])
    expect(coverInputFromFrontmatter({}, 's').tags).toEqual([])
  })
  it('filters out non-string elements from tags array', () => {
    expect(coverInputFromFrontmatter({ tags: ['ai', 42, null, 'engineering'] }, 's').tags).toEqual(['ai', 'engineering'])
  })
})
