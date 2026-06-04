# Agent Commit Diffs + Private-Repo Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the drafting agent attach real (noise-filtered, size-capped) commit diffs to blog drafts, and widen repo scope to all repos owned by the token account (private + public).

**Architecture:** Stop discarding the `patch` field GitHub already returns per file; add a pure `diff-filter` module that drops noise files and caps size; render filtered diffs into the blog draft prompt for the commits a Ready row cites. Switch repo listing from public-only to `affiliation=owner`. Discovery is untouched.

**Tech Stack:** TypeScript (strict), Node 22 agent scripts under `scripts/agent/`, Vitest for unit tests, GitHub REST API.

**Spec:** `docs/superpowers/specs/2026-06-04-agent-commit-diffs-and-private-repos-design.md`

---

## File Structure

- **Modify** `scripts/agent/lib/types.ts` — add `CommitFile`, add `files: CommitFile[]` to `CommitInfo`.
- **Modify** `scripts/agent/lib/git-scan.ts` — `fetchFiles` returns `CommitFile[]`; `fetchCommits` populates `files`; `activeRepos` uses `/user/repos?affiliation=owner`.
- **Create** `scripts/agent/lib/diff-filter.ts` — `NOISE_PATTERNS`, `isNoiseFile`, `truncatePatch`, `buildDiffBlock` (pure functions).
- **Create** `scripts/agent/tests/diff-filter.test.ts` — unit tests for the above.
- **Modify** `scripts/agent/lib/draft-blog.ts` — render diff blocks in `buildBlogUserPrompt`.
- **Modify** `scripts/agent/tests/draft-blog.test.ts` — update commit fixture (`files`), assert diff rendering.

---

## Task 1: Plumb `patch` through `CommitInfo` (types + git-scan + fixture)

This is a plumbing change with no new behavior to unit-test (network code stays untested, per the spec). Keep the tree green: type, producer, and the one existing fixture change together.

**Files:**

- Modify: `scripts/agent/lib/types.ts:69-76`
- Modify: `scripts/agent/lib/git-scan.ts:18-22` (GhCommitFile), `:72-104` (fetchCommits/fetchFiles)
- Modify: `scripts/agent/tests/draft-blog.test.ts:40-52`

- [ ] **Step 1: Add `CommitFile` and extend `CommitInfo`**

In `scripts/agent/lib/types.ts`, replace the `CommitInfo` interface (lines 69-76) with:

```ts
export interface CommitFile {
  filename: string
  status: string // "added" | "modified" | "removed" | "renamed" | ...
  additions: number
  deletions: number
  patch?: string // absent for binary / too-large files
}

export interface CommitInfo {
  repo: string // e.g. "shariqh/lognote"
  sha: string
  message: string
  date: string
  files: CommitFile[] // full list, with diffs — used for drafting diff blocks
  filesChanged: string[] // names only, capped — used by discovery (unchanged)
  url: string
}
```

- [ ] **Step 2: Return structured files from `fetchFiles`**

In `scripts/agent/lib/git-scan.ts`, update the `GhCommitFile` interface (lines 18-22) and the `fetchFiles` function (currently lines 96-104). Replace the `GhCommitFile` interface with:

```ts
interface GhCommitFile {
  filename: string
  status: string
  additions: number
  deletions: number
  patch?: string
}
```

Replace `fetchFiles` with:

```ts
async function fetchFiles(repo: string, sha: string): Promise<CommitFile[]> {
  const url = `${GH_API}/repos/${repo}/commits/${sha}`
  const res = await fetch(url, { headers: ghHeaders() })
  if (!res.ok) return []
  const data = (await res.json()) as { files?: GhCommitFile[] }
  return (data.files ?? []).map((f) => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    patch: f.patch,
  }))
}
```

Add `CommitFile` to the type import at the top of the file (line 3):

```ts
import type { CommitInfo, CommitFile } from './types'
```

- [ ] **Step 3: Populate `files` in `fetchCommits`**

In `scripts/agent/lib/git-scan.ts`, the `fetchCommits` loop currently does (around lines 78-89):

```ts
for (const c of commits) {
  const files = await fetchFiles(repo, c.sha)
  results.push({
    repo,
    sha: c.sha,
    message: c.commit.message,
    date: c.commit.author.date,
    filesChanged: files.slice(0, 10),
    url: c.html_url,
  })
}
```

`files` is now `CommitFile[]`, so `filesChanged` can no longer be `files.slice(0, 10)`. Replace the `results.push({...})` block with:

```ts
results.push({
  repo,
  sha: c.sha,
  message: c.commit.message,
  date: c.commit.author.date,
  files,
  filesChanged: files.map((f) => f.filename).slice(0, 10),
  url: c.html_url,
})
```

- [ ] **Step 4: Update the existing test fixture**

In `scripts/agent/tests/draft-blog.test.ts`, the commit fixture (lines 44-51) is missing the now-required `files`. Add it. Replace the single commit object with:

```ts
        {
          repo: 'shariqh/lognote',
          sha: 'abc1234567890def1234567890def1234567890',
          message: 'feat: add logging',
          date: '2026-06-01T00:00:00Z',
          files: [
            {
              filename: 'src/log.ts',
              status: 'added',
              additions: 10,
              deletions: 0,
              patch: '@@ -0,0 +1,2 @@\n+export const log = () => {}\n',
            },
          ],
          filesChanged: ['src/log.ts'],
          url: 'https://github.com/shariqh/lognote/commit/abc',
        },
```

- [ ] **Step 5: Verify compile + existing tests still pass**

Run: `npm test`
Expected: PASS, all existing suites green (the draft-blog test still asserts `src/log.ts` and `feat: add logging`).

Run: `npx tsc --noEmit -p scripts/agent/tsconfig.json 2>/dev/null || npx tsc --noEmit`
Expected: no type errors. (If `scripts/agent` has no own tsconfig, the root strict check covers it.)

- [ ] **Step 6: Commit**

```bash
git add scripts/agent/lib/types.ts scripts/agent/lib/git-scan.ts scripts/agent/tests/draft-blog.test.ts
git commit -m "feat(agent): keep commit patch data on CommitInfo.files"
```

---

## Task 2: `diff-filter` — noise classification

**Files:**

- Create: `scripts/agent/lib/diff-filter.ts`
- Create: `scripts/agent/tests/diff-filter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/agent/tests/diff-filter.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isNoiseFile } from '../lib/diff-filter'

describe('isNoiseFile', () => {
  it.each([
    'package-lock.json',
    'apps/web/pnpm-lock.yaml',
    'go.sum',
    'dist/index.js',
    'src/.next/build-manifest.json',
    'app/styles.min.css',
    'bundle.js.map',
    'src/__snapshots__/foo.snap',
    'public/logo.png',
    'assets/font.woff2',
  ])('treats %s as noise', (f) => {
    expect(isNoiseFile(f)).toBe(true)
  })

  it.each(['src/log.ts', 'src/pages/index.astro', 'README.md', 'lib/auth.ts', 'styles/global.css'])(
    'treats %s as signal',
    (f) => {
      expect(isNoiseFile(f)).toBe(false)
    }
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/agent/tests/diff-filter.test.ts`
Expected: FAIL — cannot resolve `../lib/diff-filter`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/agent/lib/diff-filter.ts`:

```ts
// scripts/agent/lib/diff-filter.ts
// Pure helpers for turning a commit's file list into a prompt-sized, noise-free
// diff block. No I/O — unit-tested in isolation.

// Files whose diffs add no editorial signal. Add a pattern here to exclude more.
export const NOISE_PATTERNS: RegExp[] = [
  // lockfiles
  /(^|\/)package-lock\.json$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)bun\.lockb$/,
  /(^|\/)Cargo\.lock$/,
  /(^|\/)poetry\.lock$/,
  /(^|\/)Pipfile\.lock$/,
  /(^|\/)composer\.lock$/,
  /(^|\/)Gemfile\.lock$/,
  /(^|\/)go\.sum$/,
  /(^|\/)flake\.lock$/,
  // generated / build output
  /(^|\/)(dist|build|out|coverage|node_modules|vendor)\//,
  /(^|\/)\.next\//,
  /(^|\/)\.astro\//,
  // minified & sourcemaps
  /\.min\.(js|css)$/,
  /\.map$/,
  // test snapshots
  /(^|\/)__snapshots__\//,
  /\.snap$/,
  // binary / media
  /\.(png|jpe?g|gif|webp|ico|svg|pdf|woff2?|ttf|eot|mp4|mov|zip|gz|tgz)$/i,
]

export function isNoiseFile(filename: string): boolean {
  return NOISE_PATTERNS.some((re) => re.test(filename))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/agent/tests/diff-filter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/agent/lib/diff-filter.ts scripts/agent/tests/diff-filter.test.ts
git commit -m "feat(agent): add diff noise classifier"
```

---

## Task 3: `diff-filter` — `truncatePatch` + `buildDiffBlock`

**Files:**

- Modify: `scripts/agent/lib/diff-filter.ts`
- Modify: `scripts/agent/tests/diff-filter.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `scripts/agent/tests/diff-filter.test.ts`:

````ts
import { truncatePatch, buildDiffBlock } from '../lib/diff-filter'
import type { CommitInfo } from '../lib/types'

function commit(files: CommitInfo['files']): CommitInfo {
  return {
    repo: 'shariqh/lognote',
    sha: 'abcdef1234567890',
    message: 'feat: thing\n\nbody',
    date: '2026-06-01T00:00:00Z',
    files,
    filesChanged: files.map((f) => f.filename),
    url: 'https://github.com/shariqh/lognote/commit/abcdef1',
  }
}

describe('truncatePatch', () => {
  it('returns patch unchanged when under the line cap', () => {
    const { text, truncated } = truncatePatch('a\nb\nc', 10)
    expect(text).toBe('a\nb\nc')
    expect(truncated).toBe(0)
  })

  it('truncates and reports dropped line count', () => {
    const { text, truncated } = truncatePatch('a\nb\nc\nd\ne', 2)
    expect(text).toBe('a\nb')
    expect(truncated).toBe(3)
  })
})

describe('buildDiffBlock', () => {
  it('renders a fenced diff with the commit subject', () => {
    const block = buildDiffBlock(
      commit([
        {
          filename: 'src/log.ts',
          status: 'modified',
          additions: 2,
          deletions: 1,
          patch: '@@ x @@\n+a\n-b',
        },
      ])
    )
    expect(block).toContain('shariqh/lognote@abcdef1')
    expect(block).toContain('feat: thing')
    expect(block).toContain('```diff')
    expect(block).toContain('+a')
    expect(block).toContain('src/log.ts')
  })

  it('omits noise files but counts them', () => {
    const block = buildDiffBlock(
      commit([
        {
          filename: 'src/log.ts',
          status: 'modified',
          additions: 1,
          deletions: 0,
          patch: '@@ @@\n+a',
        },
        {
          filename: 'package-lock.json',
          status: 'modified',
          additions: 999,
          deletions: 0,
          patch: '@@ @@\n+noise',
        },
      ])
    )
    expect(block).toContain('1 lockfile/generated')
    expect(block).not.toContain('+noise')
  })

  it('shows no fence when every file is noise', () => {
    const block = buildDiffBlock(
      commit([
        {
          filename: 'package-lock.json',
          status: 'modified',
          additions: 9,
          deletions: 0,
          patch: '@@ @@\n+x',
        },
      ])
    )
    expect(block).not.toContain('```diff')
    expect(block).toContain('1 lockfile/generated')
  })

  it('truncates an oversized per-file patch', () => {
    const big = Array.from({ length: 50 }, (_, i) => `+line${i}`).join('\n')
    const block = buildDiffBlock(
      commit([
        { filename: 'src/big.ts', status: 'modified', additions: 50, deletions: 0, patch: big },
      ]),
      { maxPatchLines: 5 }
    )
    expect(block).toContain('more lines truncated')
    expect(block).not.toContain('+line49')
  })

  it('drops trailing files past the byte budget with a note', () => {
    const body = 'x'.repeat(200)
    const block = buildDiffBlock(
      commit([
        { filename: 'a.ts', status: 'modified', additions: 1, deletions: 0, patch: body },
        { filename: 'b.ts', status: 'modified', additions: 1, deletions: 0, patch: body },
        { filename: 'c.ts', status: 'modified', additions: 1, deletions: 0, patch: body },
      ]),
      { maxDiffBytes: 250 }
    )
    expect(block).toContain('more file(s) omitted')
  })

  it('lists a binary file without a diff body', () => {
    const block = buildDiffBlock(
      commit([{ filename: 'src/data.bin', status: 'added', additions: 0, deletions: 0 }])
    )
    expect(block).toContain('src/data.bin')
    expect(block).toContain('binary or no inline diff')
  })
})
````

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run scripts/agent/tests/diff-filter.test.ts`
Expected: FAIL — `truncatePatch` / `buildDiffBlock` are not exported.

- [ ] **Step 3: Implement**

Append to `scripts/agent/lib/diff-filter.ts`:

````ts
import type { CommitInfo } from './types'

// Caps keep one large refactor from blowing the prompt. Tunable.
const MAX_PATCH_LINES = 150
const MAX_DIFF_BYTES = 16_000

export interface DiffBlockOptions {
  maxPatchLines?: number
  maxDiffBytes?: number
}

export function truncatePatch(
  patch: string,
  maxLines: number
): { text: string; truncated: number } {
  const lines = patch.split('\n')
  if (lines.length <= maxLines) return { text: patch, truncated: 0 }
  return { text: lines.slice(0, maxLines).join('\n'), truncated: lines.length - maxLines }
}

/**
 * Render one commit's reviewable diff as a prompt fragment: a labelled, fenced
 * `diff` block of signal files only, with noise/over-budget omissions stated
 * explicitly (never silently hidden).
 */
export function buildDiffBlock(commit: CommitInfo, opts: DiffBlockOptions = {}): string {
  const maxPatchLines = opts.maxPatchLines ?? MAX_PATCH_LINES
  const maxDiffBytes = opts.maxDiffBytes ?? MAX_DIFF_BYTES
  const subject = commit.message.split('\n')[0]
  const header = `### ${commit.repo}@${commit.sha.slice(0, 7)} — ${subject}`

  const noiseCount = commit.files.filter((f) => isNoiseFile(f.filename)).length
  const signal = commit.files.filter((f) => !isNoiseFile(f.filename))
  const noiseNote = noiseCount > 0 ? `_${noiseCount} lockfile/generated change(s) omitted_` : ''

  if (signal.length === 0) {
    return `${header}\n${noiseNote || '_no reviewable changes_'}`
  }

  const parts: string[] = []
  let bytes = 0
  let included = 0
  for (const f of signal) {
    const label = `# ${f.filename} (${f.status}, +${f.additions} -${f.deletions})`
    let body: string
    if (!f.patch) {
      body = `${label}\n(binary or no inline diff)`
    } else {
      const { text, truncated } = truncatePatch(f.patch, maxPatchLines)
      body = `${label}\n${text}${truncated ? `\n… (${truncated} more lines truncated)` : ''}`
    }
    // Always include at least one file, then stop once the budget is exceeded.
    if (included > 0 && bytes + body.length > maxDiffBytes) break
    parts.push(body)
    bytes += body.length
    included++
  }

  const filesOmitted = signal.length - included
  const omittedNote =
    filesOmitted > 0 ? `\n… (${filesOmitted} more file(s) omitted for length)` : ''

  const lines = [header]
  if (noiseNote) lines.push(noiseNote)
  lines.push('```diff', parts.join('\n'), '```')
  return lines.join('\n') + omittedNote
}
````

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run scripts/agent/tests/diff-filter.test.ts`
Expected: PASS (all `truncatePatch` and `buildDiffBlock` cases).

- [ ] **Step 5: Commit**

```bash
git add scripts/agent/lib/diff-filter.ts scripts/agent/tests/diff-filter.test.ts
git commit -m "feat(agent): render noise-filtered, capped commit diff blocks"
```

---

## Task 4: Widen repo scope to all owned repos (private + public)

Plumbing/network change — no unit test (consistent with the codebase). Verified by typecheck here and a live API call in Task 6.

**Files:**

- Modify: `scripts/agent/lib/git-scan.ts:13-17` (GhRepo), `:54-68` (activeRepos)

- [ ] **Step 1: Widen the `GhRepo` interface**

In `scripts/agent/lib/git-scan.ts`, replace the `GhRepo` interface (lines 13-17) with:

```ts
interface GhRepo {
  name: string
  full_name: string
  owner: { login: string }
  pushed_at: string
  private: boolean
}
```

- [ ] **Step 2: Switch `activeRepos` to the authenticated-owner endpoint**

Replace the `activeRepos` function (currently lines 54-68) with:

```ts
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
```

- [ ] **Step 3: Verify compile + full suite**

Run: `npm test`
Expected: PASS (no test exercises `activeRepos`; this confirms nothing else broke).

Run: `npx tsc --noEmit` (root) — Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/agent/lib/git-scan.ts
git commit -m "feat(agent): scan all owned repos (private + public) via affiliation=owner"
```

---

## Task 5: Render diff blocks in the blog draft prompt

**Files:**

- Modify: `scripts/agent/lib/draft-blog.ts:1-2` (import), `:114-120` (commits section)
- Modify: `scripts/agent/tests/draft-blog.test.ts` (add assertion)

- [ ] **Step 1: Add the failing assertion**

In `scripts/agent/tests/draft-blog.test.ts`, the `buildBlogUserPrompt` test fixture now has a `patch`. Add two assertions at the end of that `it(...)` block (after the existing `expect(up).toContain('src/log.ts')`):

````ts
expect(up).toContain('```diff')
expect(up).toContain('export const log = () => {}')
````

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run scripts/agent/tests/draft-blog.test.ts`
Expected: FAIL — prompt has no ` ```diff ` block yet.

- [ ] **Step 3: Wire `buildDiffBlock` into the prompt**

In `scripts/agent/lib/draft-blog.ts`, add the import at the top (after line 2):

```ts
import { buildDiffBlock } from './diff-filter'
```

The commits section currently reads (around lines 114-120):

```ts
if (input.commits.length) {
  lines.push('## Recent commits (context)')
  for (const c of input.commits) {
    lines.push(
      `- \`${c.repo}@${c.sha.slice(0, 7)}\` (${c.date.slice(0, 10)}) — ${c.message.split('\n')[0]}`
    )
    if (c.filesChanged.length) lines.push(`  files: ${c.filesChanged.slice(0, 5).join(', ')}`)
  }
  lines.push('')
}
```

Append a diffs section immediately after that `if` block (before the `Today's date` line):

```ts
if (input.commits.length) {
  lines.push('## Diffs of referenced commits')
  lines.push('')
  for (const c of input.commits) {
    lines.push(buildDiffBlock(c))
    lines.push('')
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run scripts/agent/tests/draft-blog.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS (all suites).

- [ ] **Step 6: Commit**

```bash
git add scripts/agent/lib/draft-blog.ts scripts/agent/tests/draft-blog.test.ts
git commit -m "feat(agent): include commit diffs in blog draft prompt"
```

---

## Task 6: Final verification + live private-repo check

**Files:** none (verification only)

- [ ] **Step 1: Full suite + typecheck**

Run: `npm test`
Expected: PASS — every suite green.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Lint/format**

Run: `npx prettier --check scripts/agent`
Expected: all matched files use Prettier code style. (If it reports unformatted files, run `npx prettier --write scripts/agent` and amend the last commit.)

- [ ] **Step 3: Live private-repo read (confirms the widened PAT works)**

This proves the `AGENT_GH_TOKEN` scope reaches private repos. Replace `<PRIVATE_REPO>` with a real private repo name owned by the account. Using the local token from `.env.local`:

```bash
source scripts/agent/../../.env.local 2>/dev/null || source .env.local
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $AGENT_GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/shariqh/<PRIVATE_REPO>/commits?per_page=1"
```

Expected: `200`. A `404` means the PAT still lacks Contents/Metadata read on that repo — fix the PAT scope before relying on private-repo coverage. (This is the only step that can't be verified from code alone.)

- [ ] **Step 4: Open the PR**

```bash
git push -u origin agent/commit-diffs
gh pr create --title "Agent: commit diffs + private-repo scope" \
  --body "Implements docs/superpowers/specs/2026-06-04-agent-commit-diffs-and-private-repos-design.md. Drafting now attaches noise-filtered, size-capped diffs of cited commits; repo scope widened to all owned repos (private + public). Discovery unchanged."
```

The `ai-code-review` and `vale` workflows run on the PR. Address any HIGH findings before merge.

---

## Notes for the implementer

- **Node 22 / native `fetch`:** `git-scan.ts` uses global `fetch` — no import needed.
- **`Date.now()` is fine here:** these are ordinary Node agent scripts, not a Workflow script, so date/random restrictions don't apply.
- **Don't touch `discover.ts`:** it consumes a structural subtype of `CommitInfo` (no `files`), so the added field is transparent to it. Adding diffs to discovery is explicitly out of scope (token cost).
- **`filesChanged` stays capped at 10 names** to preserve the exact discovery prompt behavior; only `files` (full, with patches) is new.
