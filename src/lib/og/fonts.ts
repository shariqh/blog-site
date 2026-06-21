import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export type OgFont = {
  name: string
  data: Buffer
  weight: 400 | 500 | 600
  style: 'normal'
}

// process.cwd() is the project root in both vitest and Astro build contexts,
// so this path resolves correctly regardless of where the compiled chunk lives.
const DIR = join(process.cwd(), 'src/assets/og/fonts/')

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
