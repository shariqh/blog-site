// scripts/agent/tests/migrate.test.ts
import { describe, it, expect } from 'vitest'
import { mapCmsRowToContentRows, statusToStage, mediumToKind } from '../lib/migrate-mapping'
import type { CmsRow } from '../lib/types'

const baseRow: CmsRow = {
  id: 'orig-page-1',
  title: 'Sample',
  status: 'Prepping',
  medium: ['blog'],
  origin: 'OC',
  tags: ['ai'],
  keywords: '',
  sources: '',
}

describe('statusToStage', () => {
  it('maps each legacy status', () => {
    expect(statusToStage('Prepping')).toBe('Idea')
    expect(statusToStage('Ready To Record')).toBe('Ready')
    expect(statusToStage('Recording')).toBe('Recorded')
    expect(statusToStage('Post-Processing')).toBe('Edited')
    expect(statusToStage('Published')).toBe('Published')
    expect(statusToStage('✅')).toBe('Published')
    expect(statusToStage('Abandoned')).toBe('Abandoned')
    expect(statusToStage(undefined)).toBe('Idea')
  })
})

describe('mediumToKind', () => {
  it('maps youtube to YT short by default', () => {
    expect(mediumToKind('youtube')).toBe('YT short')
  })
  it('preserves explicit kinds', () => {
    expect(mediumToKind('YT short')).toBe('YT short')
    expect(mediumToKind('blog')).toBe('blog')
    expect(mediumToKind('podcast')).toBe('podcast')
  })
})

describe('mapCmsRowToContentRows', () => {
  it('produces one row when medium has a single entry', () => {
    const out = mapCmsRowToContentRows(baseRow)
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('blog')
    expect(out[0].stage).toBe('Idea')
    expect(out[0].origin).toBe('OC')
    expect(out[0].sourceRowOriginalPageId).toBeUndefined() // first piece keeps original ID
  })

  it('splits multi-medium rows into one row per kind, linking subsequents to first via sourceRowOriginalPageId', () => {
    const row: CmsRow = { ...baseRow, medium: ['blog', 'YT short'] }
    const out = mapCmsRowToContentRows(row)
    expect(out).toHaveLength(2)
    expect(out[0].kind).toBe('blog')
    expect(out[0].origin).toBe('OC')
    expect(out[0].crossPostTargets).toEqual(['YT short'])
    expect(out[1].kind).toBe('YT short')
    expect(out[1].origin).toBe('Derivative')
    expect(out[1].sourceRowOriginalPageId).toBe('orig-page-1')
  })

  it('maps x-post:bundle origin to OC + populates Cross-post Targets from other media', () => {
    const row: CmsRow = { ...baseRow, origin: 'x-post:bundle', medium: ['blog', 'YT short'] }
    const out = mapCmsRowToContentRows(row)
    expect(out[0].origin).toBe('OC')
    expect(out[0].crossPostTargets).toEqual(['YT short'])
  })

  it('maps x-post:blog origin to Derivative', () => {
    const row: CmsRow = { ...baseRow, origin: 'x-post:blog' }
    const out = mapCmsRowToContentRows(row)
    expect(out[0].origin).toBe('Derivative')
  })

  it('appends Keywords to Hint when both present', () => {
    const row: CmsRow = { ...baseRow, keywords: 'tdd, claude' }
    expect(mapCmsRowToContentRows(row)[0].hint).toContain('tdd, claude')
  })

  it('splits Source(s) on commas and newlines', () => {
    const row: CmsRow = { ...baseRow, sources: 'https://a.com,\nhttps://b.com' }
    expect(mapCmsRowToContentRows(row)[0].sourceUrls).toEqual(['https://a.com', 'https://b.com'])
  })

  it('carries Published Link through to Published URL', () => {
    const row: CmsRow = { ...baseRow, publishedLink: 'https://example.com' }
    expect(mapCmsRowToContentRows(row)[0].publishedUrl).toBe('https://example.com')
  })
})
