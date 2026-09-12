import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  resolveSourceCommit,
  syncAgentInboxLanding,
} from "./vendor-agent-inbox-landing";

const COMMIT = "b".repeat(40);
const roots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "agent-inbox-landing-"));
  roots.push(root);
  return root;
}

function mockGitHub(
  landing: Uint8Array,
  commit = COMMIT,
): { fetchImpl: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.startsWith("https://api.github.com/")) {
      return Response.json([{ sha: commit }]);
    }
    return new Response(new TextDecoder().decode(landing));
  };
  return { fetchImpl, urls };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe("Agent Inbox landing sync", () => {
  it("resolves the latest commit that changed the landing path", async () => {
    const { fetchImpl, urls } = mockGitHub(new Uint8Array());

    await expect(resolveSourceCommit(fetchImpl, "")).resolves.toBe(COMMIT);
    const request = new URL(urls[0]);
    expect(request.pathname).toBe("/repos/shariqh/agent-inbox/commits");
    expect(request.searchParams.get("sha")).toBe("main");
    expect(request.searchParams.get("path")).toBe("marketing/index.html");
    expect(request.searchParams.get("per_page")).toBe("1");
  });

  it("preserves source bytes and writes deterministic metadata", async () => {
    const rootDir = await temporaryRoot();
    const landing = new TextEncoder().encode(
      "<!doctype html>\r\n<title>Agent Inbox — sync</title>\r\n",
    );
    const { fetchImpl, urls } = mockGitHub(landing);

    const result = await syncAgentInboxLanding({
      rootDir,
      fetchImpl,
      token: "test-token",
    });

    expect(result).toEqual({
      changed: true,
      commit: COMMIT,
      sha256:
        "22caa6ca2280dc1e61a650dc2a8c487efb98b5d3be687d5ce7b7ae398740dba9",
      files: [
        "public/agent-inbox/index.html",
        "vendor/agent-inbox-landing.json",
      ],
    });
    expect(
      await readFile(join(rootDir, "public/agent-inbox/index.html")),
    ).toEqual(Buffer.from(landing));
    await expect(
      readFile(join(rootDir, "vendor/agent-inbox-landing.json"), "utf8"),
    ).resolves.toBe(
      `${JSON.stringify(
        {
          repository: "https://github.com/shariqh/agent-inbox",
          sourcePath: "marketing/index.html",
          sourceRef: "main",
          commit: COMMIT,
          sha256:
            "22caa6ca2280dc1e61a650dc2a8c487efb98b5d3be687d5ce7b7ae398740dba9",
          license: "MIT",
        },
        null,
        2,
      )}\n`,
    );
    expect(urls[1]).toBe(
      `https://raw.githubusercontent.com/shariqh/agent-inbox/${COMMIT}/marketing/index.html`,
    );
  });

  it("is idempotent for the same path-specific upstream revision", async () => {
    const rootDir = await temporaryRoot();
    const { fetchImpl } = mockGitHub(
      new TextEncoder().encode("<!doctype html>\n"),
    );

    await syncAgentInboxLanding({ rootDir, fetchImpl, token: "" });
    await expect(
      syncAgentInboxLanding({ rootDir, fetchImpl, token: "" }),
    ).resolves.toMatchObject({ changed: false, files: [] });
  });

  it("updates provenance when a new path commit restores identical bytes", async () => {
    const rootDir = await temporaryRoot();
    const landing = new TextEncoder().encode("<!doctype html>\n");
    const first = mockGitHub(landing, "a".repeat(40));
    const second = mockGitHub(landing, "c".repeat(40));

    await syncAgentInboxLanding({
      rootDir,
      fetchImpl: first.fetchImpl,
      token: "",
    });
    await expect(
      syncAgentInboxLanding({
        rootDir,
        fetchImpl: second.fetchImpl,
        token: "",
      }),
    ).resolves.toEqual({
      changed: true,
      commit: "c".repeat(40),
      sha256:
        "335fca8574f060eea24ebcdae6b78f32414f5de03da1084fd0e73d710768e3a9",
      files: ["vendor/agent-inbox-landing.json"],
    });
  });

  it("surfaces commit lookup and raw download failures", async () => {
    const rootDir = await temporaryRoot();
    const apiFailure: typeof fetch = async () =>
      new Response("unavailable", { status: 503 });
    await expect(
      syncAgentInboxLanding({
        rootDir,
        fetchImpl: apiFailure,
        token: "",
      }),
    ).rejects.toThrow(
      "Failed to resolve the latest Agent Inbox landing commit",
    );

    const rawFailure: typeof fetch = async (input) =>
      String(input).startsWith("https://api.github.com/")
        ? Response.json([{ sha: COMMIT }])
        : new Response("missing", { status: 404 });
    await expect(
      syncAgentInboxLanding({
        rootDir,
        fetchImpl: rawFailure,
        token: "",
      }),
    ).rejects.toThrow("Failed to download the Agent Inbox landing page");
  });

  it("rejects malformed commit API responses", async () => {
    const malformed: typeof fetch = async () =>
      Response.json([{ sha: "main" }]);

    await expect(resolveSourceCommit(malformed, "")).rejects.toThrow(
      "GitHub did not return one valid commit",
    );
  });
});

describe("Agent Inbox landing sync workflow", () => {
  it("opens a reviewed PR without merging or pushing to main", async () => {
    const workflow = await readFile(
      new URL(
        "../.github/workflows/sync-agent-inbox-landing.yml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(workflow).toContain('cron: "17 * * * *"');
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("secrets.AGENT_GH_TOKEN");
    expect(workflow).toContain(
      "npm run --silent sync:agent-inbox-landing -- --json",
    );
    expect(workflow).toContain(
      'branch="automation/agent-inbox-landing-${commit:0:12}"',
    );
    expect(workflow).toContain(
      "git add -- public/agent-inbox/index.html vendor/agent-inbox-landing.json",
    );
    expect(workflow).toContain(
      'gh pr edit "$PR_NUMBER" --add-reviewer copilot-pull-request-reviewer',
    );
    expect(workflow).toContain("--state all");
    expect(workflow).toContain('action="closed"');
    expect(workflow).toContain("Verify recoverable branch");
    expect(workflow).toContain(
      '[[ "$author" == "$GITHUB_REPOSITORY_OWNER" ]]',
    );
    expect(workflow).not.toMatch(/\bgh pr merge\b/);
    expect(workflow).not.toMatch(/git push [^\n]*\bmain\b/);
  });
});
