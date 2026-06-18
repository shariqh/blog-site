import { describe, it, expect } from 'vitest'
import { deckClass } from './carousel'

describe('deckClass (5 cards)', () => {
  const L = 5
  it('current card is front', () => expect(deckClass(2, 2, L)).toBe('front'))
  it('one ahead is next', () => expect(deckClass(3, 2, L)).toBe('next'))
  it('two ahead is next2', () => expect(deckClass(4, 2, L)).toBe('next2'))
  it('one behind (wraps) is prev', () => expect(deckClass(1, 2, L)).toBe('prev'))
  it('two behind is prev2', () => expect(deckClass(0, 2, L)).toBe('prev2'))
  it('extra cards beyond the fan are hidden', () => {
    expect(deckClass(0, 0, 7)).toBe('front')
    expect(deckClass(3, 0, 7)).toBe('hide')
  })
})
