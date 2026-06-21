# Editorial style guide

Rules for **any public-facing prose** on shariq.dev: blog posts, the about page, projects page, post summaries. Adopted (and adapted) from sibling project [lognote](https://github.com/shariqh/lognote)'s editorial guide.

This document is authoritative. Every writer — human, agent, or hybrid — applies these rules before publishing. The AI drafting agent (Plan B) loads this file into its system prompt as required reading.

For YouTube scripts, the agent loads [`SHORTS-STYLE.md`](./SHORTS-STYLE.md) — same role, different format.

If a rule below is wrong or outdated, **update this file** before writing copy that contradicts it.

---

## Voice & person

- **First person** ("I", occasionally "we" for solidarity with the reader).
- **Second person** ("you") for direct advice — sparing.
- Peer-or-mentor relationship with the reader. Not lecturing. Not selling. Just thinking out loud, then committing to a take.
- Admits gaps openly when relevant ("I'm still figuring out X" beats "I'm an expert in X").
- Ends with a concrete reframe or action, never just a nod.
- Optimized for people who actually do this work — engineers, technical leaders, people thinking about AI for real. Don't write for the executive summary.

---

## Accuracy

### Don't describe things you haven't done as if you have

Confidence in writing should track lived experience. Aspirational language belongs in design docs and pitches, not on a personal blog.

**Bad:** "I built an agent that drafts blog posts from my repo activity."

**Good (before it ships):** "I'm building an agent that drafts blog posts from my repo activity." Or just write the post once you have a working version.

If unsure whether you actually did the thing, **don't write the sentence**.

### Don't quote people from memory as if it's a citation

If a sentence starts with "X said Y", either link the source or rephrase to "I remember X arguing that…" so the reader can calibrate confidence.

---

## AI-tell language

These phrases are statistical fingerprints of LLM-generated text. Avoid in shariq.dev prose, especially in drafts the agent produces.

| Avoid                                                                     | Why                                                                  |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| "I'll be blunt about this…" / "Let me be blunt"                           | Performative; reads as filler before a take.                         |
| "I want to…" (when stating something you're going to do anyway)           | Throat-clearing. Just do it: "We do X" not "I want to talk about X". |
| "…saying out loud…"                                                       | Empty intensifier.                                                   |
| "that's a real conversation" / "a real X" as emphasis                     | LLM tic.                                                             |
| "Let me think about this for a second…"                                   | Performed deliberation.                                              |
| "It's worth noting…"                                                      | Filler.                                                              |
| "In a world where…" openers                                               | Marketing-cringe + LLM common.                                       |
| "Phrases that sound profound but say nothing ("it's not just X, it's Y")" | Hollow.                                                              |
| "Delve into…"                                                             | LLM training-data signature.                                         |
| "Navigate the complex landscape of…"                                      | Stock phrase.                                                        |
| "At the end of the day"                                                   | Filler.                                                              |
| "Leverage X to…" / "Unlock X potential"                                   | Corporate fog.                                                       |

When a sentence reaches for one of these patterns, **rewrite around it**.

Vale catches the obvious ones automatically. The agent's drafting prompt should include this section verbatim.

---

## Tics

- **Em-dashes:** 2 per post max. Replace with commas, parentheses, periods, or colons. Vale enforces.
- **Exclamation points:** none in prose. Reserve for dialogue or genuine surprise (rare). Vale flags.
- **Rhetorical questions as section openers:** good in your voice, but don't reach for them automatically. Use when the post is genuinely answering a question.
- **Bold for emphasis:** sparingly. Once per paragraph max.
- **Italics for emphasis:** rare. Use for titles of things, foreign phrases, or one-off emphasis the bold-stack can't carry.
- **Three-item lists with em-dash openers** ("X, Y, and even Z") — LLM-favorite. Vary structure.

---

## Length

Match length to mode:

- **Notes / quick takes:** 300-600 words. Bucket → `notes`.
- **Personal / reflective:** 600-900 words. Bucket → `leadership`.
- **Technical deep-dive or how-to:** 1,000-1,800 words. Bucket → `engineering` or `process`.
- **Essay / opinion:** 900-1,500 words. Bucket → whichever fits the topic.

If a draft is shorter than its bucket minimum or much longer than its bucket maximum, the bucket is probably wrong (or the post is). Reconsider before publishing.

---

## Frontmatter

Every post in `src/content/writing/*.mdx` has frontmatter validated by Zod at build time (`src/content.config.ts`). Required fields:

- `title` — sentence-case unless a proper noun forces otherwise. No trailing punctuation.
- `date` — ISO `YYYY-MM-DD`.
- `summary` — ≤ 280 chars. Reads on the post page under the title and in RSS. Write a real summary, not a teaser.
- `tags` — free-form lowercase strings. The bucket resolver in `src/lib/buckets.ts` maps them to a display bucket. New tags that don't match any known bucket fall through to `notes`. When you introduce a new tag, either add it to the bucket map or accept the `notes` treatment.

Optional:

- `hero` — the cover image (`image` + `alt`, plus the generation `prompt` and an optional `style`). Covers are **AI-generated** (Azure `gpt-image-1`): the drafting agent fills `hero.image` automatically, and `hero.style` (`line-art` | `conceptual`) overrides the look. Curate the result before publishing — regenerate or pin a different image if it misses.
- `canonical` — if the post is syndicated elsewhere (e.g., a Coreworx blog crosspost), point to the canonical URL.
- `draft` — set to `true` to keep a WIP out of production. The build excludes drafts from listings and from `/feed.xml`.

---

## Pre-publish checklist

Before a post lands on master (`draft: false`), run through:

- [ ] **Voice check:** sounds like you, not like a press release.
- [ ] **Accuracy:** every claim reflects something you actually did/saw/built.
- [ ] **AI-tell sweep:** Vale clean on warnings + suggestions for the post file. (Errors block merge.)
- [ ] **Length matches bucket** (see Length section above).
- [ ] **Frontmatter complete:** title / date / summary / tags. Hero optional. Canonical if syndicated.
- [ ] **Cover image** is on-brand and topic-relevant — AI covers are curated, not auto-trusted.
- [ ] **Read it aloud** or have someone else read it. If you stumble, the sentence is wrong.
- [ ] **Vercel/Cloudflare preview reviewed.** Spot-check on mobile.

The drafting agent runs Vale before opening its PR. PR comments from Vale flag remaining issues for review. The build itself doesn't block on suggestions — only on errors (which today only fire on broken frontmatter, not prose).

---

## Tooling

### Available now

- **`docs/EDITORIAL.md`** (this file) — required reading.
- **Vale** — open-source prose linter. Config at `.vale.ini`, custom rules under `vale-styles/shariq/`. Run locally:

  ```sh
  brew install vale
  vale src/content/writing
  ```

  CI runs Vale on every PR via `.github/workflows/vale.yml` and posts inline comments on offending lines.

- **Human review** — Shariq reads every post before publishing. Even AI-drafted posts go through the PR review. No bypass.

### Not worth setting up

- **GPTZero / "AI detector" tools** — unreliable. The defense against AI-tell language is the forbidden-phrase list above + Vale + human review, not an automated detector.
- **Grammarly** — proprietary, no MCP, doesn't fit the custom-style needs.
