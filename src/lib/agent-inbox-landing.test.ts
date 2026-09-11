import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { active } from './projects'

const UPSTREAM_REPO = 'https://github.com/shariqh/agent-inbox'
const UPSTREAM_PATH = 'marketing/index.html'
const UPSTREAM_COMMIT = 'a924a78e5539c63c92b110b6201d4245ff5e8c98'
const EXPECTED_SHA256 =
  '0105c90e8555fe219e43bcdf87382add01141030b85f23abaf648750eb717dcf'
const LANDING_PAGE = new URL(
  '../../public/agent-inbox/index.html',
  import.meta.url,
)

describe('Agent Inbox landing page', () => {
  it(`matches ${UPSTREAM_REPO}/${UPSTREAM_PATH} at ${UPSTREAM_COMMIT}`, () => {
    const bytes = readFileSync(LANDING_PAGE)
    const actual = createHash('sha256').update(bytes).digest('hex')

    expect(
      actual,
      `Refresh ${UPSTREAM_PATH} from ${UPSTREAM_REPO} commit ${UPSTREAM_COMMIT} and update the pinned provenance only when intentionally vendoring a new version`,
    ).toBe(EXPECTED_SHA256)
  })

  it('uses the hosted landing page while retaining the source repository', () => {
    const project = active.find(({ name }) => name === 'Agent Inbox')

    expect(project).toMatchObject({
      site: 'https://shariq.dev/agent-inbox/',
      repo: UPSTREAM_REPO,
    })
  })
})
