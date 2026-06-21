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
})
