import { generateCover } from './generate-cover'
import { setHeroInFile, toHeroPatch } from './frontmatter'
import { safeLocalImage } from '../../src/lib/cover'
import { spawnSync } from 'node:child_process'

function gitStage(pngPath: string): void {
  const r = spawnSync('git', ['add', '--', pngPath], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`git add ${pngPath} failed: ${r.stderr}`)
}

// Non-fatal: a cover failure must never abort a draft. Returns the imagePath or
// null. The MDX hero edit is applied to filePath (which the caller stages after).
// Order: generate → validate → setHero → stage. If setHero throws, stage is never
// called, so no git index manipulation is needed on failure.
export async function attachCover(
  input: { filePath: string; slug: string; title: string; summary?: string; tags: string[] },
  deps: {
    generate?: typeof generateCover
    setHero?: typeof setHeroInFile
    stage?: (pngPath: string) => void
  } = {}
): Promise<string | null> {
  const generate = deps.generate ?? generateCover
  const setHero = deps.setHero ?? setHeroInFile
  const stage = deps.stage ?? gitStage
  try {
    const result = await generate({
      slug: input.slug,
      title: input.title,
      summary: input.summary,
      tags: input.tags,
    })
    // Defense-in-depth: re-validate imagePath against safeLocalImage before staging.
    // The slug is validated upstream, but attach must not blindly trust the path.
    const safeImage = safeLocalImage(result.imagePath)
    if (!safeImage) {
      console.error(`Cover generation failed (non-fatal): imagePath "${result.imagePath}" failed validation`)
      return null
    }
    const pngPath = `public${safeImage}`
    // setHero BEFORE stage: if frontmatter mutation fails, no PNG is staged,
    // so the git index stays clean without needing a git reset cleanup.
    setHero(input.filePath, toHeroPatch(result))
    stage(pngPath)
    return safeImage
  } catch (err) {
    console.error(`Cover generation failed (non-fatal): ${(err as Error).message}`)
    return null
  }
}
