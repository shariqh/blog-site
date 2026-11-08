import matter from 'gray-matter'

// gray-matter picks its engine from the text after the opening `---`, and its
// JavaScript engine evaluates the block. Post frontmatter is YAML only, so any
// other language tag is refused before gray-matter sees it, and the non-YAML
// engines refuse as well in case a tag slips past that check.
const YAML_LANGUAGES = new Set(['', 'yaml', 'yml'])

function refuse(language: string): never {
  throw new Error(`Refusing "${language}" frontmatter: post frontmatter must be YAML`)
}

const refusingEngine = (language: string) => ({
  parse: () => refuse(language),
  stringify: () => refuse(language),
})

const OPTIONS = {
  language: 'yaml',
  engines: {
    javascript: refusingEngine('javascript'),
    js: refusingEngine('js'),
    coffee: refusingEngine('coffee'),
    coffeescript: refusingEngine('coffeescript'),
    cson: refusingEngine('cson'),
    json: refusingEngine('json'),
  },
}

function frontmatterLanguage(source: string): string {
  const text = source.replace(/^\uFEFF/, '')
  // Same rule as gray-matter: no frontmatter unless the text opens with exactly `---`.
  if (!text.startsWith('---') || text.charAt(3) === '-') return ''
  return matter.language(text).name.toLowerCase()
}

/** Parse post frontmatter as YAML only; any other frontmatter language throws. */
export function parseYamlFrontmatter(source: string): matter.GrayMatterFile<string> {
  const language = frontmatterLanguage(source)
  if (!YAML_LANGUAGES.has(language)) refuse(language)
  return matter(source, OPTIONS)
}
