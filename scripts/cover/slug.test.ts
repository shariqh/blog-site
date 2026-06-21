import { describe, it, expect } from 'vitest'
import { assertSafeSlug } from './slug'

describe('assertSafeSlug', () => {
  // Valid cases
  it('passes a simple flat slug', () => {
    expect(assertSafeSlug('my-post')).toBe('my-post')
  })
  it('passes a slug with underscores and digits', () => {
    expect(assertSafeSlug('post_123')).toBe('post_123')
  })
  it('passes a nested slug', () => {
    expect(assertSafeSlug('docker-series/pt-1-installing-docker-and-docker-compose')).toBe(
      'docker-series/pt-1-installing-docker-and-docker-compose'
    )
  })
  it('passes a simple nested slug', () => {
    expect(assertSafeSlug('series/pt-1')).toBe('series/pt-1')
  })
  it('passes a single-char segment slug', () => {
    expect(assertSafeSlug('a')).toBe('a')
  })

  // Malicious / invalid cases
  it('throws on empty string', () => {
    expect(() => assertSafeSlug('')).toThrow()
  })
  it('throws on path traversal ../../x', () => {
    expect(() => assertSafeSlug('../../x')).toThrow(/traversal|Invalid/)
  })
  it('throws on absolute path /etc/x', () => {
    expect(() => assertSafeSlug('/etc/x')).toThrow()
  })
  it('throws on a/../b (traversal via segment)', () => {
    expect(() => assertSafeSlug('a/../b')).toThrow(/traversal|Invalid/)
  })
  it('throws on double slash a//b', () => {
    expect(() => assertSafeSlug('a//b')).toThrow(/empty segment|Invalid/)
  })
  it('throws on backslash', () => {
    expect(() => assertSafeSlug('a\\b')).toThrow(/backslash|Invalid/)
  })
  it('throws on dot-only segment (.)', () => {
    expect(() => assertSafeSlug('a/./b')).toThrow(/traversal|Invalid/)
  })
  it('throws on segment starting with uppercase', () => {
    expect(() => assertSafeSlug('My-Post')).toThrow(/Invalid/)
  })
  it('throws on segment with special chars', () => {
    expect(() => assertSafeSlug('a/b@c')).toThrow(/Invalid/)
  })
  it('throws on trailing slash', () => {
    expect(() => assertSafeSlug('a/')).toThrow(/empty segment|Invalid/)
  })
})
