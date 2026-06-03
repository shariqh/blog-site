import { spawnSync } from 'node:child_process'

export interface PrInput {
  branchName: string
  commitMessage: string
  prTitle: string
  prBody: string
}

export interface PrResult {
  branch: string
  prUrl: string
}

function run(cmd: string, args: string[]): { code: number; stdout: string; stderr: string } {
  const proc = spawnSync(cmd, args, { encoding: 'utf8' })
  return {
    code: proc.status ?? 1,
    stdout: proc.stdout ?? '',
    stderr: proc.stderr ?? '',
  }
}

/**
 * Creates a branch from the current HEAD, commits whatever's staged, pushes,
 * and opens a PR via `gh`. Returns the PR URL.
 *
 * Caller is responsible for `git add`ing the relevant files before calling.
 */
export function createBranchAndPr(input: PrInput): PrResult {
  // Create branch
  const co = run('git', ['checkout', '-b', input.branchName])
  if (co.code !== 0) throw new Error(`git checkout -b failed: ${co.stderr}`)

  // Commit
  const commit = run('git', ['commit', '-m', input.commitMessage])
  if (commit.code !== 0) throw new Error(`git commit failed: ${commit.stderr}`)

  // Push
  const push = run('git', ['push', '-u', 'origin', input.branchName])
  if (push.code !== 0) throw new Error(`git push failed: ${push.stderr}`)

  // PR
  const pr = run('gh', [
    'pr',
    'create',
    '--title',
    input.prTitle,
    '--body',
    input.prBody,
    '--label',
    'agent-draft',
  ])
  if (pr.code !== 0) throw new Error(`gh pr create failed: ${pr.stderr}`)
  const url = pr.stdout.trim().split('\n').pop() ?? ''
  if (!url.startsWith('https://')) {
    throw new Error(`Unexpected gh pr create output: ${pr.stdout}`)
  }
  return { branch: input.branchName, prUrl: url }
}
