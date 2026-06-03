# YouTube shorts / long-form style guide

Rules for AI-generated scripts for the **shariq.dev YouTube channel** (https://www.youtube.com/@ShariqHirani). The drafting agent (Plan B) loads this file verbatim into the system prompt for any row with `Kind` in `[YT short, YT long]`.

If a rule below is wrong or outdated, **update this file** before the next agent run.

---

## Voice

- **First person.** Peer-to-peer, not influencer.
- **No "what's up guys" / "smash like" / "in this video we'll" openers.** Get straight to the payoff.
- **Speak like a working engineer**, not a tutorial host. Concrete, opinionated, fast.
- **Admit gaps.** "Haven't tried X yet" beats fake authority.

## Hook (first 3 seconds)

The hook decides whether anyone watches the rest. It must:

- Promise a concrete payoff in plain language ("here's the one thing that broke for me")
- Avoid "you won't believe" / "the trick that…" / "no one is talking about…" patterns
- Be one sentence, ideally under 12 words

**Good:** "Cursor's new agent mode quietly rewrote my git config. Here's what to check."

**Bad:** "AI agents are everywhere, but no one is talking about this scary thing…"

## Length

| Kind     | Target duration | Word count guide |
| -------- | --------------- | ---------------- |
| YT short | 50-60 seconds   | 130-170 words    |
| YT long  | 4-7 minutes     | 600-1100 words   |

Going over kills retention. Going under wastes the spot.

## Script structure (shorts)

1. **Hook** (0-3s) — one sentence
2. **Setup** (3-15s) — what is the thing / why care
3. **Payoff** (15-50s) — the demo, the surprise, the take
4. **Tag** (50-60s) — one-line implication or follow-up question. No "subscribe" CTA in script (channel banner handles it).

## Script structure (long)

1. **Hook + thesis** (0-15s)
2. **Demo / walk-through** (15s-3m)
3. **What surprised me / what I'd do differently**
4. **Where this fits in your stack**
5. **Tag** — close with a take, not a CTA

## On-screen text

- Used to reinforce key terms, commands, or punchlines — never to repeat what the audio says.
- Each on-screen text is timestamped, ≤6 words, present-tense.

## B-roll

- For each timestamp, describe what visual should be on screen (screen recording, terminal, IDE, etc.).
- Avoid stock-footage cues — this channel is screen-cap-heavy.

## Thumbnail prompt

- One sentence describing the image to make.
- Include: subject, mood (matter-of-fact, not shocked-face), text overlay (≤4 words, sentence case, not all-caps).

## Titles

- 3 variants per video.
- Each ≤60 chars, sentence case, no clickbait.
- One should include a tool name; one should describe the outcome; one should be intentionally curiosity-driven without lying.

## Hashtags

- 5-8 per video, lowercase, no spaces.
- Mix: 2-3 broad (`ai`, `developer`, `programming`), 2-3 tool-specific (`claudecode`, `cursorai`), 1-2 niche (`agenticworkflows`).

## Don't

- Fake reactions ("WAIT, what?!")
- Reading the README aloud
- "Here's what I learned" recaps that aren't a take
- Mentioning competitors uncharitably
- Talking about Anthropic / OpenAI / Google as personalities
