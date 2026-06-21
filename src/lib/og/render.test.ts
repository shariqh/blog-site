import { describe, it, expect } from 'vitest'
import { renderOg, renderOgSafe, renderBrandedCover } from './render'

// 1×1 transparent PNG, enough for the hybrid <img> path.
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function pngSize(buf: Buffer) {
  // PNG: 8-byte sig, then IHDR length(4)+type(4), then width(4)+height(4) BE.
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

const base = {
  title: 'Rewriting Our Engine with Claude Opus 4.8',
  eyebrow: 'AI · shariq.dev',
  dateLabel: 'Jun 2026',
  readingLabel: '8 min',
}

describe('renderOg', () => {
  it('renders a 1200×630 PNG for the fallback (no cover)', async () => {
    const png = await renderOg({ ...base, cover: null })
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a') // PNG magic
    expect(pngSize(png)).toEqual({ width: 1200, height: 630 })
  })

  it('renders a 1200×630 PNG for the hybrid (with cover)', async () => {
    const png = await renderOg({ ...base, cover: TINY_PNG })
    expect(pngSize(png)).toEqual({ width: 1200, height: 630 })
  })
})

describe('renderOgSafe', () => {
  // A syntactically valid data URI whose payload is not a decodable PNG image.
  // "ABC" base64-decoded = 0x00 0x10 0x83 — not PNG magic bytes, so Satori/resvg
  // cannot render it and renderOg with this cover will throw. renderOgSafe must
  // catch that and fall back to the branded (no-cover) template instead.
  const CORRUPT_PNG = 'data:image/png;base64,QUJD'

  it('falls back to a valid 1200×630 PNG when the cover bytes are corrupt/undecodable', async () => {
    const png = await renderOgSafe({ ...base, cover: CORRUPT_PNG })
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a') // PNG magic
    expect(pngSize(png)).toEqual({ width: 1200, height: 630 })
  })

  it('returns the normal render when the cover is valid', async () => {
    const png = await renderOgSafe({ ...base, cover: TINY_PNG })
    expect(pngSize(png)).toEqual({ width: 1200, height: 630 })
  })

  it('returns the branded fallback when cover is null', async () => {
    const png = await renderOgSafe({ ...base, cover: null })
    expect(pngSize(png)).toEqual({ width: 1200, height: 630 })
  })
})

describe('renderBrandedCover', () => {
  it('renders a valid PNG at 1536×1024 with no title text', async () => {
    const png = await renderBrandedCover()
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a') // PNG magic
    expect(pngSize(png)).toEqual({ width: 1536, height: 1024 })
  })
})
