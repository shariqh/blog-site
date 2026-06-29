# Image Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a hosted image-generation gateway (the only holder of the Azure key) and cut blog-site's cover pipeline over to it, producing covers identically to today.

**Architecture:** A thin authenticated HTTP proxy over Azure OpenAI (`gpt-image-1` + `gpt-4o-mini`) runs in Docker on ubi-prod behind the existing cloudflared tunnel. blog-site's two Azure-calling functions (`generateImage`, `hasText`) become gateway calls; the OG/Satori render and branded fallback stay local. All deferred work is filed as GitHub issues on the new repo.

**Tech Stack:** Node 22, TypeScript, Hono (gateway); Vitest (tests, both repos); Docker + docker-compose; cloudflared tunnel; Azure OpenAI; `gh` CLI.

**Spec:** `docs/superpowers/specs/2026-06-29-image-gateway-extraction-design.md`

## Global Constraints

- **Azure API versions (exact):** image `2025-04-01-preview`; vision `2024-10-21`.
- **Azure deployments (defaults):** image `gpt-image-1`; vision `gpt-4o-mini`.
- **Auth:** every `/v1/*` route requires `Authorization: Bearer <IMAGE_GATEWAY_TOKEN>`; missing/invalid → `401`. `/healthz` is unauthenticated.
- **blog-site cover request:** `size: "1536x1024"`, `quality: "high"`, `output_format: "png"`.
- **Fail-safe policy lives in the CLIENT (blog-site), not the gateway:** the gateway reports honest errors (non-2xx); blog-site's `hasText` maps any non-2xx/network/parse failure → `true`.
- **v1 supports a single image** (`n: 1`); `generate` returns raw `image/png` bytes.
- **Endpoint paths are slash-delimited:** `/v1/images/generate`, `/v1/vision/check-text`, `/v1/images/edit`, `/healthz`.
- **Gateway repo:** new, standalone, at `/Users/shariqhirani/Development/image-gateway`. Secrets are never committed.
- **Proposed tunnel hostname:** `img-gateway.shariq.dev` (rename freely — used verbatim below).
- Commit after every task. Conventional-commit messages.

---

## Phase 1 — image-gateway service (new repo)

### Task 1: Scaffold repo, config loader, healthz, create GitHub repo

**Files:**
- Create: `/Users/shariqhirani/Development/image-gateway/package.json`
- Create: `/Users/shariqhirani/Development/image-gateway/tsconfig.json`
- Create: `/Users/shariqhirani/Development/image-gateway/vitest.config.ts`
- Create: `/Users/shariqhirani/Development/image-gateway/.gitignore`
- Create: `/Users/shariqhirani/Development/image-gateway/.env.example`
- Create: `/Users/shariqhirani/Development/image-gateway/src/config.ts`
- Create: `/Users/shariqhirani/Development/image-gateway/src/app.ts`
- Create: `/Users/shariqhirani/Development/image-gateway/src/index.ts`
- Test: `/Users/shariqhirani/Development/image-gateway/test/config.test.ts`
- Test: `/Users/shariqhirani/Development/image-gateway/test/healthz.test.ts`

**Interfaces:**
- Produces: `loadConfig(env?): GatewayConfig` where `GatewayConfig = { azureEndpoint: string; azureKey: string; imageDeployment: string; visionDeployment: string; gatewayToken: string; port: number }`.
- Produces: `buildApp(deps: { azure: AzureClient; token: string; logger?: Logger }): Hono` (in this task only `/healthz` is wired; `azure`/`token` are accepted but unused until later tasks).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "image-gateway",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "node --import tsx src/index.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": { "hono": "^4.6.0", "@hono/node-server": "^1.13.0" },
  "devDependencies": { "tsx": "^4.19.0", "typescript": "^5.6.0", "vitest": "^2.1.0", "@types/node": "^22.0.0" }
}
```

- [ ] **Step 2: Create `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `.env.example`**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ES2022", "moduleResolution": "bundler",
    "strict": true, "esModuleInterop": true, "skipLibCheck": true,
    "types": ["node"], "noEmit": true
  },
  "include": ["src", "test"]
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node' } });
```

`.gitignore`:
```
node_modules
.env
.env.local
*.log
dist
```

`.env.example`:
```
AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com
AZURE_OPENAI_KEY=
AZURE_OPENAI_IMAGE_DEPLOYMENT=gpt-image-1
AZURE_OPENAI_VISION_DEPLOYMENT=gpt-4o-mini
IMAGE_GATEWAY_TOKEN=
PORT=8080
```

- [ ] **Step 3: Write the failing config test**

`test/config.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

const base = {
  AZURE_OPENAI_ENDPOINT: 'https://x.openai.azure.com/',
  AZURE_OPENAI_KEY: 'k', IMAGE_GATEWAY_TOKEN: 't',
};

describe('loadConfig', () => {
  it('strips trailing slash and applies deployment defaults', () => {
    const c = loadConfig(base);
    expect(c.azureEndpoint).toBe('https://x.openai.azure.com');
    expect(c.imageDeployment).toBe('gpt-image-1');
    expect(c.visionDeployment).toBe('gpt-4o-mini');
    expect(c.port).toBe(8080);
  });
  it('throws when a required var is missing', () => {
    expect(() => loadConfig({ AZURE_OPENAI_ENDPOINT: 'x' })).toThrow(/AZURE_OPENAI_KEY/);
  });
});
```

- [ ] **Step 4: Run it — expect FAIL** (`npm test` → "Cannot find module '../src/config.js'").

- [ ] **Step 5: Implement `src/config.ts`**

```ts
export interface GatewayConfig {
  azureEndpoint: string; azureKey: string;
  imageDeployment: string; visionDeployment: string;
  gatewayToken: string; port: number;
}
function req(env: Record<string, string | undefined>, key: string): string {
  const v = env[key];
  if (!v) throw new Error(`Missing required env: ${key}`);
  return v;
}
export function loadConfig(env: Record<string, string | undefined> = process.env): GatewayConfig {
  return {
    azureEndpoint: req(env, 'AZURE_OPENAI_ENDPOINT').replace(/\/+$/, ''),
    azureKey: req(env, 'AZURE_OPENAI_KEY'),
    gatewayToken: req(env, 'IMAGE_GATEWAY_TOKEN'),
    imageDeployment: env.AZURE_OPENAI_IMAGE_DEPLOYMENT || 'gpt-image-1',
    visionDeployment: env.AZURE_OPENAI_VISION_DEPLOYMENT || 'gpt-4o-mini',
    port: Number(env.PORT || 8080),
  };
}
```

- [ ] **Step 6: Write the failing healthz test**

`test/healthz.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';

const deps = { azure: {} as any, token: 'test-token' };

describe('GET /healthz', () => {
  it('returns 200 ok without auth', async () => {
    const app = buildApp(deps);
    const res = await app.request('/healthz');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
```

- [ ] **Step 7: Run it — expect FAIL** (no `src/app.js`).

- [ ] **Step 8: Implement `src/app.ts` (healthz only) and `src/index.ts`**

`src/app.ts`:
```ts
import { Hono } from 'hono';
import type { AzureClient } from './azure.js';

export type Logger = (msg: Record<string, unknown>) => void;

export interface AppDeps { azure: AzureClient; token: string; logger?: Logger }

export function buildApp(deps: AppDeps): Hono {
  const app = new Hono();
  app.get('/healthz', (c) => c.json({ ok: true }));
  // /v1 routes are wired in later tasks.
  return app;
}
```

`src/index.ts`:
```ts
import { serve } from '@hono/node-server';
import { loadConfig } from './config.js';
import { createAzureClient } from './azure.js';
import { buildApp } from './app.js';

const config = loadConfig();
const azure = createAzureClient(config);
const app = buildApp({ azure, token: config.gatewayToken, logger: (m) => console.log(JSON.stringify(m)) });
serve({ fetch: app.fetch, port: config.port });
console.log(JSON.stringify({ msg: 'image-gateway listening', port: config.port }));
```

> `src/index.ts` imports `createAzureClient`/`AzureClient` from `./azure.js`, created in Task 4. Add a temporary stub now so `npm run typecheck` passes: create `src/azure.ts` with `export interface AzureClient { generate(p: any): Promise<Buffer>; checkText(png: Buffer): Promise<boolean> } export function createAzureClient(_c: unknown): AzureClient { return { async generate() { throw new Error('not implemented'); }, async checkText() { throw new Error('not implemented'); } }; }` — Task 4 replaces the body.

- [ ] **Step 9: Run tests — expect PASS** (`npm test`).

- [ ] **Step 10: Init git, create the private GitHub repo, push**

```bash
cd /Users/shariqhirani/Development/image-gateway
git init -q && git add -A && git commit -q -m "feat: scaffold image-gateway (config + healthz)"
gh repo create image-gateway --private --source=. --remote=origin --push
```
Expected: repo created under your account, initial commit pushed, `origin` set.

---

### Task 2: File the deferred backlog as GitHub issues on the new repo

Everything not built today (spec §8 follow-ons + §9 risks) becomes a tracked issue so it isn't lost. Run after Task 1 (the repo must exist). Note: the `edit` endpoint is **in scope** (Task 6), so it is NOT filed as an issue.

**Files:** none (uses `gh` against the `image-gateway` repo).

- [ ] **Step 1: Create labels (idempotent)**

```bash
cd /Users/shariqhirani/Development/image-gateway
for lbl in "gateway:0E8A16" "consumer:1D76DB" "infra:5319E7" "follow-up:FBCA04"; do
  name="${lbl%%:*}"; color="${lbl##*:}"
  gh label create "$name" --color "$color" --force >/dev/null 2>&1 || true
done
```

- [ ] **Step 2: Create the backlog issues**

```bash
cd /Users/shariqhirani/Development/image-gateway
gh issue create --title "Migrate bby-game onto the gateway" \
  --label enhancement --label consumer --label follow-up \
  --body "Point bby-game's gen.py at the gateway (both generate AND edit paths — the gateway's /v1/images/edit endpoint is implemented in v1) and remove its Azure key. Step-by-step lives in bby-game/MIGRATE-TO-GATEWAY.md."

gh issue create --title "Wire lognote as a cover consumer" \
  --label enhancement --label consumer --label follow-up \
  --body "Add a hero field to lognote's blog schema (lognote/site), a per-page OG image prop, and cover display. Branding config: paper/ink/ember palette, Instrument Sans/Serif + Caveat, 4-category taxonomy. Content lives in docs/blog/, images in site/public/blog/<slug>/."

gh issue create --title "Factor L2 blog-cover workflow into a shared, config-driven package" \
  --label enhancement --label follow-up \
  --body "Extract the blog-cover workflow (prompt spines, taxonomy->style, retry orchestration, frontmatter patching) into a package consumed by blog-site + lognote. Config surface: palette, fonts-as-TTF-buffers, taxonomy->style map, content/output paths. Triggered by the lognote wiring."

gh issue create --title "Vendor static TTF cuts of Instrument Sans/Serif + Caveat for lognote Satori" \
  --label enhancement --label consumer --label follow-up \
  --body "Satori cannot read variable WOFF2; lognote needs static TTF cuts vendored for its OG/branded-fallback rendering."

gh issue create --title "Per-consumer bearer tokens" \
  --label enhancement --label gateway --label follow-up \
  --body "Replace the single shared token with per-consumer tokens for revocation + attribution in request logs."

gh issue create --title "Rate limiting on the gateway" \
  --label enhancement --label gateway --label follow-up \
  --body "Add basic per-token rate limiting once there is more than one live consumer."

gh issue create --title "Optional server-side guard+retry mode on generate" \
  --label enhancement --label gateway --label follow-up \
  --body "Add an opt-in guard+maxAttempts param to /v1/images/generate that runs the vision text-check + retry loop server-side, so future consumers get the text-leak guard without re-implementing it. Clients still render their own local fallback on exhaustion."

gh issue create --title "Migrate expense-tracker off the shared Azure key" \
  --label enhancement --label follow-up \
  --body "expense-tracker uses Azure OpenAI for vision INPUT (receipts->JSON), not image output, but shares the sprawled key. Move it to its own credential or route through a future vision endpoint. Low priority."

gh issue create --title "Support n>1 batch responses" \
  --label enhancement --label gateway --label follow-up \
  --body "v1 returns a single image/png. Add a batch response shape only if a consumer needs n>1."

gh issue create --title "Verify cloudflared passes 60-180s responses without cutting the connection" \
  --label infra --label follow-up \
  --body "gpt-image-1 calls take 60-180s. Confirm the tunnel + client timeouts hold a long single response end-to-end; tune if needed."
```

- [ ] **Step 3: Verify**

```bash
gh issue list --repo "$(gh repo view --json nameWithOwner -q .nameWithOwner)" --limit 20
```
Expected: 10 open issues listed. (No commit — issues are remote.)

---

### Task 3: Bearer-auth middleware

**Files:**
- Create: `/Users/shariqhirani/Development/image-gateway/src/auth.ts`
- Test: `/Users/shariqhirani/Development/image-gateway/test/auth.test.ts`

**Interfaces:**
- Produces: `bearerAuth(token: string): MiddlewareHandler` — 401 unless `Authorization: Bearer <token>` matches exactly.

- [ ] **Step 1: Write the failing test**

`test/auth.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { bearerAuth } from '../src/auth.js';

function appWith(token: string) {
  const app = new Hono();
  app.use('/guarded', bearerAuth(token));
  app.get('/guarded', (c) => c.text('ok'));
  return app;
}

describe('bearerAuth', () => {
  it('401 without a token', async () => {
    const res = await appWith('secret').request('/guarded');
    expect(res.status).toBe(401);
  });
  it('401 with the wrong token', async () => {
    const res = await appWith('secret').request('/guarded', { headers: { authorization: 'Bearer nope' } });
    expect(res.status).toBe(401);
  });
  it('passes through with the correct token', async () => {
    const res = await appWith('secret').request('/guarded', { headers: { authorization: 'Bearer secret' } });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (no `src/auth.js`).

- [ ] **Step 3: Implement `src/auth.ts`**

```ts
import type { MiddlewareHandler } from 'hono';
export function bearerAuth(token: string): MiddlewareHandler {
  return async (c, next) => {
    const m = (c.req.header('authorization') ?? '').match(/^Bearer\s+(.+)$/i);
    if (!m || m[1] !== token) return c.json({ error: { message: 'unauthorized' } }, 401);
    await next();
  };
}
```

- [ ] **Step 4: Run tests — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: bearer-token auth middleware"
```

---

### Task 4: `POST /v1/images/generate` (Azure generate client + route)

**Files:**
- Modify: `/Users/shariqhirani/Development/image-gateway/src/azure.ts` (replace the Task-1 stub)
- Modify: `/Users/shariqhirani/Development/image-gateway/src/app.ts:1-20` (wire the `/v1` router + generate route)
- Test: `/Users/shariqhirani/Development/image-gateway/test/azure-generate.test.ts`
- Test: `/Users/shariqhirani/Development/image-gateway/test/generate-route.test.ts`

**Interfaces:**
- Produces: `class UpstreamError extends Error { constructor(op: string, status: number, detail: string) }` with `.status: number`.
- Produces: `interface GenerateParams { prompt: string; size?: string; quality?: string; outputFormat?: string; background?: string }`.
- Produces: `interface EditParams { prompt: string; image: Buffer; filename?: string; size?: string; quality?: string }`.
- Produces: `interface AzureClient { generate(p: GenerateParams): Promise<Buffer>; checkText(png: Buffer): Promise<boolean>; edit?(p: EditParams): Promise<Buffer> }` — `edit` is optional here and implemented in Task 6, so generate/check-text fakes in other tests need no change.
- Produces: `createAzureClient(cfg: GatewayConfig, fetchImpl?: typeof fetch): AzureClient`.
- Produces route `POST /v1/images/generate` → `image/png` on success; `{ error: { message, upstreamStatus? } }` with status 400/500/502 on failure.

- [ ] **Step 1: Write the failing Azure-generate test**

`test/azure-generate.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { createAzureClient, UpstreamError } from '../src/azure.js';

const cfg = { azureEndpoint: 'https://x.openai.azure.com', azureKey: 'k',
  imageDeployment: 'gpt-image-1', visionDeployment: 'gpt-4o-mini', gatewayToken: 't', port: 8080 };

describe('AzureClient.generate', () => {
  it('builds the correct URL/body and decodes b64 to a Buffer', async () => {
    const png = Buffer.from('PNGDATA');
    const fetchImpl = vi.fn(async (url: any, init: any) => {
      expect(String(url)).toBe('https://x.openai.azure.com/openai/deployments/gpt-image-1/images/generations?api-version=2025-04-01-preview');
      expect(init.headers['api-key']).toBe('k');
      const body = JSON.parse(init.body);
      expect(body).toMatchObject({ prompt: 'cover', n: 1, size: '1536x1024', quality: 'high', output_format: 'png' });
      return new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }), { status: 200 });
    });
    const out = await createAzureClient(cfg, fetchImpl as any).generate({ prompt: 'cover', size: '1536x1024' });
    expect(out.equals(png)).toBe(true);
  });
  it('passes background:transparent through', async () => {
    const fetchImpl = vi.fn(async (_u: any, init: any) => {
      expect(JSON.parse(init.body).background).toBe('transparent');
      return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('x').toString('base64') }] }), { status: 200 });
    });
    await createAzureClient(cfg, fetchImpl as any).generate({ prompt: 'p', background: 'transparent' });
  });
  it('throws UpstreamError on non-2xx', async () => {
    const fetchImpl = vi.fn(async () => new Response('boom', { status: 429 }));
    await expect(createAzureClient(cfg, fetchImpl as any).generate({ prompt: 'p' }))
      .rejects.toMatchObject({ status: 429 });
    expect(UpstreamError).toBeDefined();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (stub throws / no `UpstreamError`).

- [ ] **Step 3: Implement `src/azure.ts`**

```ts
import type { GatewayConfig } from './config.js';

const IMAGE_API_VERSION = '2025-04-01-preview';
const VISION_API_VERSION = '2024-10-21';

export class UpstreamError extends Error {
  status: number;
  constructor(op: string, status: number, detail: string) {
    super(`azure ${op} failed (${status}): ${detail}`);
    this.name = 'UpstreamError';
    this.status = status;
  }
}

export interface GenerateParams { prompt: string; size?: string; quality?: string; outputFormat?: string; background?: string }
export interface EditParams { prompt: string; image: Buffer; filename?: string; size?: string; quality?: string }
export interface AzureClient {
  generate(p: GenerateParams): Promise<Buffer>;
  checkText(png: Buffer): Promise<boolean>;
  edit?(p: EditParams): Promise<Buffer>; // implemented in Task 6
}

async function safeText(res: Response): Promise<string> { try { return await res.text(); } catch { return ''; } }

export function createAzureClient(cfg: GatewayConfig, fetchImpl: typeof fetch = fetch): AzureClient {
  return {
    async generate(p) {
      const url = `${cfg.azureEndpoint}/openai/deployments/${cfg.imageDeployment}/images/generations?api-version=${IMAGE_API_VERSION}`;
      const body: Record<string, unknown> = {
        prompt: p.prompt, n: 1,
        size: p.size ?? '1024x1024', quality: p.quality ?? 'high', output_format: p.outputFormat ?? 'png',
      };
      if (p.background) body.background = p.background;
      const res = await fetchImpl(url, { method: 'POST', headers: { 'api-key': cfg.azureKey, 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new UpstreamError('generate', res.status, await safeText(res));
      const json = (await res.json()) as { data?: { b64_json?: string }[] };
      const b64 = json.data?.[0]?.b64_json;
      if (!b64) throw new UpstreamError('generate', 502, 'no image in response');
      return Buffer.from(b64, 'base64');
    },
    async checkText(_png) { throw new Error('checkText implemented in Task 5'); },
  };
}
```

- [ ] **Step 4: Run the Azure-generate test — expect PASS.**

- [ ] **Step 5: Write the failing generate-route test**

`test/generate-route.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AzureClient } from '../src/azure.js';

const png = Buffer.from('PNGBYTES');
const azure: AzureClient = { async generate() { return png; }, async checkText() { return false; } };
const H = { authorization: 'Bearer t', 'content-type': 'application/json' };

describe('POST /v1/images/generate', () => {
  it('401 without auth', async () => {
    const res = await buildApp({ azure, token: 't' }).request('/v1/images/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"prompt":"x"}' });
    expect(res.status).toBe(401);
  });
  it('400 when prompt missing', async () => {
    const res = await buildApp({ azure, token: 't' }).request('/v1/images/generate', { method: 'POST', headers: H, body: '{}' });
    expect(res.status).toBe(400);
  });
  it('returns image/png bytes on success', async () => {
    const res = await buildApp({ azure, token: 't' }).request('/v1/images/generate', { method: 'POST', headers: H, body: JSON.stringify({ prompt: 'x', size: '1536x1024' }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/png');
    expect(Buffer.from(await res.arrayBuffer()).equals(png)).toBe(true);
  });
  it('502 when the client raises UpstreamError', async () => {
    const { UpstreamError } = await import('../src/azure.js');
    const failing: AzureClient = { async generate() { throw new UpstreamError('generate', 429, 'rate'); }, async checkText() { return false; } };
    const res = await buildApp({ azure: failing, token: 't' }).request('/v1/images/generate', { method: 'POST', headers: H, body: '{"prompt":"x"}' });
    expect(res.status).toBe(502);
    expect((await res.json() as any).error.upstreamStatus).toBe(429);
  });
});
```

- [ ] **Step 6: Run it — expect FAIL** (route not wired).

- [ ] **Step 7: Wire the `/v1` router + generate route in `src/app.ts`**

Replace the body of `buildApp` so it reads:
```ts
import { Hono } from 'hono';
import { bearerAuth } from './auth.js';
import { UpstreamError } from './azure.js';
import type { AzureClient } from './azure.js';

export type Logger = (msg: Record<string, unknown>) => void;
export interface AppDeps { azure: AzureClient; token: string; logger?: Logger }

interface GenerateBody { prompt?: string; size?: string; quality?: string; output_format?: string; background?: string }

export function buildApp(deps: AppDeps): Hono {
  const app = new Hono();
  app.get('/healthz', (c) => c.json({ ok: true }));

  const v1 = new Hono();
  v1.use('*', bearerAuth(deps.token));

  v1.post('/images/generate', async (c) => {
    let body: GenerateBody;
    try { body = await c.req.json(); } catch { return c.json({ error: { message: 'invalid JSON body' } }, 400); }
    if (!body?.prompt || typeof body.prompt !== 'string') return c.json({ error: { message: 'prompt is required' } }, 400);
    try {
      const out = await deps.azure.generate({ prompt: body.prompt, size: body.size, quality: body.quality, outputFormat: body.output_format, background: body.background });
      return c.body(out, 200, { 'content-type': 'image/png' });
    } catch (e) {
      if (e instanceof UpstreamError) return c.json({ error: { message: e.message, upstreamStatus: e.status } }, 502);
      return c.json({ error: { message: (e as Error).message } }, 500);
    }
  });

  app.route('/v1', v1);
  return app;
}
```

- [ ] **Step 8: Run all tests — expect PASS** (`npm test`).

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: images/generate endpoint over Azure gpt-image-1"
```

---

### Task 5: `POST /v1/vision/check-text` (Azure checkText client + route)

**Files:**
- Modify: `/Users/shariqhirani/Development/image-gateway/src/azure.ts` (implement `checkText`)
- Modify: `/Users/shariqhirani/Development/image-gateway/src/app.ts` (add the route)
- Test: `/Users/shariqhirani/Development/image-gateway/test/azure-checktext.test.ts`
- Test: `/Users/shariqhirani/Development/image-gateway/test/checktext-route.test.ts`

**Interfaces:**
- Produces: `AzureClient.checkText(png: Buffer): Promise<boolean>` — `true`/`false` parsed from a yes/no vision answer; throws `UpstreamError` on non-2xx or unparseable answer.
- Produces route `POST /v1/vision/check-text` (body `image/png`) → `{ hasText: boolean }`; `502` on `UpstreamError`.

- [ ] **Step 1: Write the failing checkText test**

`test/azure-checktext.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { createAzureClient } from '../src/azure.js';

const cfg = { azureEndpoint: 'https://x.openai.azure.com', azureKey: 'k',
  imageDeployment: 'gpt-image-1', visionDeployment: 'gpt-4o-mini', gatewayToken: 't', port: 8080 };

function answer(text: string, status = 200) {
  return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status });
}

describe('AzureClient.checkText', () => {
  it('hits the chat/completions URL and returns true on "yes"', async () => {
    const fetchImpl = vi.fn(async (url: any, init: any) => {
      expect(String(url)).toBe('https://x.openai.azure.com/openai/deployments/gpt-4o-mini/chat/completions?api-version=2024-10-21');
      expect(JSON.parse(init.body).messages[0].content[1].image_url.url).toMatch(/^data:image\/png;base64,/);
      return answer('Yes');
    });
    expect(await createAzureClient(cfg, fetchImpl as any).checkText(Buffer.from('p'))).toBe(true);
  });
  it('returns false on "no"', async () => {
    const fetchImpl = vi.fn(async () => answer('no'));
    expect(await createAzureClient(cfg, fetchImpl as any).checkText(Buffer.from('p'))).toBe(false);
  });
  it('throws UpstreamError on an unparseable answer', async () => {
    const fetchImpl = vi.fn(async () => answer('maybe?'));
    await expect(createAzureClient(cfg, fetchImpl as any).checkText(Buffer.from('p'))).rejects.toMatchObject({ status: 502 });
  });
  it('throws UpstreamError on non-2xx', async () => {
    const fetchImpl = vi.fn(async () => answer('x', 500));
    await expect(createAzureClient(cfg, fetchImpl as any).checkText(Buffer.from('p'))).rejects.toMatchObject({ status: 500 });
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`checkText` stub throws generic Error).

- [ ] **Step 3: Implement `checkText` in `src/azure.ts`** (replace the stub method)

```ts
    async checkText(png) {
      const url = `${cfg.azureEndpoint}/openai/deployments/${cfg.visionDeployment}/chat/completions?api-version=${VISION_API_VERSION}`;
      const dataUri = `data:image/png;base64,${png.toString('base64')}`;
      const body = { max_tokens: 3, temperature: 0, messages: [{ role: 'user', content: [
        { type: 'text', text: 'Does this image contain any legible, readable words or letters? Answer only "yes" or "no".' },
        { type: 'image_url', image_url: { url: dataUri } },
      ] }] };
      const res = await fetchImpl(url, { method: 'POST', headers: { 'api-key': cfg.azureKey, 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new UpstreamError('check-text', res.status, await safeText(res));
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const a = (json.choices?.[0]?.message?.content ?? '').trim().toLowerCase();
      if (a.startsWith('yes')) return true;
      if (a.startsWith('no')) return false;
      throw new UpstreamError('check-text', 502, `unparseable answer: ${a}`);
    },
```

- [ ] **Step 4: Run the checkText test — expect PASS.**

- [ ] **Step 5: Write the failing route test**

`test/checktext-route.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AzureClient } from '../src/azure.js';

const azure: AzureClient = { async generate() { return Buffer.from(''); }, async checkText() { return true; } };

describe('POST /v1/vision/check-text', () => {
  it('401 without auth', async () => {
    const res = await buildApp({ azure, token: 't' }).request('/v1/vision/check-text', { method: 'POST', headers: { 'content-type': 'image/png' }, body: Buffer.from('p') });
    expect(res.status).toBe(401);
  });
  it('returns { hasText } on success', async () => {
    const res = await buildApp({ azure, token: 't' }).request('/v1/vision/check-text', { method: 'POST', headers: { authorization: 'Bearer t', 'content-type': 'image/png' }, body: Buffer.from('p') });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hasText: true });
  });
  it('400 on empty body', async () => {
    const res = await buildApp({ azure, token: 't' }).request('/v1/vision/check-text', { method: 'POST', headers: { authorization: 'Bearer t', 'content-type': 'image/png' }, body: Buffer.alloc(0) });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 6: Run it — expect FAIL** (route not wired).

- [ ] **Step 7: Add the route to `src/app.ts`** (inside `buildApp`, before `app.route('/v1', v1)`)

```ts
  v1.post('/vision/check-text', async (c) => {
    const ab = await c.req.arrayBuffer();
    if (!ab || ab.byteLength === 0) return c.json({ error: { message: 'empty image body' } }, 400);
    try {
      const hasText = await deps.azure.checkText(Buffer.from(ab));
      return c.json({ hasText });
    } catch (e) {
      if (e instanceof UpstreamError) return c.json({ error: { message: e.message, upstreamStatus: e.status } }, 502);
      return c.json({ error: { message: (e as Error).message } }, 500);
    }
  });
```

- [ ] **Step 8: Run all tests — expect PASS.**

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: vision/check-text endpoint over Azure gpt-4o-mini"
```

---

### Task 6: `POST /v1/images/edit` (Azure edit client + route)

In scope so bby-game can migrate end-to-end (its character-consistency uses reference/edit mode).

**Files:**
- Modify: `/Users/shariqhirani/Development/image-gateway/src/azure.ts` (implement `edit` on `createAzureClient`)
- Modify: `/Users/shariqhirani/Development/image-gateway/src/app.ts` (add the multipart route)
- Test: `/Users/shariqhirani/Development/image-gateway/test/azure-edit.test.ts`
- Test: `/Users/shariqhirani/Development/image-gateway/test/edit-route.test.ts`

**Interfaces:**
- Produces: `AzureClient.edit(p: EditParams): Promise<Buffer>` — multipart POST to `.../images/edits?api-version=2025-04-01-preview`; returns PNG bytes; throws `UpstreamError` on non-2xx / no image.
- Produces route `POST /v1/images/edit` (multipart/form-data: `prompt`, file `image`, optional `size`/`quality`) → `image/png`; `400` on missing prompt/image; `502` on `UpstreamError`.

- [ ] **Step 1: Write the failing Azure-edit test**

`test/azure-edit.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { createAzureClient } from '../src/azure.js';

const cfg = { azureEndpoint: 'https://x.openai.azure.com', azureKey: 'k',
  imageDeployment: 'gpt-image-1', visionDeployment: 'gpt-4o-mini', gatewayToken: 't', port: 8080 };

describe('AzureClient.edit', () => {
  it('POSTs multipart to images/edits and decodes b64 to a Buffer', async () => {
    const png = Buffer.from('EDITED');
    const fetchImpl = vi.fn(async (url: any, init: any) => {
      expect(String(url)).toBe('https://x.openai.azure.com/openai/deployments/gpt-image-1/images/edits?api-version=2025-04-01-preview');
      expect(init.headers['api-key']).toBe('k');
      expect(init.body).toBeInstanceOf(FormData);
      const fd = init.body as FormData;
      expect(fd.get('prompt')).toBe('make it pop');
      expect(fd.get('image')).toBeInstanceOf(Blob);
      return new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }), { status: 200 });
    });
    const out = await createAzureClient(cfg, fetchImpl as any).edit!({ prompt: 'make it pop', image: Buffer.from('REF'), filename: 'ref.png', size: '1024x1024' });
    expect(out.equals(png)).toBe(true);
  });
  it('throws UpstreamError on non-2xx', async () => {
    const fetchImpl = vi.fn(async () => new Response('bad', { status: 400 }));
    await expect(createAzureClient(cfg, fetchImpl as any).edit!({ prompt: 'p', image: Buffer.from('x') })).rejects.toMatchObject({ status: 400 });
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`edit` not on the client).

- [ ] **Step 3: Implement `edit` in `createAzureClient` (src/azure.ts)** — add this method to the returned object

```ts
    async edit(p) {
      const url = `${cfg.azureEndpoint}/openai/deployments/${cfg.imageDeployment}/images/edits?api-version=${IMAGE_API_VERSION}`;
      const form = new FormData();
      form.append('prompt', p.prompt);
      form.append('n', '1');
      if (p.size) form.append('size', p.size);
      if (p.quality) form.append('quality', p.quality);
      form.append('image', new Blob([p.image], { type: 'image/png' }), p.filename ?? 'image.png');
      const res = await fetchImpl(url, { method: 'POST', headers: { 'api-key': cfg.azureKey }, body: form });
      if (!res.ok) throw new UpstreamError('edit', res.status, await safeText(res));
      const json = (await res.json()) as { data?: { b64_json?: string }[] };
      const b64 = json.data?.[0]?.b64_json;
      if (!b64) throw new UpstreamError('edit', 502, 'no image in response');
      return Buffer.from(b64, 'base64');
    },
```
> Do NOT set `content-type` on the edit request — `fetch` derives the multipart boundary from the `FormData` body automatically.

- [ ] **Step 4: Run the Azure-edit test — expect PASS.**

- [ ] **Step 5: Write the failing edit-route test**

`test/edit-route.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AzureClient } from '../src/azure.js';

const edited = Buffer.from('EDITEDPNG');
const azure: AzureClient = { async generate() { return Buffer.from(''); }, async checkText() { return false; }, async edit() { return edited; } };

function form(withImage = true) {
  const fd = new FormData();
  fd.append('prompt', 'make it pop');
  if (withImage) fd.append('image', new Blob([Buffer.from('REF')], { type: 'image/png' }), 'ref.png');
  return fd;
}

describe('POST /v1/images/edit', () => {
  it('401 without auth', async () => {
    const res = await buildApp({ azure, token: 't' }).request('/v1/images/edit', { method: 'POST', body: form() });
    expect(res.status).toBe(401);
  });
  it('400 when the image file is missing', async () => {
    const res = await buildApp({ azure, token: 't' }).request('/v1/images/edit', { method: 'POST', headers: { authorization: 'Bearer t' }, body: form(false) });
    expect(res.status).toBe(400);
  });
  it('returns image/png on success', async () => {
    const res = await buildApp({ azure, token: 't' }).request('/v1/images/edit', { method: 'POST', headers: { authorization: 'Bearer t' }, body: form() });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/png');
    expect(Buffer.from(await res.arrayBuffer()).equals(edited)).toBe(true);
  });
});
```

- [ ] **Step 6: Run it — expect FAIL** (route still absent / 501).

- [ ] **Step 7: Add the route to `src/app.ts`** (replace any prior `/images/edit` line; place before `app.route('/v1', v1)`)

```ts
  v1.post('/images/edit', async (c) => {
    const fd = await c.req.formData();
    const prompt = fd.get('prompt');
    const image = fd.get('image');
    if (typeof prompt !== 'string' || !prompt) return c.json({ error: { message: 'prompt is required' } }, 400);
    if (!(image instanceof File)) return c.json({ error: { message: 'image file is required' } }, 400);
    if (!deps.azure.edit) return c.json({ error: { message: 'edit not available' } }, 501);
    const size = typeof fd.get('size') === 'string' ? (fd.get('size') as string) : undefined;
    const quality = typeof fd.get('quality') === 'string' ? (fd.get('quality') as string) : undefined;
    try {
      const out = await deps.azure.edit({ prompt, image: Buffer.from(await image.arrayBuffer()), filename: image.name, size, quality });
      return c.body(out, 200, { 'content-type': 'image/png' });
    } catch (e) {
      if (e instanceof UpstreamError) return c.json({ error: { message: e.message, upstreamStatus: e.status } }, 502);
      return c.json({ error: { message: (e as Error).message } }, 500);
    }
  });
```

- [ ] **Step 8: Run all tests — expect PASS.**

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: images/edit endpoint (multipart reference-image mode)"
```

---

### Task 7: Structured request logging

**Files:**
- Modify: `/Users/shariqhirani/Development/image-gateway/src/app.ts` (logging middleware on `/v1/*`)
- Test: `/Users/shariqhirani/Development/image-gateway/test/logging.test.ts`

**Interfaces:**
- Consumes: `deps.logger?: Logger` from `AppDeps`.
- Produces: one log object per `/v1` request: `{ endpoint, method, status, ms, client }` (`client` from the `X-Client` header or `'unknown'`).

- [ ] **Step 1: Write the failing test**

`test/logging.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AzureClient } from '../src/azure.js';
const azure: AzureClient = { async generate() { return Buffer.from('x'); }, async checkText() { return false; } };

describe('request logging', () => {
  it('logs one line per /v1 request with endpoint, status, client', async () => {
    const logs: Record<string, unknown>[] = [];
    const app = buildApp({ azure, token: 't', logger: (m) => logs.push(m) });
    await app.request('/v1/images/generate', { method: 'POST', headers: { authorization: 'Bearer t', 'content-type': 'application/json', 'x-client': 'blog-site' }, body: '{"prompt":"x"}' });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ endpoint: '/v1/images/generate', status: 200, client: 'blog-site' });
    expect(typeof logs[0].ms).toBe('number');
  });
  it('does not log /healthz', async () => {
    const logs: Record<string, unknown>[] = [];
    await buildApp({ azure, token: 't', logger: (m) => logs.push(m) }).request('/healthz');
    expect(logs).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.**

- [ ] **Step 3: Add logging middleware to `src/app.ts`** (register on `v1` BEFORE `bearerAuth` so auth failures are logged too)

```ts
  v1.use('*', async (c, next) => {
    const start = Date.now();
    await next();
    deps.logger?.({ endpoint: new URL(c.req.url).pathname, method: c.req.method, status: c.res.status, ms: Date.now() - start, client: c.req.header('x-client') ?? 'unknown' });
  });
```

> Order in `buildApp`: create `v1`, then `v1.use('*', <logging>)`, then `v1.use('*', bearerAuth(deps.token))`, then the routes. Hono runs middleware in registration order, so logging wraps auth.

- [ ] **Step 4: Run all tests — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: structured per-request logging on /v1"
```

---

### Task 8: Dockerfile, compose, README, local run

**Files:**
- Create: `/Users/shariqhirani/Development/image-gateway/Dockerfile`
- Create: `/Users/shariqhirani/Development/image-gateway/docker-compose.yml`
- Create: `/Users/shariqhirani/Development/image-gateway/.dockerignore`
- Create: `/Users/shariqhirani/Development/image-gateway/README.md`

- [ ] **Step 1: Create `Dockerfile`**

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm install tsx
COPY . .
EXPOSE 8080
CMD ["node", "--import", "tsx", "src/index.ts"]
```

- [ ] **Step 2: Create `.dockerignore`, `docker-compose.yml`**

`.dockerignore`:
```
node_modules
.git
.env
.env.local
*.log
test
```

`docker-compose.yml`:
```yaml
services:
  image-gateway:
    build: .
    restart: unless-stopped
    env_file: .env
    ports:
      - "8080:8080"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080/healthz"]
      interval: 30s
      timeout: 5s
      retries: 3
```

- [ ] **Step 3: Create `README.md`** (ops quickstart)

```markdown
# image-gateway

Thin authenticated proxy over Azure OpenAI image + vision for shariq.dev properties.
Holds the only Azure key. See blog-site spec 2026-06-29-image-gateway-extraction-design.md.

## Endpoints
- `POST /v1/images/generate`  JSON `{prompt,size?,quality?,output_format?,background?}` -> image/png
- `POST /v1/vision/check-text` body image/png -> `{hasText}`
- `POST /v1/images/edit`       multipart {prompt,image,size?,quality?} -> image/png
- `GET  /healthz`

All `/v1/*` require `Authorization: Bearer $IMAGE_GATEWAY_TOKEN`.

## Run locally
cp .env.example .env   # fill AZURE_OPENAI_KEY + IMAGE_GATEWAY_TOKEN
npm install && npm test && npm run dev

## Deploy (ubi-prod)
Render .env locally (op), rsync, `docker compose up -d --build`. Tunnel: img-gateway.shariq.dev.
```

- [ ] **Step 4: Build + run locally and verify healthz**

```bash
cd /Users/shariqhirani/Development/image-gateway
cp .env.example .env   # put any non-empty AZURE_OPENAI_KEY + IMAGE_GATEWAY_TOKEN for a local boot
docker compose up -d --build
sleep 3 && curl -fsS http://localhost:8080/healthz
```
Expected: `{"ok":true}`. Then `docker compose down`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: Dockerfile, compose, README for ubi-prod deploy"
git push
```

---

### Task 9: Deploy to ubi-prod behind the tunnel

This task runs against your infrastructure (per the ubi-prod project memory: `ssh shariq@ubi-prod`; Docker on the host; `node`/`op`/`cloudflared` not run on the host; render secrets locally + rsync). Adapt paths to your conventions.

**Files:** none in-repo (deploy artifacts + tunnel config live on ubi-prod / your dotfiles).

- [ ] **Step 1: Render the production `.env` locally (never commit)**

```bash
cd /Users/shariqhirani/Development/image-gateway
op inject -i .env.example -o .env.prod   # or hand-fill; set the ROTATED key in Task 10
# Ensure IMAGE_GATEWAY_TOKEN is a fresh strong secret: openssl rand -hex 32
```

- [ ] **Step 2: Sync the repo to ubi-prod**

```bash
rsync -az --delete --exclude node_modules --exclude .git --exclude .env \
  /Users/shariqhirani/Development/image-gateway/ shariq@ubi-prod:~/apps/image-gateway/
scp .env.prod shariq@ubi-prod:~/apps/image-gateway/.env
```

- [ ] **Step 3: Build + start on ubi-prod**

```bash
ssh shariq@ubi-prod 'cd ~/apps/image-gateway && docker compose up -d --build && sleep 3 && curl -fsS http://localhost:8080/healthz'
```
Expected: `{"ok":true}`.

- [ ] **Step 4: Add the cloudflared tunnel ingress + DNS**

Add an ingress rule to the tunnel config (same tunnel as social-agent) mapping the hostname to the container, then route DNS:
```yaml
# in the tunnel config.yml ingress: list, BEFORE the catch-all 404 rule
  - hostname: img-gateway.shariq.dev
    service: http://localhost:8080
```
```bash
cloudflared tunnel route dns <tunnel-name> img-gateway.shariq.dev   # if not already routed
# restart the cloudflared service so it picks up the new ingress rule
```

- [ ] **Step 5: Verify end-to-end through the tunnel**

```bash
curl -fsS https://img-gateway.shariq.dev/healthz
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://img-gateway.shariq.dev/v1/images/generate   # expect 401 (no token)
```
Expected: `{"ok":true}` then `401`. (No repo commit — infra state.)

---

### Task 10: Rotate the Azure key

The Azure key is currently sprawled across blog-site/bby-game/expense-tracker. Rotate it so only the gateway holds the live key.

- [ ] **Step 1: Regenerate the key**

```bash
az cognitiveservices account keys regenerate \
  --name shariq-blog-img-eus2 --resource-group rg-blog-og --key-name key1
az cognitiveservices account keys list --name shariq-blog-img-eus2 --resource-group rg-blog-og
```
(Or rotate in the Azure portal: resource → Keys and Endpoint → Regenerate Key1.)

- [ ] **Step 2: Put the new key only in the gateway and redeploy**

```bash
# update AZURE_OPENAI_KEY in the local .env.prod, then:
scp .env.prod shariq@ubi-prod:~/apps/image-gateway/.env
ssh shariq@ubi-prod 'cd ~/apps/image-gateway && docker compose up -d --build'
```

- [ ] **Step 3: Smoke-test a real generation through the gateway**

```bash
curl -fsS -X POST https://img-gateway.shariq.dev/v1/images/generate \
  -H "authorization: Bearer $IMAGE_GATEWAY_TOKEN" -H 'content-type: application/json' \
  -d '{"prompt":"a single flat ochre circle on deep navy, no text","size":"1536x1024"}' \
  -o /tmp/gw-test.png && file /tmp/gw-test.png
```
Expected: `/tmp/gw-test.png: PNG image data, 1536 x 1024`.

- [ ] **Step 4: Scrub the old key** from `bby-game/.env.local` and `blog-site` local env now (blog-site's code is swapped in Phase 2). Confirm the old key no longer appears: `grep -rl "<old-key-prefix>" ~/Development 2>/dev/null` returns nothing. (No repo commit.)

---

## Phase 2 — blog-site cutover (existing repo, branch `feat/image-gateway`)

> All Phase-2 work is in `/Users/shariqhirani/Development/blog-site` on the already-created `feat/image-gateway` branch. Run commands from that repo root.

### Task 11: Gateway config in blog-site

**Files:**
- Modify: `/Users/shariqhirani/Development/blog-site/scripts/cover/config.ts`
- Test: `/Users/shariqhirani/Development/blog-site/scripts/cover/config.test.ts` (create if absent)

**Interfaces:**
- Produces: `getGatewayConfig(): { url: string; token: string }` reading `IMAGE_GATEWAY_URL` + `IMAGE_GATEWAY_TOKEN`; throws a descriptive error if either is missing. Replaces `getImageConfig`/`getVisionConfig`/`requireCreds`.

- [ ] **Step 1: Write the failing test**

`scripts/cover/config.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { getGatewayConfig } from './config.js';

describe('getGatewayConfig', () => {
  it('reads url + token from env', () => {
    process.env.IMAGE_GATEWAY_URL = 'https://img-gateway.shariq.dev';
    process.env.IMAGE_GATEWAY_TOKEN = 'tok';
    expect(getGatewayConfig()).toEqual({ url: 'https://img-gateway.shariq.dev', token: 'tok' });
  });
  it('throws when token missing', () => {
    process.env.IMAGE_GATEWAY_URL = 'https://x'; delete process.env.IMAGE_GATEWAY_TOKEN;
    expect(() => getGatewayConfig()).toThrow(/IMAGE_GATEWAY_TOKEN/);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`npx vitest run scripts/cover/config.test.ts`).

- [ ] **Step 3: Rewrite `scripts/cover/config.ts`**

Keep the existing dotenv load (`.env.local` then `.env`, non-overriding). Replace the Azure exports with:
```ts
export interface GatewayConfig { url: string; token: string }
export function getGatewayConfig(): GatewayConfig {
  const url = process.env.IMAGE_GATEWAY_URL;
  const token = process.env.IMAGE_GATEWAY_TOKEN;
  if (!url) throw new Error('Missing IMAGE_GATEWAY_URL');
  if (!token) throw new Error('Missing IMAGE_GATEWAY_TOKEN');
  return { url: url.replace(/\/+$/, ''), token };
}
```
Remove `getImageConfig`, `getVisionConfig`, `requireCreds`, and the `AZURE_OPENAI_*` reads.

- [ ] **Step 4: Run it — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add scripts/cover/config.ts scripts/cover/config.test.ts
git commit -m "feat(cover): read image-gateway url+token instead of Azure creds"
```

---

### Task 12: `generateImage` → gateway

**Files:**
- Modify: `/Users/shariqhirani/Development/blog-site/scripts/cover/azure.ts`
- Test: `/Users/shariqhirani/Development/blog-site/scripts/cover/azure.test.ts` (create if absent)

**Interfaces:**
- Consumes: `getGatewayConfig()` (Task 11).
- Produces: `generateImage(prompt: string): Promise<Buffer>` — POSTs `${url}/v1/images/generate` with `{prompt, size:'1536x1024', quality:'high', output_format:'png'}`, bearer auth, `X-Client: blog-site`, ~200s timeout; returns the PNG bytes. **Signature unchanged** so `generate-cover.ts` is untouched.

- [ ] **Step 1: Write the failing test**

`scripts/cover/azure.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  process.env.IMAGE_GATEWAY_URL = 'https://gw.test';
  process.env.IMAGE_GATEWAY_TOKEN = 'tok';
});

describe('generateImage', () => {
  it('POSTs the gateway generate endpoint and returns PNG bytes', async () => {
    const png = Buffer.from('PNGBYTES');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(png, { status: 200, headers: { 'content-type': 'image/png' } }),
    );
    const { generateImage } = await import('./azure.js');
    const out = await generateImage('a cover prompt');
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://gw.test/v1/images/generate');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body as string)).toMatchObject({ prompt: 'a cover prompt', size: '1536x1024', quality: 'high', output_format: 'png' });
    expect(out.equals(png)).toBe(true);
    fetchSpy.mockRestore();
  });
  it('throws on non-2xx', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('err', { status: 502 }));
    const { generateImage } = await import('./azure.js');
    await expect(generateImage('p')).rejects.toThrow();
    fetchSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.**

- [ ] **Step 3: Rewrite `scripts/cover/azure.ts`**

```ts
import { getGatewayConfig } from './config.js';

const GENERATE_TIMEOUT_MS = 200_000; // > gpt-image-1 worst case (~180s) + proxy overhead

export async function generateImage(prompt: string): Promise<Buffer> {
  const { url, token } = getGatewayConfig();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), GENERATE_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/v1/images/generate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-client': 'blog-site' },
      body: JSON.stringify({ prompt, size: '1536x1024', quality: 'high', output_format: 'png' }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`gateway generate failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(t);
  }
}
```
Remove any Azure URL/`api-key`/`api-version` code from this file.

- [ ] **Step 4: Run it — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add scripts/cover/azure.ts scripts/cover/azure.test.ts
git commit -m "feat(cover): generateImage calls the gateway"
```

---

### Task 13: `hasText` → gateway (preserve fail-safe)

**Files:**
- Modify: `/Users/shariqhirani/Development/blog-site/scripts/cover/text-check.ts`
- Test: `/Users/shariqhirani/Development/blog-site/scripts/cover/text-check.test.ts` (create if absent)

**Interfaces:**
- Consumes: `getGatewayConfig()` (Task 11).
- Produces: `hasText(png: Buffer): Promise<boolean>` — POSTs `${url}/v1/vision/check-text` (body `image/png`). On `200`, returns `body.hasText`. On **any** non-2xx / network / parse error, returns `true` (fail-safe — identical to today). **Signature unchanged.**

- [ ] **Step 1: Write the failing test**

`scripts/cover/text-check.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
beforeEach(() => { process.env.IMAGE_GATEWAY_URL = 'https://gw.test'; process.env.IMAGE_GATEWAY_TOKEN = 'tok'; });

describe('hasText', () => {
  it('returns the gateway hasText value on 200', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ hasText: false }), { status: 200 }));
    const { hasText } = await import('./text-check.js');
    expect(await hasText(Buffer.from('p'))).toBe(false);
    spy.mockRestore();
  });
  it('fails safe to true on non-2xx', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('err', { status: 502 }));
    const { hasText } = await import('./text-check.js');
    expect(await hasText(Buffer.from('p'))).toBe(true);
    spy.mockRestore();
  });
  it('fails safe to true on network error', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('down'));
    const { hasText } = await import('./text-check.js');
    expect(await hasText(Buffer.from('p'))).toBe(true);
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.**

- [ ] **Step 3: Rewrite `scripts/cover/text-check.ts`**

```ts
import { getGatewayConfig } from './config.js';

const CHECK_TIMEOUT_MS = 60_000;

export async function hasText(png: Buffer): Promise<boolean> {
  try {
    const { url, token } = getGatewayConfig();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), CHECK_TIMEOUT_MS);
    try {
      const res = await fetch(`${url}/v1/vision/check-text`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'image/png', 'x-client': 'blog-site' },
        body: png, signal: ctrl.signal,
      });
      if (!res.ok) return true; // fail safe -> forces retry / fallback
      const json = (await res.json()) as { hasText?: boolean };
      return typeof json.hasText === 'boolean' ? json.hasText : true;
    } finally {
      clearTimeout(t);
    }
  } catch {
    return true; // any error (network/abort/parse) fails safe to "has text"
  }
}
```
Remove the Azure chat/completions code.

- [ ] **Step 4: Run it — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add scripts/cover/text-check.ts scripts/cover/text-check.test.ts
git commit -m "feat(cover): hasText calls the gateway (fail-safe preserved)"
```

---

### Task 14: Update env example + docs, scrub Azure key

**Files:**
- Modify: `/Users/shariqhirani/Development/blog-site/.env.local.example`
- Modify: `/Users/shariqhirani/Development/blog-site/CLAUDE.md` ("AI cover generation" section)

- [ ] **Step 1: Replace the Azure block in `.env.local.example`**

Remove the four `AZURE_OPENAI_*` lines (and the `rg-blog-og` comment) and add:
```
# Image gateway (AI cover generation) — only needed to run gen:cover / gen:cover:all
# Service: image-gateway on ubi-prod (holds the Azure key). The site build never calls it.
IMAGE_GATEWAY_URL=https://img-gateway.shariq.dev
IMAGE_GATEWAY_TOKEN=
```

- [ ] **Step 2: Update `CLAUDE.md`** — in the "AI cover generation" section, replace the Azure-creds sentence (the `AZURE_OPENAI_ENDPOINT/KEY/...` list) with:

```
Covers are generated by calling the **image-gateway** service (holds the only Azure
key; see docs/superpowers/specs/2026-06-29-image-gateway-extraction-design.md). The
pipeline reads `IMAGE_GATEWAY_URL` + `IMAGE_GATEWAY_TOKEN` (scripts/cover/config.ts) and
posts to `/v1/images/generate` + `/v1/vision/check-text`. The branded fallback and OG
rendering remain local (Satori/resvg); the site build never calls the gateway.
```

- [ ] **Step 3: Set the real values in your local `.env.local`** and confirm no Azure key remains in blog-site:

```bash
grep -rn "AZURE_OPENAI" /Users/shariqhirani/Development/blog-site --exclude-dir=node_modules --exclude-dir=.git || echo "clean"
```
Expected: `clean` (no matches).

- [ ] **Step 4: Commit**

```bash
git add .env.local.example CLAUDE.md
git commit -m "docs(cover): point env + CLAUDE.md at the image gateway"
```

---

### Task 15: Reprove — tests, live cover, build

**Files:** none (verification).

- [ ] **Step 1: Unit tests green**

```bash
cd /Users/shariqhirani/Development/blog-site && npm test
```
Expected: all pass, including the new `scripts/cover/*.test.ts`.

- [ ] **Step 2: Type-check**

```bash
npm run astro check
```
Expected: 0 errors.

- [ ] **Step 3: Live cover generation through the gateway** (gateway must be deployed, Task 9–10)

Pick an existing post slug, force-regenerate, confirm a real (non-fallback) cover:
```bash
npm run gen:cover -- <existing-slug> --force
```
Expected: logs show attempts succeeding (not "fell back"), `public/static/images/blog/<slug>/cover.png` rewritten, and `hero` frontmatter updated. Revert the test change afterward if you don't want to keep it: `git checkout -- src/content/writing/<slug>.mdx public/static/images/blog/<slug>/cover.png`.

- [ ] **Step 4: Build (OG unaffected)**

```bash
npm run build
```
Expected: build succeeds; `dist/og/<slug>.png` exists for posts (OG never touched the gateway).

- [ ] **Step 5: Commit any doc/lockfile touch-ups** (if none, skip)

```bash
git add -A && git commit -m "test(cover): reprove gateway cutover" --allow-empty
```

---

### Task 16: Open the blog-site PR and watch reviews

**Files:** none.

- [ ] **Step 1: Push and open the PR**

```bash
cd /Users/shariqhirani/Development/blog-site
git push -u origin feat/image-gateway
gh pr create --base main --title "feat: route cover-gen through the image gateway" --body "$(cat <<'EOF'
Cuts blog-site's cover pipeline over to the new image-gateway (ubi-prod) — the only
holder of the Azure key. Swaps generateImage + hasText to gateway calls; OG/Satori
render and branded fallback stay local. Spec: docs/superpowers/specs/2026-06-29-image-gateway-extraction-design.md.

Follow-ons (lognote wiring, bby-game migration, edit endpoint) are tracked as issues on the image-gateway repo.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Watch CI + the AI review**

Watch the `review` check and the `## 🤖 AI code review` sticky comment; address findings before calling it ready (per project convention). Optionally trigger Copilot: `gh pr edit <PR#> --add-reviewer copilot-pull-request-reviewer`.

- [ ] **Step 3: Mark todo #107 progress** in Solo (comment the PR URL); leave it open until the follow-on issues are also triaged.

---

## Self-Review

**Spec coverage:**
- Gateway service (§4) → Tasks 1,3–10. Endpoints generate/check-text/edit/healthz → Tasks 1,4,5,6. Auth (§4.2) → Task 3. Config (§4.3) → Task 1. Deploy + tunnel + logging (§4.4) → Tasks 7,8,9. ✓
- blog-site cutover (§5) → Tasks 11–14; reprove (§7) → Task 15. ✓
- Secret rotation (§4.3/§6) → Task 10 + Task 14 scrub. ✓
- Failure behavior unchanged (§6) → Task 13 fail-safe tests + Task 12 throw-on-error. ✓
- Follow-ons + risks (§8/§9) → Task 2 GitHub issues (10 issues: bby-game, lognote, L2 package, fonts, per-consumer tokens, rate limit, server-side guard, expense-tracker, n>1, tunnel-timeout). The `edit` endpoint is NOT an issue — it's built in Task 6 so bby-game can migrate e2e. ✓
- User request (file backlog as issues once repo exists) → Task 2 (after repo creation in Task 1). ✓
- `edit` endpoint (multipart reference mode, bby-game's e2e dependency) → Task 6 (real implementation + tests). ✓

**Placeholder scan:** No TBD/TODO. `<existing-slug>`, `<PR#>`, `<resource>`, `<tunnel-name>`, `<old-key-prefix>` are genuine user-supplied values, not unfinished plan content. ✓

**Type consistency:** `GatewayConfig` (gateway) vs `getGatewayConfig` (blog-site) are distinct, intentionally. `AzureClient.generate/checkText`, `GenerateParams`, `UpstreamError.status`, `buildApp(AppDeps)`, `bearerAuth(token)`, `generateImage(prompt)`, `hasText(png)` are used identically across the tasks that reference them. Endpoint paths are slash-style everywhere. ✓
