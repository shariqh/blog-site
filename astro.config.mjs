import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { unified } from "@astrojs/markdown-remark";
import tailwindcss from "@tailwindcss/vite";

import remarkMath from "remark-math";
import { remarkReadingTime } from "./src/lib/remark-reading-time.ts";
import { rehypeTableScroll } from "./src/lib/rehype-table-scroll.ts";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";

import { SITE } from "./src/lib/site.ts";

export default defineConfig({
  site: SITE.url,
  // Astro 7 changed the default to 'jsx' whitespace rules, which can drop the
  // space between inline elements on separate lines. Keep the HTML rules.
  compressHTML: true,
  integrations: [
    mdx(),
    sitemap({ customPages: [`${SITE.url}/agent-inbox/`] }),
  ],
  markdown: {
    // Astro 7 defaults to the Sätteri processor, which doesn't run
    // remark/rehype plugins. Keep the unified pipeline; .mdx inherits it.
    processor: unified({
      remarkPlugins: [remarkMath, remarkReadingTime],
      rehypePlugins: [
        rehypeSlug,
        [rehypeAutolinkHeadings, { behavior: "wrap" }],
        // Before rehypeKatex, so table labels read math as its TeX source
        // rather than KaTeX's MathML, annotation and HTML copies.
        rehypeTableScroll,
        rehypeKatex,
      ],
    }),
    shikiConfig: {
      // Single dark theme: the site background is white, so a dark code block
      // (vs. white-on-white with github-light) gives clear separation on-brand.
      theme: "github-dark",
      wrap: true,
    },
  },
  vite: {
    plugins: [tailwindcss()],
    css: { devSourcemap: true },
  },
});
