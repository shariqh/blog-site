import matter from 'gray-matter'
import { writingSchema } from '../../../src/lib/schemas'
import { spawnSync } from 'node:child_process'

export type ValidationResult =
  | { ok: true; data: ReturnType<typeof writingSchema.parse> }
  | { ok: false; error: string }

export function validateMdxFrontmatter(mdx: string): ValidationResult {
  let parsed
  try {
    parsed = matter(mdx)
  } catch (e) {
    return { ok: false, error: `gray-matter parse failed: ${(e as Error).message}` }
  }
  const result = writingSchema.safeParse(parsed.data)
  if (!result.success) {
    return { ok: false, error: result.error.toString() }
  }
  return { ok: true, data: result.data }
}

export interface ValeFinding {
  line: number
  column: number
  rule: string
  severity: 'error' | 'warning' | 'suggestion'
  message: string
}

/**
 * Runs Vale on a single file. Returns parsed findings (empty array if clean).
 * If Vale is not installed, returns []. Failure to invoke Vale is non-fatal.
 */
export function runVale(filePath: string): ValeFinding[] {
  const proc = spawnSync('vale', ['--output=JSON', filePath], { encoding: 'utf8' })
  if (proc.error) return [] // Vale not installed
  if (!proc.stdout) return []
  let json: Record<
    string,
    Array<{ Line: number; Span: number[]; Check: string; Severity: string; Message: string }>
  >
  try {
    json = JSON.parse(proc.stdout)
  } catch {
    return []
  }
  const findings: ValeFinding[] = []
  for (const file of Object.values(json)) {
    for (const f of file) {
      findings.push({
        line: f.Line,
        column: f.Span?.[0] ?? 0,
        rule: f.Check,
        severity: (f.Severity ?? 'warning').toLowerCase() as ValeFinding['severity'],
        message: f.Message,
      })
    }
  }
  return findings
}

export function formatValeReport(findings: ValeFinding[]): string {
  if (findings.length === 0) return '_(Vale clean)_'
  const groups = {
    error: [] as ValeFinding[],
    warning: [] as ValeFinding[],
    suggestion: [] as ValeFinding[],
  }
  for (const f of findings) groups[f.severity].push(f)
  const lines: string[] = []
  for (const sev of ['error', 'warning', 'suggestion'] as const) {
    if (groups[sev].length === 0) continue
    lines.push(`**${sev}** (${groups[sev].length}):`)
    for (const f of groups[sev]) {
      lines.push(`- L${f.line}: \`${f.rule}\` — ${f.message}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}
