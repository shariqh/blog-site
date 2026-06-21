import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import matter from 'gray-matter'
import { generateCover } from './generate-cover'
import { setHeroInFile, toHeroPatch, coverInputFromFrontmatter } from './frontmatter'
import { assertSafeSlug } from './slug'
import type { CoverStyle } from './prompt'

export function parseCliArgs(argv: string[]): { slug: string; style?: CoverStyle; force: boolean } {
  let slug: string | undefined
  let style: CoverStyle | undefined
  let force = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--force') force = true
    else if (a === '--style') {
      const v = argv[++i]
      if (v !== 'line-art' && v !== 'conceptual') throw new Error(`Invalid --style "${v}" (line-art|conceptual)`)
      style = v
    } else if (!a.startsWith('--') && !slug) slug = a
  }
  if (!slug) throw new Error('Usage: gen:cover <slug> [--style line-art|conceptual] [--force]')
  return { slug, style, force }
}

async function main(): Promise<void> {
  const { slug, style, force } = parseCliArgs(process.argv.slice(2))

  // Security: validate slug before using it to build any filesystem path.
  assertSafeSlug(slug)

  const writingRoot = resolve('src/content/writing')
  const filePath = join(writingRoot, `${slug}.mdx`)

  // Defense-in-depth: ensure the resolved MDX path stays within the writing dir.
  const resolvedFile = resolve(filePath)
  if (!resolvedFile.startsWith(writingRoot + '/') && resolvedFile !== writingRoot) {
    throw new Error(`Path containment violation: "${resolvedFile}" escapes "${writingRoot}"`)
  }

  const fm = matter(readFileSync(filePath, 'utf8'))

  if (fm.data.hero?.image && !force) {
    console.log(`${slug}: already has hero.image (use --force to regenerate). Skipping.`)
    return
  }

  console.log(`Generating cover for ${slug} …`)
  const coverInput = coverInputFromFrontmatter(fm.data, slug)
  const result = await generateCover({
    slug,
    ...coverInput,
    // Precedence: CLI flag > frontmatter hero.style > bucket default (in generateCover)
    style: style ?? coverInput.style,
  })
  setHeroInFile(filePath, toHeroPatch(result))
  console.log(
    `✓ ${slug}: ${result.style}${result.usedFallback ? ' (branded fallback — text guard tripped 3×)' : ''} → ${result.imagePath}`
  )
}

// Only run when invoked directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
