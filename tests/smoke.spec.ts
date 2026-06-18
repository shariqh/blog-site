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

test('homepage renders the zine hero', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('h1')).toContainText(['Shariq'])
  await expect(page.locator('[data-deck] .deck img')).toHaveCount(5)
  await expect(page.locator('.featured')).toBeVisible()
  await expect(page.getByText('I build a few things, and break a lot of things')).toBeVisible()
})

test('header nav + footer socials', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('header nav')).toContainText(['Blog'])
  await expect(page.locator('header nav')).toContainText(['Projects'])
  const footer = page.locator('footer')
  await expect(footer).toContainText(['GitHub'])
  await expect(footer).toContainText(['YouTube'])
  await expect(footer).toContainText(['LinkedIn'])
})

test('RSS feed serves', async ({ request }) => {
  const res = await request.get('/feed.xml')
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toMatch(/xml/)
})

test('blog listing renders + filters', async ({ page }) => {
  await page.goto('/blog')
  await expect(page.locator('h1')).toContainText(['Blog'])
  await expect(page.locator('.featured')).toBeVisible()
  // All + 5 buckets = 6 pills
  await expect(page.locator('[data-filter]')).toHaveCount(6)
  const cards = page.locator('[data-bucket]')
  const total = await cards.count()
  expect(total).toBeGreaterThan(0)
  await page.locator('[data-filter="engineering"]').click()
  const visible = page.locator('[data-bucket]:visible')
  const vCount = await visible.count()
  expect(vCount).toBeGreaterThan(0)
  for (let k = 0; k < vCount; k++) {
    await expect(visible.nth(k)).toHaveAttribute('data-bucket', 'engineering')
  }
})

for (const slug of SLUGS) {
  test(`/blog/${slug} renders`, async ({ page }) => {
    const res = await page.goto(`/blog/${slug}`)
    expect(res?.status()).toBe(200)
    await expect(page.locator('h1').first()).toBeVisible()
  })
}
