import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { writingSchema } from './lib/schemas'

export { writingSchema }

const writing = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/writing' }),
  schema: () => writingSchema,
})

export const collections = { writing }
