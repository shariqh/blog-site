// scripts/agent/lib/youtube.ts
import { CONFIG } from './config'
import type { YouTubeStat } from './types'

const YT = 'https://www.googleapis.com/youtube/v3'

interface YtVideo {
  id: string
  snippet: { title: string; publishedAt: string }
  statistics: { viewCount?: string; likeCount?: string }
}

interface YtSearchItem {
  id: { videoId?: string }
  snippet: { publishedAt: string }
}

/**
 * Returns view + like stats for the channel's videos published in the last N days.
 */
export async function recentChannelStats(daysBack: number = 30): Promise<YouTubeStat[]> {
  const publishedAfter = new Date(Date.now() - daysBack * 86_400_000).toISOString()
  const searchUrl = `${YT}/search?part=id,snippet&channelId=${CONFIG.youtubeChannelId}&type=video&order=date&publishedAfter=${publishedAfter}&maxResults=50&key=${CONFIG.youtubeApiKey}`
  const searchRes = await fetch(searchUrl)
  if (!searchRes.ok) {
    console.warn(`YT search failed: ${searchRes.status}`)
    return []
  }
  const search = (await searchRes.json()) as { items: YtSearchItem[] }
  const ids = search.items.map((i) => i.id.videoId).filter((x): x is string => !!x)
  if (ids.length === 0) return []

  const videosUrl = `${YT}/videos?part=snippet,statistics&id=${ids.join(',')}&key=${
    CONFIG.youtubeApiKey
  }`
  const vidRes = await fetch(videosUrl)
  if (!vidRes.ok) return []
  const vids = (await vidRes.json()) as { items: YtVideo[] }
  return vids.items.map((v) => ({
    videoId: v.id,
    title: v.snippet.title,
    views: parseInt(v.statistics.viewCount ?? '0', 10),
    likes: parseInt(v.statistics.likeCount ?? '0', 10),
    publishedAt: v.snippet.publishedAt,
  }))
}
