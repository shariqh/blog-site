// scripts/agent/tests/promote.test.ts
import { describe, it, expect } from 'vitest'
import { selectRowsNeedingPromotion, buildDerivativeRowInput } from '../lib/promote'
import type { ContentRow } from '../lib/types'

const baseRow: ContentRow = {
  id: 'row-1',
  title: 'A short',
  kind: 'YT short',
  stage: 'Published',
  origin: 'OC',
  crossPostTargets: ['blog'],
  tags: ['ai'],
  tools: ['claude-code'],
  hint: '',
  sourceUrls: [],
  publishedUrl: 'https://youtu.be/abc12345678',
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-02T00:00:00Z',
}

describe('selectRowsNeedingPromotion', () => {
  it('selects published YT rows with blog target and no existing derivative', () => {
    const out = selectRowsNeedingPromotion([baseRow], [])
    expect(out).toHaveLength(1)
  })

  it('skips rows without blog target', () => {
    const r = { ...baseRow, crossPostTargets: [] }
    expect(selectRowsNeedingPromotion([r], [])).toHaveLength(0)
  })

  it('skips rows that already have a derivative', () => {
    const derivative: ContentRow = {
      ...baseRow,
      id: 'row-2',
      kind: 'blog',
      origin: 'Derivative',
      sourceRowId: 'row-1',
    }
    expect(selectRowsNeedingPromotion([baseRow], [derivative])).toHaveLength(0)
  })

  it('skips non-published YT rows', () => {
    const r = { ...baseRow, stage: 'Drafted' as const }
    expect(selectRowsNeedingPromotion([r], [])).toHaveLength(0)
  })

  it('skips non-YT rows even if they have blog target', () => {
    const r = { ...baseRow, kind: 'blog' as const }
    expect(selectRowsNeedingPromotion([r], [])).toHaveLength(0)
  })
})

describe('buildDerivativeRowInput', () => {
  it('mints a blog derivative carrying tags, tools, and YT URL forward', () => {
    const out = buildDerivativeRowInput(baseRow)
    expect(out.kind).toBe('blog')
    expect(out.stage).toBe('Proposed')
    expect(out.origin).toBe('Derivative')
    expect(out.sourceRowId).toBe('row-1')
    expect(out.tags).toEqual(['ai'])
    expect(out.tools).toEqual(['claude-code'])
    expect(out.sourceUrls).toContain('https://youtu.be/abc12345678')
    expect(out.hint).toContain('Blog-length treatment')
  })
})
