import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import { loadOgFonts } from './fonts'
import { hybridTemplate, fallbackTemplate, brandedCoverTemplate } from './templates'
import type { OgData } from './data'

const WIDTH = 1200
const HEIGHT = 630

const COVER_WIDTH = 1536
const COVER_HEIGHT = 1024

export async function renderOg(data: OgData): Promise<Buffer> {
  const element = data.cover ? hybridTemplate(data) : fallbackTemplate(data)
  const svg = await satori(element as Parameters<typeof satori>[0], {
    width: WIDTH,
    height: HEIGHT,
    fonts: loadOgFonts(),
  })
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: WIDTH },
  })
    .render()
    .asPng()
  return png
}

// Title-less branded cover at 1536×1024 (3:2).
// Used as the deterministic fallback when gpt-image-1 keeps leaking text.
// No prose text is rendered — a title will be overlaid by the OG hybrid later.
export async function renderBrandedCover(): Promise<Buffer> {
  const element = brandedCoverTemplate()
  const svg = await satori(element as Parameters<typeof satori>[0], {
    width: COVER_WIDTH,
    height: COVER_HEIGHT,
    fonts: loadOgFonts(),
  })
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: COVER_WIDTH },
  })
    .render()
    .asPng()
  return png
}
