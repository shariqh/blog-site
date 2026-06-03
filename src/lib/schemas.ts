import { z } from 'zod'

/**
 * Zod schema for writing collection frontmatter.
 * Defined here (not in content.config.ts) so it can be imported
 * from both Astro and Node.js contexts (e.g. validate.ts).
 */
export const writingSchema = z.object({
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
})
