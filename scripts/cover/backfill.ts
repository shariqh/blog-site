import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import matter from 'gray-matter'
import { generateCover, type CoverResult } from './generate-cover'
import { setHeroInFile, toHeroPatch, coverInputFromFrontmatter, type HeroPatch } from './frontmatter'

const WRITING_DIR = join('src', 'content', 'writing')

export function listPostFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...listPostFiles(full))
    else if (entry.endsWith('.mdx')) out.push(full)
  }
  return out
}

export function slugFromPath(dir: string, filePath: string): string {
  return relative(dir, filePath).replace(/\.mdx$/, '').split(sep).join('/')
}

export type BackfillDeps = {
  force: boolean
  readFile: (filePath: string) => string
  generateCover: (input: {
    slug: string
    title: string
    summary?: string
    tags: string[]
  }) => Promise<CoverResult>
  setHero: (filePath: string, hero: HeroPatch) => void
}

export type BackfillResult = {
  made: number
  fellBack: number
  skipped: number
  failed: number
}

export async function runBackfill(
  files: string[],
  deps: BackfillDeps
): Promise<BackfillResult> {
  let made = 0
  let skipped = 0
  let fellBack = 0
  let failed = 0

  for (const filePath of files) {
    const fm = matter(deps.readFile(filePath))
    if (fm.data.draft) {
      skipped++
      continue
    }
    const slug = slugFromPath(WRITING_DIR, filePath)
    if (fm.data.hero?.image && !deps.force) {
      console.log(`• ${slug}: has hero.image — skipping (use --force).`)
      skipped++
      continue
    }
    try {
      console.log(`→ ${slug}: generating …`)
      const result = await deps.generateCover({
        slug,
        ...coverInputFromFrontmatter(fm.data, slug),
      })
      deps.setHero(filePath, toHeroPatch(result))
      made++
      if (result.usedFallback) fellBack++
      console.log(`  ✓ ${result.style}${result.usedFallback ? ' (fallback)' : ''}`)
    } catch (err) {
      console.error(`  ✗ ${slug}: ${err instanceof Error ? err.message : String(err)}`)
      failed++
    }
  }

  return { made, fellBack, skipped, failed }
}

async function main(): Promise<void> {
  const force = process.argv.slice(2).includes('--force')
  const files = listPostFiles(WRITING_DIR).sort()

  const { made, fellBack, skipped, failed } = await runBackfill(files, {
    force,
    readFile: (filePath) => readFileSync(filePath, 'utf8'),
    generateCover,
    setHero: setHeroInFile,
  })

  console.log(`\nDone. Generated: ${made}, fell back: ${fellBack}, skipped: ${skipped}, failed: ${failed}.`)
  if (failed > 0) process.exit(1)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
