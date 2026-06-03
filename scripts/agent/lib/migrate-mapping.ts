// scripts/agent/lib/migrate-mapping.ts
import type {
  CmsRow,
  Kind,
  Stage,
  Origin,
  CrossPostTarget,
  LegacyStatus,
  LegacyMedium,
  MappedRow,
} from './types'

const STATUS_MAP: Record<LegacyStatus, Stage> = {
  Prepping: 'Idea',
  'Ready To Record': 'Ready',
  Recording: 'Recorded',
  'Post-Processing': 'Edited',
  Published: 'Published',
  Abandoned: 'Abandoned',
  '✅': 'Published',
}

const MEDIUM_TO_KIND: Record<LegacyMedium, Kind> = {
  blog: 'blog',
  youtube: 'YT short', // default YouTube to short; user can adjust
  'YT short': 'YT short',
  podcast: 'podcast',
  presentation: 'presentation',
  'IG reel': 'IG reel',
  'stand up': 'stand up',
}

export function statusToStage(s?: LegacyStatus): Stage {
  if (!s) return 'Idea'
  return STATUS_MAP[s] ?? 'Idea'
}

export function mediumToKind(m: LegacyMedium): Kind {
  return MEDIUM_TO_KIND[m] ?? 'blog'
}

function splitSources(s: string): string[] {
  if (!s) return []
  return s
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
}

function buildHint(row: CmsRow): string {
  const parts: string[] = []
  if (row.keywords) parts.push(row.keywords.trim())
  return parts.join(' · ')
}

function isCrossPostTarget(k: Kind): k is CrossPostTarget {
  return k === 'blog' || k === 'YT short' || k === 'YT long'
}

export function mapCmsRowToContentRows(row: CmsRow): MappedRow[] {
  const mediums = row.medium.length > 0 ? row.medium : (['blog'] as LegacyMedium[])
  const kinds = mediums.map(mediumToKind)
  const stage = statusToStage(row.status)
  const hint = buildHint(row)
  const sourceUrls = splitSources(row.sources)
  const baseOrigin: Origin = row.origin === 'x-post:blog' ? 'Derivative' : 'OC'

  // x-post:bundle → primary row's Cross-post Targets gets the *other* kinds
  // When splitting multi-medium without bundle, the primary still gets Cross-post Targets
  // so the future agent run can recognize the relationship.
  const crossPostsForPrimary: CrossPostTarget[] = kinds.slice(1).filter(isCrossPostTarget)

  const primary: MappedRow = {
    title: row.title,
    kind: kinds[0],
    stage,
    origin: baseOrigin,
    crossPostTargets: crossPostsForPrimary,
    tags: row.tags,
    tools: [],
    hint,
    sourceUrls,
    publishedUrl: row.publishedLink || undefined,
    publishingDate: row.publishing,
    // primary keeps the original Notion page ID — no source row marker needed
  }

  const derivatives: MappedRow[] = kinds.slice(1).map((k) => ({
    title: row.title,
    kind: k,
    stage,
    origin: 'Derivative' as Origin,
    crossPostTargets: [],
    tags: row.tags,
    tools: [],
    hint,
    sourceUrls,
    publishingDate: row.publishing,
    sourceRowOriginalPageId: row.id,
  }))

  return [primary, ...derivatives]
}
