import { resolveBucket } from '../../src/lib/buckets'

export type CoverStyle = 'line-art' | 'conceptual'

// Promoted verbatim from the validated spike (design-samples/cover-spike2.mjs),
// with a strengthened no-text clause appended to BRAND.
export const BRAND = `Strict, limited color palette ONLY: deep navy ink (#15233a) as the dominant base, warm ochre/mustard (#d49a3a), muted terracotta red (#b04a3a), and soft cream/paper (#f3e8d2). Warm, calm, intelligent, premium editorial feel. Do NOT render any readable words, captions, labels, headlines, sentences, or paragraphs — the image must contain no legible prose text, because a title will be overlaid afterward. Stylized logos, app or screen UI, code symbols, and abstract mark-making are fine as long as they are not spelled-out words. No photorealistic human faces. Wide 3:2 landscape composition with deliberate empty negative space in the LEFT third so a title can be overlaid later.`

export const A_LINE = `Style: flat abstract shapes combined with loose hand-drawn single-weight line-art (thin, confident strokes), minimal and geometric — a vintage mid-century editorial spot illustration. Flat color fills, subtle paper grain, no gradients, no 3D, no glossy realism.`

export const B_CONCEPT = `Style: rich conceptual editorial illustration, like a Wired or New Yorker feature spread, with one clear central metaphor. Painterly flat shading, depth, texture, sophisticated. Constrained to the palette.`

// engineering/ai/process → line-art; leadership/notes → conceptual.
const STYLE_BY_BUCKET: Record<string, CoverStyle> = {
  engineering: 'line-art',
  ai: 'line-art',
  process: 'line-art',
  leadership: 'conceptual',
  notes: 'conceptual',
}

export function selectStyle(tags: string[]): CoverStyle {
  return STYLE_BY_BUCKET[resolveBucket(tags).key] ?? 'conceptual'
}

export function buildCoverPrompt(input: {
  title: string
  summary?: string
  tags: string[]
  style?: CoverStyle
}): { prompt: string; style: CoverStyle } {
  const style = input.style ?? selectStyle(input.tags)
  const spine = style === 'line-art' ? A_LINE : B_CONCEPT
  const subject = input.summary
    ? `Concept: ${input.title}. ${input.summary}`
    : `Concept: ${input.title}.`
  return { prompt: `${spine}\n\n${subject}\n\n${BRAND}`, style }
}
