import { z } from 'zod'

/**
 * Hosts we legitimately cross-post FROM — i.e. where shariq.dev carries a COPY
 * and `rel=canonical` must point at the external original. Constraining the
 * canonical field to these (https only) stops frontmatter from canonicalizing a
 * page to an arbitrary domain (an SEO-poisoning vector, relevant because the
 * drafting agent ingests untrusted external content). Adding a host here is a
 * deliberate, reviewable change.
 */
export const CANONICAL_ALLOWED_HOSTS = ['www.bundleapps.io']

function isAllowedCanonical(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && CANONICAL_ALLOWED_HOSTS.includes(url.hostname)
  } catch {
    return false
  }
}

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
  canonical: z
    .string()
    .url()
    .refine(isAllowedCanonical, {
      message: `canonical must be an https URL on an allowed host (${CANONICAL_ALLOWED_HOSTS.join(
        ', '
      )})`,
    })
    .optional(),
})
