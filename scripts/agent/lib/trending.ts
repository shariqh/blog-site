// scripts/agent/lib/trending.ts
import type { TrendingItem } from './types'

const HN_TOP = 'https://hacker-news.firebaseio.com/v0/topstories.json'
const HN_ITEM = (id: number): string => `https://hacker-news.firebaseio.com/v0/item/${id}.json`

const HN_KEYWORDS = [
  'cli',
  'agent',
  'claude',
  'gemini',
  'copilot',
  'codex',
  'cursor',
  'tool',
  'mcp',
]

export async function fetchTrending(extraTools: string[] = []): Promise<TrendingItem[]> {
  const [hn, gh] = await Promise.all([
    fetchHnFiltered([...HN_KEYWORDS, ...extraTools]),
    fetchGhTrending(),
  ])
  return [...hn, ...gh]
}

async function fetchHnFiltered(keywords: string[]): Promise<TrendingItem[]> {
  try {
    const topRes = await fetch(HN_TOP)
    if (!topRes.ok) return []
    const ids = (await topRes.json()) as number[]
    const sample = ids.slice(0, 100) // top 100 stories
    const items: TrendingItem[] = []
    const kws = keywords.map((k) => k.toLowerCase())
    for (const id of sample) {
      const itemRes = await fetch(HN_ITEM(id))
      if (!itemRes.ok) continue
      const it = (await itemRes.json()) as {
        title?: string
        url?: string
        score?: number
        type?: string
      }
      if (it.type !== 'story' || !it.title) continue
      const title = it.title
      const lower = title.toLowerCase()
      if (!kws.some((k) => lower.includes(k))) continue
      items.push({
        source: 'hn',
        title,
        url: it.url ?? `https://news.ycombinator.com/item?id=${id}`,
        hint: it.score ? `HN ${it.score} points` : undefined,
      })
      if (items.length >= 10) break
    }
    return items
  } catch (err) {
    console.warn(`HN fetch failed: ${(err as Error).message}`)
    return []
  }
}

async function fetchGhTrending(): Promise<TrendingItem[]> {
  const langs = ['typescript', 'python', 'rust']
  const items: TrendingItem[] = []
  for (const lang of langs) {
    try {
      const url = `https://github.com/trending/${lang}?since=weekly`
      const res = await fetch(url, {
        headers: { 'User-Agent': 'shariq-dev-agent/1.0' },
      })
      if (!res.ok) continue
      const html = await res.text()
      // Match the standard trending repo card structure
      const matches = html.match(/href="\/[^/\s]+\/[^/\s"]+"[^>]*>\s*<svg/g) ?? []
      const seen = new Set<string>()
      for (const m of matches) {
        const path = m.match(/href="(\/[^/]+\/[^/"]+)"/)?.[1]
        if (!path) continue
        if (seen.has(path)) continue
        seen.add(path)
        items.push({
          source: 'gh-trending',
          title: path.slice(1),
          url: `https://github.com${path}`,
          hint: `trending ${lang}`,
        })
        if (items.length >= 15) break
      }
    } catch (err) {
      console.warn(`GH trending ${lang} failed: ${(err as Error).message}`)
    }
  }
  return items
}
