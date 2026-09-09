import { readFileSync } from "node:fs";
import matter from "gray-matter";
import { describe, expect, it, vi } from "vitest";

interface Step {
  name: string;
  id?: string;
  uses?: string;
  run?: string;
  if?: string;
  env?: Record<string, string>;
  with?: Record<string, string | boolean>;
}

interface Job {
  if?: string;
  needs?: string | string[];
  permissions: Record<string, string>;
  outputs?: Record<string, string>;
  steps: Step[];
}

interface Workflow {
  on: Record<string, unknown>;
  permissions: Record<string, string>;
  concurrency: Record<string, unknown>;
  jobs: Record<string, Job>;
}

const source = readFileSync(
  new URL("../../.github/workflows/deploy.yml", import.meta.url),
  "utf8",
);
const workflow = matter(`---\n${source}\n---`).data as Workflow;
const HEAD = "a".repeat(40);
const MERGE = "b".repeat(40);
const OLD = "c".repeat(40);
const PROVIDER_ID = "bc095409-1234-4567-89ab-0123456789ab";
const PREVIEW_URL = "https://bc095409.shariq-dev.pages.dev";
const ENVIRONMENT = "cloudflare-preview/pr-95";
const RUN_URL =
  "https://github.com/shariqh/blog-site/actions/runs/1001/attempts/1";

function step(job: string, name: string) {
  const found = workflow.jobs[job].steps.find(
    (candidate) => candidate.name === name,
  );
  if (!found) throw new Error(`Missing workflow step: ${job}/${name}`);
  return found;
}

function script(job: string, name: string) {
  const value = step(job, name).with?.script;
  if (typeof value !== "string")
    throw new Error(`Missing workflow script: ${job}/${name}`);
  return value;
}

const lifecycle = script(
  "prepare-preview",
  "Prepare or retire preview metadata",
);
const provenance = script("deploy", "Verify checked-out source");
const verifyProvider = script("deploy", "Verify Cloudflare preview");
const comment = script("finish-preview", "Comment preview URL on PR");

interface Deployment {
  id: number;
  sha: string;
  environment: string;
  task: string;
  production_environment: boolean;
  transient_environment: boolean;
  payload: { source: string; pr: number };
}

interface Status {
  state: string;
  log_url: string;
  environment_url?: string;
}

interface DeploymentQuery {
  sha?: string;
  task?: string;
  environment?: string;
  per_page: number;
  page?: number;
}

function deployment(overrides: Partial<Deployment> = {}): Deployment {
  return {
    id: 1,
    sha: HEAD,
    environment: ENVIRONMENT,
    task: "cloudflare-preview",
    production_environment: false,
    transient_environment: true,
    payload: { source: "cloudflare-preview-v1", pr: 95 },
    ...overrides,
  };
}

function pullRequest() {
  return {
    number: 95,
    state: "open",
    user: { login: "shariqh" },
    head: {
      sha: HEAD,
      ref: "shariqh-cloudflare-preview-metadata",
      repo: { full_name: "shariqh/blog-site" },
    },
  };
}

function harness(records: Deployment[] = []) {
  const state = {
    records: structuredClone(records),
    live: pullRequest(),
    statuses: new Map<number, Status[]>(),
  };
  const context = {
    repo: { owner: "shariqh", repo: "blog-site" },
    issue: { number: 95 },
    payload: {
      action: "opened",
      pull_request: pullRequest() as ReturnType<typeof pullRequest> | undefined,
    },
    eventName: "pull_request",
    sha: MERGE,
    serverUrl: "https://github.com",
    runId: 1001,
    actor: "shariqh",
  };
  const listDeployments = vi.fn(async (query: DeploymentQuery) => {
    const matching = state.records.filter(
      (record) =>
        (!query.sha || record.sha === query.sha) &&
        (!query.task || record.task === query.task) &&
        (!query.environment || record.environment === query.environment),
    );
    const start = ((query.page ?? 1) - 1) * query.per_page;
    return { data: matching.slice(start, start + query.per_page) };
  });
  const createDeployment = vi.fn(
    async (input: Omit<Deployment, "id" | "sha"> & { ref: string }) => {
      const record = deployment({
        ...input,
        sha: input.ref,
        id: Math.max(0, ...state.records.map((record) => record.id)) + 1,
      });
      state.records.push(record);
      return { status: 201, data: record };
    },
  );
  const listDeploymentStatuses = vi.fn(
    async ({ deployment_id }: { deployment_id: number; per_page: number }) => ({
      data: (state.statuses.get(deployment_id) ?? []).slice(0, 1),
    }),
  );
  const createDeploymentStatus = vi.fn(
    async (input: Status & { deployment_id: number }) => {
      state.statuses.set(input.deployment_id, [
        input,
        ...(state.statuses.get(input.deployment_id) ?? []),
      ]);
      return { data: input };
    },
  );
  const getPR = vi.fn(async () => ({ data: state.live }));
  const createComment = vi.fn(async () => ({ data: { id: 1 } }));
  const github = {
    rest: {
      pulls: { get: getPR },
      repos: {
        listDeployments,
        createDeployment,
        listDeploymentStatuses,
        createDeploymentStatus,
      },
      issues: { createComment },
    },
    paginate: vi.fn(
      async (method: typeof listDeployments, query: DeploymentQuery) => {
        const all: Deployment[] = [];
        for (let page = 1; ; page++) {
          const { data } = await method({ ...query, page });
          all.push(...data);
          if (data.length < query.per_page) return all;
        }
      },
    ),
  };
  const exec = { getExecOutput: vi.fn(async () => ({ stdout: `${HEAD}\n` })) };
  const provider = {
    success: true,
    result: {
      id: PROVIDER_ID,
      url: PREVIEW_URL,
      environment: "preview",
      deployment_trigger: {
        metadata: { commit_hash: HEAD, branch: state.live.head.ref },
      },
      latest_stage: { name: "deploy", status: "success" },
    },
  };
  const fetch = vi.fn(async (_url: string, _options: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => provider,
  }));
  let outputs: Record<string, string> = {};
  const core = {
    setOutput: vi.fn((name: string, value: string) => {
      outputs[name] = value;
    }),
    notice: vi.fn(),
  };
  async function execute(
    code: string,
    environment: Record<string, string | undefined> = {},
  ) {
    outputs = {};
    // Run the checked-in Actions script, never a second implementation of its policy.
    const run = new Function(
      "github",
      "context",
      "core",
      "process",
      "exec",
      "fetch",
      "AbortSignal",
      `"use strict"; return (async () => {\n${code}\n})();`,
    );
    await run(
      github,
      context,
      core,
      { env: environment },
      exec,
      fetch,
      AbortSignal,
    );
    return { ...outputs };
  }
  async function run(
    phase: "prepare" | "finish",
    environment: Record<string, string | undefined> = {},
  ) {
    return execute(lifecycle, {
      PHASE: phase,
      TRIGGERING_ACTOR: "shariqh",
      GITHUB_RUN_ATTEMPT: "1",
      DEPLOYMENT_ID: "1",
      PREPARED_ATTEMPT: "1",
      DEPLOY_RESULT: "success",
      VERIFIED_SHA: HEAD,
      PREVIEW_URL,
      CLOUDFLARE_DEPLOYMENT_ID: PROVIDER_ID,
      ...environment,
    });
  }
  const providerEnv = {
    CLOUDFLARE_ACCOUNT_ID: "d".repeat(32),
    CLOUDFLARE_API_TOKEN: "fixture-token",
    DEPLOYMENT_ID: PROVIDER_ID,
    DEPLOYMENT_URL: PREVIEW_URL,
    DEPLOYMENT_ENVIRONMENT: "preview",
  };
  return {
    state,
    context,
    github,
    exec,
    provider,
    fetch,
    core,
    providerEnv,
    execute,
    run,
    createDeployment,
    createDeploymentStatus,
    listDeploymentStatuses,
    listDeployments,
    getPR,
    createComment,
  };
}

describe("deployment workflow boundaries", () => {
  it("preserves production triggers and the global queue, with explicit close cleanup", () => {
    expect(workflow.on).toEqual({
      push: { branches: ["main"] },
      pull_request: { types: ["opened", "synchronize", "reopened", "closed"] },
      workflow_dispatch: null,
    });
    expect(workflow.concurrency).toEqual({
      group: "deploy-shariq-dev",
      "cancel-in-progress": false,
      queue: "max",
    });
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.jobs.deploy.permissions).toEqual({ contents: "read" });
    expect(workflow.jobs.deploy.if).toContain(
      "github.event_name != 'pull_request'",
    );
    expect(workflow.jobs.deploy.if).toContain(
      "needs.prepare-preview.outputs.should-deploy == 'true'",
    );
    expect(workflow.jobs.deploy.if).toContain("!cancelled()");
    expect(workflow.jobs["finish-preview"].if).toContain("always()");
  });

  it("keeps write tokens out of checkout, npm, provider credentials, and PR code", () => {
    for (const name of ["prepare-preview", "finish-preview"]) {
      const job = workflow.jobs[name];
      expect(job.permissions.deployments).toBe("write");
      expect(
        job.steps.every(
          (step) => step.uses === "actions/github-script@v7" && !step.run,
        ),
      ).toBe(true);
      expect(JSON.stringify(job.steps)).not.toContain("secrets.");
      expect(job.if).toContain(
        "github.event.pull_request.head.repo.full_name == github.repository",
      );
    }
    expect(workflow.jobs["prepare-preview"].permissions["pull-requests"]).toBe(
      "read",
    );
    expect(workflow.jobs["finish-preview"].permissions["pull-requests"]).toBe(
      "write",
    );
    expect(workflow.jobs["prepare-preview"].if).toContain(
      "github.actor != 'dependabot[bot]'",
    );
    expect(workflow.jobs["prepare-preview"].if).toContain(
      "github.triggering_actor != 'dependabot[bot]'",
    );
    expect(workflow.jobs["prepare-preview"].if).toContain(
      "github.event.pull_request.user.login != 'dependabot[bot]'",
    );
    expect(source).not.toContain("pull_request_target");
    expect(source).not.toContain("workflow_run");
    expect(source).not.toContain("gitHubToken:");
  });

  it("wires exact-head source, verified outputs, and shared checkout-free scripts", () => {
    expect(step("deploy", "Checkout").with).toEqual({
      ref: "${{ github.event.pull_request.head.sha || github.sha }}",
      "persist-credentials": false,
    });
    expect(script("deploy", "Verify deployment source")).toBe(provenance);
    expect(script("finish-preview", "Finalize preview metadata")).toBe(
      lifecycle,
    );
    expect(step("deploy", "Deploy to Cloudflare Pages").uses).toBe(
      "cloudflare/wrangler-action@v3",
    );
    expect(step("deploy", "Deploy to Cloudflare Pages").with?.command).toBe(
      "${{ steps.provenance.outputs.command }}",
    );
    expect(workflow.jobs.deploy.outputs).toEqual({
      "preview-url": "${{ steps.verify.outputs.preview-url }}",
      "verified-sha": "${{ steps.verify.outputs.verified-sha }}",
      "cloudflare-deployment-id":
        "${{ steps.verify.outputs.cloudflare-deployment-id }}",
    });
    expect(
      step("finish-preview", "Finalize preview metadata").env?.DEPLOY_RESULT,
    ).toBe("${{ needs.deploy.result }}");
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps) {
        expect(step.with?.script ?? step.run ?? "").not.toContain("${{");
      }
    }
  });
});

describe("immutable checkout provenance", () => {
  it("uses the checked-out PR head rather than the event merge SHA", async () => {
    const h = harness();
    const output = await h.execute(provenance);
    expect(output.command).toBe(
      `pages deploy dist --project-name=shariq-dev --branch=${h.state.live.head.ref} --commit-hash=${HEAD}`,
    );
    expect(h.exec.getExecOutput).toHaveBeenCalledWith(
      "git",
      ["rev-parse", "HEAD"],
      { silent: true },
    );
    h.exec.getExecOutput.mockResolvedValue({ stdout: `${MERGE}\n` });
    await expect(h.execute(provenance)).rejects.toThrow(
      "immutable deployment commit",
    );
  });

  it.each(["push", "workflow_dispatch"])(
    "preserves the triggering commit for %s production deployments",
    async (eventName) => {
      const h = harness();
      h.context.eventName = eventName;
      h.context.payload.pull_request = undefined;
      h.exec.getExecOutput.mockResolvedValue({ stdout: `${MERGE}\n` });
      expect(await h.execute(provenance, { GITHUB_REF_NAME: "main" })).toEqual({
        command: `pages deploy dist --project-name=shariq-dev --branch=main --commit-hash=${MERGE}`,
      });
    },
  );

  it.each([
    "main",
    "MAIN",
    "--branch=main",
    'topic";process.exit(0)//',
    "topic\n--branch=main",
    "topic$(id)",
  ])(
    "rejects unsafe PR branch %j before passing a command to Wrangler",
    async (branch) => {
      const h = harness();
      h.context.payload.pull_request!.head.ref = branch;
      await expect(h.execute(provenance)).rejects.toThrow(
        "Unsafe deployment branch",
      );
    },
  );
});

describe("Cloudflare provider verification", () => {
  it("reads the fixed provider endpoint and emits only successful exact-head evidence", async () => {
    const h = harness();
    expect(await h.execute(verifyProvider, h.providerEnv)).toEqual({
      "preview-url": PREVIEW_URL,
      "verified-sha": HEAD,
      "cloudflare-deployment-id": PROVIDER_ID,
    });
    expect(h.fetch).toHaveBeenCalledWith(
      `https://api.cloudflare.com/client/v4/accounts/${"d".repeat(32)}/pages/projects/shariq-dev/deployments/${PROVIDER_ID}`,
      expect.objectContaining({
        redirect: "error",
        headers: { Authorization: "Bearer fixture-token" },
      }),
    );
  });

  it.each([
    "https://shariq.dev",
    "https://topic.shariq-dev.pages.dev",
    "http://bc095409.shariq-dev.pages.dev",
    "https://bc095409.shariq-dev.pages.dev.evil.example",
    "https://user:password@bc095409.shariq-dev.pages.dev",
    "https://bc095409.shariq-dev.pages.dev:8443",
    `${PREVIEW_URL}/?token=bad`,
    `${PREVIEW_URL}#fragment`,
    '"; throw new Error("injected") //',
  ])("rejects an unverified or mutable output URL %j", async (url) => {
    const h = harness();
    await expect(
      h.execute(verifyProvider, { ...h.providerEnv, DEPLOYMENT_URL: url }),
    ).rejects.toThrow("immutable Cloudflare preview");
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it.each([
    "commit",
    "branch",
    "environment",
    "stage",
    "pending",
    "id",
    "url",
    "unsuccessful",
  ])("rejects mismatched provider evidence: %s", async (mismatch) => {
    const h = harness();
    if (mismatch === "commit")
      h.provider.result.deployment_trigger.metadata.commit_hash = MERGE;
    if (mismatch === "branch")
      h.provider.result.deployment_trigger.metadata.branch = "different-branch";
    if (mismatch === "environment")
      h.provider.result.environment = "production";
    if (mismatch === "stage") h.provider.result.latest_stage.name = "build";
    if (mismatch === "pending")
      h.provider.result.latest_stage.status = "active";
    if (mismatch === "id") h.provider.result.id = "another-deployment";
    if (mismatch === "url") h.provider.result.url = "https://shariq.dev";
    if (mismatch === "unsuccessful") h.provider.success = false;
    await expect(h.execute(verifyProvider, h.providerEnv)).rejects.toThrow(
      "has not confirmed",
    );
    expect(h.core.setOutput).not.toHaveBeenCalled();
  });

  it("surfaces provider API failures without exposing its response body", async () => {
    const h = harness();
    h.fetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => h.provider,
    });
    await expect(h.execute(verifyProvider, h.providerEnv)).rejects.toThrow(
      "HTTP 403",
    );
    expect(h.core.setOutput).not.toHaveBeenCalled();
  });
});

describe("preview metadata lifecycle", () => {
  it("creates an explicit exact-head transient non-production record before deploying", async () => {
    const h = harness();
    expect(await h.run("prepare")).toEqual({
      "should-deploy": "true",
      "deployment-id": "1",
      attempt: "1",
    });
    expect(h.createDeployment).toHaveBeenCalledExactlyOnceWith({
      owner: "shariqh",
      repo: "blog-site",
      ref: HEAD,
      task: "cloudflare-preview",
      environment: ENVIRONMENT,
      auto_merge: false,
      required_contexts: [],
      production_environment: false,
      transient_environment: true,
      description: "Cloudflare preview for PR #95",
      payload: { source: "cloudflare-preview-v1", pr: 95 },
    });
    expect(h.createDeploymentStatus).toHaveBeenLastCalledWith({
      owner: "shariqh",
      repo: "blog-site",
      deployment_id: 1,
      state: "in_progress",
      description: "Building the exact PR head",
      environment: ENVIRONMENT,
      environment_url: "",
      log_url: RUN_URL,
      auto_inactive: false,
    });
    await h.run("finish");
    expect(h.createDeploymentStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        deployment_id: 1,
        state: "success",
        environment_url: PREVIEW_URL,
        log_url: RUN_URL,
        auto_inactive: false,
      }),
    );
  });

  it("reuses the same record across reruns and replaces, rather than duplicates, the active URL", async () => {
    const h = harness();
    await h.run("prepare");
    await h.run("finish");
    const nextId = "deadbeef-1234-4567-89ab-0123456789ab";
    await h.run("prepare", { GITHUB_RUN_ATTEMPT: "2" });
    expect(h.state.statuses.get(1)?.[0].state).toBe("in_progress");
    await h.run("finish", {
      GITHUB_RUN_ATTEMPT: "2",
      PREPARED_ATTEMPT: "2",
      PREVIEW_URL: "https://deadbeef.shariq-dev.pages.dev",
      CLOUDFLARE_DEPLOYMENT_ID: nextId,
    });
    expect(h.createDeployment).toHaveBeenCalledTimes(1);
    expect(h.state.records).toHaveLength(1);
    expect(h.state.statuses.get(1)?.[0]).toMatchObject({
      state: "success",
      environment_url: "https://deadbeef.shariq-dev.pages.dev",
      log_url: RUN_URL.replace("attempts/1", "attempts/2"),
    });
  });

  it("allows a failed-finalizer retry to use its actual preparation attempt", async () => {
    const h = harness();
    await h.run("prepare");
    await h.run("finish", { GITHUB_RUN_ATTEMPT: "2", PREPARED_ATTEMPT: "1" });
    expect(h.state.statuses.get(1)?.[0]).toMatchObject({
      state: "success",
      log_url: RUN_URL,
    });
    expect(h.createDeployment).toHaveBeenCalledTimes(1);
  });

  it.each(["failure", "cancelled", "skipped"])(
    "never reports success when the deploy job is %s",
    async (result) => {
      const h = harness();
      await h.run("prepare");
      await h.run("finish", { DEPLOY_RESULT: result });
      expect(h.state.statuses.get(1)?.[0]).toMatchObject({
        state: result === "failure" ? "failure" : "error",
        environment_url: "",
      });
      expect(
        h.createDeploymentStatus.mock.calls.some(
          ([status]) => status.state === "success",
        ),
      ).toBe(false);
    },
  );

  it.each([
    { VERIFIED_SHA: MERGE },
    { PREVIEW_URL: "" },
    { PREVIEW_URL: "https://shariq.dev" },
    { CLOUDFLARE_DEPLOYMENT_ID: "invalid" },
  ])("records an error for invalid finalizer evidence %j", async (invalid) => {
    const h = harness();
    await h.run("prepare");
    await expect(h.run("finish", invalid)).rejects.toThrow("Refusing success");
    expect(h.state.statuses.get(1)?.[0]).toMatchObject({
      state: "error",
      environment_url: "",
    });
  });

  it("paginates retirement and leaves foreign providers, PRs, and production records alone", async () => {
    const old = Array.from({ length: 101 }, (_, index) =>
      deployment({ id: index + 1, sha: OLD }),
    );
    const foreign = [
      deployment({ id: 102, task: "vercel", sha: OLD }),
      deployment({ id: 103, payload: { source: "foreign", pr: 95 }, sha: OLD }),
      deployment({ id: 104, production_environment: true, sha: OLD }),
      deployment({
        id: 105,
        environment: "cloudflare-preview/pr-96",
        sha: OLD,
      }),
    ];
    const h = harness([...old, ...foreign]);
    await h.run("prepare");
    expect(h.listDeployments).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, per_page: 100 }),
    );
    expect(h.state.statuses.get(101)?.[0].state).toBe("inactive");
    for (const record of foreign)
      expect(h.state.statuses.has(record.id)).toBe(false);
    expect(h.createDeployment).toHaveBeenCalledTimes(1);
  });

  it("retires duplicate same-head records explicitly before advertising a single success", async () => {
    const h = harness([deployment(), deployment({ id: 2 })]);
    for (const id of [1, 2])
      h.state.statuses.set(id, [
        { state: "success", log_url: RUN_URL, environment_url: PREVIEW_URL },
      ]);
    await h.run("prepare");
    await h.run("finish");
    expect(h.createDeployment).not.toHaveBeenCalled();
    expect(h.state.statuses.get(1)?.[0].state).toBe("success");
    expect(h.state.statuses.get(2)?.[0].state).toBe("inactive");
  });

  it.each([5, 6])(
    "refuses to add to %i unrelated same-head deployments",
    async (count) => {
      const h = harness(
        Array.from({ length: count }, (_, index) =>
          deployment({ id: index + 1, task: "foreign" }),
        ),
      );
      await expect(h.run("prepare")).rejects.toThrow("bounded preview lookup");
      expect(h.createDeployment).not.toHaveBeenCalled();
      expect(h.createDeploymentStatus).not.toHaveBeenCalled();
    },
  );

  it("refuses success if the exact-head lookup becomes truncated after preparation", async () => {
    const h = harness();
    await h.run("prepare");
    h.state.records.push(
      ...Array.from({ length: 5 }, (_, index) =>
        deployment({ id: index + 2, task: "foreign" }),
      ),
    );
    await expect(h.run("finish")).rejects.toThrow("bounded, exact-head");
    expect(h.state.statuses.get(1)?.[0].state).toBe("error");
  });

  it("does not create another deployment after an uncertain create response", async () => {
    const h = harness();
    h.createDeployment.mockImplementationOnce(async () => {
      h.state.records.push(deployment());
      throw new Error("connection interrupted after create");
    });
    await expect(h.run("prepare")).rejects.toThrow("connection interrupted");
    await h.run("prepare");
    expect(h.createDeployment).toHaveBeenCalledTimes(1);
    expect(h.state.records).toHaveLength(1);
  });

  it.each([
    deployment({ id: 0 }),
    deployment({ id: Number.MAX_SAFE_INTEGER + 1 }),
    deployment({ sha: MERGE }),
    deployment({ production_environment: true }),
  ])("rejects an invalid GitHub creation response %j", async (record) => {
    const h = harness();
    h.createDeployment.mockResolvedValue({ status: 201, data: record });
    await expect(h.run("prepare")).rejects.toThrow(
      "exact-head preview deployment",
    );
    expect(h.createDeploymentStatus).not.toHaveBeenCalled();
  });

  it.each([
    "fork",
    "dependabot-author",
    "dependabot-actor",
    "dependabot-rerun",
  ])("skips the %s trust boundary without API writes", async (boundary) => {
    const h = harness();
    if (boundary === "fork")
      h.context.payload.pull_request!.head.repo.full_name = "outside/blog-site";
    if (boundary === "dependabot-author")
      h.context.payload.pull_request!.user.login = "dependabot[bot]";
    if (boundary === "dependabot-actor") h.context.actor = "dependabot[bot]";
    expect(
      await h.run(
        "prepare",
        boundary === "dependabot-rerun"
          ? { TRIGGERING_ACTOR: "dependabot[bot]" }
          : {},
      ),
    ).toEqual({ "should-deploy": "false" });
    expect(h.getPR).not.toHaveBeenCalled();
    expect(h.createDeployment).not.toHaveBeenCalled();
    expect(h.createDeploymentStatus).not.toHaveBeenCalled();
    expect(h.core.notice).toHaveBeenCalled();
  });

  it("ignores a stale head without retiring the current head", async () => {
    const h = harness([deployment({ sha: OLD }), deployment({ id: 2 })]);
    h.context.payload.pull_request!.head.sha = OLD;
    expect(await h.run("prepare")).toEqual({ "should-deploy": "false" });
    expect(h.state.statuses.get(1)?.[0].state).toBe("inactive");
    expect(h.state.statuses.has(2)).toBe(false);
    expect(h.createDeployment).not.toHaveBeenCalled();
  });

  it("retires a closed PR without a provider operation, but ignores stale close events after reopening", async () => {
    const h = harness([deployment(), deployment({ id: 2, sha: OLD })]);
    h.context.payload.action = "closed";
    h.state.live.state = "closed";
    expect(await h.run("prepare")).toEqual({ "should-deploy": "false" });
    expect(h.state.statuses.get(1)?.[0].state).toBe("inactive");
    expect(h.state.statuses.get(2)?.[0].state).toBe("inactive");
    h.createDeploymentStatus.mockClear();
    h.state.live.state = "open";
    expect(await h.run("prepare")).toEqual({ "should-deploy": "false" });
    expect(h.createDeploymentStatus).not.toHaveBeenCalled();
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it.each(["head", "closed"])(
    "marks the preview inactive if PR %s changes before finalization",
    async (change) => {
      const h = harness();
      await h.run("prepare");
      if (change === "head") h.state.live.head.sha = OLD;
      else h.state.live.state = "closed";
      await h.run("finish");
      expect(h.state.statuses.get(1)?.[0].state).toBe("inactive");
    },
  );

  it("rechecks live PR identity immediately before publishing success", async () => {
    const h = harness();
    await h.run("prepare");
    h.getPR
      .mockResolvedValueOnce({ data: pullRequest() })
      .mockResolvedValueOnce({ data: { ...pullRequest(), state: "closed" } });
    await h.run("finish");
    expect(h.state.statuses.get(1)?.[0].state).toBe("inactive");
  });

  it("ignores an old full rerun and finalizer after a newer run takes ownership", async () => {
    const h = harness();
    await h.run("prepare");
    h.context.runId = 1002;
    await h.run("prepare");
    await h.run("finish");
    h.context.runId = 1001;
    h.createDeploymentStatus.mockClear();
    expect(await h.run("prepare", { GITHUB_RUN_ATTEMPT: "2" })).toEqual({
      "should-deploy": "false",
    });
    await h.run("finish", { GITHUB_RUN_ATTEMPT: "2" });
    expect(h.createDeploymentStatus).not.toHaveBeenCalled();
    expect(h.state.statuses.get(1)?.[0].log_url).toContain("/1002/");
  });

  it("does not swallow lifecycle API failures", async () => {
    const h = harness();
    await h.run("prepare");
    h.createDeploymentStatus.mockRejectedValueOnce(
      new Error("GitHub unavailable"),
    );
    await expect(h.run("finish")).rejects.toThrow("GitHub unavailable");
    expect(h.state.statuses.get(1)?.[0].state).toBe("in_progress");
  });
});

describe("verified preview comment", () => {
  it("uses the finalizer output as data and awaits the existing PR comment operation", async () => {
    const h = harness();
    h.context.payload.pull_request!.head.ref = 'topic";process.exit(0)//';
    await h.execute(comment, { PREVIEW_URL });
    expect(h.createComment).toHaveBeenCalledExactlyOnceWith({
      owner: "shariqh",
      repo: "blog-site",
      issue_number: 95,
      body: `Preview deployed: ${PREVIEW_URL}`,
    });
    expect(
      step("finish-preview", "Comment preview URL on PR").env?.PREVIEW_URL,
    ).toBe("${{ steps.metadata.outputs.preview-url }}");
  });

  it("fails instead of silently commenting an invalid action output", async () => {
    const h = harness();
    await expect(
      h.execute(comment, { PREVIEW_URL: '";process.exit(0)//' }),
    ).rejects.toThrow("verified preview URL");
    expect(h.createComment).not.toHaveBeenCalled();
  });
});
