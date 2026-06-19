export type DeckPos = 'front' | 'next' | 'next2' | 'prev' | 'prev2' | 'hide'

export function deckClass(n: number, i: number, len: number): DeckPos {
  const rel = (n - i + len) % len
  if (rel === 0) return 'front'
  const forward = rel
  const backward = len - rel
  if (forward <= backward) {
    if (forward === 1) return 'next'
    if (forward === 2) return 'next2'
    return 'hide'
  }
  if (backward === 1) return 'prev'
  if (backward === 2) return 'prev2'
  return 'hide'
}
