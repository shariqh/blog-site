// scripts/agent/lib/diff-filter.ts
// Pure helpers for turning a commit's file list into a prompt-sized, noise-free
// diff block. No I/O — unit-tested in isolation.

// Files whose diffs add no editorial signal. Add a pattern here to exclude more.
export const NOISE_PATTERNS: RegExp[] = [
  // lockfiles
  /(^|\/)package-lock\.json$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)bun\.lockb$/,
  /(^|\/)Cargo\.lock$/,
  /(^|\/)poetry\.lock$/,
  /(^|\/)Pipfile\.lock$/,
  /(^|\/)composer\.lock$/,
  /(^|\/)Gemfile\.lock$/,
  /(^|\/)go\.sum$/,
  /(^|\/)flake\.lock$/,
  // generated / build output
  /(^|\/)(dist|build|out|coverage|node_modules|vendor)\//,
  /(^|\/)\.next\//,
  /(^|\/)\.astro\//,
  // minified & sourcemaps
  /\.min\.(js|css)$/,
  /\.map$/,
  // test snapshots
  /(^|\/)__snapshots__\//,
  /\.snap$/,
  // binary / media
  /\.(png|jpe?g|gif|webp|ico|svg|pdf|woff2?|ttf|eot|mp4|mov|zip|gz|tgz)$/i,
]

export function isNoiseFile(filename: string): boolean {
  return NOISE_PATTERNS.some((re) => re.test(filename))
}
