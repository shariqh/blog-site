import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "http://localhost:4321";
const out = process.argv[3] ?? "/tmp/blog-screenshot.png";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: "networkidle" });
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`Saved ${out}`);
