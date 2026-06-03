// scripts/agent/lib/editorial.ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

export function loadEditorialGuide(): string {
  return readFileSync(join(REPO_ROOT, 'docs', 'EDITORIAL.md'), 'utf8')
}

export function loadShortsStyleGuide(): string {
  return readFileSync(join(REPO_ROOT, 'docs', 'SHORTS-STYLE.md'), 'utf8')
}
