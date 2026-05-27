export const BUCKETS = {
  leadership: {
    label: 'Leadership',
    tags: ['leadership', 'management', 'teams', 'culture', 'insights'],
  },
  engineering: {
    label: 'Engineering',
    tags: [
      'nextjs',
      'docker',
      'devops',
      'cloud',
      'architecture',
      'astro',
      'typescript',
      'javascript',
      'engineering',
    ],
  },
  ai: {
    label: 'AI',
    tags: [
      'ai',
      'llm',
      'claude',
      'agents',
      'mcp',
      'claude-code',
      'agent-sdk',
      'anthropic',
      'openai',
      'prompts',
      'rag',
    ],
  },
  process: {
    label: 'Process',
    tags: ['workflow', 'tooling', 'systems', 'how-to', 'guide'],
  },
  notes: {
    label: 'Notes',
    tags: [],
  },
} as const

export type BucketKey = keyof typeof BUCKETS
export type Bucket = { key: BucketKey; label: string }

const TAG_INDEX: Record<string, BucketKey> = (() => {
  const index: Record<string, BucketKey> = {}
  for (const [key, def] of Object.entries(BUCKETS) as [BucketKey, { tags: readonly string[] }][]) {
    for (const tag of def.tags) {
      index[tag.toLowerCase()] = key
    }
  }
  return index
})()

export function resolveBucket(tags: readonly string[]): Bucket {
  for (const tag of tags) {
    const hit = TAG_INDEX[tag.toLowerCase()]
    if (hit) return { key: hit, label: BUCKETS[hit].label }
  }
  return { key: 'notes', label: BUCKETS.notes.label }
}
