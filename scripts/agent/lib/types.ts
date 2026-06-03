// scripts/agent/lib/types.ts

export type Kind =
  | 'blog'
  | 'YT short'
  | 'YT long'
  | 'podcast'
  | 'presentation'
  | 'IG reel'
  | 'stand up'

export type Stage =
  | 'Idea'
  | 'Proposed'
  | 'Ready'
  | 'Drafted'
  | 'Recorded'
  | 'Edited'
  | 'Published'
  | 'Abandoned'

export type Origin = 'OC' | 'Agent Proposed' | 'Derivative'

export type CrossPostTarget = 'blog' | 'YT short' | 'YT long'

export interface ContentRow {
  id: string // Notion page ID
  title: string
  kind: Kind
  stage: Stage
  origin: Origin
  sourceRowId?: string
  crossPostTargets: CrossPostTarget[]
  tags: string[]
  tools: string[]
  hint: string
  sourceUrls: string[]
  draftUrl?: string
  publishedUrl?: string
  publishingDate?: string
  createdAt: string
  updatedAt: string
}

export interface Candidate {
  title: string
  hint: string
  tags?: string[]
  tools?: string[]
  sourceUrls: string[]
  rationale: string
}

export interface DiscoveryOutput {
  blogCandidates: Candidate[]
  ytCandidates: Candidate[]
}

export interface YTScriptBlocks {
  hook: string
  script: string
  onScreenText: Array<{ timestampSeconds: number; text: string }>
  bRoll: Array<{ timestampSeconds: number; description: string }>
  thumbnailPrompt: string
  titleVariants: string[]
  hashtags: string[]
}

export interface CommitInfo {
  repo: string // e.g. "shariqh/lognote"
  sha: string
  message: string
  date: string
  filesChanged: string[]
  url: string
}

export interface TrendingItem {
  source: 'gh-trending' | 'hn'
  title: string
  url: string
  hint?: string // e.g. HN score, GH stars-this-week
}

export interface YouTubeStat {
  videoId: string
  title: string
  views: number
  likes: number
  publishedAt: string
}
