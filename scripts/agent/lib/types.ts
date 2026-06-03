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

export type LegacyStatus =
  | 'Prepping'
  | 'Ready To Record'
  | 'Recording'
  | 'Post-Processing'
  | 'Published'
  | 'Abandoned'
  | '✅'

export type LegacyMedium =
  | 'blog'
  | 'youtube'
  | 'YT short'
  | 'podcast'
  | 'presentation'
  | 'IG reel'
  | 'stand up'

export type LegacyOrigin = 'OC' | 'x-post:bundle' | 'x-post:blog'

export interface CmsRow {
  id: string
  title: string
  status?: LegacyStatus
  medium: LegacyMedium[]
  origin?: LegacyOrigin
  tags: string[]
  type?: string
  keywords: string
  sources: string
  publishedLink?: string
  publishing?: string
  no?: number
}

export interface MappedRow {
  // The new row's intended properties (no ID — caller assigns)
  title: string
  kind: Kind
  stage: Stage
  origin: Origin
  crossPostTargets: CrossPostTarget[]
  tags: string[]
  tools: string[]
  hint: string
  sourceUrls: string[]
  publishedUrl?: string
  publishingDate?: string
  // Bookkeeping for derivatives:
  // If the row was split, the first piece keeps the original Notion page ID
  // and this is null. The subsequent piece(s) are NEW rows; this points at
  // the original page ID to install as Source Row after creation.
  sourceRowOriginalPageId?: string
}

export interface MigrationReport {
  totalInputRows: number
  rowsKept: number
  rowsSplit: number
  newRowsCreated: number
  abandoned: number
  unresolvedXPostBlog: string[] // titles where Source Row couldn't be matched
}
