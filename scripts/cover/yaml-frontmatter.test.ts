import { afterEach, describe, expect, it } from 'vitest'
import matter from 'gray-matter'
import { parseYamlFrontmatter } from './yaml-frontmatter'
import { setHero } from './frontmatter'
import { validateMdxFrontmatter } from '../agent/lib/validate'

const MARK = '__frontmatterEvaluated'
const marked = () => (globalThis as Record<string, unknown>)[MARK]

// If evaluated, this frontmatter sets a global before returning its data.
const payload = (opener: string, newline = '\n') =>
  `${opener}${newline}{ title: (globalThis.${MARK} = true, 'evaluated') }${newline}---${newline}Body.${newline}`

afterEach(() => {
  delete (globalThis as Record<string, unknown>)[MARK]
})

describe('parseYamlFrontmatter', () => {
  it('uses a payload that plain gray-matter would evaluate', () => {
    expect(matter(payload('---js'), {}).data.title).toBe('evaluated')
    expect(marked()).toBe(true)
  })

  it.each([
    ['---js'],
    ['---javascript'],
    ['---JS'],
    ['--- js '],
    ['---coffee'],
    ['---coffeescript'],
    ['---cson'],
    ['---json'],
    ['---toml'],
    ['\uFEFF---js'],
  ])('refuses %j frontmatter without evaluating it', (opener) => {
    expect(() => parseYamlFrontmatter(payload(opener))).toThrow('must be YAML')
    expect(marked()).toBeUndefined()
  })

  it('refuses CRLF-delimited JavaScript frontmatter without evaluating it', () => {
    expect(() => parseYamlFrontmatter(payload('---js', '\r\n'))).toThrow('must be YAML')
    expect(marked()).toBeUndefined()
  })

  it.each(['---', '---yaml', '---yml', '---YAML'])('parses %j frontmatter as YAML', (opener) => {
    const parsed = parseYamlFrontmatter(`${opener}\ntitle: A Post\ntags: [ai]\n---\nBody.\n`)
    expect(parsed.data).toEqual({ title: 'A Post', tags: ['ai'] })
    expect(parsed.content).toBe('Body.\n')
  })

  it('accepts a file with no frontmatter', () => {
    expect(parseYamlFrontmatter('Just a body.\n').data).toEqual({})
  })

  it('keeps a body that opens with JavaScript frontmatter as text when setting the hero', () => {
    const body = `---js\n(globalThis.${MARK} = true, {})\n---\nBody.\n`
    const out = setHero(`---\ntitle: A Post\n---\n${body}`, {
      image: '/x.png',
      alt: 'x',
      prompt: 'x',
      style: 'line-art',
    })
    expect(marked()).toBeUndefined()
    expect(out.endsWith(`---\n${body}`)).toBe(true)
    const parsed = parseYamlFrontmatter(out)
    expect(parsed.data).toEqual({
      title: 'A Post',
      hero: { image: '/x.png', alt: 'x', prompt: 'x', style: 'line-art' },
    })
    expect(parsed.content).toBe(body)
    expect(marked()).toBeUndefined()
  })

  it('refuses at every post frontmatter entry point', () => {
    const hero = { image: '/x.png', alt: 'x', prompt: 'x', style: 'line-art' as const }
    expect(() => setHero(payload('---js'), hero)).toThrow('must be YAML')
    const result = validateMdxFrontmatter(payload('---js'))
    expect(result.ok).toBe(false)
    expect(marked()).toBeUndefined()
  })
})
