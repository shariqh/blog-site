// scripts/agent/lib/promote.ts
import type { ContentRow } from './types'
import type { CreateRowInput } from './notion'

export function selectRowsNeedingPromotion(
  allRows: ContentRow[],
  existingDerivatives: ContentRow[]
): ContentRow[] {
  const promotedSourceIds = new Set(
    existingDerivatives
      .filter((r) => r.origin === 'Derivative' && r.kind === 'blog' && r.sourceRowId)
      .map((r) => r.sourceRowId as string)
  )
  return allRows.filter(
    (r) =>
      (r.kind === 'YT short' || r.kind === 'YT long') &&
      r.stage === 'Published' &&
      r.crossPostTargets.includes('blog') &&
      !promotedSourceIds.has(r.id)
  )
}

export function buildDerivativeRowInput(source: ContentRow): CreateRowInput {
  const ytUrl = source.publishedUrl ?? ''
  const sourceUrls = [...source.sourceUrls]
  if (ytUrl && !sourceUrls.includes(ytUrl)) sourceUrls.unshift(ytUrl)

  return {
    title: source.title,
    kind: 'blog',
    stage: 'Proposed',
    origin: 'Derivative',
    sourceRowId: source.id,
    tags: source.tags,
    tools: source.tools,
    hint: `Blog-length treatment of YT video ${ytUrl}. Expand on: setup, full demo, what surprised me, where this fits.`,
    sourceUrls,
  }
}
