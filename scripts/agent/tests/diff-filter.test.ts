import { describe, it, expect } from 'vitest'
import { isNoiseFile } from '../lib/diff-filter'
import { truncatePatch, buildDiffBlock } from '../lib/diff-filter'
import type { CommitInfo } from '../lib/types'

describe('isNoiseFile', () => {
  it.each([
    'package-lock.json',
    'apps/web/pnpm-lock.yaml',
    'go.sum',
    'dist/index.js',
    'src/.next/build-manifest.json',
    'app/styles.min.css',
    'bundle.js.map',
    'src/__snapshots__/foo.snap',
    'public/logo.png',
    'assets/font.woff2',
  ])('treats %s as noise', (f) => {
    expect(isNoiseFile(f)).toBe(true)
  })

  it.each(['src/log.ts', 'src/pages/index.astro', 'README.md', 'lib/auth.ts', 'styles/global.css'])(
    'treats %s as signal',
    (f) => {
      expect(isNoiseFile(f)).toBe(false)
    }
  )
})

function commit(files: CommitInfo['files']): CommitInfo {
  return {
    repo: 'shariqh/lognote',
    sha: 'abcdef1234567890',
    message: 'feat: thing\n\nbody',
    date: '2026-06-01T00:00:00Z',
    files,
    filesChanged: files.map((f) => f.filename),
    url: 'https://github.com/shariqh/lognote/commit/abcdef1',
  }
}

describe('truncatePatch', () => {
  it('returns patch unchanged when under the line cap', () => {
    const { text, truncated } = truncatePatch('a\nb\nc', 10)
    expect(text).toBe('a\nb\nc')
    expect(truncated).toBe(0)
  })

  it('truncates and reports dropped line count', () => {
    const { text, truncated } = truncatePatch('a\nb\nc\nd\ne', 2)
    expect(text).toBe('a\nb')
    expect(truncated).toBe(3)
  })

  it('does not truncate when the line count equals the cap', () => {
    const { text, truncated } = truncatePatch('a\nb\nc', 3)
    expect(text).toBe('a\nb\nc')
    expect(truncated).toBe(0)
  })
})

describe('buildDiffBlock', () => {
  it('renders a fenced diff with the commit subject', () => {
    const block = buildDiffBlock(
      commit([
        {
          filename: 'src/log.ts',
          status: 'modified',
          additions: 2,
          deletions: 1,
          patch: '@@ x @@\n+a\n-b',
        },
      ])
    )
    expect(block).toContain('shariqh/lognote@abcdef1')
    expect(block).toContain('feat: thing')
    expect(block).toContain('```diff')
    expect(block).toContain('+a')
    expect(block).toContain('src/log.ts')
  })

  it('omits noise files but counts them', () => {
    const block = buildDiffBlock(
      commit([
        {
          filename: 'src/log.ts',
          status: 'modified',
          additions: 1,
          deletions: 0,
          patch: '@@ @@\n+a',
        },
        {
          filename: 'package-lock.json',
          status: 'modified',
          additions: 999,
          deletions: 0,
          patch: '@@ @@\n+noise',
        },
      ])
    )
    expect(block).toContain('1 lockfile/generated')
    expect(block).not.toContain('+noise')
    expect(block.indexOf('lockfile/generated')).toBeLessThan(block.indexOf('```diff'))
  })

  it('shows no fence when every file is noise', () => {
    const block = buildDiffBlock(
      commit([
        {
          filename: 'package-lock.json',
          status: 'modified',
          additions: 9,
          deletions: 0,
          patch: '@@ @@\n+x',
        },
      ])
    )
    expect(block).not.toContain('```diff')
    expect(block).toContain('1 lockfile/generated')
  })

  it('truncates an oversized per-file patch', () => {
    const big = Array.from({ length: 50 }, (_, i) => `+line${i}`).join('\n')
    const block = buildDiffBlock(
      commit([
        { filename: 'src/big.ts', status: 'modified', additions: 50, deletions: 0, patch: big },
      ]),
      { maxPatchLines: 5 }
    )
    expect(block).toContain('more lines truncated')
    expect(block).not.toContain('+line49')
  })

  it('drops trailing files past the byte budget with a note', () => {
    const body = 'x'.repeat(200)
    const block = buildDiffBlock(
      commit([
        { filename: 'a.ts', status: 'modified', additions: 1, deletions: 0, patch: body },
        { filename: 'b.ts', status: 'modified', additions: 1, deletions: 0, patch: body },
        { filename: 'c.ts', status: 'modified', additions: 1, deletions: 0, patch: body },
      ]),
      { maxDiffBytes: 250 }
    )
    expect(block).toContain('a.ts')
    expect(block).toContain('more file(s) omitted')
  })

  it('lists a binary file without a diff body', () => {
    const block = buildDiffBlock(
      commit([{ filename: 'src/data.bin', status: 'added', additions: 0, deletions: 0 }])
    )
    expect(block).toContain('src/data.bin')
    expect(block).toContain('binary or no inline diff')
  })

  it('reports no reviewable changes for an empty commit', () => {
    const block = buildDiffBlock(commit([]))
    expect(block).toContain('shariqh/lognote@abcdef1')
    expect(block).toContain('no reviewable changes')
    expect(block).not.toContain('```diff')
  })
})
