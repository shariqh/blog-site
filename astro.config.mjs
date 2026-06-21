import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

import remarkMath from "remark-math";
import { remarkReadingTime } from "./src/lib/remark-reading-time.ts";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";

import { SITE } from "./src/lib/site.ts";

export default defineConfig({
  site: SITE.url,
  integrations: [mdx(), sitemap()],
  markdown: {
    remarkPlugins: [remarkMath, remarkReadingTime],
    rehypePlugins: [
      rehypeSlug,
      [rehypeAutolinkHeadings, { behavior: "wrap" }],
      rehypeKatex,
    ],
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
