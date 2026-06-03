// scripts/agent/migrate-cms.ts
//
// One-shot in-place migration of the existing CMS Notion DB.
// Source DB and destination DB are the same.
//
// Pre-condition (manual user step in Notion UI before running):
//   - Rename Status → Stage; rename Status options to match new Stage values
//   - Add Kind property (single-select)
//   - Add Origin options: Agent Proposed, Derivative
//   - Add: Source Row (self-relation), Cross-post Targets (multi-select),
//          Tools (multi-select), Hint (text), Draft URL (URL)
//
// What this script does:
//   - PATCH every row with: Kind (from first Medium), Hint (from Keywords),
//     Source URLs (from Source(s)). For Origin=x-post:blog rows, set Origin=Derivative.
//     For Origin=x-post:bundle rows, populate Cross-post Targets from non-first Mediums.
//   - For multi-Medium rows, additionally CREATE one new sibling page per
//     additional Medium with Origin=Derivative and Source Row → primary's page ID.
//   - Idempotent: rows where Kind is already populated are skipped.

import { CONFIG } from './lib/config'
import { createContentRow, updateContentRow } from './lib/notion'
import type {
  CmsRow,
  LegacyMedium,
  LegacyStatus,
  LegacyOrigin,
  Kind,
  CrossPostTarget,
} from './lib/types'

const DRY_RUN = process.argv.includes('--dry-run')
const EXECUTE = process.argv.includes('--execute')

if (!DRY_RUN && !EXECUTE) {
  console.error('Usage: npm run migrate:cms -- (--dry-run | --execute)')
  process.exit(1)
}

const NOTION_VERSION = '2025-09-03'

interface NotionPageRaw {
  id: string
  properties: Record<string, { type: string; [k: string]: unknown }>
}

interface CmsRowWithKind extends CmsRow {
  alreadyMigrated: boolean // true if Kind already populated
}

async function fetchAllRows(): Promise<CmsRowWithKind[]> {
  const dsId = await getDataSourceId(CONFIG.notionCmsDbId)
  const out: CmsRowWithKind[] = []
  let cursor: string | undefined
  do {
    const res = await fetch(`https://api.notion.com/v1/data_sources/${dsId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CONFIG.notionToken}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ start_cursor: cursor, page_size: 100 }),
    })
    if (!res.ok) throw new Error(`Query failed: ${res.status} ${await res.text()}`)
    const data = (await res.json()) as {
      results: NotionPageRaw[]
      has_more: boolean
      next_cursor?: string
    }
    for (const p of data.results) out.push(extractCmsRow(p))
    cursor = data.has_more ? data.next_cursor : undefined
  } while (cursor)
  return out
}

async function getDataSourceId(dbId: string): Promise<string> {
  const dbRes = await fetch(`https://api.notion.com/v1/databases/${dbId}`, {
    headers: {
      Authorization: `Bearer ${CONFIG.notionToken}`,
      'Notion-Version': NOTION_VERSION,
    },
  })
  if (!dbRes.ok) throw new Error(`DB fetch failed: ${dbRes.status}`)
  const db = (await dbRes.json()) as { data_sources: Array<{ id: string }> }
  const ds = db.data_sources[0]?.id
  if (!ds) throw new Error(`No data source on DB ${dbId}`)
  return ds
}

function extractCmsRow(page: NotionPageRaw): CmsRowWithKind {
  const p = page.properties
  const text = (prop: typeof p[string] | undefined): string => {
    if (!prop) return ''
    if (prop.type === 'title')
      return (((prop as unknown) as { title: Array<{ plain_text: string }> }).title ?? [])
        .map((t) => t.plain_text)
        .join('')
    if (prop.type === 'rich_text')
      return (((prop as unknown) as { rich_text: Array<{ plain_text: string }> }).rich_text ?? [])
        .map((t) => t.plain_text)
        .join('')
    return ''
  }
  const select = <T extends string>(prop: typeof p[string] | undefined): T | undefined => {
    if (!prop || prop.type !== 'select') return undefined
    const sel = ((prop as unknown) as { select: { name: string } | null }).select
    return sel ? (sel.name as T) : undefined
  }
  const multi = <T extends string>(prop: typeof p[string] | undefined): T[] => {
    if (!prop || prop.type !== 'multi_select') return []
    return (
      ((prop as unknown) as { multi_select: Array<{ name: string }> }).multi_select ?? []
    ).map((m) => m.name as T)
  }
  const url = (prop: typeof p[string] | undefined): string | undefined => {
    if (!prop || prop.type !== 'url') return undefined
    return ((prop as unknown) as { url: string | null }).url ?? undefined
  }
  const date = (prop: typeof p[string] | undefined): string | undefined => {
    if (!prop || prop.type !== 'date') return undefined
    return ((prop as unknown) as { date: { start: string } | null }).date?.start
  }
  const num = (prop: typeof p[string] | undefined): number | undefined => {
    if (!prop || prop.type !== 'number') return undefined
    return ((prop as unknown) as { number: number | null }).number ?? undefined
  }

  return {
    id: page.id,
    title: text(p['Title']),
    status: select<LegacyStatus>(p['Status'] ?? p['Stage']), // Stage post-rename also OK
    medium: multi<LegacyMedium>(p['Medium']),
    origin: select<LegacyOrigin>(p['Origin']),
    tags: multi<string>(p['Tags']),
    type: select<string>(p['Type']),
    keywords: text(p['Keywords']),
    sources: text(p['Source(s)']),
    publishedLink: url(p['Published Link']) ?? url(p['Published URL']),
    publishing: date(p['Publishing']),
    no: num(p['No.']),
    alreadyMigrated: select<string>(p['Kind']) !== undefined,
  }
}

const KIND_FROM_MEDIUM: Record<LegacyMedium, Kind> = {
  blog: 'blog',
  youtube: 'YT short',
  'YT short': 'YT short',
  podcast: 'podcast',
  presentation: 'presentation',
  'IG reel': 'IG reel',
  'stand up': 'stand up',
}

function isCrossPostTarget(k: Kind): k is CrossPostTarget {
  return k === 'blog' || k === 'YT short' || k === 'YT long'
}

function splitSources(s: string): string[] {
  if (!s) return []
  return s
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
}

interface PlannedPatch {
  pageId: string
  title: string
  kind: Kind
  origin?: 'Derivative' // only when we're upgrading x-post:blog
  crossPostTargets: CrossPostTarget[]
  hint?: string
  sourceUrls: string[]
}

interface PlannedSibling {
  primaryPageId: string
  title: string
  kind: Kind
  tags: string[]
}

interface MigrationPlan {
  patches: PlannedPatch[]
  siblings: PlannedSibling[]
  skipped: number
  totalRows: number
}

function buildPlan(rows: CmsRowWithKind[]): MigrationPlan {
  const patches: PlannedPatch[] = []
  const siblings: PlannedSibling[] = []
  let skipped = 0

  for (const row of rows) {
    if (row.alreadyMigrated) {
      skipped++
      continue
    }

    const mediums = row.medium.length > 0 ? row.medium : (['blog'] as LegacyMedium[])
    const kinds = mediums.map((m) => KIND_FROM_MEDIUM[m] ?? 'blog')
    const primaryKind = kinds[0]
    const otherKinds = kinds.slice(1).filter(isCrossPostTarget)

    // Build patch for the primary (existing) page
    const patch: PlannedPatch = {
      pageId: row.id,
      title: row.title,
      kind: primaryKind,
      crossPostTargets: otherKinds,
      hint: row.keywords || undefined,
      sourceUrls: splitSources(row.sources),
    }
    if (row.origin === 'x-post:blog') patch.origin = 'Derivative'
    patches.push(patch)

    // Build siblings for multi-Medium rows
    for (const siblingKind of kinds.slice(1)) {
      siblings.push({
        primaryPageId: row.id,
        title: row.title,
        kind: siblingKind,
        tags: row.tags,
      })
    }
  }

  return { patches, siblings, skipped, totalRows: rows.length }
}

function printReport(plan: MigrationPlan): void {
  console.log('\n=== Migration plan ===')
  console.log(`Total rows in CMS:    ${plan.totalRows}`)
  console.log(`Already migrated:     ${plan.skipped} (skipped)`)
  console.log(`Rows to PATCH:        ${plan.patches.length}`)
  console.log(`Sibling rows to CREATE: ${plan.siblings.length} (from multi-Medium splits)`)

  if (plan.siblings.length > 0) {
    console.log('\nSplit rows (primary → siblings):')
    const byPrimary = new Map<string, PlannedSibling[]>()
    for (const s of plan.siblings) {
      if (!byPrimary.has(s.primaryPageId)) byPrimary.set(s.primaryPageId, [])
      byPrimary.get(s.primaryPageId)!.push(s)
    }
    for (const [primaryId, sibs] of byPrimary) {
      const primaryTitle = plan.patches.find((p) => p.pageId === primaryId)?.title ?? '?'
      console.log(`  ${primaryTitle} → ${sibs.map((s) => s.kind).join(', ')}`)
    }
  }
}

async function main(): Promise<void> {
  console.log(`Fetching all rows from CMS DB ${CONFIG.notionCmsDbId}...`)
  const rows = await fetchAllRows()
  console.log(`Fetched ${rows.length} rows.`)

  const plan = buildPlan(rows)
  printReport(plan)

  if (DRY_RUN) {
    console.log('\n[dry-run] No writes performed. Re-run with --execute to apply.')
    return
  }

  console.log('\nExecuting migration...')
  let patched = 0
  let created = 0

  for (const p of plan.patches) {
    await updateContentRow(p.pageId, {
      kind: p.kind,
      crossPostTargets: p.crossPostTargets,
      hint: p.hint,
      sourceUrls: p.sourceUrls,
      ...(p.origin ? { origin: p.origin } : {}),
    })
    patched++
    if (patched % 10 === 0) console.log(`  patched ${patched} / ${plan.patches.length}`)
  }

  for (const s of plan.siblings) {
    await createContentRow({
      title: s.title,
      kind: s.kind,
      stage: 'Idea',
      origin: 'Derivative',
      sourceRowId: s.primaryPageId,
      tags: s.tags,
    })
    created++
    if (created % 5 === 0) console.log(`  created ${created} / ${plan.siblings.length} siblings`)
  }

  console.log(`\nDone. Patched ${patched} rows, created ${created} sibling rows.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
