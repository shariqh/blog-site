// scripts/agent/lib/diff-filter.ts
// Pure helpers for turning a commit's file list into a prompt-sized, noise-free
// diff block. No I/O — unit-tested in isolation.

import type { CommitInfo } from './types'

// Files whose diffs add no editorial signal. Add a pattern here to exclude more.
export const NOISE_PATTERNS: RegExp[] = [
  // lockfiles
  /(^|\/)package-lock\.json$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)bun\.lockb$/,
  /(^|\/)Cargo\.lock$/,
  /(^|\/)poetry\.lock$/,
  /(^|\/)Pipfile\.lock$/,
  /(^|\/)composer\.lock$/,
  /(^|\/)Gemfile\.lock$/,
  /(^|\/)go\.sum$/,
  /(^|\/)flake\.lock$/,
  // generated / build output
  /(^|\/)(dist|build|out|coverage|node_modules|vendor)\//,
  /(^|\/)\.next\//,
  /(^|\/)\.astro\//,
  // minified & sourcemaps
  /\.min\.(js|css)$/,
  /\.map$/,
  // test snapshots
  /(^|\/)__snapshots__\//,
  /\.snap$/,
  // binary / media
  /\.(png|jpe?g|gif|webp|ico|svg|pdf|woff2?|ttf|eot|mp4|mov|zip|gz|tgz)$/i,
]

export function isNoiseFile(filename: string): boolean {
  return NOISE_PATTERNS.some((re) => re.test(filename))
}

// Caps keep one large refactor from blowing the prompt. Tunable.
const MAX_PATCH_LINES = 150
const MAX_DIFF_BYTES = 16_000

export interface DiffBlockOptions {
  maxPatchLines?: number
  maxDiffBytes?: number
}

export function truncatePatch(
  patch: string,
  maxLines: number
): { text: string; truncated: number } {
  const lines = patch.split('\n')
  if (lines.length <= maxLines) return { text: patch, truncated: 0 }
  return { text: lines.slice(0, maxLines).join('\n'), truncated: lines.length - maxLines }
}

/**
 * Render one commit's reviewable diff as a prompt fragment: a labelled, fenced
 * `diff` block of signal files only, with noise/over-budget omissions stated
 * explicitly (never silently hidden).
 */
export function buildDiffBlock(commit: CommitInfo, opts: DiffBlockOptions = {}): string {
  const maxPatchLines = opts.maxPatchLines ?? MAX_PATCH_LINES
  const maxDiffBytes = opts.maxDiffBytes ?? MAX_DIFF_BYTES
  const subject = commit.message.split('\n')[0]
  const header = `### ${commit.repo}@${commit.sha.slice(0, 7)} — ${subject}`

  const noiseCount = commit.files.filter((f) => isNoiseFile(f.filename)).length
  const signal = commit.files.filter((f) => !isNoiseFile(f.filename))
  const noiseNote = noiseCount > 0 ? `_${noiseCount} lockfile/generated change(s) omitted_` : ''

  if (signal.length === 0) {
    return `${header}\n${noiseNote || '_no reviewable changes_'}`
  }

  const parts: string[] = []
  let bytes = 0
  let included = 0
  for (const f of signal) {
    const label = `# ${f.filename} (${f.status}, +${f.additions} -${f.deletions})`
    let body: string
    if (!f.patch) {
      body = `${label}\n(binary or no inline diff)`
    } else {
      const { text, truncated } = truncatePatch(f.patch, maxPatchLines)
      body = `${label}\n${text}${truncated ? `\n… (${truncated} more lines truncated)` : ''}`
    }
    // Always include at least one file, then stop once the budget is exceeded.
    if (included > 0 && bytes + body.length > maxDiffBytes) break
    parts.push(body)
    bytes += body.length
    included++
  }

  const filesOmitted = signal.length - included
  const omittedNote =
    filesOmitted > 0 ? `\n… (${filesOmitted} more file(s) omitted for length)` : ''

  const lines = [header]
  if (noiseNote) lines.push(noiseNote)
  lines.push('```diff', parts.join('\n'), '```')
  return lines.join('\n') + omittedNote
}
