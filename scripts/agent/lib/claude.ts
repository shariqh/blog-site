// scripts/agent/lib/claude.ts
import { query } from '@anthropic-ai/claude-agent-sdk'

export interface PromptOptions {
  systemPrompt: string
  userPrompt: string
  model?: string
  maxTurns?: number
}

/**
 * Runs a one-shot Claude prompt via the Agent SDK using subscription OAuth.
 * Returns the assistant's full text response.
 *
 * Auth: reads CLAUDE_CODE_OAUTH_TOKEN from env (set by config import side effect
 * via 'dotenv/config' in callers' lib/config.ts).
 */
export async function runPrompt(opts: PromptOptions): Promise<string> {
  const result = query({
    prompt: opts.userPrompt,
    options: {
      systemPrompt: opts.systemPrompt,
      model: opts.model ?? 'claude-sonnet-4-6',
      // Disable all built-in tools — we feed all context in the prompt.
      tools: [],
      maxTurns: opts.maxTurns ?? 1,
    },
  })

  let text = ''
  for await (const message of result) {
    if (message.type === 'assistant' && Array.isArray(message.message.content)) {
      for (const block of message.message.content) {
        if (block.type === 'text') text += block.text
      }
    }
  }
  return text.trim()
}

/**
 * Parses a Claude response we expect to be JSON. The model often wraps JSON in
 * markdown code fences; this strips those before parsing.
 */
export function parseJsonResponse<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)```/)
  const raw = fenced ? fenced[1] : text
  return JSON.parse(raw.trim()) as T
}
