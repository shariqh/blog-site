import { createHash } from 'node:crypto'
import { Resvg } from '@resvg/resvg-js'

// The deterministic fallback when gpt-image-1 keeps leaking text: render a
// title-less branded cover whose geometry varies by article. The OG hybrid
// overlays the title later, so no text is baked into this image.
export async function renderFallbackCover(args: {
  title: string
  summary?: string
  concept?: string
  tags: string[]
}): Promise<Buffer> {
  const seed = [args.title, args.summary, args.concept, ...args.tags]
    .filter(Boolean)
    .join('\n')
  const hash = createHash('sha256').update(seed).digest()
  const x1 = 760 + (hash[0]! % 180)
  const y1 = 80 + (hash[1]! % 120)
  const radius = 60 + (hash[2]! % 80)
  const x2 = 1080 + (hash[3]! % 260)
  const y2 = 650 + (hash[4]! % 170)
  const rotation = -20 + (hash[5]! % 40)
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024">
      <rect width="1536" height="1024" fill="#15233a"/>
      <g transform="rotate(${rotation} 1120 500)">
        <path d="M${x1} ${y1} C1010 40 1320 120 1450 330 C1530 470 1460 620 1280 650 C1070 690 930 580 820 430 C750 330 710 190 ${x1} ${y1}Z" fill="#d49a3a"/>
        <path d="M${x2 - 220} ${y2} C1110 600 1370 620 1510 790 L1510 1024 L810 1024 C800 930 850 820 ${x2 - 220} ${y2}Z" fill="#b04a3a"/>
        <circle cx="${x2}" cy="${y1 + 210}" r="${radius}" fill="#f3e8d2"/>
        <path d="M720 690 C860 590 1010 570 1170 610" fill="none" stroke="#f3e8d2" stroke-width="16" stroke-linecap="round"/>
        <path d="M860 210 L1110 500 L1370 170" fill="none" stroke="#15233a" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/>
      </g>
    </svg>`
  return Buffer.from(
    new Resvg(svg, { fitTo: { mode: 'width', value: 1536 } }).render().asPng(),
  )
}
