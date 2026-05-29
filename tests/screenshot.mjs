// Screenshot a page. Usage:
//   node tests/screenshot.mjs <url> <out.png> [width] [height] [clip-height]
// If clip-height is provided, the screenshot is cropped to that height
// (useful for hero images of the above-the-fold section).
import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "http://localhost:4321";
const out = process.argv[3] ?? "/tmp/blog-screenshot.png";
const width = Number(process.argv[4] ?? 1440);
const height = Number(process.argv[5] ?? 1200);
const clipHeight = process.argv[6] ? Number(process.argv[6]) : null;

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: 2, // retina-quality PNG
});
const page = await ctx.newPage();
await page.goto(url, { waitUntil: "networkidle" });
await page.screenshot({
  path: out,
  fullPage: !clipHeight,
  clip: clipHeight ? { x: 0, y: 0, width, height: clipHeight } : undefined,
});
await browser.close();
console.log(`Saved ${out}`);
