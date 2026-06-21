import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listPostFiles, slugFromPath } from './backfill'

let dir: string
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'cov-'))
  writeFileSync(join(dir, 'a.mdx'), '---\ntitle: A\n---\n')
  mkdirSync(join(dir, 'series'), { recursive: true })
  writeFileSync(join(dir, 'series', 'pt-1.mdx'), '---\ntitle: P1\n---\n')
  writeFileSync(join(dir, 'notes.txt'), 'ignore me')
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('listPostFiles', () => {
  it('finds .mdx files recursively and ignores non-mdx', () => {
    const files = listPostFiles(dir).map((f) => f.replace(dir + '/', '')).sort()
    expect(files).toEqual(['a.mdx', 'series/pt-1.mdx'])
  })
})

describe('slugFromPath', () => {
  it('keeps nested folders and drops the extension', () => {
    expect(slugFromPath(dir, join(dir, 'series', 'pt-1.mdx'))).toBe('series/pt-1')
    expect(slugFromPath(dir, join(dir, 'a.mdx'))).toBe('a')
  })
})
