import { describe, it, expect } from 'vitest'
import { buildBlogSystemPrompt, buildBlogUserPrompt, slugify } from '../lib/draft-blog'

describe('slugify', () => {
  it('lowercases and dashes a title', () => {
    expect(slugify('Claude Code agents in CI')).toBe('claude-code-agents-in-ci')
  })
  it('strips punctuation', () => {
    expect(slugify('Why TDD? It works.')).toBe('why-tdd-it-works')
  })
  it('collapses multiple dashes', () => {
    expect(slugify('a -- b')).toBe('a-b')
  })
})

describe('buildBlogSystemPrompt', () => {
  it('includes EDITORIAL guide and bucket map', () => {
    const sp = buildBlogSystemPrompt({ editorialMd: 'EDITORIAL CONTENT', isDerivative: false })
    expect(sp).toContain('EDITORIAL CONTENT')
    expect(sp).toContain('Leadership')
    expect(sp).toContain('Engineering')
  })

  it('adds derivative instructions when isDerivative=true', () => {
    const sp = buildBlogSystemPrompt({
      editorialMd: 'x',
      isDerivative: true,
      sourceVideoUrl: 'https://youtu.be/abc123def45',
    })
    expect(sp).toContain('<Youtube id="abc123def45" />')
  })
})

describe('buildBlogUserPrompt', () => {
  it('embeds title, hint, source URLs, and commit context', () => {
    const up = buildBlogUserPrompt({
      title: 'A post',
      hint: 'angle here',
      sourceUrls: ['https://x.com'],
      tags: ['ai'],
      commits: [
        {
          repo: 'shariqh/lognote',
          sha: 'abc1234567890def1234567890def1234567890',
          message: 'feat: add logging',
          date: '2026-06-01T00:00:00Z',
          files: [
            {
              filename: 'src/log.ts',
              status: 'added',
              additions: 10,
              deletions: 0,
              patch: '@@ -0,0 +1,2 @@\n+export const log = () => {}\n',
            },
          ],
          filesChanged: ['src/log.ts'],
          url: 'https://github.com/shariqh/lognote/commit/abc',
        },
      ],
    })
    expect(up).toContain('A post')
    expect(up).toContain('angle here')
    expect(up).toContain('https://x.com')
    expect(up).toContain('feat: add logging')
    expect(up).toContain('src/log.ts')
    expect(up).toContain('```diff')
    expect(up).toContain('export const log = () => {}')
  })

  it('caps the number of commits rendered as diffs and notes the overflow', () => {
    const commits = Array.from({ length: 10 }, (_, i) => ({
      repo: 'shariqh/lognote',
      sha: `${i}`.repeat(40),
      message: `feat: change ${i}`,
      date: '2026-06-01T00:00:00Z',
      files: [
        {
          filename: `src/f${i}.ts`,
          status: 'modified',
          additions: 1,
          deletions: 0,
          patch: `@@ @@\n+x${i}`,
        },
      ],
      filesChanged: [`src/f${i}.ts`],
      url: `https://github.com/shariqh/lognote/commit/${i}`,
    }))
    const up = buildBlogUserPrompt({
      title: 'A post',
      hint: '',
      sourceUrls: [],
      tags: [],
      commits,
    })
    // 10 cited, cap is 8 → 8 diff fences + a "2 more ... omitted" note.
    expect(up.match(/```diff/g)?.length).toBe(8)
    expect(up).toContain('2 more referenced commit(s) omitted from diffs for length')
  })
})
