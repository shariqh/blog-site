// scripts/agent/tests/notion.test.ts
import { describe, it, expect } from 'vitest'
import { pageToContentRow } from '../lib/notion'

const samplePage = {
  id: '2467cc75-7fe9-8052-b08e-e9327ac7fbf1',
  created_time: '2025-08-05T10:32:00.000Z',
  last_edited_time: '2025-08-12T16:36:00.000Z',
  properties: {
    Title: { type: 'title', title: [{ plain_text: 'A test row' }] },
    Kind: { type: 'select', select: { name: 'blog' } },
    Stage: { type: 'select', select: { name: 'Proposed' } },
    Origin: { type: 'select', select: { name: 'Agent Proposed' } },
    'Source Row': { type: 'relation', relation: [] },
    'Cross-post Targets': {
      type: 'multi_select',
      multi_select: [{ name: 'YT short' }],
    },
    Tags: { type: 'multi_select', multi_select: [{ name: 'ai' }, { name: 'cli' }] },
    Tools: { type: 'multi_select', multi_select: [{ name: 'claude-code' }] },
    Hint: { type: 'rich_text', rich_text: [{ plain_text: 'a one-line angle' }] },
    'Source URLs': { type: 'rich_text', rich_text: [{ plain_text: 'https://example.com' }] },
    'Draft URL': { type: 'url', url: null },
    'Published URL': { type: 'url', url: 'https://shariq.dev/blog/x' },
    Publishing: { type: 'date', date: { start: '2026-06-10' } },
  },
}

describe('pageToContentRow', () => {
  it('maps a fully-populated page to a ContentRow', () => {
    const row = pageToContentRow(samplePage as never)
    expect(row.title).toBe('A test row')
    expect(row.kind).toBe('blog')
    expect(row.stage).toBe('Proposed')
    expect(row.origin).toBe('Agent Proposed')
    expect(row.crossPostTargets).toEqual(['YT short'])
    expect(row.tags).toEqual(['ai', 'cli'])
    expect(row.tools).toEqual(['claude-code'])
    expect(row.hint).toBe('a one-line angle')
    expect(row.sourceUrls).toEqual(['https://example.com'])
    expect(row.draftUrl).toBeUndefined()
    expect(row.publishedUrl).toBe('https://shariq.dev/blog/x')
    expect(row.publishingDate).toBe('2026-06-10')
  })

  it('handles empty Source URLs as empty array', () => {
    const empty = {
      ...samplePage,
      properties: {
        ...samplePage.properties,
        'Source URLs': { type: 'rich_text', rich_text: [] },
      },
    }
    expect(pageToContentRow(empty as never).sourceUrls).toEqual([])
  })

  it('splits comma-or-newline-separated Source URLs', () => {
    const multi = {
      ...samplePage,
      properties: {
        ...samplePage.properties,
        'Source URLs': {
          type: 'rich_text',
          rich_text: [{ plain_text: 'https://a.com\nhttps://b.com' }],
        },
      },
    }
    expect(pageToContentRow(multi as never).sourceUrls).toEqual(['https://a.com', 'https://b.com'])
  })

  it('returns sourceRowId when relation has an entry', () => {
    const withRel = {
      ...samplePage,
      properties: {
        ...samplePage.properties,
        'Source Row': { type: 'relation', relation: [{ id: 'abc123' }] },
      },
    }
    expect(pageToContentRow(withRel as never).sourceRowId).toBe('abc123')
  })
})
