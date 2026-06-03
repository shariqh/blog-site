// scripts/agent/discover.ts
import { runPrompt, parseJsonResponse } from './lib/claude'
import { queryContentRows, createContentRow } from './lib/notion'
import { recentCommits } from './lib/git-scan'
import { fetchTrending } from './lib/trending'
import { recentChannelStats } from './lib/youtube'
import { loadEditorialGuide, loadShortsStyleGuide } from './lib/editorial'
import { isTitleDuplicate, hasFullToolsOverlap } from './lib/dedupe'
import type { ContentRow, Candidate } from './lib/types'

async function main(): Promise<void> {
  console.log('Discovery: gathering source material...')
  const [ideaRows, allRows, commits, ytStats] = await Promise.all([
    queryContentRows({ property: 'Stage', select: { equals: 'Idea' } }),
    queryContentRows({
      and: [{ property: 'Stage', select: { does_not_equal: 'Abandoned' } }],
    }),
    recentCommits(7),
    recentChannelStats(30),
  ])

  const toolsRegistry = extractKnownTools(allRows)
  const trending = await fetchTrending(toolsRegistry)

  const publishedYtRows = allRows.filter(
    (r) => r.stage === 'Published' && (r.kind === 'YT short' || r.kind === 'YT long')
  )

  console.log(
    `Sources: ${ideaRows.length} ideas, ${commits.length} commits, ${trending.length} trending, ${ytStats.length} YT stats`
  )

  const editorialMd = loadEditorialGuide()
  const shortsStyleMd = loadShortsStyleGuide()

  const systemPrompt = `You are the discovery agent for shariq.dev. Propose up to 3 new blog candidates and up to 3 new YouTube short candidates that are worth drafting.

Empty arrays are fine — do not propose mediocre candidates to fill slots.

OUTPUT: Valid JSON only, matching this schema:

\`\`\`json
{
  "blog_candidates": [
    {"title": "string", "hint": "string", "tags": ["string"], "source_urls": ["string"], "rationale": "string"}
  ],
  "yt_candidates": [
    {"title": "string", "hint": "string", "tools": ["string"], "source_urls": ["string"], "rationale": "string"}
  ]
}
\`\`\`

# Editorial guide (for blog candidates)

${editorialMd}

# Shorts style (for YT candidates)

${shortsStyleMd}
`

  const userPrompt = buildDiscoveryUserPrompt({
    ideaRows,
    publishedYtRows,
    commits,
    trending,
    ytStats,
  })

  console.log('Calling Claude for ranking...')
  const raw = await runPrompt({ systemPrompt, userPrompt })
  const out = parseJsonResponse<{
    blog_candidates: Candidate[]
    yt_candidates: Candidate[]
  }>(raw)

  // Dedupe + upsert
  const recentTitles = allRows
    .filter((r) => Date.now() - new Date(r.createdAt).getTime() < 60 * 86_400_000)
    .map((r) => r.title)

  let blogCreated = 0
  for (const c of out.blog_candidates) {
    if (isTitleDuplicate(c.title, recentTitles)) {
      console.log(`Skipping blog dupe: ${c.title}`)
      continue
    }
    await createCandidateRow(c, 'blog')
    blogCreated++
  }

  const publishedYtToolsByRow = publishedYtRows.map((r) => r.tools)
  let ytCreated = 0
  for (const c of out.yt_candidates) {
    if (isTitleDuplicate(c.title, recentTitles)) {
      console.log(`Skipping YT dupe (title): ${c.title}`)
      continue
    }
    if (c.tools && hasFullToolsOverlap(c.tools, publishedYtToolsByRow)) {
      console.log(`Skipping YT dupe (tools covered): ${c.title}`)
      continue
    }
    await createCandidateRow(c, 'YT short')
    ytCreated++
  }

  console.log(`Discovery done. Created ${blogCreated} blog + ${ytCreated} YT candidate rows.`)
}

function extractKnownTools(rows: ContentRow[]): string[] {
  const set = new Set<string>()
  for (const r of rows) for (const t of r.tools) set.add(t.toLowerCase())
  return [...set]
}

interface DiscoveryUserPromptInput {
  ideaRows: ContentRow[]
  publishedYtRows: ContentRow[]
  commits: {
    repo: string
    sha: string
    message: string
    date: string
    filesChanged: string[]
    url: string
  }[]
  trending: { source: string; title: string; url: string; hint?: string }[]
  ytStats: { title: string; views: number; likes: number; publishedAt: string }[]
}

function buildDiscoveryUserPrompt(input: DiscoveryUserPromptInput): string {
  const lines: string[] = []
  lines.push(`# Source material for discovery`)
  lines.push('')

  lines.push('## Existing ideas in Notion (not yet drafted)')
  if (input.ideaRows.length === 0) lines.push('(none)')
  for (const r of input.ideaRows.slice(0, 20)) {
    lines.push(
      `- **${r.title}** (Kind: ${r.kind}; tags: ${r.tags.join(',') || '–'}) — ${r.hint || ''}`
    )
  }
  lines.push('')

  lines.push('## Recent commits (last 7 days, across active repos)')
  if (input.commits.length === 0) lines.push('(none)')
  for (const c of input.commits.slice(0, 40)) {
    const first = c.message.split('\n')[0]
    lines.push(
      `- \`${c.repo}@${c.sha.slice(0, 7)}\` — ${first} (${c.filesChanged.slice(0, 3).join(', ')})`
    )
  }
  lines.push('')

  lines.push('## Trending (GH + HN, AI/dev tool keywords)')
  if (input.trending.length === 0) lines.push('(none)')
  for (const t of input.trending.slice(0, 20)) {
    lines.push(`- [${t.source}] **${t.title}** — ${t.url}${t.hint ? ` (${t.hint})` : ''}`)
  }
  lines.push('')

  lines.push('## YouTube performance (channel, last 30 days)')
  if (input.ytStats.length === 0) lines.push('(no recent uploads)')
  for (const s of input.ytStats.slice(0, 20)) {
    lines.push(
      `- "${s.title}" — ${s.views} views, ${s.likes} likes (${s.publishedAt.slice(0, 10)})`
    )
  }
  lines.push('')

  lines.push(`Today's date: ${new Date().toISOString().slice(0, 10)}`)
  lines.push('')
  lines.push('Propose candidates now. Return JSON only.')

  return lines.join('\n')
}

async function createCandidateRow(c: Candidate, kind: 'blog' | 'YT short'): Promise<void> {
  await createContentRow({
    title: c.title,
    kind,
    stage: 'Proposed',
    origin: 'Agent Proposed',
    tags: c.tags ?? [],
    tools: c.tools ?? [],
    hint: c.hint,
    sourceUrls: c.sourceUrls,
  })
  console.log(`+ ${kind}: ${c.title}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
