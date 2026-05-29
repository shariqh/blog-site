import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

const writing = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/writing' }),
  schema: () =>
    z.object({
      title: z.string(),
      date: z.coerce.date(),
      tags: z.array(z.string()).default([]),
      summary: z.string().max(280),
      hero: z
        .object({
          // Path served from /public/ (e.g. /static/images/blog/<slug>/hero.png).
          // Rendered as a plain <img> in PostHeader. Skips Astro's image
          // optimization, which is fine for v1 — banner PNGs are already small.
          image: z.string(),
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
