import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export type OgFont = {
  name: string
  data: Buffer
  weight: 400 | 500 | 600
  style: 'normal'
}

const DIR = fileURLToPath(new URL('../../assets/og/fonts/', import.meta.url))

function read(file: string): Buffer {
  return readFileSync(`${DIR}${file}`)
}

let cache: OgFont[] | null = null

// Loaded once and cached; satori() is called per-post at build.
export function loadOgFonts(): OgFont[] {
  if (cache) return cache
  cache = [
    { name: 'Fraunces', data: read('fraunces-400.ttf'), weight: 400, style: 'normal' },
    { name: 'Fraunces', data: read('fraunces-600.ttf'), weight: 600, style: 'normal' },
    { name: 'Inter', data: read('inter-400.ttf'), weight: 400, style: 'normal' },
    { name: 'Inter', data: read('inter-500.ttf'), weight: 500, style: 'normal' },
    { name: 'JetBrains Mono', data: read('jetbrains-mono-500.ttf'), weight: 500, style: 'normal' },
  ]
  return cache
}
