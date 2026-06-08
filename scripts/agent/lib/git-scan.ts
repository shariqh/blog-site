// scripts/agent/lib/git-scan.ts
import { CONFIG } from './config'
import type { CommitInfo, CommitFile } from './types'

interface GhCommit {
  sha: string
  html_url: string
  commit: { message: string; author: { date: string } }
}

interface GhCommitFile {
  filename: string
  status: string
  additions: number
  deletions: number
  patch?: string
}

interface GhRepo {
  name: string
  full_name: string
  owner: { login: string }
  pushed_at: string
  private: boolean
}

const GH_API = 'https://api.github.com'

function ghHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${CONFIG.agentGhToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

/**
 * Returns commits across all repos in scope from the last N days.
 * Scope = always-on repos (CONFIG.scanRepoInclude) + any public repo under
 * CONFIG.scanRepoOrg with a push in the last CONFIG.scanRepoActiveDays days.
 */
export async function recentCommits(daysBack: number = 7): Promise<CommitInfo[]> {
  const since = new Date(Date.now() - daysBack * 86_400_000).toISOString()
  const repos = await reposInScope()
  const allCommits: CommitInfo[] = []
  for (const repo of repos) {
    try {
      const commits = await fetchCommits(repo, since)
      allCommits.push(...commits)
    } catch (err) {
      console.warn(`Failed to fetch commits for ${repo}: ${(err as Error).message}`)
    }
  }
  return allCommits
}

async function reposInScope(): Promise<string[]> {
  const always = CONFIG.scanRepoInclude.map((r) => `${CONFIG.scanRepoOrg}/${r}`)
  const opportunistic = await activeRepos()
  const set = new Set<string>([...always, ...opportunistic])
  return [...set]
}

async function activeRepos(): Promise<string[]> {
  // /user/repos with affiliation=owner returns the token owner's repos —
  // private AND public — so private-repo commits come into scope. Other
  // accounts' repos are never returned by this endpoint.
  const url = `${GH_API}/user/repos?affiliation=owner&per_page=100&sort=pushed`
  const res = await fetch(url, { headers: ghHeaders() })
  if (!res.ok) {
    console.warn(`Failed to list owned repos: ${res.status}`)
    return []
  }
  const repos = (await res.json()) as GhRepo[]
  const cutoff = Date.now() - CONFIG.scanRepoActiveDays * 86_400_000
  return repos
    .filter(
      (r) => r.owner.login === CONFIG.scanRepoOrg && new Date(r.pushed_at).getTime() >= cutoff
    )
    .map((r) => r.full_name)
}

async function fetchCommits(repo: string, sinceISO: string): Promise<CommitInfo[]> {
  const url = `${GH_API}/repos/${repo}/commits?since=${sinceISO}&per_page=50`
  const res = await fetch(url, { headers: ghHeaders() })
  if (!res.ok) throw new Error(`${res.status}`)
  const commits = (await res.json()) as GhCommit[]
  const results: CommitInfo[] = []
  for (const c of commits) {
    const files = await fetchFiles(repo, c.sha)
    results.push({
      repo,
      sha: c.sha,
      message: c.commit.message,
      date: c.commit.author.date,
      files,
      filesChanged: files.map((f) => f.filename).slice(0, 10),
      url: c.html_url,
    })
  }
  return results
}

async function fetchFiles(repo: string, sha: string): Promise<CommitFile[]> {
  const url = `${GH_API}/repos/${repo}/commits/${sha}`
  const res = await fetch(url, { headers: ghHeaders() })
  if (!res.ok) {
    console.warn(`Failed to fetch files for ${repo}@${sha}: ${res.status}`)
    return []
  }
  const data = (await res.json()) as { files?: GhCommitFile[] }
  return (data.files ?? []).map((f) => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    patch: f.patch,
  }))
}
