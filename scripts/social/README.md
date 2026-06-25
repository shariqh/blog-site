# Social posting

Tooling for pushing blog content out to social.

## `post-thread.ts` — post an X (Twitter) thread

Reads a thread from a text file and posts it as a native X thread (each tweet
replies to the one before it).

### Thread file format

Plain text. Separate tweets with a line containing only `---`. Each tweet keeps
its own line breaks. See [`threads/lognote-day-one.txt`](./threads/lognote-day-one.txt).

### One-time setup

1. Create an X developer app at <https://developer.x.com> (Project → App).
2. In the app's **User authentication settings**, enable **Read and Write** and
   **OAuth 1.0a**, then generate an **Access Token & Secret** for your account.
   You now have four values: API Key, API Key Secret, Access Token, Access Secret.
3. Store the four values in 1Password (e.g. an "X API" item in `dev-env-vars`).
4. Copy `.env.social.example` to `.env.social` (gitignored) and point each line
   at your 1Password fields (the `op://...` references).

The **Free** API tier covers posting (~1,500 writes/month), so no paid plan is
needed for threads.

### Usage

Dry run — preview each tweet with its character count, no credentials needed:

```sh
npm run post:thread -- scripts/social/threads/lognote-day-one.txt
```

Publish — credentials injected from 1Password at runtime:

```sh
op run --env-file=.env.social -- npm run post:thread -- scripts/social/threads/lognote-day-one.txt --post
```

Flags:

- `--post` actually publishes (omit it for a dry run).
- `--force` posts even if a tweet looks over 280. URLs count as 23 chars, so the
  script's estimate is conservative and a link-bearing tweet may still fit.

If a tweet fails mid-thread, the script stops and prints the last posted tweet's
ID so you can finish the rest as replies to it.
