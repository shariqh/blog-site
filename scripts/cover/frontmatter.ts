import { readFileSync, writeFileSync } from 'node:fs'
import matter from 'gray-matter'

export type HeroPatch = {
  image: string
  alt: string
  prompt: string
  style: 'line-art' | 'conceptual'
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
