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

// Safe wrapper: if the cover image is corrupt/undecodable, retries with
// cover: null so a bad image degrades to the branded fallback rather than
// crashing the static build. Only catches errors when a cover is present —
// if cover is already null (or absent), errors propagate so font/template
// bugs surface rather than being silently masked.
export async function renderOgSafe(data: OgData): Promise<Buffer> {
  if (!data.cover) {
    return renderOg(data)
  }
  try {
    return await renderOg(data)
  } catch {
    return await renderOg({ ...data, cover: null })
  }
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
