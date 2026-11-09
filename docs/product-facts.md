# Product facts for posts

Ground truth the publishing pipeline's reviewer and reviser read when a draft makes a factual
claim about one of my projects. Each fact names its source. Add to it when a review asks for
product input; never put private infrastructure details here.

## Agent Inbox: the unslop A2A agent

Measured by the agent's bench (S11) on 2026-11-07; see
https://github.com/shariqh/agent-inbox/blob/main/docs/unslop.md.

- **Warm calls:** p50 about 2.1 s, p95 about 4.3 s, over 27 calls. The agent was running and
  its model was already loaded on the homelab GPU box.
- **The bench's one cold call took 13.6 s:** about 9 s waiting for the model to load, then
  4.6 s to generate. "Cold" means a call that had to start the agent or wait for a model load.
- **A full model swap is slower:** loading the chat model when the box has its coding model
  loaded takes about 65 s. That is the worst case for a first call; the bench did not hit it.
- So "13.6 s" and "65 s" are different cases: a cold call in the bench, and a full model swap.
  Name which one a sentence means.
