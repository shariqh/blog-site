import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import matter from "gray-matter";
import { afterEach, describe, expect, it } from "vitest";
import {
  inspectSourceCommit,
  resolveSourceCommit,
  syncAgentInboxLanding,
  verifySourceLicense,
} from "./vendor-agent-inbox-landing";

const COMMIT = "b".repeat(40);
const roots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "agent-inbox-landing-"));
  roots.push(root);
  return root;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

// Source files under marketing/vendor/ plus a manifest that lists them, in
// reverse order so the sync has to sort them.
function vendored(
  files: Record<string, string>,
  listed = Object.keys(files).map((path) => ({
    path,
    sha256: sha256(files[path]),
  })),
): Record<string, string> {
  return {
    ...files,
    "vendor/manifest.json": JSON.stringify({ files: [...listed].reverse() }),
  };
}

// Every entry under public/agent-inbox, with links and other non-files marked.
async function landingTree(rootDir: string): Promise<string[]> {
  const landing = join(rootDir, "public/agent-inbox");
  const entries = await readdir(landing, {
    recursive: true,
    withFileTypes: true,
  });
  return entries
    .filter((entry) => !entry.isDirectory())
    .map(
      (entry) =>
        `${join(entry.parentPath, entry.name).slice(landing.length + 1)}${entry.isFile() ? "" : " (not a file)"}`,
    )
    .sort();
}

const THREE_186 = {
  "vendor/three-0.186.0/LICENSE": "The MIT License\n",
  "vendor/three-0.186.0/three.core.js": "export const REVISION = '186';\n",
  "vendor/three-0.186.0/three.module.js": "export * from './three.core.js';\n",
};

function mockGitHub(
  landing: Uint8Array,
  commit = COMMIT,
  license = "MIT",
  vendor: Record<string, string> = {},
): { fetchImpl: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    const { pathname } = new URL(url);
    if (pathname.endsWith("/license")) {
      return Response.json({
        path: "LICENSE",
        license: { spdx_id: license },
      });
    }
    if (pathname.endsWith("/commits")) {
      return Response.json([{ sha: commit }]);
    }
    const path = pathname.replace(
      `/shariqh/agent-inbox/${commit}/marketing/`,
      "",
    );
    if (path === "index.html") {
      return new Response(new TextDecoder().decode(landing));
    }
    if (Object.hasOwn(vendor, path)) {
      return new Response(vendor[path]);
    }
    return new Response("Not found", { status: 404 });
  };
  return { fetchImpl, urls };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe("Agent Inbox landing sync", () => {
  it("resolves the latest commit that changed the landing directory", async () => {
    const { fetchImpl, urls } = mockGitHub(new Uint8Array());

    await expect(resolveSourceCommit(fetchImpl, "")).resolves.toBe(COMMIT);
    const request = new URL(urls[0]);
    expect(request.pathname).toBe("/repos/shariqh/agent-inbox/commits");
    expect(request.searchParams.get("sha")).toBe("main");
    expect(request.searchParams.get("path")).toBe("marketing");
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
      assets: [],
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
      `https://api.github.com/repos/shariqh/agent-inbox/license?ref=${COMMIT}`,
    );
    expect(urls[2]).toBe(
      `https://raw.githubusercontent.com/shariqh/agent-inbox/${COMMIT}/marketing/index.html`,
    );
    // A revision without a vendor manifest still syncs index.html alone.
    expect(urls.slice(3)).toEqual([
      `https://raw.githubusercontent.com/shariqh/agent-inbox/${COMMIT}/marketing/vendor/manifest.json`,
    ]);
    await expect(
      access(join(rootDir, "public/agent-inbox/vendor")),
    ).rejects.toThrow();
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
      assets: [],
      files: ["vendor/agent-inbox-landing.json"],
    });
  });

  it("copies the files the vendor manifest lists and records each SHA-256", async () => {
    const rootDir = await temporaryRoot();
    const landing = new TextEncoder().encode("<!doctype html>\n");
    const { fetchImpl, urls } = mockGitHub(
      landing,
      COMMIT,
      "MIT",
      vendored(THREE_186),
    );

    const result = await syncAgentInboxLanding({
      rootDir,
      fetchImpl,
      token: "",
    });

    const assets = Object.entries(THREE_186).map(([path, text]) => ({
      path,
      sha256: sha256(text),
    }));
    expect(result).toEqual({
      changed: true,
      commit: COMMIT,
      sha256: sha256("<!doctype html>\n"),
      assets,
      files: [
        "public/agent-inbox/index.html",
        "public/agent-inbox/vendor",
        "vendor/agent-inbox-landing.json",
      ],
    });
    for (const [path, text] of Object.entries(THREE_186)) {
      await expect(
        readFile(join(rootDir, "public/agent-inbox", path), "utf8"),
      ).resolves.toBe(text);
      expect(urls).toContain(
        `https://raw.githubusercontent.com/shariqh/agent-inbox/${COMMIT}/marketing/${path}`,
      );
    }
    await expect(
      readFile(join(rootDir, "vendor/agent-inbox-landing.json"), "utf8"),
    ).resolves.toBe(
      `${JSON.stringify(
        {
          repository: "https://github.com/shariqh/agent-inbox",
          sourcePath: "marketing/index.html",
          sourceRef: "main",
          commit: COMMIT,
          sha256: sha256("<!doctype html>\n"),
          license: "MIT",
          assets,
        },
        null,
        2,
      )}\n`,
    );
    await expect(
      syncAgentInboxLanding({ rootDir, fetchImpl, token: "" }),
    ).resolves.toMatchObject({ changed: false, files: [] });
  });

  it("replaces the vendored folder as later revisions change it", async () => {
    const rootDir = await temporaryRoot();
    const landing = new TextEncoder().encode("<!doctype html>\n");
    const three187 = {
      "vendor/three-0.187.0/LICENSE": "The MIT License\n",
      "vendor/three-0.187.0/three.core.js": "export const REVISION = '187';\n",
    };
    // A file in one revision can become a folder in the next.
    const asFile = { "vendor/three": "export {};\n" };
    const asFolder = { "vendor/three/core.js": "export {};\n" };
    const sync = async (fetchImpl: typeof fetch) =>
      syncAgentInboxLanding({ rootDir, fetchImpl, token: "" });

    await sync(
      mockGitHub(landing, "a".repeat(40), "MIT", vendored(THREE_186)).fetchImpl,
    );
    const upgrade = await sync(
      mockGitHub(landing, "c".repeat(40), "MIT", vendored(three187)).fetchImpl,
    );
    expect(upgrade.files).toEqual([
      "public/agent-inbox/vendor",
      "vendor/agent-inbox-landing.json",
    ]);
    await expect(landingTree(rootDir)).resolves.toEqual([
      "index.html",
      ...Object.keys(three187),
    ]);
    await expect(
      readFile(
        join(rootDir, "public/agent-inbox/vendor/three-0.187.0/three.core.js"),
        "utf8",
      ),
    ).resolves.toBe(three187["vendor/three-0.187.0/three.core.js"]);

    for (const files of [asFile, asFolder, asFile]) {
      await sync(
        mockGitHub(landing, "e".repeat(40), "MIT", vendored(files)).fetchImpl,
      );
      await expect(landingTree(rootDir)).resolves.toEqual([
        "index.html",
        ...Object.keys(files),
      ]);
    }

    // A revision without a manifest leaves index.html alone, as before vendoring.
    const legacy = await sync(mockGitHub(landing, "d".repeat(40)).fetchImpl);
    expect(legacy.assets).toEqual([]);
    expect(legacy.files).toEqual([
      "public/agent-inbox/vendor",
      "vendor/agent-inbox-landing.json",
    ]);
    await expect(landingTree(rootDir)).resolves.toEqual(["index.html"]);
    const metadata = JSON.parse(
      await readFile(join(rootDir, "vendor/agent-inbox-landing.json"), "utf8"),
    );
    expect(Object.keys(metadata)).toEqual([
      "repository",
      "sourcePath",
      "sourceRef",
      "commit",
      "sha256",
      "license",
    ]);
  });

  it("replaces links and other non-files in the vendored folder without following them", async () => {
    const rootDir = await temporaryRoot();
    const outside = await temporaryRoot();
    await writeFile(join(outside, "keep.js"), "outside\n");
    const vendorDir = join(rootDir, "public/agent-inbox/vendor");
    const { fetchImpl } = mockGitHub(
      new TextEncoder().encode("<!doctype html>\n"),
      COMMIT,
      "MIT",
      vendored(THREE_186),
    );
    const sync = () => syncAgentInboxLanding({ rootDir, fetchImpl, token: "" });

    // A linked subfolder, then a linked vendor folder, are swapped out rather
    // than written through.
    await mkdir(vendorDir, { recursive: true });
    await symlink(outside, join(vendorDir, "three-0.186.0"));
    await expect(sync()).resolves.toMatchObject({ changed: true });
    await rm(vendorDir, { recursive: true });
    await symlink(outside, vendorDir);
    await expect(sync()).resolves.toMatchObject({ changed: true });
    await expect(readdir(outside)).resolves.toEqual(["keep.js"]);
    await expect(landingTree(rootDir)).resolves.toEqual([
      "index.html",
      ...Object.keys(THREE_186),
    ]);

    // A FIFO is never read, so it cannot stall the sync.
    execFileSync("mkfifo", [join(vendorDir, "three-0.186.0/pipe")]);
    await expect(sync()).resolves.toMatchObject({ changed: true });
    await expect(landingTree(rootDir)).resolves.toEqual([
      "index.html",
      ...Object.keys(THREE_186),
    ]);

    // A link standing in for the landing folder itself is refused.
    await rm(join(rootDir, "public/agent-inbox"), { recursive: true });
    await symlink(outside, join(rootDir, "public/agent-inbox"));
    await expect(sync()).rejects.toThrow(
      "public/agent-inbox must be a directory",
    );
    await expect(readdir(outside)).resolves.toEqual(["keep.js"]);
  });

  it("writes nothing when a vendored file does not match its manifest", async () => {
    const rootDir = await temporaryRoot();
    const { fetchImpl } = mockGitHub(
      new TextEncoder().encode("<!doctype html>\n"),
      COMMIT,
      "MIT",
      {
        ...vendored(THREE_186),
        "vendor/three-0.186.0/three.core.js":
          "export const REVISION = '999';\n",
      },
    );

    await expect(
      syncAgentInboxLanding({ rootDir, fetchImpl, token: "" }),
    ).rejects.toThrow(
      "Agent Inbox vendored file vendor/three-0.186.0/three.core.js does not match its manifest SHA-256",
    );
    await expect(access(join(rootDir, "public"))).rejects.toThrow();
    await expect(access(join(rootDir, "vendor"))).rejects.toThrow();
  });

  it.each([
    ["a parent segment", ["vendor/../index.html"]],
    ["a path outside vendor/", ["scripts/x.js"]],
    ["a hidden segment", ["vendor/.git/config"]],
    ["an empty segment", ["vendor//x.js"]],
    ["too many folders", ["vendor/a/b/c/d/e.js"]],
    ["paths that differ only in case", ["vendor/A.js", "vendor/a.js"]],
    ["a file that is also a folder", ["vendor/a", "vendor/a/b.js"]],
  ])("rejects a vendor manifest with %s", async (_, paths) => {
    const files = Object.fromEntries(paths.map((path) => [path, "x\n"]));
    const { fetchImpl } = mockGitHub(
      new TextEncoder().encode("<!doctype html>\n"),
      COMMIT,
      "MIT",
      vendored(files),
    );

    await expect(inspectSourceCommit(COMMIT, fetchImpl, "")).rejects.toThrow(
      /^The Agent Inbox vendor manifest (has an invalid file entry|lists conflicting paths)/,
    );
  });

  it.each([
    ["no files", '{"files":[]}'],
    [
      "too many files",
      JSON.stringify({
        files: Array.from({ length: 17 }, (_, index) => ({
          path: `vendor/${index}.js`,
          sha256: "0".repeat(64),
        })),
      }),
    ],
    [
      "an invalid SHA-256",
      JSON.stringify({
        files: [{ path: "vendor/a.js", sha256: "A".repeat(64) }],
      }),
    ],
    ["invalid JSON", "{"],
  ])("rejects a vendor manifest with %s", async (_, manifest) => {
    const { fetchImpl } = mockGitHub(
      new TextEncoder().encode("<!doctype html>\n"),
      COMMIT,
      "MIT",
      { "vendor/manifest.json": manifest },
    );

    await expect(inspectSourceCommit(COMMIT, fetchImpl, "")).rejects.toThrow(
      /^The Agent Inbox vendor manifest /,
    );
  });

  it("fails instead of dropping vendored files when the manifest download fails", async () => {
    const { fetchImpl: github } = mockGitHub(
      new TextEncoder().encode("<!doctype html>\n"),
    );
    const fetchImpl: typeof fetch = async (input, init) =>
      String(input).endsWith("/marketing/vendor/manifest.json")
        ? new Response("unavailable", { status: 503 })
        : github(input, init);

    await expect(inspectSourceCommit(COMMIT, fetchImpl, "")).rejects.toThrow(
      "Failed to download the Agent Inbox vendor manifest",
    );
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

    const rawFailure: typeof fetch = async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/commits")) {
        return Response.json([{ sha: COMMIT }]);
      }
      if (path.endsWith("/license")) {
        return Response.json({
          path: "LICENSE",
          license: { spdx_id: "MIT" },
        });
      }
      return new Response("missing", { status: 404 });
    };
    await expect(
      syncAgentInboxLanding({
        rootDir,
        fetchImpl: rawFailure,
        token: "",
      }),
    ).rejects.toThrow("Failed to download the Agent Inbox landing page");
  });

  it("bounds upstream responses and supplies an abort signal", async () => {
    let signal: AbortSignal | null | undefined;
    let canceled = false;
    const oversized: typeof fetch = async (input, init) => {
      signal = init?.signal;
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/commits")) {
        return Response.json([{ sha: COMMIT }]);
      }
      if (path.endsWith("/license")) {
        return Response.json({
          path: "LICENSE",
          license: { spdx_id: "MIT" },
        });
      }
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(1_000_001));
          },
          cancel() {
            canceled = true;
          },
        }),
      );
    };

    await expect(
      syncAgentInboxLanding({
        rootDir: await temporaryRoot(),
        fetchImpl: oversized,
        token: "",
      }),
    ).rejects.toThrow("response exceeds 1000000 bytes");
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(canceled).toBe(true);
  });

  it("rejects malformed commit API responses", async () => {
    const malformed: typeof fetch = async () =>
      Response.json([{ sha: "main" }]);

    await expect(resolveSourceCommit(malformed, "")).rejects.toThrow(
      "GitHub did not return one valid commit",
    );
  });

  it("rejects an upstream revision without a verified MIT license", async () => {
    const { fetchImpl } = mockGitHub(
      new TextEncoder().encode("<!doctype html>\n"),
      COMMIT,
      "NOASSERTION",
    );

    await expect(verifySourceLicense(COMMIT, fetchImpl, "")).rejects.toThrow(
      "is not published under the expected MIT license",
    );
  });

  it("independently inspects an exact source commit", async () => {
    const { fetchImpl } = mockGitHub(
      new TextEncoder().encode("<!doctype html>\n"),
    );

    await expect(inspectSourceCommit(COMMIT, fetchImpl, "")).resolves.toEqual({
      commit: COMMIT,
      sha256:
        "335fca8574f060eea24ebcdae6b78f32414f5de03da1084fd0e73d710768e3a9",
      license: "MIT",
      assets: [],
    });
  });

  it("inspects a source commit's vendored files without writing them", async () => {
    const { fetchImpl } = mockGitHub(
      new TextEncoder().encode("<!doctype html>\n"),
      COMMIT,
      "MIT",
      vendored(THREE_186),
    );

    await expect(
      inspectSourceCommit(COMMIT, fetchImpl, ""),
    ).resolves.toMatchObject({
      commit: COMMIT,
      assets: Object.entries(THREE_186).map(([path, text]) => ({
        path,
        sha256: sha256(text),
      })),
    });
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
    const parsed = matter(`---\n${workflow}\n---`).data as {
      jobs: {
        sync: {
          env?: Record<string, string>;
          steps: Array<{
            name?: string;
            env?: Record<string, string>;
            with?: Record<string, string | boolean>;
          }>;
        };
      };
    };
    const sync = parsed.jobs.sync;
    const attributes = await readFile(
      new URL("../.gitattributes", import.meta.url),
      "utf8",
    );
    const step = (name: string) => {
      const found = sync.steps.find((candidate) => candidate.name === name);
      if (!found) throw new Error(`Missing workflow step: ${name}`);
      return found;
    };

    expect(workflow).toContain('cron: "17 * * * *"');
    expect(workflow).not.toContain("workflow_dispatch:");
    expect(workflow).toContain("branches: [main]");
    expect(workflow).toContain(
      '- ".github/workflows/sync-agent-inbox-landing.yml"',
    );
    expect(workflow).toContain("secrets.AGENT_GH_TOKEN");
    expect(workflow).toContain(
      "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
    );
    expect(workflow).toContain(
      "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
    );
    expect(workflow).toContain(
      "npm run --silent sync:agent-inbox-landing -- --json",
    );
    expect(workflow).toContain(
      'branch="automation/agent-inbox-landing-$commit"',
    );
    expect(workflow).toContain('-f "head=$GITHUB_REPOSITORY_OWNER:$branch"');
    expect(workflow).toContain("-f base=main");
    expect(workflow).toContain(
      "git add --all -- public/agent-inbox vendor/agent-inbox-landing.json",
    );
    expect(workflow).toContain(
      "Git staging changed the vendored landing bytes",
    );
    expect(workflow).toContain("Git staging changed the vendored bytes of");
    expect(attributes).toContain(
      "public/agent-inbox/index.html -text diff=html",
    );
    // The last matching line wins, so this must follow the *.js and LICENSE rules.
    expect(attributes.trimEnd().split("\n").at(-1)).toBe(
      "public/agent-inbox/vendor/** -text",
    );
    expect(workflow).toContain('echo "assets=$assets"');
    expect(workflow).toContain("Invalid source assets");
    expect(workflow).toContain("Invalid deferred source assets");
    expect(workflow).toContain(
      'verify_delivery_ref "$open_head_sha" "$open_commit" "$open_hash" "$open_assets"',
    );
    expect(workflow).toContain(
      'verify_delivery_ref "$head_sha" "$SOURCE_COMMIT" "$SOURCE_SHA256" "$SOURCE_ASSETS"',
    );
    expect(workflow).toContain("Delivery ref has unexpected landing files");
    expect(workflow).toContain("Recovery branch has unexpected landing files");
    expect(workflow).toContain("Git staging produced unexpected landing files");
    expect(workflow).toContain("Delivery ref tree listing is truncated");
    expect(workflow).toContain(
      "Delivery ref does not match the resolved source for",
    );
    expect(workflow).toContain(
      "Recovery branch does not match the resolved source for",
    );
    expect(workflow).toContain(
      'git diff --no-renames --name-only "origin/main...origin/$BRANCH"',
    );
    for (const name of [
      "Inspect existing delivery state",
      "Verify recoverable branch",
      "Create or recover delivery pull request",
    ]) {
      expect(step(name).env?.SOURCE_ASSETS).toBe(
        "${{ steps.sync.outputs.assets }}",
      );
    }
    expect(workflow).toContain(
      'gh pr edit "$PR_NUMBER" --add-reviewer copilot-pull-request-reviewer',
    );
    expect(workflow).toContain("-f state=all");
    expect(workflow).toContain("Unexpected delivery PR state");
    expect(workflow).toMatch(/case "\$state" in\s+open\)/);
    expect(workflow).toContain('action="closed"');
    expect(workflow).toContain("Verify recoverable branch");
    expect(workflow).toContain("git/matching-refs/heads/$branch");
    expect(workflow).toContain('verify_delivery_ref "$head_sha"');
    expect(workflow).toContain('verify_pr_scope "$number"');
    expect(workflow).toContain("Unexpected delivery PR path");
    expect(workflow).toContain("invalid file mode");
    expect(workflow).toContain('cmp --silent "$actual_metadata"');
    expect(workflow).toContain('cmp --silent "$staged_metadata"');
    expect(workflow).toContain("Git staging produced an invalid file mode");
    expect(workflow).toContain("Delivery PR changed after verification");
    expect(workflow).toContain(
      "Delivery PR changed while review was requested",
    );
    expect(workflow).toContain('--inspect "$open_commit"');
    expect(workflow).toContain("Delivery PR must not rename repository paths");
    expect(workflow).toContain('echo "verified-head=$verified_head"');
    expect(workflow).toContain("Deferring this revision while sync PR");
    expect(workflow).toContain('echo "action=defer"');
    expect(workflow).toContain(
      'test("^automation/agent-inbox-landing-[a-f0-9]{40}$")',
    );
    expect(workflow).toContain("gh auth setup-git");
    expect(workflow).toContain('[[ "$author" == "$GITHUB_REPOSITORY_OWNER" &&');
    expect(sync.env).toBeUndefined();
    expect(step("Check out blog site").with).toMatchObject({
      "persist-credentials": false,
      ref: "main",
    });
    expect(workflow).toContain("Sync checkout must match origin/main");
    expect(step("Sync the latest landing revision").env).toEqual({
      GITHUB_TOKEN: "${{ github.token }}",
    });
    expect(step("Install dependencies").env).toBeUndefined();
    expect(step("Validate synchronized landing").env).toBeUndefined();
    expect(step("Inspect existing delivery state").env?.GH_TOKEN).toBe(
      "${{ secrets.AGENT_GH_TOKEN }}",
    );
    expect(step("Create or recover delivery pull request").env?.GH_TOKEN).toBe(
      "${{ secrets.AGENT_GH_TOKEN }}",
    );
    expect(step("Ensure built-in Copilot review").env?.GH_TOKEN).toBe(
      "${{ secrets.AGENT_GH_TOKEN }}",
    );
    expect(workflow).toContain("--paginate");
    expect(workflow).toContain("--slurp");
    expect(workflow).toContain("reviews?per_page=100");
    expect(workflow).not.toMatch(/\bgh pr merge\b/);
    expect(workflow).not.toMatch(/git push [^\n]*\bmain\b/);
  });
});
