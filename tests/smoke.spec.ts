import { test, expect } from '@playwright/test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import matter from 'gray-matter'
import { active, built } from '../src/lib/projects'
import { buildArticlePath } from '../src/lib/popular-articles'
import { buildReadCountUrl } from '../src/lib/read-count'
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
const READ_COUNT_SLUG =
  'rewriting-our-engine-with-anthropic-claude-opus-4-8-and-dynamic-workflows'
const READ_COUNT_PATH = `/blog/${READ_COUNT_SLUG}/`
const READ_COUNT_ROUTE = 'https://shariq-blog.goatcounter.com/counter/**'
const READ_COUNT_URL = buildReadCountUrl(READ_COUNT_PATH)

interface HomeArticleFixture {
  slug: string
  title: string
  publishedAt: number
}

function readHomeArticles(dir: string, prefix = ''): HomeArticleFixture[] {
  const articles: HomeArticleFixture[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const relativePath = prefix ? `${prefix}/${name}` : name
    if (statSync(path).isDirectory()) {
      if (name.startsWith('_')) continue
      articles.push(...readHomeArticles(path, relativePath))
      continue
    }
    if (!relativePath.endsWith('.mdx')) continue

    const { data } = matter(readFileSync(path, 'utf8'))
    if (data.draft === true) continue
    const publishedAt = Date.parse(String(data.date))
    if (typeof data.title !== 'string' || Number.isNaN(publishedAt)) {
      throw new Error(`Invalid homepage article fixture: ${relativePath}`)
    }
    articles.push({
      slug: relativePath.replace(/\.mdx$/, ''),
      title: data.title,
      publishedAt,
    })
  }
  return articles
}

const HOME_ARTICLES = readHomeArticles('src/content/writing')
const HOME_FEATURED = HOME_ARTICLES.toSorted(
  (left, right) => right.publishedAt - left.publishedAt,
)[0]
const [POPULAR_FIRST, POPULAR_SECOND, POPULAR_THIRD] = HOME_ARTICLES.filter(
  (article) => article.slug !== HOME_FEATURED?.slug,
).toSorted((left, right) =>
  left.slug < right.slug ? -1 : left.slug > right.slug ? 1 : 0,
)

if (!HOME_FEATURED || !POPULAR_FIRST || !POPULAR_SECOND || !POPULAR_THIRD) {
  throw new Error(
    'Homepage popularity smoke tests require four published posts',
  )
}

const POPULAR_FIXTURES = [
  { article: POPULAR_FIRST, count: '2,345', label: '2,345 views' },
  { article: POPULAR_SECOND, count: '42', label: '42 views' },
  { article: POPULAR_THIRD, count: '1', label: '1 view' },
] as const

test.beforeEach(async ({ page }) => {
  await page.route('**/gc.zgo.at/count.js', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: '' }),
  )
  await page.route(READ_COUNT_ROUTE, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({}),
    }),
  )
})

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

test('homepage ranks popular articles without duplication or overflow', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  const countByUrl = new Map<string, string>([
      [buildReadCountUrl(buildArticlePath(HOME_FEATURED.slug)), '9,999'],
    ...POPULAR_FIXTURES.map(
      ({ article, count }) =>
          [buildReadCountUrl(buildArticlePath(article.slug)), count] as const,
    ),
  ])
  await page.unroute(READ_COUNT_ROUTE)
  await page.route(READ_COUNT_ROUTE, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        count: countByUrl.get(route.request().url()) ?? '0',
      }),
    }),
  )

  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('/')

    const popular = page.locator('[data-popular-articles]')
    await expect(popular).toHaveAttribute(
      'data-popular-articles-state',
      'loaded',
    )
    await expect(popular).toBeVisible()
    await expect(
      popular.getByRole('heading', { name: 'Most popular' }),
    ).toBeVisible()
    await expect(popular.locator('[data-popular-candidate]')).toHaveCount(3)
    await expect(popular.locator('[data-popular-title]')).toHaveText(
      POPULAR_FIXTURES.map(({ article }) => article.title),
    )
    await expect(popular.locator('[data-popular-count]')).toHaveText(
      POPULAR_FIXTURES.map(({ label }) => label),
    )
    await expect(
      popular.locator(
        `[data-popular-candidate][data-article-id="${HOME_FEATURED.slug}"]`,
      ),
    ).toHaveCount(0)

    const widths = await page.evaluate(() => {
      const section = document.querySelector<HTMLElement>(
        '[data-popular-articles]',
      )
      return {
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
        section: section?.scrollWidth ?? 0,
      }
    })
    expect(widths.document).toBeLessThanOrEqual(widths.viewport)
    expect(widths.section).toBeLessThanOrEqual(widths.viewport)
  }

  expect(errors).toEqual([])
})

test('homepage shows partial popularity and hides total failure cleanly', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  const validUrl = buildReadCountUrl(buildArticlePath(POPULAR_THIRD.slug))
  await page.unroute(READ_COUNT_ROUTE)
  await page.route(READ_COUNT_ROUTE, (route) =>
    route.request().url() === validUrl
      ? route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ count: '1' }),
        })
      : route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({}),
        }),
  )

  await page.goto('/')
  const popular = page.locator('[data-popular-articles]')
  await expect(popular).toHaveAttribute('data-popular-articles-state', 'loaded')
  await expect(popular).toBeVisible()
  await expect(popular.locator('[data-popular-candidate]')).toHaveCount(1)
  await expect(popular.locator('[data-popular-title]')).toHaveText([
    POPULAR_THIRD.title,
  ])
  await expect(popular.locator('[data-popular-count]')).toHaveText(['1 view'])

  await page.unroute(READ_COUNT_ROUTE)
  await page.route(READ_COUNT_ROUTE, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({}),
    }),
  )
  await page.goto('/')
  await expect(popular).toHaveAttribute(
    'data-popular-articles-state',
    'unavailable',
  )
  await expect(popular).toBeHidden()
  expect(errors).toEqual([])
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
    { name: 'GitHub', icon: 'github' },
    { name: 'GitHub Copilot', icon: 'githubcopilot' },
    { name: 'Claude', icon: 'claude' },
    { name: 'Notion', icon: 'notion' },
    { name: '1Password', icon: '1password' },
    { name: 'iTerm2', icon: 'iterm2' },
    { name: 'Obsidian', icon: 'obsidian' },
    { name: 'Docker', icon: 'docker' },
    { name: 'Swift', icon: 'swift' },
    { name: 'TypeScript', icon: 'typescript' },
    { name: 'Astro', icon: 'astro' },
    { name: 'Cloudflare', icon: 'cloudflare' },
  ]
  const toolChips = page.locator('.stack .tool')
  await expect(toolChips).toHaveCount(expectedTools.length)
  await expect(toolChips).toHaveText(expectedTools.map(({ name }) => name))
  for (const [index, tool] of expectedTools.entries()) {
    const chip = toolChips.nth(index)
    const icon = chip.locator('.tool-ic')
    await expect(chip).toHaveText(tool.name)
    await expect(icon).toHaveAttribute(
      'style',
      `--ic: url(/static/icons/${tool.icon}.svg)`,
    )
    await expect(icon).toHaveCSS(
      'mask-image',
      new RegExp(`/static/icons/${tool.icon}\\.svg`),
    )
  }
  await expect(page.getByText('SQLite', { exact: true })).toHaveCount(0)
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

test('blog post reveals GoatCounter views without responsive or console regressions', async ({
  page,
}) => {
  const errors: string[] = []
  const requests: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.unroute(READ_COUNT_ROUTE)
  await page.route(READ_COUNT_ROUTE, (route) => {
    requests.push(route.request().url())
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ count: '1,234' }),
    })
  })

  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto(READ_COUNT_PATH)

    const readCount = page.locator('[data-read-count]')
    await expect(readCount).toHaveAttribute('data-path', READ_COUNT_PATH)
    await expect(readCount).toHaveAttribute('data-read-count-state', 'loaded')
    await expect(readCount).toBeVisible()
    await expect(readCount).toContainText('1,234 views')

    const widths = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
    }))
    expect(widths.document).toBeLessThanOrEqual(widths.viewport)
  }

  expect(requests).toEqual([READ_COUNT_URL, READ_COUNT_URL])
  expect(errors).toEqual([])
})

test('blog post keeps unavailable views hidden and non-blog pages omit them', async ({
  page,
}) => {
  const pageErrors: string[] = []
  await page.addInitScript(() => {
    const consoleErrors: string[] = []
    Object.defineProperty(window, '__readCountConsoleErrors', {
      value: consoleErrors,
      configurable: true,
    })
    const originalConsoleError = console.error
    console.error = (...args) => {
      consoleErrors.push(args.map(String).join(' '))
      originalConsoleError(...args)
    }
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.unroute(READ_COUNT_ROUTE)
  await page.route(READ_COUNT_ROUTE, (route) =>
    route.fulfill({ status: 403 }),
  )

  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto(READ_COUNT_PATH)
    const readCount = page.locator('[data-read-count]')
    await expect(readCount).toHaveAttribute(
      'data-read-count-state',
      'unavailable',
    )
    await expect(readCount).toBeHidden()
    const consoleErrors = await page.evaluate(
      () =>
        (
          window as Window &
            typeof globalThis & { __readCountConsoleErrors: string[] }
        ).__readCountConsoleErrors,
    )
    expect(consoleErrors).toEqual([])
  }

  await page.goto('/')
  await expect(page.locator('[data-read-count]')).toHaveCount(0)
  expect(pageErrors).toEqual([])
})

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
