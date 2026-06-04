# Commit diffs + private-repo scope for the drafting agent

**Date:** 2026-06-04
**Status:** Approved (design)
**Builds on:** `2026-06-02-plan-b-ai-drafting-agent-design.md`

## Problem

When the drafting agent (`agent-draft`) writes a blog post from a Notion
`Stage=Ready` row, it can attach context from GitHub commits the row cites in
its **Source URLs**. Today that context is impoverished in two ways:

1. **It throws away the diff.** The `/commits/{sha}` GitHub API call the agent
   already makes returns a `patch` (unified diff) per file. `fetchFiles` in
   `lib/git-scan.ts` keeps only `filename` and discards `patch`. The agent
   therefore sees _which_ files changed (headline + filenames), never _what_
   changed. The substance has to be hand-written into the row's Hint.

2. **It can't see private repos.** Repo scope is built from public repos only
   (`/users/shariqh/repos?type=public`, with `!private` filtered out), so a
   commit in a private repo never matches a Source URL and never contributes
   context.

This makes the 7-day commit window feel lossy: a change not written up quickly
loses its auto-pulled context. Passing real (filtered) diffs and covering
private repos makes commit-sourced drafts substantially richer.

## Goals

- Drafting reads the **actual diff** of the commits a Ready row references,
  filtered for noise and size-capped.
- Repo scope covers **all repos owned by the token account** (`shariqh`),
  private and public, recently pushed — and _only_ those (never other
  accounts' public repos).
- **Discovery is unchanged.** It keeps using commit headline + filenames; full
  diffs are not fed into discovery (decision below).

## Non-goals (YAGNI)

- No diffs in discovery. Discovery scans up to ~40 commits; full diffs there
  would balloon the nightly prompt and token cost, mostly on commits that never
  become drafts. Confirmed: drafting-only.
- No per-repo or per-row overrides for the noise list, diff caps, or repo
  scope. One global denylist + two global caps. Confirmed.
- No reading of PR objects (descriptions, review threads) or open/unmerged PRs.
  The source remains the commit list on the default branch; merged PRs surface
  as commits there.
- No diff fetching for commits a Ready row does **not** reference.

## Design

Three units, each with one job.

### 1. Diff capture — `lib/git-scan.ts`

Stop discarding `patch`. No new API calls; the data is already in the response
we pay for.

- `fetchFiles(repo, sha)` returns `CommitFile[]` instead of `string[]`, where:
  ```ts
  interface CommitFile {
    filename: string
    status: string // "added" | "modified" | "removed" | "renamed" | ...
    additions: number
    deletions: number
    patch?: string // absent for binary / too-large files (expected)
  }
  ```
- `CommitInfo` gains `files: CommitFile[]`. The existing
  `filesChanged: string[]` field stays, derived as `files.map(f => f.filename)`,
  so **`discover.ts` and its prompt are untouched**.

### 2. Noise filter — `lib/diff-filter.ts` (new)

Pure functions, unit-tested in isolation. Exposes:

- `NOISE_PATTERNS: string[]` — single exported array; amending is a one-line
  edit. Covers:
  - Lockfiles: `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`,
    `bun.lockb`, `Cargo.lock`, `poetry.lock`, `Pipfile.lock`,
    `composer.lock`, `Gemfile.lock`, `go.sum`, `flake.lock`
  - Generated/build dirs: `dist/`, `build/`, `out/`, `.next/`, `.astro/`,
    `coverage/`, `node_modules/`, `vendor/`
  - Minified & maps: `*.min.js`, `*.min.css`, `*.map`
  - Snapshots: `__snapshots__/`, `*.snap`
  - Binary/media by extension: images, fonts, video, archives, `.pdf`
- `isNoiseFile(filename): boolean`
- `buildDiffBlock(commit, opts): string` — renders the prompt fragment:
  - Drops noise files from the diff but **counts** them, e.g.
    `+ 2 lockfile/generated changes omitted` (never silently hidden).
  - Per-file patch truncated at `MAX_PATCH_LINES` (~150) →
    `… (N more lines truncated)`.
  - Per-commit signal-diff budget `MAX_DIFF_BYTES` (~16 KB): include files
    until the budget is hit; note the remainder omitted.
  - Files with no `patch` (binary) are listed by name + status, no diff body.

`MAX_PATCH_LINES` and `MAX_DIFF_BYTES` are module constants — tunable.

### 3. Prompt wiring + private-repo scope

**`lib/draft-blog.ts`** — `buildBlogUserPrompt` renders, for each referenced
commit, a fenced ` ```diff ` block via `buildDiffBlock`. Only commits cited in
the row's Source URLs get diffs (typically 1–3), so the prompt stays focused.
The existing "Recent commits (context)" headline list is kept; the diff blocks
augment it.

**`lib/git-scan.ts` `activeRepos()`** — switch the listing from the public-only
user endpoint to the authenticated-owner endpoint:

- `GET /user/repos?affiliation=owner&per_page=100&sort=pushed`
- Filter to `owner.login === CONFIG.scanRepoOrg` (belt-and-suspenders; the
  endpoint already returns only owned repos) and `pushed_at` within
  `CONFIG.scanRepoActiveDays`.
- Drop the `!private` exclusion.

The always-on `CONFIG.scanRepoInclude` list is retained as a safety net for
repos not pushed within the active-days window.

#### Token prerequisite (operator action — already done)

`AGENT_GH_TOKEN` (fine-grained PAT) must grant **Contents: Read** +
**Metadata: Read**. The operator has set it to **All repositories**. The code
change is inert without this. Post-change verification: a live API call against
a known private repo's commit list must return 200 before we trust the scope.

## Data flow (drafting, after change)

```
Ready row ──┐
            │ Source URLs cite commit URLs (.../commit/<sha>)
            ▼
recentCommits(7)  ── /user/repos?affiliation=owner → in-scope repos (priv+pub)
            │           └─ per repo: /commits?since=7d → /commits/{sha} (w/ patch)
            ▼
draftBlogRow: match cited SHAs → commits[]
            ▼
buildBlogUserPrompt → buildDiffBlock(commit) per cited commit
            │   ├─ drop noise files (counted)
            │   ├─ truncate per-file patch
            │   └─ cap per-commit diff bytes
            ▼
Claude prompt: headline list + fenced diff blocks
```

## Error handling

- Binary / too-large files: `patch` absent → list filename + status, no body
  (already handled by the optional `patch` field).
- A commit with _only_ noise files: diff block shows just the omitted-count
  line; no empty fence.
- Private-repo fetch failure (token lacks access): existing per-repo
  `try/catch` in `recentCommits` logs a warning and skips — drafting still
  proceeds with whatever it could fetch. Surfaced in CI logs.
- Over-budget commit: included files until budget, explicit
  `… (M more files omitted)` note — never silent truncation.

## Testing

Unit tests (`scripts/agent/tests/`) for `diff-filter.ts` only — pure functions:

- `isNoiseFile`: lockfile/min.js/snapshot/image → `true`; `.ts`/`.astro`/`.md`
  → `false`.
- `buildDiffBlock`: noise files excluded but counted; per-file truncation past
  `MAX_PATCH_LINES`; per-commit budget overflow drops trailing files with a
  note; binary (no `patch`) listed without body.

The network code in `git-scan.ts` stays thin and untested, consistent with the
current codebase.

## Rollout

1. Land code change (this branch → PR).
2. Operator confirms `AGENT_GH_TOKEN` scope (done: All repositories).
3. Verify private-repo read with a live API call before merge.
4. Next `agent-draft` run picks it up automatically — no workflow edits needed.
