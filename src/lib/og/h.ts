export type OgNode = {
  type: string
  props: Record<string, unknown> & { children: unknown }
}

// Satori consumes React-element-shaped objects. Children are flattened so
// callers can pass strings, nodes, or arrays interchangeably.
export function h(
  type: string,
  props: Record<string, unknown> | null,
  ...children: unknown[]
): OgNode {
  return { type, props: { ...(props ?? {}), children: children.flat() } }
}
