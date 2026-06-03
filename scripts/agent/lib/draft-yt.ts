// scripts/agent/lib/draft-yt.ts
import type { YTScriptBlocks, Kind } from './types'

export interface YtSystemPromptInput {
  shortsStyleMd: string
  kind: Kind
  tools: string[]
}

export function buildYtSystemPrompt(input: YtSystemPromptInput): string {
  return `You are the drafting agent for the shariq.dev YouTube channel. Produce one script in the structured JSON format below, following the style guide verbatim.

OUTPUT: Valid JSON only. No markdown fences, no commentary, no preamble.

# Kind
${input.kind}

# Tools covered
${input.tools.length ? input.tools.join(', ') : '(none specified — infer from sources)'}

# Style guide

${input.shortsStyleMd}

# Output schema

\`\`\`json
{
  "hook": "string (≤3s of dialogue)",
  "script": "string (full body, ~50s for short, ~5min for long)",
  "on_screen_text": [{"timestamp_seconds": number, "text": "string ≤6 words"}],
  "b_roll": [{"timestamp_seconds": number, "description": "string"}],
  "thumbnail_prompt": "string (one sentence)",
  "title_variants": ["string", "string", "string"],
  "hashtags": ["string", "string", "..."]
}
\`\`\`
`
}

export interface YtUserPromptInput {
  title: string
  hint: string
  sourceUrls: string[]
  tools: string[]
  perfSignal?: string
}

export function buildYtUserPrompt(input: YtUserPromptInput): string {
  const lines: string[] = []
  lines.push(`# Write this script`)
  lines.push('')
  lines.push(`**Working title:** ${input.title}`)
  lines.push(`**Angle:** ${input.hint || '(none — derive)'}`)
  if (input.tools.length) lines.push(`**Tools:** ${input.tools.join(', ')}`)
  if (input.sourceUrls.length) {
    lines.push('')
    lines.push('## Source URLs')
    for (const u of input.sourceUrls) lines.push(`- ${u}`)
  }
  if (input.perfSignal) {
    lines.push('')
    lines.push('## Performance signal')
    lines.push(input.perfSignal)
  }
  lines.push('')
  lines.push('Return the JSON now.')
  return lines.join('\n')
}

interface NotionBlock {
  object?: 'block'
  type: string
  [k: string]: unknown
}

function rtText(content: string): unknown[] {
  return [{ type: 'text', text: { content } }]
}

function heading2(text: string): NotionBlock {
  return { object: 'block', type: 'heading_2', heading_2: { rich_text: rtText(text) } }
}

function paragraph(text: string): NotionBlock {
  return { object: 'block', type: 'paragraph', paragraph: { rich_text: rtText(text) } }
}

function bullet(text: string): NotionBlock {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: { rich_text: rtText(text) },
  }
}

export function renderYtScriptToBlocks(s: YTScriptBlocks): NotionBlock[] {
  const blocks: NotionBlock[] = []

  blocks.push(heading2('Hook'))
  blocks.push(paragraph(s.hook))

  blocks.push(heading2('Script'))
  for (const para of s.script.split(/\n\s*\n/)) blocks.push(paragraph(para))

  blocks.push(heading2('On-screen text'))
  for (const ost of s.onScreenText) blocks.push(bullet(`${ost.timestampSeconds}s — ${ost.text}`))

  blocks.push(heading2('B-roll'))
  for (const b of s.bRoll) blocks.push(bullet(`${b.timestampSeconds}s — ${b.description}`))

  blocks.push(heading2('Thumbnail'))
  blocks.push(paragraph(s.thumbnailPrompt))

  blocks.push(heading2('Title variants'))
  for (const t of s.titleVariants) blocks.push(bullet(t))

  blocks.push(heading2('Hashtags'))
  blocks.push(paragraph(s.hashtags.map((h) => `#${h}`).join(' ')))

  return blocks
}
