# Editorial style guide

Rules for **any public-facing prose** on shariq.dev: blog posts, the about page, projects page, post summaries. Adopted (and adapted) from sibling project [Oris](https://orisnotes.com)'s editorial guide.

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

## Structure: PAS or STAR

Every post follows one of two shapes (Shariq, Nov 24 2026):

- **STAR** (Situation, Task, Action, Result) for a record of something done, ending on a measured result. Example: the Apple on-device model post.
- **PAS** (Problem, Agitate, Solution) for arguing a fix to a problem the reader has. A STAR case can sit inside the Solution as proof.

Pick the shape before drafting. If neither fits, the post probably isn't ready yet.

### Don't label sections after the shape

PAS and STAR shape the post; they never show in it. No heading named after a step: not "Situation", "Task", "Action", "Result", "Problem", "Agitate" or "Solution", and not "The situation: two copies of one skill" either. Name what the section is about.

| Bad                                      | Good                           |
| ---------------------------------------- | ------------------------------ |
| "The situation: two copies of one skill" | "Two copies of the same skill" |
| "The result: what the bench showed"      | "How the two-week trial went"  |

`npm run lint:plain` fails a heading that starts with one of these labels.

### A title a stranger understands

The title is read alone, in a feed, by someone who has never heard of the project. It says what the post is about in words that person already knows. It isn't a summary of the result with every number in it, and it isn't built for search keywords.

| Bad                                                                                   | Good                                                        |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| "Apple's on-device model trimmed my workout to the time I had just once in 128 tries" | "Apple's on-device model couldn't shorten my workouts"      |
| "From writing skill to shared A2A agent on a local model"                             | "One copy of my writing rules for every AI assistant I use" |

### Every detail serves the point

Write the post's point in one sentence before drafting, and keep it in view. A true, interesting detail that doesn't move that point along gets cut, however much work went into it. Ask of each paragraph: if it were gone, would the reader miss it?

Cut from the unslop post, whose point is "two assistants drifted apart on one writing skill, so I made it one shared agent": the GPU's load time and tokens per second, the design-doc review and its two blockers, and the list of six PR numbers. All true; none of it helps a reader follow why or how the copies became one.

### No internal names

Names that only exist inside the project mean nothing to a reader: test-suite IDs, ticket numbers, internal codenames. "Bench S11 ran on 24 generated public texts" tells a reader nothing. Say what it was: "In testing, ...". Link a PR or issue only when the reader would want to open it.

### Say it the way a person would

Read each sentence aloud. If you wouldn't say it to a colleague, rewrite it. Nouns stacked into jargon are the usual sign.

| Bad                                                                           | Good                                                           |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------- |
| "adding a privacy screen and fidelity checks before it runs on anyone's text" | "without letting private text leave my laptop or facts change" |
| "which counts as agent-initiated egress"                                      | "the assistant, not me, decides to send the text out"          |

### Stay on the subject

A post is about its subject, not about how it was made. A post reflecting on Apple's on-device model is about the model, not about the agents or process that produced the test. Cut asides that belong in a different post.

### Length follows the content

Long is fine. Cut only padding: sentences that say nothing new or repeat the one before.

---

## Plain English

Shariq's rule: plain, concrete English. **Every sentence must make sense to a reader who has only read what came before it.** No insider shorthand, and no word that points back to something the post hasn't introduced yet.

The two failures that keep coming back:

1. **Shorthand that hides the fact.** "Got X right", "does the job", "hit the target", "kills that path". The writer knows what they mean; the reader has to guess.
2. **Words with nothing to point back to.** "The check", "the job", "the edges", "it", used before the post has said which check, which job, which edges.

| Bad                                                                          | Good                                                                                                                                               |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| "It got the time right once in 128 tries, so a plain rule does the job now." | "Only 1 of its 128 trimmed workouts actually fit the time I gave it. So Shorter now uses a simple rule instead of the model."                      |
| "The parts of A2A 1.0 the demos skip are the edges."                         | "Most A2A demos skip what happens when something goes wrong: the connection drops halfway through a reply, or a web page tries to call the agent." |
| "Requiring Host to equal the literal IP string kills that path."             | "The server accepts only 127.0.0.1 in the Host header, so it refuses the request."                                                                 |
| "And the stream itself can lie by omission."                                 | "If the client prints text as it arrives, a reader can see an edit that later fails the fact check."                                               |
| "A client can't show text that later fails the check." (no check introduced) | Introduce it first: "My agent edits text and then runs a fact check..." Then "the fact check" has something to point back to.                      |

How to fix a flagged sentence:

- Replace the shorthand with what actually happened, in numbers where there are numbers.
- Name the thing ("the fact check", "trimming a workout to the time you have") the first time, then refer back to it.
- Define a term the first time it appears ("the client, the program calling the agent").
- If a sentence needs the reader to know something the post hasn't said yet, move the explanation earlier.

### Enforced by

- **`npm run lint:plain`** checks posts for known shorthand. Rules live in `src/lib/plain-english.ts`, each with a reason and a plainer way to say it. **Errors** fail the `Plain English` check on any PR that adds or changes a post; **warnings** ("the job", "the target", which can be literal) show as PR annotations for a human to judge. When a new piece of shorthand gets flagged in review, add it to the rule list with a test.
- **A cold read** (below) catches what a phrase list can't.

### Cold read

Before a draft goes to Shariq, a fresh reader with no context reads it once, top to bottom, and flags every sentence it can't follow. Run it as a new agent session that has seen nothing but the post. Give it only the file path and this prompt:

> You are a cold reader. Read the blog post at `<path>` (skip the YAML frontmatter and code blocks). You know nothing about the author or project beyond what the post says. Don't open any other file or page. Read it once, top to bottom, as a working software engineer new to the topic. First, say in one sentence what you think the post's point is, and whether the title alone would make sense to you in a feed. Then flag every sentence that (1) points back to something the post hasn't introduced yet, (2) uses insider shorthand, an internal name or a vague verb where a plain statement would do, (3) a reader who has read only what came before couldn't explain, (4) no person would say out loud, or (5) adds a detail that doesn't serve the post's point. For each: quote the sentence, name the test it fails, and give a one-line plain rewrite or say to cut it. Worst first, 15 at most. If nothing fails, say "No sentences flagged." Don't edit the file.

Fold in every flag that holds up, keeping the facts as they are. Don't add facts the post can't back up just because the cold reader suggested them. Then run `npm run lint:plain` again.

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
- [ ] **Shape:** PAS or STAR, and the post stays on its subject.
- [ ] **Point and title:** the point fits in one sentence, every detail serves it, no heading is named after a PAS or STAR step, no internal names, and the title makes sense to a stranger.
- [ ] **Plain English:** `npm run lint:plain -- <post>` has no errors, and a cold read (§Plain English) flags nothing that still holds up.
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

- **`npm run lint:plain`** — insider-shorthand check (§Plain English). CI runs it on every PR that adds or changes a post, via `.github/workflows/plain-english.yml`.
- **Cold read** — a fresh agent session reads the draft with no context and flags sentences it can't follow (§Plain English).
- **Human review** — Shariq reads every post before publishing. Even AI-drafted posts go through the PR review. No bypass.

### Not worth setting up

- **GPTZero / "AI detector" tools** — unreliable. The defense against AI-tell language is the forbidden-phrase list above + Vale + human review, not an automated detector.
- **Grammarly** — proprietary, no MCP, doesn't fit the custom-style needs.
