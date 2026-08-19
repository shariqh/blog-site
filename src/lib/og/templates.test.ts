import { describe, it, expect } from 'vitest'
import { h } from './h'
import { hybridTemplate, fallbackTemplate } from './templates'

const data = {
  title: 'Rewriting Our Engine',
  eyebrow: 'AI · shariq.dev',
  dateLabel: 'Jun 2026',
  readingLabel: '8 min',
  cover: 'data:image/png;base64,iVBORw0KGgo=',
}

// Recursively collect every string leaf in the tree.
function texts(node: any, out: string[] = []): string[] {
  if (typeof node === 'string') out.push(node)
  else if (Array.isArray(node)) node.forEach((n) => texts(n, out))
  else if (node && node.props) texts(node.props.children, out)
  return out
}

function nodesByType(node: any, type: string, out: any[] = []): any[] {
  if (node && node.type === type) out.push(node)
  if (node && node.props) {
    ;[]
      .concat(node.props.children ?? [])
      .forEach((child) => nodesByType(child, type, out))
  }
  return out
}

function expectSeparatedMark(node: any) {
  const marks = nodesByType(node, 'svg')
  expect(marks).toHaveLength(1)
  expect(marks[0].props.viewBox).toBe('0 0 100 100')
  expect(
    nodesByType(marks[0], 'path').map(({ props }) => ({
      d: props.d,
      fill: props.fill,
    })),
  ).toEqual([
    {
      d: 'M10 2h32l6 6v8H18v14h30v36l-6 6H10l-6-6v-8h30V44H4V8Z',
      fill: '#b04a3a',
    },
    {
      d: 'M60 28h8v28h16V28h8l6 6v58l-6 6h-8V70H68v28h-8l-6-6V34Z',
      fill: '#f3e8d2',
    },
  ])
  expect(JSON.stringify(node)).not.toContain('rotate(45deg)')
}

describe('h', () => {
  it('builds a {type, props:{children}} node', () => {
    const n = h('div', { style: { color: 'red' } }, 'hi')
    expect(n.type).toBe('div')
    expect(n.props.style).toEqual({ color: 'red' })
    expect(n.props.children).toEqual(['hi'])
  })
})

describe('hybridTemplate', () => {
  it('is a root div containing the title, eyebrow, date and reading labels', () => {
    const node = hybridTemplate(data)
    expect(node.type).toBe('div')
    const all = texts(node).join(' | ')
    expect(all).toContain('Rewriting Our Engine')
    expect(all).toContain('AI · shariq.dev')
    expect(all).toContain('Jun 2026 · 8 min')
  })
  it('embeds the cover as an img src', () => {
    const node = hybridTemplate(data)
    const imgs: string[] = []
    const walk = (n: any) => {
      if (n && n.type === 'img') imgs.push(n.props.src)
      if (n && n.props) [].concat(n.props.children ?? []).forEach(walk)
    }
    walk(node)
    expect(imgs).toContain(data.cover)
  })
  it('renders the separated SH mark in the site signature', () => {
    expectSeparatedMark(hybridTemplate(data))
  })
})

describe('fallbackTemplate', () => {
  it('renders title + eyebrow and no cover img', () => {
    const node = fallbackTemplate({ ...data, cover: null })
    const all = texts(node).join(' | ')
    expect(all).toContain('Rewriting Our Engine')
    expect(all).toContain('AI · shariq.dev')
    let hasImg = false
    const walk = (n: any) => {
      if (n && n.type === 'img') hasImg = true
      if (n && n.props) [].concat(n.props.children ?? []).forEach(walk)
    }
    walk(node)
    expect(hasImg).toBe(false)
  })
  it('renders the separated SH mark in the site signature', () => {
    expectSeparatedMark(fallbackTemplate({ ...data, cover: null }))
  })
})
