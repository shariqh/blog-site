# Image Gateway — extraction & blog-site cutover

**Status:** Design approved, ready for implementation plan
**Date:** 2026-06-29
**Tracking:** Solo blog-site todo #107 ("Generalize the cover-gen + OG image service for reuse across other sites")
**Supersedes the "Future work / generalize" item in:** `docs/superpowers/specs/2026-06-20-og-images-and-ai-cover-generation-design.md` §13

---

## 1. Context

The AI cover-generation + build-time OG-image engine built for blog-site (PR #46/#47)
should be reusable across the user's other properties. A repo-wide survey of
`~/Development` established the **actual** demand surface rather than assuming it:

- **Only two projects generate AI images today**, and they share one Azure resource
  (`shariq-blog-img-eus2` / `gpt-image-1`, eastus2):
  - **blog-site** (TS/Astro) — one landscape cover per post + build-time OG images.
    Has a vision text-leak guard + retry loop + branded fallback.
  - **bby-game** (Python, vanilla `gen.py`) — a character sheet, 6 scene
    illustrations, ~12 transparent sprites/icons. Uses Azure `images/edits`
    (reference image for character consistency), `background: transparent`, and
    square/portrait sizes. No guard/retry — manual eyeballing.
- **lognote** (TS/Astro 5 + MDX, `lognote/site`) is a near-perfect structural match
  to blog-site but has **no image generation yet**. Different branding (paper/ink/ember
  palette, Instrument Sans/Serif + Caveat fonts, a 4-category taxonomy) and posts that
  live outside the site at `docs/blog/`.
- Everything else is **deterministic rendering, not generation** (`create_thumb` →
  Pillow thumbnails; `coreworx` → `sharp` favicons) or **vision input** (`expense-tracker`
  reads receipt images via Azure OpenAI, emits none). **coreworx is explicitly out of
  scope** for this work.
- **Secret sprawl:** the same Azure key is copy-pasted into the `.env.local` of
  blog-site, bby-game, and expense-tracker.

### The three layers

The engine decomposes into three layers with **different sharing fates**:

| Layer | What | Sharing fate |
|---|---|---|
| **L0 — generative primitive** | `prompt → PNG` via gpt-image-1; `images/edits`; the gpt-4o-mini vision text-check | Shared by everything — but consumers span **TS + Python**, so code-sharing means an **HTTP service**, not a package |
| **L1 — deterministic render** | Satori → resvg branded OG images and the branded fallback cover | TS-only, hermetic, build-time — **stays local** in each Astro site; must never cross a network |
| **L2 — blog-cover workflow** | prompt spines, taxonomy→style selection, retry orchestration, frontmatter patching | Shared by **blog-site + lognote only**; bby-game is explicitly **not** a consumer |

This spec covers **standing up L0 as a hosted gateway and cutting blog-site over to it**.
L1 is untouched (it never called Azure). L2 stays in blog-site for now; factoring L2 into
a shared package is a follow-on driven by the lognote wiring.

## 2. Goal & scope

**Goal:** A single hosted **image gateway** becomes the only holder of the Azure key and
the only thing that talks to Azure OpenAI for image work. blog-site's cover pipeline calls
the gateway instead of Azure directly, and produces covers identically to today.

**In scope (this deliverable):**

1. A new standalone **`image-gateway`** service (own repo), deployed to **ubi-prod** in
   Docker behind the existing cloudflared tunnel, exposing `generate`, `vision:check-text`,
   and `healthz` (the `edit` endpoint is contract-reserved but implemented with bby-game —
   see §8).
2. **blog-site cutover:** replace the two Azure-calling functions with gateway calls;
   move config from Azure vars to gateway URL + token; update env example + docs.
3. **Azure key rotation:** rotate the sprawled key; the new key lives only in the gateway;
   scrub it from blog-site.
4. **Reprove:** demonstrate blog-site still generates a real cover via the gateway, unit
   tests pass, and the build (incl. OG images) is unaffected.

**Non-goals (tracked as follow-ons, §8):** lognote wiring; bby-game migration + the `edit`
endpoint; factoring L2 into a shared package; per-consumer tokens; rate limiting;
migrating expense-tracker.

## 3. Architecture

```
                       ┌─────────────────────────────────────────────┐
   blog-site (TS)      │  image-gateway  (ubi-prod, Docker, Node/TS)  │
   scripts/cover/      │  behind cloudflared tunnel                   │
   ─ generateImage ───►│  POST /v1/images/generate    ──┐            │
   ─ hasText       ───►│  POST /v1/vision/check-text   ──┤            │      ┌──────────────┐
                       │  POST /v1/images/edit (reserved)─┼──Azure────┼─────►│ Azure OpenAI │
   bby-game (py)       │  GET  /healthz                  ─┘  key      │      │ gpt-image-1  │
   gen.py (follow-on)─►│  Bearer-token auth · req logging │  (only    │      │ gpt-4o-mini  │
                       │  Azure key lives here only       │   here)   │      └──────────────┘
                       └─────────────────────────────────────────────┘

   STAYS LOCAL in each Astro site (never touches the gateway):
   ─ OG image render (Satori/resvg)        ← L1, build-time, hermetic
   ─ branded fallback cover render          ← L1
   ─ retry loop, taxonomy→style, frontmatter patching ← L2
```

The gateway is a **thin authenticated proxy**: it mirrors Azure's request shape, holds the
credential, and adds auth + structured logging. It contains no blog-cover policy — the
3-attempt retry loop and the branded fallback stay in blog-site.

## 4. The gateway service

### 4.1 Repo, language, framework

- **New repo `image-gateway`** under `~/Development` (deployed independently, like
  social-agent). Not inside blog-site.
- **Node / TypeScript**, minimal HTTP framework (**Hono** suggested). Rationale: the
  gateway's Azure logic is essentially blog-site's existing `scripts/cover/azure.ts`
  (generate) + `scripts/cover/text-check.ts` (check-text) **moved server-side** — TS lets
  us lift that proven code near-verbatim, and it matches the rest of the ecosystem.

### 4.2 API contract (v1)

All endpoints require `Authorization: Bearer <IMAGE_GATEWAY_TOKEN>`; missing/invalid → `401`.

**`POST /v1/images/generate`**
- Request `Content-Type: application/json`:
  ```jsonc
  {
    "prompt": "string (required)",
    "size": "1024x1024 | 1536x1024 | 1024x1536",  // optional, default 1024x1024
    "quality": "low | medium | high",              // optional, default high
    "output_format": "png | jpeg",                 // optional, default png
    "background": "transparent | opaque",          // optional (png only)
    "n": 1                                          // optional, default 1; v1 supports 1
  }
  ```
- Success: `200`, `Content-Type: image/png` (raw bytes of the single image).
- Failure: non-2xx, `application/json` `{ "error": { "message": "...", "upstreamStatus": 0 } }`.
- Internally: POST `{endpoint}/openai/deployments/{IMAGE_DEPLOYMENT}/images/generations?api-version=2025-04-01-preview`, decode `data[0].b64_json` → bytes.

**`POST /v1/vision/check-text`**
- Request: `Content-Type: image/png`, body = raw PNG bytes.
- Success: `200`, `application/json` `{ "hasText": true | false }`.
- Failure: non-2xx (the **client** owns the fail-safe policy — see §6).
- Internally: POST `{endpoint}/openai/deployments/{VISION_DEPLOYMENT}/chat/completions?api-version=2024-10-21`, the same yes/no "does this image contain legible readable words?" prompt blog-site uses today.

**`POST /v1/images/edit`** — *contract-reserved, implemented with bby-game (§8).*
- Request: `multipart/form-data` fields `prompt`, `size`, `quality`, `n`; file `image` (reference).
- Success: `200`, `image/png`.
- Internally: multipart POST to `…/images/edits`.

**`GET /healthz`** → `200 {"ok": true}` (no auth) — for the compose healthcheck and tunnel.

### 4.3 Configuration (gateway env)

Rendered locally (via `op`) and delivered to ubi-prod as an env file — **never committed**:

| Var | Notes |
|---|---|
| `AZURE_OPENAI_ENDPOINT` | the rotated resource endpoint |
| `AZURE_OPENAI_KEY` | **rotated** key — lives only here |
| `AZURE_OPENAI_IMAGE_DEPLOYMENT` | default `gpt-image-1` |
| `AZURE_OPENAI_VISION_DEPLOYMENT` | default `gpt-4o-mini` |
| `IMAGE_GATEWAY_TOKEN` | bearer secret consumers present |
| `PORT` | container listen port |

### 4.4 Deploy (ubi-prod)

- `Dockerfile` (`node:22-alpine`), a `docker-compose` service with a `/healthz` healthcheck.
- Follows the established ubi-prod pattern (per project memory): build/render secrets
  locally → rsync → `docker compose up -d` on the host (`node`/`op`/`cloudflared` are not
  run on the host directly).
- Add a **cloudflared tunnel ingress rule**: `img-gateway.shariq.dev` → `http://localhost:<PORT>`
  (proposed hostname; rename freely).
- **Structured request logging to stdout** (`docker logs`): per request — consumer (from a
  caller-supplied `X-Client` header or token identity), endpoint, size/quality, latency,
  upstream status. This is the central cost/usage visibility that motivated centralizing.

## 5. blog-site cutover

Minimal diff — only the two Azure-calling implementations and their config change. The
orchestrator (`generate-cover.ts`), prompt building, **local** branded fallback, and
frontmatter patching are untouched (the injectable-deps seam already isolates them).

1. **`scripts/cover/config.ts`** — replace `getImageConfig`/`getVisionConfig`/`requireCreds`
   (Azure endpoint/key/deployments) with `getGatewayConfig()` reading `IMAGE_GATEWAY_URL`
   + `IMAGE_GATEWAY_TOKEN`.
2. **`scripts/cover/azure.ts`** — `generateImage(prompt)` POSTs `…/v1/images/generate`
   (`size: "1536x1024"`, `quality: "high"`, `output_format: "png"`), returns the PNG buffer.
   **Raise** the client timeout to ~200s (the current 120s is below the gateway's
   worst-case generate time of ~180s plus proxy overhead).
3. **`scripts/cover/text-check.ts`** — `hasText(png)` POSTs the PNG to `…/v1/vision/check-text`,
   returns `body.hasText`. Preserve the **fail-safe**: any non-2xx / network error / parse
   failure → `true` (forces a retry, then the local fallback) — identical to today.
4. **`.env.local.example`** + **`CLAUDE.md`** ("AI cover generation" section) — swap the
   Azure vars for `IMAGE_GATEWAY_URL` / `IMAGE_GATEWAY_TOKEN`; note the build never calls
   the gateway (covers are generated at draft/CLI time only).
5. Remove the Azure key/endpoint from blog-site's local env.

No change to: `generate-cover.ts`, `prompt.ts`, `fallback.ts`, `frontmatter.ts`,
`cli.ts`/`backfill.ts`/`attach.ts` control flow, `src/lib/og/*`, or the OG build endpoint.

## 6. Failure behavior (unchanged)

A gateway outage degrades exactly like an Azure outage does today:

- `generateImage` (gateway down) throws → propagates out of `generateCover`. Callers handle
  it as now: `attach.ts` (Plan B hook) logs and returns `null` (draft proceeds, post gets the
  branded OG fallback); `cli.ts`/`backfill.ts` surface the error.
- `hasText` fails safe to `true` on any error → the 3-attempt loop exhausts → the **local**
  branded fallback cover renders. "Nothing ships blank" still holds with zero gateway
  availability.

Because covers are generated only at **draft/CLI time** (never on every Pages build), the
gateway is not on the site's critical build path.

## 7. Testing & acceptance criteria ("reprove")

1. **Unit:** existing cover tests pass — the injectable-deps seam means the orchestrator is
   tested with fakes; add focused tests for the two new gateway clients (request shape,
   `hasText` fail-safe on non-2xx).
2. **Gateway:** `GET /healthz` → 200; `generate`/`check-text` return correct types; a missing/
   wrong bearer token → 401.
3. **End-to-end:** with the gateway live on ubi-prod, `npm run gen:cover <slug> --force`
   produces a real (non-fallback) AI cover and patches `hero` frontmatter as before.
4. **Build:** `npm run build` succeeds and OG images render (unaffected — they never touched
   the gateway). `npm run astro check` clean.
5. **Secret hygiene:** blog-site contains no Azure key; the gateway holds the rotated key;
   old key revoked.

## 8. Follow-on work (out of scope here)

- **bby-game migration:** implement `POST /v1/images/edit`; point `gen.py` at the gateway
  (its `generate` calls work day one — `size`/`background: transparent` are already
  supported; only reference-mode needs `edit`); remove its Azure key.
- **lognote wiring:** add a `hero` field to its blog schema, a per-page OG prop + cover
  display; this is the natural trigger to **factor L2 into a shared, config-driven package**
  (palette, fonts-as-TTF-buffers, taxonomy→style map, content/output paths). lognote needs
  static TTF cuts of Instrument Sans/Serif + Caveat for Satori.
- **Per-consumer tokens** (revocation/attribution), **rate limiting**, and optionally a
  **server-side guard+retry** mode on `generate` if a future consumer wants the text-leak
  guard without re-implementing the loop.
- **expense-tracker** key migration (separate vision-input use; low priority).

## 9. Risks & open questions

- **ubi-prod availability** is now a dependency for *generating* covers (not for builds or
  serving). Acceptable given cover-gen is a non-fatal draft/CLI job; the local fallback
  covers an outage.
- **Tunnel hostname / DNS** (`img-gateway.shariq.dev`): this is a cloudflared tunnel
  ingress rule + DNS record pointing at the ubi-prod container, not a Pages/Worker deploy.
- **Long requests through the tunnel:** confirm cloudflared passes a 60–180s response without
  cutting the connection (raise client/tunnel timeouts if needed).
- **n > 1** is unsupported in v1 (binary single-image response). Revisit only if a consumer
  needs batches.
