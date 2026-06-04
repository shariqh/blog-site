import { describe, it, expect } from 'vitest'
import { isNoiseFile } from '../lib/diff-filter'

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
