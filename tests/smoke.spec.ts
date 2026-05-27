import { test, expect } from '@playwright/test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function walkMdx(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const rel = prefix ? `${prefix}/${name}` : name
    if (statSync(p).isDirectory()) {
      if (name.startsWith('_')) continue
      out.push(...walkMdx(p, rel))
    } else if (rel.endsWith('.mdx')) {
      const content = readFileSync(p, 'utf8')
      if (/^\s*draft:\s*true/m.test(content)) continue
      out.push(rel.replace(/\.mdx$/, ''))
    }
  }
  return out
}

const SLUGS = walkMdx('src/content/writing')

test('homepage renders', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('h1')).toContainText(['Writing'])
})

test('RSS feed serves', async ({ request }) => {
  const res = await request.get('/feed.xml')
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toMatch(/xml/)
})

for (const slug of SLUGS) {
  test(`/blog/${slug} renders`, async ({ page }) => {
    const res = await page.goto(`/blog/${slug}`)
    expect(res?.status()).toBe(200)
    await expect(page.locator('h1').first()).toBeVisible()
  })
}
