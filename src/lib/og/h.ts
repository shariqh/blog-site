export type OgNode = {
  type: string
  props: Record<string, unknown> & { children: unknown }
}

// Satori consumes React-element-shaped objects. Children are flattened so
// callers can pass strings, nodes, or arrays interchangeably.
// Satori v0.26 treats children:[] as "has children" and requires display:flex,
// so we omit the key entirely for leaf nodes (no children passed).
export function h(
  type: string,
  props: Record<string, unknown> | null,
  ...children: unknown[]
): OgNode {
  const flat = children.flat()
  return { type, props: { ...(props ?? {}), children: flat.length ? flat : undefined } }
}
