import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

const writing = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/writing' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      date: z.coerce.date(),
      tags: z.array(z.string()).default([]),
      summary: z.string().max(280),
      hero: z
        .object({
          image: image(),
          alt: z.string(),
          prompt: z.string().optional(),
          background: z.enum(['ink', 'ink-soft', 'ochre', 'terracotta', 'paper']).optional(),
          titleStyle: z.enum(['italic', 'upper-mono', 'serif-display']).optional(),
        })
        .optional(),
      draft: z.boolean().default(false),
      updatedAt: z.coerce.date().optional(),
      canonical: z.string().url().optional(),
    }),
})

export const collections = { writing }
