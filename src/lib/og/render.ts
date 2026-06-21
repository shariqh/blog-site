import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import { loadOgFonts } from './fonts'
import { hybridTemplate, fallbackTemplate } from './templates'
import type { OgData } from './data'

const WIDTH = 1200
const HEIGHT = 630

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
