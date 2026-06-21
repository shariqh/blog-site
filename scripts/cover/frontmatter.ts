import { readFileSync, writeFileSync } from 'node:fs'
import matter from 'gray-matter'
import type { CoverResult } from './generate-cover'

export type HeroPatch = {
  image: string
  alt: string
  prompt: string
  style: 'line-art' | 'conceptual'
}

/** Map a CoverResult to the HeroPatch written into frontmatter. */
export function toHeroPatch(result: CoverResult): HeroPatch {
  return {
    image: result.imagePath,
    alt: result.alt,
    prompt: result.prompt,
    style: result.style,
  }
}

/** Coerce gray-matter frontmatter data to the input expected by generateCover. */
export function coverInputFromFrontmatter(
  data: Record<string, unknown>,
  slug: string
): { title: string; summary?: string; tags: string[] } {
  return {
    title: String(data.title ?? slug),
    summary: typeof data.summary === 'string' ? data.summary : undefined,
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
  }
}

// Parse, set the hero object, re-serialize. gray-matter re-dumps the YAML, so
// frontmatter formatting may normalize (quotes/key order) — acceptable churn,
// reviewed in the backfill PR.
export function setHero(mdx: string, hero: HeroPatch): string {
  const parsed = matter(mdx)
  const data = { ...parsed.data, hero: { ...hero } }
  return matter.stringify(parsed.content, data)
}

export function setHeroInFile(filePath: string, hero: HeroPatch): void {
  const mdx = readFileSync(filePath, 'utf8')
  writeFileSync(filePath, setHero(mdx, hero))
}
