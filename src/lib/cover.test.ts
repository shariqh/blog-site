import { describe, it, expect } from 'vitest'
import { resolveCover } from './cover'

describe('resolveCover', () => {
  it('uses hero.image when it is a valid /static/images path', () => {
    const r = resolveCover({ hero: { image: '/static/images/blog/x/cover.png', alt: 'X' }, tags: ['ai'] })
    expect(r).toEqual({ kind: 'image', src: '/static/images/blog/x/cover.png', alt: 'X' })
  })
  it('falls back to a bucket placeholder when no image', () => {
    expect(resolveCover({ tags: ['docker'] })).toEqual({ kind: 'placeholder', bucket: 'engineering' })
  })
  it('placeholder bucket is "notes" when tags do not match', () => {
    expect(resolveCover({ tags: ['unmapped'] })).toEqual({ kind: 'placeholder', bucket: 'notes' })
  })
  it('empty alt defaults to empty string', () => {
    const r = resolveCover({ hero: { image: '/static/images/blog/x/cover.png' }, tags: [] })
    expect(r).toEqual({ kind: 'image', src: '/static/images/blog/x/cover.png', alt: '' })
  })
  it('rejects an absolute https hero.image → placeholder', () => {
    expect(resolveCover({ hero: { image: 'https://evil.example.com/x.png' }, tags: ['docker'] }))
      .toEqual({ kind: 'placeholder', bucket: 'engineering' })
  })
  it('rejects a protocol-relative hero.image → placeholder', () => {
    expect(resolveCover({ hero: { image: '//evil.example.com/x.png' }, tags: ['ai'] }))
      .toEqual({ kind: 'placeholder', bucket: 'ai' })
  })
  it('rejects a data: URI hero.image → placeholder', () => {
    expect(resolveCover({ hero: { image: 'data:image/png;base64,AAAA' }, tags: [] }))
      .toEqual({ kind: 'placeholder', bucket: 'notes' })
  })
  it('rejects a same-origin path outside /static/images/ → placeholder', () => {
    expect(resolveCover({ hero: { image: '/admin/secret.png' }, tags: ['docker'] }))
      .toEqual({ kind: 'placeholder', bucket: 'engineering' })
  })
  it('rejects a traversal path that normalizes out of /static/ → placeholder', () => {
    expect(resolveCover({ hero: { image: '/static/../admin/secret.png' }, tags: ['ai'] }))
      .toEqual({ kind: 'placeholder', bucket: 'ai' })
  })
  it('rejects a /static/images path without a raster image extension → placeholder', () => {
    expect(resolveCover({ hero: { image: '/static/images/blog/x/cover.txt' }, tags: [] }))
      .toEqual({ kind: 'placeholder', bucket: 'notes' })
  })
  it('rejects a percent-encoded traversal under /static/images → placeholder', () => {
    expect(resolveCover({ hero: { image: '/static/images/%2e%2e/admin/secret.png' }, tags: ['ai'] }))
      .toEqual({ kind: 'placeholder', bucket: 'ai' })
  })
  it('rejects any percent-encoding in the path → placeholder', () => {
    expect(resolveCover({ hero: { image: '/static/images/blog/a%2fb/cover.png' }, tags: [] }))
      .toEqual({ kind: 'placeholder', bucket: 'notes' })
  })
})
