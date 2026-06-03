// scripts/agent/draft.ts
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runPrompt, parseJsonResponse } from './lib/claude'
import { queryContentRows, updateContentRow, addPageComment, replacePageBody } from './lib/notion'
import { recentCommits } from './lib/git-scan'
import { loadEditorialGuide, loadShortsStyleGuide } from './lib/editorial'
import { buildBlogSystemPrompt, buildBlogUserPrompt, slugify } from './lib/draft-blog'
import { buildYtSystemPrompt, buildYtUserPrompt, renderYtScriptToBlocks } from './lib/draft-yt'
import { recentChannelStats } from './lib/youtube'
import { validateMdxFrontmatter, runVale, formatValeReport } from './lib/validate'
import { createBranchAndPr } from './lib/pr'
import type { ContentRow, CommitInfo, YTScriptBlocks, YouTubeStat } from './lib/types'

const READY_FILTER = {
  property: 'Stage',
  select: { equals: 'Ready' },
}

// Cap drafts per run so a big triage batch doesn't fan out into many model
// calls (one long, quota-heavy nightly run) all at once. Remaining Ready rows
// stay Ready and are picked up on the next run.
const MAX_DRAFTS_PER_RUN = 3

async function main(): Promise<void> {
  // Oldest-Ready first for a stable, predictable cap order. Safe because a
  // failed row is moved out of Ready (below), so persistent failures can't keep
  // refilling the capped slots and starving newer rows.
  const ready = await queryContentRows(READY_FILTER, [
    { timestamp: 'created_time', direction: 'ascending' },
  ])
  console.log(`Found ${ready.length} Ready row(s).`)
  if (ready.length === 0) return

  const rows = ready.slice(0, MAX_DRAFTS_PER_RUN)
  if (ready.length > MAX_DRAFTS_PER_RUN) {
    console.log(
      `Capping to ${MAX_DRAFTS_PER_RUN} this run; ${
        ready.length - MAX_DRAFTS_PER_RUN
      } more Ready row(s) will draft on the next run.`
    )
  }

  // Fetch shared context once
  const allCommits = await recentCommits(7)
  const editorialMd = loadEditorialGuide()

  let succeeded = 0
  let failed = 0
  for (const row of rows) {
    try {
      if (row.kind === 'blog') {
        await draftBlogRow(row, allCommits, editorialMd)
        succeeded++
      } else if (row.kind === 'YT short' || row.kind === 'YT long') {
        await draftYtRow(row)
        succeeded++
      } else {
        console.log(`Skipping unsupported Kind=${row.kind}: ${row.title}`)
      }
    } catch (err) {
      failed++
      const msg = (err as Error).message
      console.error(`Row ${row.id} (${row.title}) failed: ${msg}`)
      try {
        await addPageComment(row.id, `Agent drafting failed: ${msg}`)
        // Move out of Ready so a persistently-failing row can't occupy a cap
        // slot every run and starve later rows. Surfaced via the comment above
        // for you to fix and re-flip to Ready.
        await updateContentRow(row.id, { stage: 'Proposed' })
      } catch (innerErr) {
        console.error(
          `Also failed to post Notion comment / reset stage: ${(innerErr as Error).message}`
        )
      }
    }
  }
  console.log(`Done. Succeeded: ${succeeded}, Failed: ${failed}`)
}

async function draftBlogRow(
  row: ContentRow,
  allCommits: CommitInfo[],
  editorialMd: string
): Promise<void> {
  // Filter commits relevant to this row (mentioned by SHA in Source URLs)
  const relevantShas = new Set(
    row.sourceUrls.map((u) => u.match(/\/commit\/([a-f0-9]+)/)?.[1]).filter((x): x is string => !!x)
  )
  const commits = allCommits.filter((c) => relevantShas.has(c.sha))

  const isDerivative = row.origin === 'Derivative'
  const sourceVideoUrl = isDerivative
    ? row.sourceUrls.find((u) => /youtu\.be|youtube\.com/.test(u))
    : undefined

  const systemPrompt = buildBlogSystemPrompt({
    editorialMd,
    isDerivative,
    sourceVideoUrl,
  })

  const userPrompt = buildBlogUserPrompt({
    title: row.title,
    hint: row.hint,
    sourceUrls: row.sourceUrls,
    tags: row.tags,
    commits,
    sourceVideoUrl,
    sourceScript: undefined, // populated below in YT-derivative case if we add it later
  })

  console.log(`Calling Claude for: ${row.title}`)
  const mdx = await runPrompt({ systemPrompt, userPrompt })

  // Validate
  const valid = validateMdxFrontmatter(mdx)
  if (!valid.ok) {
    throw new Error(`Frontmatter validation failed: ${valid.error}`)
  }

  // Write file
  const slug = slugify(row.title)
  const filePath = join('src', 'content', 'writing', `${slug}.mdx`)
  writeFileSync(filePath, mdx)

  // Vale
  const findings = runVale(filePath)
  const valeReport = formatValeReport(findings)

  // Stage the file
  const { spawnSync } = await import('node:child_process')
  const stageRes = spawnSync('git', ['add', filePath], { encoding: 'utf8' })
  if (stageRes.status !== 0) throw new Error(`git add failed: ${stageRes.stderr}`)

  // Create branch + PR, always returning to the originating branch afterwards
  const branchName = `agent/draft/${slug}`
  const commitMsg = `draft: ${row.title} (proposed by agent)`
  const prBody = renderPrBody(row, valeReport)

  let prUrl: string
  try {
    const result = createBranchAndPr({
      branchName,
      commitMessage: commitMsg,
      prTitle: commitMsg,
      prBody,
    })
    prUrl = result.prUrl
  } finally {
    // Always return to the originating branch so the next row starts clean
    spawnSync('git', ['checkout', '-'], { encoding: 'utf8' })
  }

  // Update Notion (only reached if PR creation succeeded)
  await updateContentRow(row.id, { stage: 'Drafted', draftUrl: prUrl })

  console.log(`✓ Drafted ${row.title} → ${prUrl}`)
}

async function draftYtRow(row: ContentRow): Promise<void> {
  const shortsStyleMd = loadShortsStyleGuide()
  const stats = await recentChannelStats(30)
  const perfSignal = buildPerfSignal(row.tools, stats)

  const systemPrompt = buildYtSystemPrompt({
    shortsStyleMd,
    kind: row.kind,
    tools: row.tools,
  })
  const userPrompt = buildYtUserPrompt({
    title: row.title,
    hint: row.hint,
    sourceUrls: row.sourceUrls,
    tools: row.tools,
    perfSignal,
  })

  console.log(`Calling Claude for YT: ${row.title}`)
  const json = await runPrompt({ systemPrompt, userPrompt })
  const parsed = parseJsonResponse<RawYtScript>(json)
  const blocks: YTScriptBlocks = {
    hook: parsed.hook,
    script: parsed.script,
    onScreenText: parsed.on_screen_text.map((o) => ({
      timestampSeconds: o.timestamp_seconds,
      text: o.text,
    })),
    bRoll: parsed.b_roll.map((b) => ({
      timestampSeconds: b.timestamp_seconds,
      description: b.description,
    })),
    thumbnailPrompt: parsed.thumbnail_prompt,
    titleVariants: parsed.title_variants,
    hashtags: parsed.hashtags,
  }
  const notionBlocks = renderYtScriptToBlocks(blocks)
  await replacePageBody(row.id, notionBlocks)
  await updateContentRow(row.id, { stage: 'Drafted' })

  console.log(`✓ YT script drafted for ${row.title}`)
}

interface RawYtScript {
  hook: string
  script: string
  on_screen_text: Array<{ timestamp_seconds: number; text: string }>
  b_roll: Array<{ timestamp_seconds: number; description: string }>
  thumbnail_prompt: string
  title_variants: string[]
  hashtags: string[]
}

function buildPerfSignal(tools: string[], stats: YouTubeStat[]): string {
  if (stats.length === 0) return 'No recent video stats available.'
  const lines: string[] = ['Recent video performance (last 30 days):']
  for (const s of stats.slice(0, 10)) {
    lines.push(`- "${s.title}" — ${s.views} views`)
  }
  if (tools.length > 0) {
    lines.push('')
    lines.push(`Tools this script covers: ${tools.join(', ')}.`)
  }
  return lines.join('\n')
}

function renderPrBody(row: ContentRow, valeReport: string): string {
  return `## AI-drafted post

Drafted by the Plan B agent from Notion row [\`${
    row.title
  }\`](https://www.notion.so/${row.id.replace(/-/g, '')}).

### Source
- Hint: ${row.hint || '_(none)_'}
- Tags: ${row.tags.join(', ') || '_(none)_'}
- Source URLs: ${row.sourceUrls.length ? row.sourceUrls.join(', ') : '_(none)_'}

### Pre-publish checklist (from docs/EDITORIAL.md)

- [ ] Voice check — sounds like me, not a press release
- [ ] Accuracy — every claim reflects something I actually did/saw/built
- [ ] AI-tell sweep (read it out loud)
- [ ] Length matches bucket
- [ ] Frontmatter complete
- [ ] Cloudflare preview reviewed (mobile too)

### Vale report

${valeReport}

---

_When this PR merges to main, please update the Notion row's Published URL to the live shariq.dev URL._
`
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
