import { describe, it, expect } from 'vitest'
import { parseCliArgs } from './cli'

describe('parseCliArgs', () => {
  it('reads the slug positionally', () => {
    expect(parseCliArgs(['my-post'])).toEqual({ slug: 'my-post', style: undefined, force: false })
  })
  it('reads --style and --force', () => {
    expect(parseCliArgs(['my-post', '--style', 'conceptual', '--force'])).toEqual({
      slug: 'my-post',
      style: 'conceptual',
      force: true,
    })
  })
  it('rejects an invalid --style', () => {
    expect(() => parseCliArgs(['p', '--style', 'bogus'])).toThrow(/style/)
  })
  it('throws when no slug is given', () => {
    expect(() => parseCliArgs(['--force'])).toThrow(/slug/)
  })
})
