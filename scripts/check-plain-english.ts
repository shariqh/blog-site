// Checks blog posts for insider shorthand (docs/EDITORIAL.md §Plain English).
//
//   npm run lint:plain                      # every post
//   npm run lint:plain -- path/to/post.mdx  # just these files
//
// Exits 1 when any `error` rule matches. In GitHub Actions it also prints
// annotations, so each hit shows on the PR's changed line.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkPlainEnglish, type Finding } from "../src/lib/plain-english";

const POSTS = "src/content/writing";

function allPosts(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return allPosts(path);
    return /\.mdx?$/.test(entry.name) ? [path] : [];
  });
}

export function formatFinding(
  file: string,
  f: Finding,
  annotate: boolean,
): string {
  const text = `"${f.match}": ${f.why} Instead: ${f.instead}`;
  if (annotate) {
    const escaped = text
      .replace(/%/g, "%25")
      .replace(/\r/g, "%0D")
      .replace(/\n/g, "%0A");
    return `::${f.level} file=${file},line=${f.line},col=${f.column},title=Plain English (${f.rule})::${escaped}`;
  }
  return `${file}:${f.line}:${f.column} ${f.level} [${f.rule}] ${text}`;
}

function main(argv: string[]): number {
  const files = argv.filter((a) => /\.mdx?$/.test(a));
  const targets = argv.length > 0 ? files : allPosts(POSTS);
  const annotate = process.env.GITHUB_ACTIONS === "true";
  let errors = 0;
  let warnings = 0;
  for (const file of targets) {
    for (const f of checkPlainEnglish(readFileSync(file, "utf8"))) {
      console.log(formatFinding(file, f, annotate));
      if (f.level === "error") errors++;
      else warnings++;
    }
  }
  console.log(
    `Plain English: ${targets.length} file(s), ${errors} error(s), ${warnings} warning(s).` +
      (errors
        ? " Rewrite each error in plain words (docs/EDITORIAL.md §Plain English)."
        : ""),
  );
  return errors > 0 ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`)
  process.exit(main(process.argv.slice(2)));
