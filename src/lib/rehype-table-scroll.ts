import type { Element, ElementContent, Parent, Root } from 'hast'

// Wraps every Markdown table in a labeled, keyboard-focusable region that
// scrolls horizontally, so a table wider than the screen scrolls inside its own
// box instead of widening the page. The wrapper scrolls rather than the table
// itself: `display: block` on a <table> can strip its table semantics in some
// browsers. Prose.astro styles `.table-scroll` and the table inside it.
export function rehypeTableScroll() {
  return (tree: Root) => {
    let count = 0
    const visit = (parent: Parent) => {
      parent.children.forEach((child, index) => {
        if (child.type === 'element' && child.tagName === 'table') {
          count += 1
          parent.children[index] = {
            type: 'element',
            tagName: 'div',
            properties: {
              className: ['table-scroll'],
              role: 'region',
              tabIndex: 0,
              ariaLabel: tableLabel(child, count),
            },
            children: [child],
          }
        } else if ('children' in child) {
          visit(child)
        }
      })
    }
    visit(tree)
  }
}

// GFM tables have no caption, so name each region by its position and column
// headers, e.g. "Table 1: Setup, Cost". The position keeps the names unique.
function tableLabel(table: Element, position: number): string {
  const head = table.children.find((node) => isElement(node, 'thead'))
  const row = head?.children.find((node) => isElement(node, 'tr'))
  const columns = (row?.children ?? [])
    .filter((node) => isElement(node, 'th'))
    .map((cell) => textContent(cell).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const name = `Table ${position}`
  return columns.length > 0 ? `${name}: ${columns.join(', ')}` : name
}

function isElement(node: ElementContent, tagName: string): node is Element {
  return node.type === 'element' && node.tagName === tagName
}

function textContent(node: ElementContent): string {
  if (node.type === 'text') return node.value
  return 'children' in node ? node.children.map(textContent).join('') : ''
}
