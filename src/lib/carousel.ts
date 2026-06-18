export type DeckPos = 'front' | 'next' | 'next2' | 'prev' | 'prev2' | 'hide'

export function deckClass(n: number, i: number, len: number): DeckPos {
  const rel = (n - i + len) % len
  if (rel === 0) return 'front'
  if (rel === 1) return 'next'
  if (rel === 2) return 'next2'
  if (rel === len - 1) return 'prev'
  if (rel === len - 2) return 'prev2'
  return 'hide'
}
