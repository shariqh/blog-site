// scripts/agent/lib/notion.ts
import type { ContentRow, Kind, Stage, Origin, CrossPostTarget } from './types'

const BASE = 'https://api.notion.com/v1'
const VERSION = '2025-09-03'

// CONFIG is imported lazily via a cached variable so that module load does not
// call required() — which throws when env vars are absent. The pure
// row-mapper (pageToContentRow) therefore stays unit-testable without env vars.
let _config: { notionToken: string; notionContentDbId: string } | undefined

async function getConfig() {
  if (!_config) {
    const mod = await import('./config')
    _config = mod.CONFIG
  }
  return _config
}

function buildHeaders(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Notion-Version': VERSION,
    'Content-Type': 'application/json',
    ...extra,
  }
}

async function fetchJson(
  path: string,
  init?: { method?: string; body?: string; headers?: Record<string, string> }
): Promise<unknown> {
  const cfg = await getConfig()
  const res = await fetch(`${BASE}${path}`, {
    method: init?.method,
    body: init?.body,
    headers: { ...buildHeaders(cfg.notionToken), ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Notion ${init?.method ?? 'GET'} ${path} ${res.status}: ${body}`)
  }
  return res.json()
}

// ---------- Row mapping ----------

type AnyProp = { type: string; [k: string]: unknown }
type NotionPage = {
  id: string
  created_time: string
  last_edited_time: string
  properties: Record<string, AnyProp>
}

function textOf(prop: AnyProp | undefined): string {
  if (!prop) return ''
  if (prop.type === 'title') {
    return (((prop as unknown) as { title: Array<{ plain_text: string }> }).title ?? [])
      .map((t) => t.plain_text)
      .join('')
  }
  if (prop.type === 'rich_text') {
    return (((prop as unknown) as { rich_text: Array<{ plain_text: string }> }).rich_text ?? [])
      .map((t) => t.plain_text)
      .join('')
  }
  return ''
}

function selectName<T extends string>(prop: AnyProp | undefined): T | undefined {
  if (!prop || prop.type !== 'select') return undefined
  const sel = ((prop as unknown) as { select: { name: string } | null }).select
  return sel ? (sel.name as T) : undefined
}

function multiSelectNames<T extends string>(prop: AnyProp | undefined): T[] {
  if (!prop || prop.type !== 'multi_select') return []
  return (((prop as unknown) as { multi_select: Array<{ name: string }> }).multi_select ?? []).map(
    (m) => m.name as T
  )
}

function urlOf(prop: AnyProp | undefined): string | undefined {
  if (!prop || prop.type !== 'url') return undefined
  const v = ((prop as unknown) as { url: string | null }).url
  return v ?? undefined
}

function dateStartOf(prop: AnyProp | undefined): string | undefined {
  if (!prop || prop.type !== 'date') return undefined
  return ((prop as unknown) as { date: { start: string } | null }).date?.start
}

function relationFirstId(prop: AnyProp | undefined): string | undefined {
  if (!prop || prop.type !== 'relation') return undefined
  const rel = ((prop as unknown) as { relation: Array<{ id: string }> }).relation
  return rel?.[0]?.id
}

export function pageToContentRow(page: NotionPage): ContentRow {
  const p = page.properties
  const sourceUrlsRaw = textOf(p['Source URLs']).trim()
  const sourceUrls = sourceUrlsRaw
    ? sourceUrlsRaw
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : []
  return {
    id: page.id,
    title: textOf(p['Title']),
    kind: (selectName<Kind>(p['Kind']) ?? 'blog') as Kind,
    stage: (selectName<Stage>(p['Stage']) ?? 'Idea') as Stage,
    origin: (selectName<Origin>(p['Origin']) ?? 'OC') as Origin,
    sourceRowId: relationFirstId(p['Source Row']),
    crossPostTargets: multiSelectNames<CrossPostTarget>(p['Cross-post Targets']),
    tags: multiSelectNames<string>(p['Tags']),
    tools: multiSelectNames<string>(p['Tools']),
    hint: textOf(p['Hint']),
    sourceUrls,
    draftUrl: urlOf(p['Draft URL']),
    publishedUrl: urlOf(p['Published URL']),
    publishingDate: dateStartOf(p['Publishing']),
    createdAt: page.created_time,
    updatedAt: page.last_edited_time,
  }
}

// ---------- Public DB ops ----------

export async function queryContentRows(filter: object, sorts?: object[]): Promise<ContentRow[]> {
  const cfg = await getConfig()
  const dataSourceId = await getDataSourceIdForDb(cfg.notionContentDbId)
  const rows: ContentRow[] = []
  let cursor: string | undefined
  do {
    const body = JSON.stringify({ filter, sorts, start_cursor: cursor, page_size: 100 })
    const data = (await fetchJson(`/data_sources/${dataSourceId}/query`, {
      method: 'POST',
      body,
    })) as { results: NotionPage[]; has_more: boolean; next_cursor?: string }
    rows.push(...data.results.map(pageToContentRow))
    cursor = data.has_more ? data.next_cursor : undefined
  } while (cursor)
  return rows
}

async function getDataSourceIdForDb(dbId: string): Promise<string> {
  const db = (await fetchJson(`/databases/${dbId}`)) as {
    data_sources: Array<{ id: string }>
  }
  const ds = db.data_sources?.[0]
  if (!ds) throw new Error(`No data source for DB ${dbId}`)
  return ds.id
}

export interface CreateRowInput {
  title: string
  kind: Kind
  stage: Stage
  origin: Origin
  crossPostTargets?: CrossPostTarget[]
  tags?: string[]
  tools?: string[]
  hint?: string
  sourceUrls?: string[]
  draftUrl?: string
  publishedUrl?: string
  sourceRowId?: string
  publishingDate?: string
}

export async function createContentRow(input: CreateRowInput): Promise<string> {
  const cfg = await getConfig()
  const dataSourceId = await getDataSourceIdForDb(cfg.notionContentDbId)
  const body = {
    parent: { type: 'data_source_id', data_source_id: dataSourceId },
    properties: buildPropertiesPayload(input),
  }
  const data = (await fetchJson('/pages', { method: 'POST', body: JSON.stringify(body) })) as {
    id: string
  }
  return data.id
}

export async function updateContentRow(
  pageId: string,
  patch: Partial<CreateRowInput>
): Promise<void> {
  const body = { properties: buildPropertiesPayload(patch) }
  await fetchJson(`/pages/${pageId}`, { method: 'PATCH', body: JSON.stringify(body) })
}

function buildPropertiesPayload(input: Partial<CreateRowInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (input.title !== undefined)
    out['Title'] = { title: [{ type: 'text', text: { content: input.title } }] }
  if (input.kind !== undefined) out['Kind'] = { select: { name: input.kind } }
  if (input.stage !== undefined) out['Stage'] = { select: { name: input.stage } }
  if (input.origin !== undefined) out['Origin'] = { select: { name: input.origin } }
  if (input.crossPostTargets !== undefined)
    out['Cross-post Targets'] = {
      multi_select: input.crossPostTargets.map((n) => ({ name: n })),
    }
  if (input.tags !== undefined) out['Tags'] = { multi_select: input.tags.map((n) => ({ name: n })) }
  if (input.tools !== undefined)
    out['Tools'] = { multi_select: input.tools.map((n) => ({ name: n })) }
  if (input.hint !== undefined)
    out['Hint'] = { rich_text: [{ type: 'text', text: { content: input.hint } }] }
  if (input.sourceUrls !== undefined)
    out['Source URLs'] = {
      rich_text: [{ type: 'text', text: { content: input.sourceUrls.join('\n') } }],
    }
  if (input.draftUrl !== undefined) out['Draft URL'] = { url: input.draftUrl }
  if (input.publishedUrl !== undefined) out['Published URL'] = { url: input.publishedUrl }
  if (input.sourceRowId !== undefined) out['Source Row'] = { relation: [{ id: input.sourceRowId }] }
  if (input.publishingDate !== undefined)
    out['Publishing'] = { date: { start: input.publishingDate } }
  return out
}

export async function appendBlocks(pageId: string, blocks: unknown[]): Promise<void> {
  await fetchJson(`/blocks/${pageId}/children`, {
    method: 'PATCH',
    body: JSON.stringify({ children: blocks }),
  })
}

export async function replacePageBody(pageId: string, blocks: unknown[]): Promise<void> {
  // Fetch existing children and archive each, then append new.
  const existing = (await fetchJson(`/blocks/${pageId}/children?page_size=100`)) as {
    results: Array<{ id: string }>
  }
  for (const child of existing.results) {
    await fetchJson(`/blocks/${child.id}`, {
      method: 'DELETE',
    })
  }
  if (blocks.length > 0) await appendBlocks(pageId, blocks)
}

export async function addPageComment(pageId: string, text: string): Promise<void> {
  const body = {
    parent: { page_id: pageId },
    rich_text: [{ type: 'text', text: { content: text } }],
  }
  await fetchJson('/comments', { method: 'POST', body: JSON.stringify(body) })
}
