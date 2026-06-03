// scripts/agent/lib/dedupe.ts

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[m][n]
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Returns true if `candidate` is within 20% normalized edit distance of any
 * title in `existing`. Used to skip re-proposing similar candidates.
 */
export function isTitleDuplicate(candidate: string, existing: string[]): boolean {
  if (existing.length === 0) return false
  const cand = normalize(candidate)
  for (const ex of existing) {
    const a = cand
    const b = normalize(ex)
    const maxLen = Math.max(a.length, b.length)
    if (maxLen === 0) continue
    const ratio = levenshtein(a, b) / maxLen
    if (ratio <= 0.2) return true
  }
  return false
}

/**
 * Returns true if every tool in `proposed` is contained in at least one row's
 * tool list in `existingRows`. (One row must cover the whole proposed set.)
 */
export function hasFullToolsOverlap(proposed: string[], existingRows: string[][]): boolean {
  if (proposed.length === 0) return false
  const propSet = new Set(proposed.map((t) => t.toLowerCase()))
  for (const row of existingRows) {
    const rowSet = new Set(row.map((t) => t.toLowerCase()))
    let allIn = true
    for (const t of propSet) {
      if (!rowSet.has(t)) {
        allIn = false
        break
      }
    }
    if (allIn) return true
  }
  return false
}
