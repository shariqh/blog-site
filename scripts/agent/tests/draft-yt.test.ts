// scripts/agent/tests/draft-yt.test.ts
import { describe, it, expect } from 'vitest'
import { buildYtSystemPrompt, buildYtUserPrompt, renderYtScriptToBlocks } from '../lib/draft-yt'
import type { YTScriptBlocks } from '../lib/types'

const sample: YTScriptBlocks = {
  hook: 'Cursor rewrote my git config.',
  script: 'Here is what happened…',
  onScreenText: [{ timestampSeconds: 2, text: 'WAIT' }],
  bRoll: [{ timestampSeconds: 5, description: 'screen recording of git config diff' }],
  thumbnailPrompt: 'Terminal with red diff, calm face',
  titleVariants: ['Cursor broke my git', 'Heads up on Cursor', 'A weird thing Cursor did'],
  hashtags: ['ai', 'cursor', 'developer', 'cli'],
}

describe('renderYtScriptToBlocks', () => {
  it('renders all 7 sections as Notion blocks', () => {
    const blocks = renderYtScriptToBlocks(sample)
    const headings = blocks.filter((b: { type?: string }) => b.type === 'heading_2')
    expect(headings).toHaveLength(7)
  })

  it('preserves timestamps in on-screen-text bullets', () => {
    const blocks = renderYtScriptToBlocks(sample)
    const serialized = JSON.stringify(blocks)
    expect(serialized).toContain('2s — WAIT')
  })
})

describe('buildYtSystemPrompt', () => {
  it('includes SHORTS-STYLE guide and tools', () => {
    const sp = buildYtSystemPrompt({
      shortsStyleMd: 'SHORTS GUIDE',
      kind: 'YT short',
      tools: ['claude-code'],
    })
    expect(sp).toContain('SHORTS GUIDE')
    expect(sp).toContain('claude-code')
  })
})

describe('buildYtUserPrompt', () => {
  it('embeds title, hint, source URLs, and YT performance signal', () => {
    const up = buildYtUserPrompt({
      title: 'A short',
      hint: 'angle',
      sourceUrls: ['https://x.com'],
      tools: ['claude-code'],
      perfSignal: 'Past videos on claude-code averaged 4k views',
    })
    expect(up).toContain('A short')
    expect(up).toContain('claude-code')
    expect(up).toContain('4k views')
  })
})
