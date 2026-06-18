import { describe, it, expect } from 'vitest'
import { resolveCover } from './cover'

describe('resolveCover', () => {
  it('uses hero.image when present', () => {
    const r = resolveCover({ hero: { image: '/static/x.png', alt: 'X' }, tags: ['ai'] })
    expect(r).toEqual({ kind: 'image', src: '/static/x.png', alt: 'X' })
  })
  it('falls back to a bucket placeholder when no image', () => {
    const r = resolveCover({ tags: ['docker'] })
    expect(r).toEqual({ kind: 'placeholder', bucket: 'engineering' })
  })
  it('placeholder bucket is "notes" when tags do not match', () => {
    const r = resolveCover({ tags: ['unmapped'] })
    expect(r).toEqual({ kind: 'placeholder', bucket: 'notes' })
  })
  it('empty alt defaults to empty string', () => {
    const r = resolveCover({ hero: { image: '/static/x.png' }, tags: [] })
    expect(r).toEqual({ kind: 'image', src: '/static/x.png', alt: '' })
  })
  it('rejects a same-origin path outside /static/ → placeholder', () => {
    const r = resolveCover({ hero: { image: '/admin/secret' }, tags: ['docker'] })
    expect(r).toEqual({ kind: 'placeholder', bucket: 'engineering' })
  })
  it('rejects an absolute https hero.image (untrusted) → placeholder', () => {
    const r = resolveCover({ hero: { image: 'https://evil.example.com/x.png' }, tags: ['docker'] })
    expect(r).toEqual({ kind: 'placeholder', bucket: 'engineering' })
  })
  it('rejects a protocol-relative hero.image → placeholder', () => {
    const r = resolveCover({ hero: { image: '//evil.example.com/x.png' }, tags: ['ai'] })
    expect(r).toEqual({ kind: 'placeholder', bucket: 'ai' })
  })
  it('rejects a data: URI hero.image → placeholder', () => {
    const r = resolveCover({ hero: { image: 'data:image/png;base64,AAAA' }, tags: [] })
    expect(r).toEqual({ kind: 'placeholder', bucket: 'notes' })
  })
  it('accepts a root-relative local path', () => {
    const r = resolveCover({
      hero: { image: '/static/images/blog/x/cover.png', alt: 'C' },
      tags: [],
    })
    expect(r).toEqual({ kind: 'image', src: '/static/images/blog/x/cover.png', alt: 'C' })
  })
})
