import { BUCKETS } from './bucket'
import type { CommitInfo } from './types'

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export interface BlogSystemPromptInput {
  editorialMd: string
  isDerivative: boolean
  sourceVideoUrl?: string
}

export function buildBlogSystemPrompt(input: BlogSystemPromptInput): string {
  const bucketSummary = Object.entries(BUCKETS)
    .map(
      ([key, b]) =>
        `- **${b.label}** (key: \`${key}\`) — tags: ${
          b.tags.length ? b.tags.join(', ') : '(catch-all)'
        }`
    )
    .join('\n')

  const derivativeBlock = input.isDerivative
    ? `

## DERIVATIVE POST FROM YOUTUBE

This post derives from a YouTube video. Open the MDX with the video embedded at the very top via:

\`\`\`mdx
<Youtube id="${extractYoutubeId(input.sourceVideoUrl ?? '')}" />
\`\`\`

After the embed, write what you couldn't fit in 60 seconds — context, longer demos, gotchas, where it fits in the broader stack.
`
    : ''

  return `You are the drafting agent for shariq.dev. Your job is to produce one MDX file ready to publish, following the editorial guide below verbatim.

OUTPUT: Just the MDX file contents. No prose explanation, no markdown fences around the file. Start with the YAML frontmatter, end with the body.

# Buckets

Posts are categorized by tags into one of five buckets:

${bucketSummary}

Pick tags appropriate for the post. The bucket resolver in src/lib/buckets.ts will assign the visual treatment automatically.

# Editorial guide (verbatim — follow these rules)

${input.editorialMd}
${derivativeBlock}`
}

function extractYoutubeId(url: string): string {
  const m = url.match(/(?:youtu\.be\/|v=)([A-Za-z0-9_-]{11})/)
  return m?.[1] ?? ''
}

export interface BlogUserPromptInput {
  title: string
  hint: string
  sourceUrls: string[]
  tags: string[]
  commits: CommitInfo[]
  sourceVideoUrl?: string
  sourceScript?: string
}

export function buildBlogUserPrompt(input: BlogUserPromptInput): string {
  const lines: string[] = []
  lines.push(`# Draft this post`)
  lines.push('')
  lines.push(`**Working title:** ${input.title}`)
  lines.push(`**Angle:** ${input.hint || '(none provided — derive from sources)'}`)
  if (input.tags.length) lines.push(`**Suggested tags:** ${input.tags.join(', ')}`)
  lines.push('')

  if (input.sourceVideoUrl) {
    lines.push('## Source video')
    lines.push(input.sourceVideoUrl)
    lines.push('')
  }
  if (input.sourceScript) {
    lines.push('## Original YouTube script (basis to expand from)')
    lines.push('```')
    lines.push(input.sourceScript)
    lines.push('```')
    lines.push('')
  }
  if (input.sourceUrls.length) {
    lines.push('## Source URLs')
    for (const u of input.sourceUrls) lines.push(`- ${u}`)
    lines.push('')
  }
  if (input.commits.length) {
    lines.push('## Recent commits (context)')
    for (const c of input.commits) {
      lines.push(
        `- \`${c.repo}@${c.sha.slice(0, 7)}\` (${c.date.slice(0, 10)}) — ${
          c.message.split('\n')[0]
        }`
      )
      if (c.filesChanged.length) lines.push(`  files: ${c.filesChanged.slice(0, 5).join(', ')}`)
    }
    lines.push('')
  }

  lines.push(`Today's date: ${new Date().toISOString().slice(0, 10)}`)
  lines.push('')
  lines.push('Write the MDX now. Frontmatter first, body second.')

  return lines.join('\n')
}
