import getReadingTime from 'reading-time'
import { toString } from 'mdast-util-to-string'

export function remarkReadingTime() {
  return function (tree: any, { data }: any) {
    const textOnPage = toString(tree)
    const readingTime = getReadingTime(textOnPage)
    // reading-time returns time in ms; store as seconds (route divides by 60 for minutes)
    data.astro.frontmatter.readingTime = readingTime.time / 1000
  }
}
