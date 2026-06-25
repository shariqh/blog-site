#!/usr/bin/env tsx
/**
 * Post an X (Twitter) thread from a text file.
 *
 * Thread file format: tweets separated by a line containing only `---`.
 * Each tweet keeps its own internal line breaks. See threads/ for examples.
 *
 * Usage:
 *   npm run post:thread -- scripts/social/threads/<file>.txt           # dry run
 *   npm run post:thread -- scripts/social/threads/<file>.txt --post    # publish
 *
 * Credentials (OAuth 1.0a user context) come from env. Source them from
 * 1Password rather than hard-coding:
 *   op run --env-file=.env.social -- npm run post:thread -- <file> --post
 */
import { readFileSync } from 'node:fs'
import { TwitterApi } from 'twitter-api-v2'

const ENV_KEYS = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'] as const

// X counts every URL as 23 chars (the t.co wrap), regardless of the real length.
function tweetLength(text: string): number {
  return text.replace(/https?:\/\/\S+/g, 'x'.repeat(23)).length
}

function parseThread(path: string): string[] {
  const groups: string[][] = [[]]
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (line.trim() === '---') groups.push([])
    else groups[groups.length - 1]!.push(line)
  }
  return groups.map((g) => g.join('\n').trim()).filter(Boolean)
}

function loadCreds() {
  const missing = ENV_KEYS.filter((k) => !process.env[k])
  if (missing.length) {
    console.error(`\nMissing env vars: ${missing.join(', ')}`)
    console.error('Source them from 1Password, e.g.:')
    console.error('  op run --env-file=.env.social -- npm run post:thread -- <file> --post\n')
    process.exit(1)
  }
  return {
    appKey: process.env.X_API_KEY!,
    appSecret: process.env.X_API_SECRET!,
    accessToken: process.env.X_ACCESS_TOKEN!,
    accessSecret: process.env.X_ACCESS_SECRET!,
  }
}

async function main() {
  const args = process.argv.slice(2)
  const post = args.includes('--post')
  const force = args.includes('--force')
  const file = args.find((a) => !a.startsWith('--'))
  if (!file) {
    console.error('usage: post:thread <thread.txt> [--post] [--force]')
    process.exit(1)
  }

  const tweets = parseThread(file)
  if (!tweets.length) {
    console.error(`No tweets parsed from ${file} (separate tweets with a line containing only "---").`)
    process.exit(1)
  }

  let overLimit = false
  tweets.forEach((t, i) => {
    const len = tweetLength(t)
    const over = len > 280
    if (over) overLimit = true
    console.log(`\n--- [${i + 1}/${tweets.length}] ${len}/280${over ? '  !! OVER LIMIT' : ''} ---\n${t}`)
  })

  if (overLimit && !force) {
    console.error('\nOne or more tweets exceed 280 chars. Trim them, or pass --force to try anyway.')
    process.exit(1)
  }

  if (!post) {
    console.log(`\n[dry run] ${tweets.length} tweets ready. Re-run with --post to publish.`)
    return
  }

  const client = new TwitterApi(loadCreds())
  const me = (await client.v2.me()).data.username
  console.log(`\nPosting ${tweets.length} tweets as @${me} ...`)

  let replyTo: string | undefined
  for (let i = 0; i < tweets.length; i++) {
    try {
      const res = await client.v2.tweet(
        tweets[i]!,
        replyTo ? { reply: { in_reply_to_tweet_id: replyTo } } : {}
      )
      replyTo = res.data.id
      console.log(`  ok ${i + 1}/${tweets.length}  https://x.com/${me}/status/${replyTo}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`\n  FAILED at tweet ${i + 1}/${tweets.length}: ${msg}`)
      console.error(
        replyTo
          ? `  Posted ${i} of ${tweets.length}. To finish, reply the remaining tweets to ${replyTo}.`
          : '  Nothing was posted.'
      )
      process.exit(1)
    }
  }
  console.log(`\nDone. Thread posted (${tweets.length} tweets).`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
