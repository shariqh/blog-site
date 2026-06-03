// scripts/agent/lib/config.ts
import 'dotenv/config'

function required(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required env var: ${key}`)
  return val
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback
}

export const CONFIG = {
  claudeOauthToken: required('CLAUDE_CODE_OAUTH_TOKEN'),
  notionToken: required('NOTION_TOKEN'),
  notionCmsDbId: required('NOTION_CMS_DB_ID'),
  youtubeApiKey: required('YOUTUBE_API_KEY'),
  youtubeChannelId: required('YOUTUBE_CHANNEL_ID'),
  agentGhToken: required('AGENT_GH_TOKEN'),

  scanRepoOrg: optional('SCAN_REPO_ORG', 'shariqh'),
  scanRepoInclude: optional('SCAN_REPO_INCLUDE', 'blog-site,lognote').split(','),
  scanRepoActiveDays: parseInt(optional('SCAN_REPO_ACTIVE_DAYS', '30'), 10),
} as const

export type Config = typeof CONFIG
