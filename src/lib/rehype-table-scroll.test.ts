import { describe, expect, it } from 'vitest'
import type { Element, ElementContent, Root } from 'hast'
import { rehypeTableScroll } from './rehype-table-scroll'

const text = (value: string): ElementContent => ({ type: 'text', value })
const el = (tagName: string, ...children: ElementContent[]): Element => ({
  type: 'element',
  tagName,
  properties: {},
  children,
})
// The shape remark-gfm produces: the header row in <thead>, the rest in <tbody>.
const table = (...headers: Array<string | ElementContent[]>): Element =>
  el(
    'table',
    el(
      'thead',
      el(
        'tr',
        ...headers.map((h) =>
          el('th', ...(typeof h === 'string' ? [text(h)] : h)),
        ),
      ),
    ),
    el('tbody', el('tr', ...headers.map(() => el('td', text('1'))))),
  )

function transform(...children: Element[]): Root {
  const tree: Root = { type: 'root', children }
  rehypeTableScroll()(tree)
  return tree
}

describe('rehypeTableScroll', () => {
  it('wraps a table in a focusable region named by its column headers', () => {
    const original = table(
      'Setup',
      [text('Cost ('), el('code', text('AIU')), text(')')],
      ' vs. Opus\n  max ',
    )
    const [wrapper] = transform(original).children

    expect(wrapper).toEqual({
      type: 'element',
      tagName: 'div',
      properties: {
        className: ['table-scroll'],
        role: 'region',
        tabIndex: 0,
        ariaLabel: 'Table 1: Setup, Cost (AIU), vs. Opus max',
      },
      children: [original],
    })
    expect((wrapper as Element).children[0]).toBe(original)
  })

  it('numbers every table so repeated or empty headers still get unique names', () => {
    const labels = transform(
      table('A', 'B'),
      table('A', 'B'),
      table(' ', ''),
    ).children.map((node) => (node as Element).properties.ariaLabel)

    expect(labels).toEqual(['Table 1: A, B', 'Table 2: A, B', 'Table 3'])
  })

  it('wraps tables nested inside other elements exactly once', () => {
    const nested = table('A')
    const [quote] = transform(
      el('blockquote', el('p', text('Quoted')), nested),
    ).children
    const wrapper = (quote as Element).children[1] as Element

    expect(wrapper.properties.className).toEqual(['table-scroll'])
    expect(wrapper.children).toEqual([nested])
  })
})
