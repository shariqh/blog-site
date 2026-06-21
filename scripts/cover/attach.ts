import { spawnSync } from 'node:child_process'
import { generateCover } from './generate-cover'
import { setHeroInFile } from './frontmatter'

function gitStage(pngPath: string): void {
  spawnSync('git', ['add', pngPath], { encoding: 'utf8' })
}

// Non-fatal: a cover failure must never abort a draft. Returns the imagePath or
// null. The MDX hero edit is applied to filePath (which the caller stages after).
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
    setHero(input.filePath, {
      image: result.imagePath,
      alt: result.alt,
      prompt: result.prompt,
      style: result.style,
    })
    stage(`public${result.imagePath}`)
    return result.imagePath
  } catch (err) {
    console.error(`Cover generation failed (non-fatal): ${(err as Error).message}`)
    return null
  }
}
