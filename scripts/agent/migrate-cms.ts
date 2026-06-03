// scripts/agent/migrate-cms.ts
import { CONFIG } from './lib/config'
import { mapCmsRowToContentRows } from './lib/migrate-mapping'
import { createContentRow } from './lib/notion'
import type { CmsRow, MappedRow, LegacyMedium, LegacyStatus, LegacyOrigin } from './lib/types'

const DRY_RUN = process.argv.includes('--dry-run')
const EXECUTE = process.argv.includes('--execute')

if (!DRY_RUN && !EXECUTE) {
  console.error('Usage: npm run migrate:cms -- (--dry-run | --execute)')
  process.exit(1)
}

const NOTION_VERSION = '2025-09-03'

async function fetchLegacyCmsRows(legacyDbId: string): Promise<CmsRow[]> {
  // Get data source for legacy DB
  const dbRes = await fetch(`https://api.notion.com/v1/databases/${legacyDbId}`, {
    headers: {
      Authorization: `Bearer ${CONFIG.notionToken}`,
      'Notion-Version': NOTION_VERSION,
    },
  })
  if (!dbRes.ok) throw new Error(`Failed to fetch legacy DB: ${dbRes.status}`)
  const db = (await dbRes.json()) as { data_sources: Array<{ id: string }> }
  const ds = db.data_sources[0]?.id
  if (!ds) throw new Error('No data source on legacy CMS DB')

  const rows: CmsRow[] = []
  let cursor: string | undefined
  do {
    const body = JSON.stringify({ start_cursor: cursor, page_size: 100 })
    const res = await fetch(`https://api.notion.com/v1/data_sources/${ds}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CONFIG.notionToken}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body,
    })
    if (!res.ok) throw new Error(`Legacy query failed: ${res.status} ${await res.text()}`)
    const data = (await res.json()) as {
      results: Array<{ id: string; properties: Record<string, unknown> }>
      has_more: boolean
      next_cursor?: string
    }
    for (const p of data.results) {
      rows.push(extractCmsRow(p))
    }
    cursor = data.has_more ? data.next_cursor : undefined
  } while (cursor)
  return rows
}

function extractCmsRow(page: { id: string; properties: Record<string, unknown> }): CmsRow {
  const p = page.properties as Record<string, { type: string; [k: string]: unknown }>
  const text = (prop: { type: string; [k: string]: unknown } | undefined): string => {
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
  const select = <T extends string>(
    prop: { type: string; [k: string]: unknown } | undefined
  ): T | undefined => {
    if (!prop || prop.type !== 'select') return undefined
    const sel = ((prop as unknown) as { select: { name: string } | null }).select
    return sel ? (sel.name as T) : undefined
  }
  const multi = <T extends string>(
    prop: { type: string; [k: string]: unknown } | undefined
  ): T[] => {
    if (!prop || prop.type !== 'multi_select') return []
    return (
      ((prop as unknown) as { multi_select: Array<{ name: string }> }).multi_select ?? []
    ).map((m) => m.name as T)
  }
  const url = (prop: { type: string; [k: string]: unknown } | undefined): string | undefined => {
    if (!prop || prop.type !== 'url') return undefined
    return ((prop as unknown) as { url: string | null }).url ?? undefined
  }
  const date = (prop: { type: string; [k: string]: unknown } | undefined): string | undefined => {
    if (!prop || prop.type !== 'date') return undefined
    return ((prop as unknown) as { date: { start: string } | null }).date?.start
  }
  const num = (prop: { type: string; [k: string]: unknown } | undefined): number | undefined => {
    if (!prop || prop.type !== 'number') return undefined
    return ((prop as unknown) as { number: number | null }).number ?? undefined
  }
  return {
    id: page.id,
    title: text(p['Title']),
    status: select<LegacyStatus>(p['Status']),
    medium: multi<LegacyMedium>(p['Medium']),
    origin: select<LegacyOrigin>(p['Origin']),
    tags: multi<string>(p['Tags']),
    type: select<string>(p['Type']),
    keywords: text(p['Keywords']),
    sources: text(p['Source(s)']),
    publishedLink: url(p['Published Link']),
    publishing: date(p['Publishing']),
    no: num(p['No.']),
  }
}

async function main(): Promise<void> {
  const legacyId = CONFIG.notionLegacyCmsDbId
  if (!legacyId) {
    console.error('Set NOTION_LEGACY_CMS_DB_ID in .env.local')
    process.exit(1)
  }
  console.log(`Fetching legacy CMS rows from ${legacyId}...`)
  const rows = await fetchLegacyCmsRows(legacyId)
  console.log(`Fetched ${rows.length} legacy rows.`)

  const mapped: Array<{ source: CmsRow; out: MappedRow[] }> = rows.map((r) => ({
    source: r,
    out: mapCmsRowToContentRows(r),
  }))

  // Report
  const splits = mapped.filter((m) => m.out.length > 1)
  const totalOutRows = mapped.reduce((s, m) => s + m.out.length, 0)

  console.log('\n=== Migration report ===')
  console.log(`Input rows:      ${rows.length}`)
  console.log(`Output rows:     ${totalOutRows}`)
  console.log(`Rows being split:${splits.length}`)
  console.log(
    `New rows created:${
      totalOutRows - rows.length
    } (from splits; primary rows reuse original page ID)`
  )

  if (splits.length > 0) {
    console.log('\nSplit rows:')
    for (const s of splits) {
      console.log(
        `  ${s.source.title}: ${s.source.medium.join(',')} → ${s.out.map((o) => o.kind).join(',')}`
      )
    }
  }

  if (DRY_RUN) {
    console.log('\n[dry-run] No writes performed. Re-run with --execute to apply.')
    return
  }

  // Execute mode — refuse if Content DB has any rows
  console.log('\nChecking destination DB is empty...')
  const dest = await fetch(
    `https://api.notion.com/v1/data_sources/${await getDataSourceId(
      CONFIG.notionContentDbId
    )}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CONFIG.notionToken}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ page_size: 1 }),
    }
  )
  if (!dest.ok) throw new Error(`Destination check failed: ${dest.status}`)
  const destData = (await dest.json()) as { results: unknown[] }
  if (destData.results.length > 0) {
    console.error('Destination Content DB is not empty. Aborting to avoid double-import.')
    process.exit(1)
  }

  console.log('Executing migration...')
  let created = 0
  for (const m of mapped) {
    // Create primary first; capture its new ID so derivatives in this group
    // can link to it directly. This avoids the title-collision risk of a
    // post-hoc title-based linking pass.
    let primaryNewId: string | null = null
    for (const out of m.out) {
      const sourceRowId = out.sourceRowOriginalPageId && primaryNewId ? primaryNewId : undefined
      const id = await createContentRow({
        title: out.title,
        kind: out.kind,
        stage: out.stage,
        origin: out.origin,
        crossPostTargets: out.crossPostTargets,
        tags: out.tags,
        tools: out.tools,
        hint: out.hint,
        sourceUrls: out.sourceUrls,
        publishedUrl: out.publishedUrl,
        publishingDate: out.publishingDate,
        sourceRowId,
      })
      if (!out.sourceRowOriginalPageId) primaryNewId = id
      created++
      if (created % 10 === 0) console.log(`  created ${created} rows...`)
    }
  }

  console.log(`Done. Created ${created} rows.`)
}

async function getDataSourceId(dbId: string): Promise<string> {
  const dbRes = await fetch(`https://api.notion.com/v1/databases/${dbId}`, {
    headers: {
      Authorization: `Bearer ${CONFIG.notionToken}`,
      'Notion-Version': NOTION_VERSION,
    },
  })
  const db = (await dbRes.json()) as { data_sources: Array<{ id: string }> }
  return db.data_sources[0].id
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
