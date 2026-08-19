import { test, expect } from '@playwright/test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { active, built } from '../src/lib/projects'
import { SITE } from '../src/lib/site'

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
  await expect(
    page.getByText('I build a few things, and break a lot of things'),
  ).toBeVisible()
  await expect(page.getByText('Engineer', { exact: true })).toBeVisible()
  await expect(page.getByText('Founder', { exact: true })).toBeVisible()
  await expect(page.getByText("Lately I've built", { exact: true })).toHaveCount(
    0,
  )
  await expect(page.getByText('Senior Solutions Engineer')).toHaveCount(0)
  await expect(
    page.getByRole('link', { name: "More on what I'm doing now" }),
  ).toHaveAttribute('href', '/now')
})

test('header nav + footer socials', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  const homeLink = page.getByRole('link', {
    name: SITE.title,
    exact: true,
  })
  await expect(homeLink).toHaveCount(1)
  await expect(homeLink).toHaveText('')
  const headerMark = homeLink.locator('img[src="/favicon.svg"]')
  await expect(headerMark).toHaveCount(1)
  await expect(headerMark).toHaveAttribute('alt', '')
  await expect(headerMark).toHaveAttribute('aria-hidden', 'true')
  await expect(headerMark).toHaveCSS('width', '28px')
  await expect(headerMark).toHaveCSS('height', '28px')

  await expect(page.locator('header nav')).toContainText(['Blog'])
  await expect(page.locator('header nav')).toContainText(['Projects'])

  const footer = page.locator('footer')
  const footerMark = footer.locator('img[src="/favicon.svg"]')
  await expect(footerMark).toHaveAttribute('alt', '')
  await expect(footerMark).toHaveAttribute('aria-hidden', 'true')
  await expect(footer).toContainText(['GitHub'])
  await expect(footer).toContainText(['YouTube'])
  await expect(footer).toContainText(['LinkedIn'])

  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    header: document.querySelector('header')?.scrollWidth ?? 0,
  }))
  expect(widths.document).toBeLessThanOrEqual(widths.viewport)
  expect(widths.header).toBeLessThanOrEqual(widths.viewport)
})

test('RSS feed serves', async ({ request }) => {
  const res = await request.get('/feed.xml')
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toMatch(/xml/)
})

test('custom site icons serve', async ({ request }) => {
  const svg = await request.get('/favicon.svg')
  expect(svg.status()).toBe(200)
  expect(svg.headers()['content-type']).toMatch(/svg/)
  const source = await svg.text()
  expect(source).toContain('#b04a3a')
  expect(source).toContain('#15233a')
  expect(source).not.toContain('M48 58h6v12h-6Z')

  const touchIcon = await request.get('/static/favicons/apple-touch-icon.png')
  expect(touchIcon.status()).toBe(200)
  expect(touchIcon.headers()['content-type']).toMatch(/png/)
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

test('home keeps current work compact', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('link', { name: 'Oris', exact: true }).first(),
  ).toHaveAttribute('href', 'https://orisnotes.com')
  await expect(
    page.getByRole('link', { name: 'Agent Inbox', exact: true }).first(),
  ).toBeVisible()
  await expect(
    page.locator('.right-now').getByText('AskDocs', { exact: true }),
  ).toBeVisible()
  await expect(page.locator('.right-now li')).toHaveCount(3)
  await expect(page.getByText('Building Oris + agent tools')).toHaveCount(0)
})

test('now owns the changing snapshot', async ({ page }) => {
  await page.goto('/now')
  const focusProjects = active.filter((project) =>
    ['Oris', 'Agent Inbox', 'AskDocs'].includes(project.name),
  )

  for (const project of focusProjects) {
    const projectEntry = page.locator('.building').filter({
      has: page.getByRole('heading', { name: project.name }),
    })
    await expect(
      page.getByRole('heading', { name: project.name }),
    ).toBeVisible()
    if (project.blurb) {
      await expect(
        projectEntry.getByText(project.blurb, { exact: true }),
      ).toBeVisible()
    } else {
      await expect(projectEntry.locator('.project-blurb')).toHaveCount(0)
    }
    await expect(
      page.getByText(project.description, { exact: true }),
    ).toHaveCount(0)
    if (project.status) {
      await expect(
        projectEntry.getByText(project.status, { exact: true }),
      ).toBeVisible()
    } else {
      await expect(projectEntry.locator('.project-status')).toHaveCount(0)
    }
  }

  await expect(page.getByText('Day job', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Senior Solutions Engineer')).toHaveCount(0)

  const expectedTools = [
    'GitHub',
    'GitHub Copilot',
    'Claude',
    'Notion',
    '1Password',
    'iTerm2',
    'Obsidian',
    'Docker',
    'Swift',
    'TypeScript',
    'Astro',
    'Cloudflare',
    'SQLite',
  ]
  await expect(page.locator('.stack .tool')).toHaveCount(expectedTools.length)
  for (const tool of expectedTools) {
    await expect(
      page.locator('.stack').getByText(tool, { exact: true }),
    ).toBeVisible()
  }
  for (const oldTool of ['Soloterm', 'Spotify', 'Apple Music', 'Sublime Text']) {
    await expect(page.getByText(oldTool, { exact: true })).toHaveCount(0)
  }
})

test('projects remains the detailed project inventory', async ({ page }) => {
  await page.goto('/projects')
  await expect(page.getByRole('heading', { name: 'Oris' })).toBeVisible()
  await expect(
    page.getByText(active[0].description, { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText(built[0].description, { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'AskDocs', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('link', { name: 'GitHub Enterprise Settings Configurator' }),
  ).toBeVisible()
  for (const retired of ['coffee-ui', 'unrivaledpro', 'myspace']) {
    await expect(page.getByText(retired, { exact: true })).toHaveCount(0)
  }
})

test('about owns stable identity and points to current work', async ({ page }) => {
  await page.goto('/about')
  await expect(
    page.getByText('Senior Solutions Engineer, GitHub', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('Currently building', { exact: true })).toHaveCount(
    0,
  )
  await expect(page.getByText('Tools I reach for', { exact: true })).toHaveCount(
    0,
  )
  await expect(page.locator('.tool')).toHaveCount(0)

  const intro = page.locator('.lede')
  await expect(
    intro.getByRole('link', { name: 'now', exact: true }),
  ).toHaveAttribute('href', '/now')
  await expect(
    intro.getByRole('link', { name: "work I've shipped", exact: true }),
  ).toHaveAttribute('href', '/projects')
})

for (const slug of SLUGS) {
  test(`/blog/${slug} renders`, async ({ page }) => {
    const res = await page.goto(`/blog/${slug}`)
    expect(res?.status()).toBe(200)
    await expect(page.locator('h1').first()).toBeVisible()
  })
}

test('blog post exposes OG image meta and the PNG is built', async ({
  page,
}) => {
  const slug =
    'rewriting-our-engine-with-anthropic-claude-opus-4-8-and-dynamic-workflows'
  await page.goto(`/blog/${slug}`)

  const ogImage = page.locator('meta[property="og:image"]')
  await expect(ogImage).toHaveAttribute(
    'content',
    new RegExp(`/og/${slug}\\.png$`),
  )
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute(
    'content',
    '1200',
  )
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    'content',
    'summary_large_image',
  )

  expect(existsSync(`dist/og/${slug}.png`)).toBe(true)
})
