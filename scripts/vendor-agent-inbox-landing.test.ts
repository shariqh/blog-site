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
import { join, matchesGlob } from "node:path";
import { gzipSync } from "node:zlib";
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

// A gzipped ustar archive of plain files, laid out like an npm tarball. `size`
// writes each entry's size field, so a test can damage one.
function npmTarball(
  files: Record<string, string>,
  size: (name: string, length: number) => string = (_, length) =>
    `${length.toString(8).padStart(11, "0")}\0`,
): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const blocks: Uint8Array[] = [];
  for (const [name, text] of Object.entries(files)) {
    const data = encoder.encode(text);
    const header = new Uint8Array(512);
    const field = (offset: number, value: string) =>
      header.set(encoder.encode(value), offset);
    field(0, name);
    field(100, "0000644\0");
    field(124, size(name, data.length));
    field(156, "0");
    field(257, "ustar\u000000");
    // The checksum is the header's byte sum, counting its own field as spaces.
    header.fill(0x20, 148, 156);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    field(148, `${checksum.toString(8).padStart(6, "0")}\0 `);
    blocks.push(header, data, new Uint8Array(-data.length & 511));
  }
  blocks.push(new Uint8Array(1024));
  return new Uint8Array(gzipSync(Buffer.concat(blocks)));
}

const NPM_FILES: Record<string, string> = {
  LICENSE: "package/LICENSE",
  "three.core.js": "package/build/three.core.js",
  "three.module.js": "package/build/three.module.js",
};

interface Source {
  // Files under marketing/, keyed by their path from there.
  vendor?: Record<string, string>;
  // npm registry responses by URL.
  registry?: Record<string, () => Response>;
}

// Vendored files and a manifest that lists them, in reverse order so the sync
// has to sort them, and names the npm release behind each folder. The registry
// serves that release, holding `npmFiles` (by default the vendored files).
function vendored(
  files: Record<string, string>,
  {
    listed = Object.keys(files).map((path) => ({
      path,
      sha256: sha256(files[path]),
    })),
    npmFiles = files,
    size,
  }: {
    listed?: Array<{ path: string; sha256: string }>;
    npmFiles?: Record<string, string>;
    size?: (name: string, length: number) => string;
  } = {},
): Required<Source> {
  const registry: Record<string, () => Response> = {};
  const versions = new Set(
    Object.keys(files).flatMap(
      (path) => /^vendor\/three-(\d+\.\d+\.\d+)\//.exec(path)?.[1] ?? [],
    ),
  );
  const sources = [...versions].map((version) => {
    const directory = `vendor/three-${version}`;
    const members = Object.entries(npmFiles).flatMap(([path, text]) => {
      const member = NPM_FILES[path.slice(directory.length + 1)];
      return path.startsWith(`${directory}/`) && member ? [[member, text]] : [];
    });
    const archive = npmTarball(
      {
        "package/package.json": JSON.stringify({ name: "three", version }),
        ...Object.fromEntries(members),
      },
      size,
    );
    const tarball = `https://registry.npmjs.org/three/-/three-${version}.tgz`;
    const integrity = `sha512-${createHash("sha512").update(archive).digest("base64")}`;
    registry[`https://registry.npmjs.org/three/${version}`] = () =>
      Response.json({ name: "three", version, dist: { tarball, integrity } });
    registry[tarball] = () => new Response(archive);
    return {
      directory,
      package: `three@${version}`,
      tarball,
      integrity,
      license: "MIT",
    };
  });
  return {
    vendor: {
      ...files,
      "vendor/manifest.json": JSON.stringify({
        files: [...listed].reverse(),
        sources,
      }),
    },
    registry,
  };
}

// The manifest vendored() writes for these files.
function manifestOf(files: Record<string, string>) {
  return JSON.parse(vendored(files).vendor["vendor/manifest.json"]);
}

// The THREE_186 manifest with its npm source changed.
function withSource(change: Record<string, string>) {
  const manifest = manifestOf(THREE_186);
  return { ...manifest, sources: [{ ...manifest.sources[0], ...change }] };
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
  { vendor = {}, registry = {} }: Source = {},
): {
  fetchImpl: typeof fetch;
  urls: string[];
  registryHeaders: Headers[];
} {
  const urls: string[] = [];
  const registryHeaders: Headers[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    urls.push(url);
    const { hostname, pathname } = new URL(url);
    if (hostname === "registry.npmjs.org") {
      registryHeaders.push(new Headers(init?.headers));
      return registry[url]?.() ?? new Response("Not found", { status: 404 });
    }
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
  return { fetchImpl, urls, registryHeaders };
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
      npm: [],
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
      npm: [],
      files: ["vendor/agent-inbox-landing.json"],
    });
  });

  it("copies the files the vendor manifest lists and records each SHA-256", async () => {
    const rootDir = await temporaryRoot();
    const landing = new TextEncoder().encode("<!doctype html>\n");
    const source = vendored(THREE_186);
    const { fetchImpl, urls, registryHeaders } = mockGitHub(
      landing,
      COMMIT,
      "MIT",
      source,
    );

    const result = await syncAgentInboxLanding({
      rootDir,
      fetchImpl,
      token: "test-token",
    });

    const assets = Object.entries(THREE_186).map(([path, text]) => ({
      path,
      sha256: sha256(text),
    }));
    const manifest = JSON.parse(source.vendor["vendor/manifest.json"]);
    expect(result).toEqual({
      changed: true,
      commit: COMMIT,
      sha256: sha256("<!doctype html>\n"),
      assets,
      npm: [
        { package: "three@0.186.0", integrity: manifest.sources[0].integrity },
      ],
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
    // The registry was asked for the release and its tarball, never with the token.
    expect(urls).toContain("https://registry.npmjs.org/three/0.186.0");
    expect(urls).toContain(
      "https://registry.npmjs.org/three/-/three-0.186.0.tgz",
    );
    expect(
      registryHeaders.map((headers) => headers.has("authorization")),
    ).toEqual([false, false]);
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

  it("refuses a vendored file that differs from its npm release, even with a matching manifest hash", async () => {
    const rootDir = await temporaryRoot();
    // The commit edits three.core.js and updates its manifest hash to match.
    const edited = {
      ...THREE_186,
      "vendor/three-0.186.0/three.core.js":
        "fetch('https://example.invalid');\n",
    };
    const { fetchImpl } = mockGitHub(
      new TextEncoder().encode("<!doctype html>\n"),
      COMMIT,
      "MIT",
      vendored(edited, { npmFiles: THREE_186 }),
    );

    await expect(
      syncAgentInboxLanding({ rootDir, fetchImpl, token: "" }),
    ).rejects.toThrow(
      "Agent Inbox vendored file vendor/three-0.186.0/three.core.js does not match package/build/three.core.js in npm three@0.186.0",
    );
    await expect(access(join(rootDir, "public"))).rejects.toThrow();
  });

  it.each([
    [
      "a tarball that does not match the registry's integrity",
      (source: Required<Source>) => {
        const url = "https://registry.npmjs.org/three/-/three-0.186.0.tgz";
        source.registry[url] = () => new Response(npmTarball(THREE_186));
      },
      "The npm tarball for three@0.186.0 does not match the registry's integrity",
    ],
    [
      "a registry integrity that differs from the manifest",
      (source: Required<Source>) => {
        const url = "https://registry.npmjs.org/three/0.186.0";
        source.registry[url] = () =>
          Response.json({
            name: "three",
            version: "0.186.0",
            dist: {
              tarball: "https://registry.npmjs.org/three/-/three-0.186.0.tgz",
              integrity: `sha512-${"A".repeat(86)}==`,
            },
          });
      },
      "The npm registry does not list three@0.186.0 with the vendor manifest's tarball and integrity",
    ],
    [
      "a registry tarball somewhere else",
      (source: Required<Source>) => {
        const { integrity } = manifestOf(THREE_186).sources[0];
        source.registry["https://registry.npmjs.org/three/0.186.0"] = () =>
          Response.json({
            name: "three",
            version: "0.186.0",
            dist: {
              tarball: "https://example.invalid/three-0.186.0.tgz",
              integrity,
            },
          });
      },
      "The npm registry does not list three@0.186.0 with the vendor manifest's tarball and integrity",
    ],
  ])("refuses %s", async (_, change, message) => {
    const source = vendored(THREE_186);
    change(source);
    const { fetchImpl } = mockGitHub(
      new TextEncoder().encode("<!doctype html>\n"),
      COMMIT,
      "MIT",
      source,
    );

    await expect(inspectSourceCommit(COMMIT, fetchImpl, "")).rejects.toThrow(
      message,
    );
  });

  it.each([
    ["a negative size", "-0000000001\0"],
    ["a size with trailing garbage", "0000000001x\0"],
    ["a base-256 size", "\u0080\0\0\0\0\0\0\0\0\0\0\u0001"],
  ])("refuses an npm tarball entry with %s", async (_, field) => {
    const { fetchImpl } = mockGitHub(
      new TextEncoder().encode("<!doctype html>\n"),
      COMMIT,
      "MIT",
      vendored(THREE_186, {
        size: (name, length) =>
          name === "package/build/three.core.js"
            ? field
            : `${length.toString(8).padStart(11, "0")}\0`,
      }),
    );

    await expect(inspectSourceCommit(COMMIT, fetchImpl, "")).rejects.toThrow(
      "The npm tarball has a damaged entry",
    );
  });

  it("replaces whatever is in the vendored folder, such as a file where a folder belongs", async () => {
    const rootDir = await temporaryRoot();
    const landing = new TextEncoder().encode("<!doctype html>\n");
    const three187 = {
      "vendor/three-0.187.0/LICENSE": "The MIT License\n",
      "vendor/three-0.187.0/three.core.js": "export const REVISION = '187';\n",
      "vendor/three-0.187.0/three.module.js":
        "export * from './three.core.js';\n",
    };
    const vendorDir = join(rootDir, "public/agent-inbox/vendor");
    const sync = async (fetchImpl: typeof fetch) =>
      syncAgentInboxLanding({ rootDir, fetchImpl, token: "" });

    // A file where the release folder belongs, then a folder where a file belongs.
    await mkdir(vendorDir, { recursive: true });
    await writeFile(join(vendorDir, "three-0.186.0"), "stale\n");
    await sync(
      mockGitHub(landing, "a".repeat(40), "MIT", vendored(THREE_186)).fetchImpl,
    );
    await expect(landingTree(rootDir)).resolves.toEqual([
      "index.html",
      ...Object.keys(THREE_186),
    ]);
    await rm(join(vendorDir, "three-0.186.0/LICENSE"));
    await mkdir(join(vendorDir, "three-0.186.0/LICENSE/stale"), {
      recursive: true,
    });
    await writeFile(join(vendorDir, "three-0.186.0/LICENSE/stale/x.js"), "x\n");
    const repaired = await sync(
      mockGitHub(landing, "a".repeat(40), "MIT", vendored(THREE_186)).fetchImpl,
    );
    expect(repaired.files).toEqual(["public/agent-inbox/vendor"]);
    await expect(landingTree(rootDir)).resolves.toEqual([
      "index.html",
      ...Object.keys(THREE_186),
    ]);

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
    const source = vendored(THREE_186);
    source.vendor["vendor/three-0.186.0/three.core.js"] =
      "export const REVISION = '999';\n";
    const { fetchImpl } = mockGitHub(
      new TextEncoder().encode("<!doctype html>\n"),
      COMMIT,
      "MIT",
      source,
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
    // Test runners would collect these from the synced tree and run them in CI.
    [
      "a TypeScript test file",
      ["vendor/scripts/vendor-agent-inbox-landing.test.ts"],
    ],
    ["a JavaScript test file", ["vendor/three-0.186.0/three.test.js"]],
    ["a spec module", ["vendor/three-0.186.0/three.spec.mjs"]],
    ["an upper-case test name", ["vendor/three-0.186.0/three.TEST.js"]],
    ["a test folder name", ["vendor/a.test.js/three.module.js"]],
    ["a benchmark", ["vendor/three-0.186.0/three.bench.js"]],
    ["a long benchmark name", ["vendor/three-0.186.0/three.benchmark.js"]],
    ["a type test", ["vendor/three-0.186.0/three.test-d.js"]],
    ["a file a page cannot load", ["vendor/three-0.186.0/three.core.cjs"]],
    ["a parent segment", ["vendor/../index.js"]],
    ["a path outside vendor/", ["scripts/x.js"]],
    ["a hidden segment", ["vendor/.git/x.js"]],
    ["an empty segment", ["vendor//x.js"]],
    ["too many folders", ["vendor/a/b/c/d/e.js"]],
    ["paths that differ only in case", ["vendor/A.js", "vendor/a.js"]],
    ["a file that is also a folder", ["vendor/a.js", "vendor/a.js/b.js"]],
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
    ["a file the three release does not ship", "vendor/three-0.186.0/extra.js"],
    ["a folder without an npm source", "vendor/other-1.0.0/other.js"],
  ])("refuses %s", async (_, path) => {
    const source = vendored({ ...THREE_186, [path]: "x\n" });
    const { fetchImpl } = mockGitHub(
      new TextEncoder().encode("<!doctype html>\n"),
      COMMIT,
      "MIT",
      source,
    );

    await expect(inspectSourceCommit(COMMIT, fetchImpl, "")).rejects.toThrow(
      `Agent Inbox vendored file ${path} is not a three release file the sync can check against npm`,
    );
  });

  it.each([
    ["no files", () => ({ files: [] })],
    [
      "too many files",
      () => ({
        files: Array.from({ length: 17 }, (_, index) => ({
          path: `vendor/${index}.js`,
          sha256: "0".repeat(64),
        })),
      }),
    ],
    [
      "an invalid SHA-256",
      () => ({ files: [{ path: "vendor/a.js", sha256: "A".repeat(64) }] }),
    ],
    [
      "no npm sources",
      () => ({ ...manifestOf(THREE_186), sources: undefined }),
    ],
    ["another npm package", () => withSource({ package: "lodash@4.17.21" })],
    [
      "a source folder that does not match its release",
      () => withSource({ directory: "vendor/three-0.185.0" }),
    ],
    [
      "a tarball outside the npm registry",
      () => withSource({ tarball: "https://example.invalid/three.tgz" }),
    ],
    ["an invalid integrity", () => withSource({ integrity: "sha1-x" })],
  ])("rejects a vendor manifest with %s", async (_, manifest) => {
    const { fetchImpl } = mockGitHub(
      new TextEncoder().encode("<!doctype html>\n"),
      COMMIT,
      "MIT",
      {
        vendor: {
          ...THREE_186,
          "vendor/manifest.json": JSON.stringify(manifest()),
        },
      },
    );

    await expect(inspectSourceCommit(COMMIT, fetchImpl, "")).rejects.toThrow(
      /^(The Agent Inbox vendor manifest |Agent Inbox vendored file )/,
    );
  });

  it("rejects a vendor manifest that is not JSON", async () => {
    const { fetchImpl } = mockGitHub(
      new TextEncoder().encode("<!doctype html>\n"),
      COMMIT,
      "MIT",
      { vendor: { "vendor/manifest.json": "{" } },
    );

    await expect(inspectSourceCommit(COMMIT, fetchImpl, "")).rejects.toThrow(
      "The Agent Inbox vendor manifest is not valid JSON",
    );
  });

  it.each([
    ["a revision without a manifest", "three.module.js", {}],
    [
      "a manifest that does not list it",
      "three.webgpu.js",
      vendored(THREE_186),
    ],
  ])(
    "refuses a page that loads a vendored file from %s",
    async (_, name, source) => {
      const rootDir = await temporaryRoot();
      const { fetchImpl } = mockGitHub(
        new TextEncoder().encode(
          `<script type="module">import('./vendor/three-0.186.0/${name}')</script>\n`,
        ),
        COMMIT,
        "MIT",
        source,
      );

      await expect(
        syncAgentInboxLanding({ rootDir, fetchImpl, token: "" }),
      ).rejects.toThrow(
        `Agent Inbox commit ${COMMIT} refers to vendor/three-0.186.0/${name}, which its vendor manifest does not list`,
      );
      await expect(access(join(rootDir, "public"))).rejects.toThrow();
    },
  );

  it.each(Object.keys(THREE_186))(
    "refuses a vendored release without %s",
    async (path) => {
      const files: Record<string, string> = { ...THREE_186 };
      delete files[path];
      const { fetchImpl } = mockGitHub(
        new TextEncoder().encode("<!doctype html>\n"),
        COMMIT,
        "MIT",
        vendored(files),
      );

      await expect(inspectSourceCommit(COMMIT, fetchImpl, "")).rejects.toThrow(
        `The Agent Inbox vendor manifest lists vendor/three-0.186.0 without ${path.slice("vendor/three-0.186.0/".length)}`,
      );
    },
  );

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
    const { fetchImpl, urls } = mockGitHub(
      new TextEncoder().encode("<!doctype html>\n"),
    );

    await expect(inspectSourceCommit(COMMIT, fetchImpl, "")).resolves.toEqual({
      commit: COMMIT,
      sha256:
        "335fca8574f060eea24ebcdae6b78f32414f5de03da1084fd0e73d710768e3a9",
      license: "MIT",
      assets: [],
      npm: [],
    });
    expect(urls.some((url) => url.includes("registry.npmjs.org"))).toBe(false);
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
      npm: [expect.objectContaining({ package: "three@0.186.0" })],
    });
  });
});

interface WorkflowStep {
  name?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, string | boolean>;
}

interface WorkflowJob {
  env?: Record<string, string>;
  needs?: string;
  permissions?: Record<string, string>;
  steps: WorkflowStep[];
}

async function readWorkflow(): Promise<{
  workflow: string;
  jobs: Record<string, WorkflowJob>;
}> {
  const workflow = await readFile(
    new URL(
      "../.github/workflows/sync-agent-inbox-landing.yml",
      import.meta.url,
    ),
    "utf8",
  );
  const { jobs } = matter(`---\n${workflow}\n---`).data as {
    jobs: Record<string, WorkflowJob>;
  };
  return { workflow, jobs };
}

describe("Agent Inbox landing sync workflow", () => {
  it("opens a reviewed PR without merging or pushing to main", async () => {
    const { workflow, jobs } = await readWorkflow();
    const attributes = await readFile(
      new URL("../.gitattributes", import.meta.url),
      "utf8",
    );
    const step = (job: string, name: string) => {
      const found = jobs[job].steps.find(
        (candidate) => candidate.name === name,
      );
      if (!found) throw new Error(`Missing ${job} step: ${name}`);
      return found;
    };

    expect(Object.keys(jobs)).toEqual(["sync", "publish"]);
    expect(workflow).toContain('cron: "17 * * * *"');
    expect(workflow).not.toContain("workflow_dispatch:");
    expect(workflow).toContain("branches: [main]");
    expect(workflow).toContain(
      '- ".github/workflows/sync-agent-inbox-landing.yml"',
    );
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
    expect(workflow).toContain('echo "npm=$npm"');
    expect(workflow).toContain("Invalid source assets");
    expect(workflow).toContain("Invalid deferred source assets");
    expect(workflow).toContain("Invalid npm sources");
    expect(workflow).toContain(
      'verify_delivery_ref "$open_head_sha" "$open_commit" "$open_hash" "$open_assets"',
    );
    expect(workflow).toContain(
      'verify_delivery_ref "$head_sha" "$SOURCE_COMMIT" "$SOURCE_SHA256" "$SOURCE_ASSETS"',
    );
    expect(workflow).toContain("Delivery ref has unexpected landing files");
    expect(workflow).toContain("Recovery branch has unexpected landing files");
    expect(workflow).toContain("Git staging produced unexpected landing files");
    expect(workflow).toContain(
      "The synced landing artifact holds unexpected files",
    );
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
    expect(workflow).toContain("## npm release");
    expect(workflow).toContain('gh pr edit "$PR_NUMBER"');
    expect(workflow).toContain("--add-reviewer copilot-pull-request-reviewer");
    expect(workflow).toContain("-f state=all");
    expect(workflow).toContain("Unexpected delivery PR state");
    expect(workflow).toMatch(/case "\$state" in\s+open\)/);
    expect(workflow).toContain('action="closed"');
    expect(workflow).toContain("git/matching-refs/heads/$branch");
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
    expect(workflow).toContain("AGENT_GH_TOKEN must authenticate as");
    expect(jobs.sync.env).toBeUndefined();
    expect(jobs.publish.env).toBeUndefined();
    expect(step("sync", "Check out blog site").with).toMatchObject({
      "persist-credentials": false,
      ref: "main",
    });
    expect(workflow).toContain("Sync checkout must match origin/main");
    expect(step("sync", "Sync the latest landing revision").env).toEqual({
      GITHUB_TOKEN: "${{ github.token }}",
    });
    expect(step("sync", "Install dependencies").env).toBeUndefined();
    expect(step("sync", "Validate synchronized landing").env).toBeUndefined();
    expect(step("sync", "Inspect existing delivery state").env?.GH_TOKEN).toBe(
      "${{ github.token }}",
    );
    for (const name of [
      "Check the publishing token",
      "Create or recover delivery pull request",
      "Ensure built-in Copilot review",
    ]) {
      expect(step("publish", name).env?.GH_TOKEN).toBe(
        "${{ secrets.AGENT_GH_TOKEN }}",
      );
    }
    expect(workflow).toContain("--paginate");
    expect(workflow).toContain("--slurp");
    expect(workflow).toContain("reviews?per_page=100");
    expect(workflow).not.toMatch(/\bgh pr merge\b/);
    expect(workflow).not.toMatch(/git (?:-c \S+ )?push [^\n]*\bmain\b/);
  });

  it.each([
    ["vendor/three-0.186.0/three.module.js", true],
    ["vendor/three-0.186.0/LICENSE", true],
    ["vendor/a/b/c/site.css", true],
    ["vendor/x.mjs", true],
    ["vendor/scripts/vendor-agent-inbox-landing.test.ts", false],
    ["vendor/three-0.186.0/three.test.js", false],
    ["vendor/three-0.186.0/three.spec.mjs", false],
    ["vendor/three-0.186.0/three.TEST.js", false],
    ["vendor/a.test.js/three.module.js", false],
    ["vendor/three-0.186.0/three.bench.js", false],
    ["vendor/three-0.186.0/three.benchmark.js", false],
    ["vendor/three-0.186.0/three.test-d.js", false],
    ["vendor/three-0.186.0/three.Spec-D.mjs", false],
    ["vendor/three-0.186.0/three.core.cjs", false],
    ["vendor/../index.js", false],
    ["vendor/.git/x.js", false],
    ["vendor/a/b/c/d/e.js", false],
  ])(
    "checks %s with the same rules in every workflow step",
    async (path, allowed) => {
      const { workflow } = await readWorkflow();
      // Bash checks repository paths; jq checks paths relative to the page.
      const bash = [
        ...workflow.matchAll(
          /asset_path_pattern='([^']+)'\n\s+test_name_pattern='([^']+)'/g,
        ),
      ].map(
        ([, asset, test]) => [new RegExp(asset), new RegExp(test)] as const,
      );
      const jq = [
        ...workflow.matchAll(
          /test\("(\^vendor(?:[^"\\]|\\.)*)"\) and\s+\(test\("((?:[^"\\]|\\.)*)"; "i"\) \| not\)/g,
        ),
      ].map(
        ([, asset, test]) =>
          [
            new RegExp(JSON.parse(`"${asset}"`)),
            new RegExp(JSON.parse(`"${test}"`), "i"),
          ] as const,
      );

      expect(bash).toHaveLength(4);
      expect(jq).toHaveLength(3);
      // ...and every one of them decides a check that fails its step.
      expect(
        workflow.match(
          /\( "\$path" =~ \$asset_path_pattern &&\s+! "\$path" =~ \$test_name_pattern \) \]\] \|\| \{/g,
        ),
      ).toHaveLength(4);
      expect(
        workflow.match(
          /jq -e '[^']*test\("\^vendor[^']*' <<<"\$\w+" >\/dev\/null \|\| \{/g,
        ),
      ).toHaveLength(3);
      for (const [asset, test] of bash) {
        const repositoryPath = `public/agent-inbox/${path}`;
        expect(asset.test(repositoryPath) && !test.test(repositoryPath)).toBe(
          allowed,
        );
      }
      for (const [asset, test] of jq) {
        expect(asset.test(path) && !test.test(path)).toBe(allowed);
      }
    },
  );

  it("keeps AGENT_GH_TOKEN out of every job that runs code over the synced files", async () => {
    const { jobs } = await readWorkflow();

    // Only the publish job names the owner token, and it needs the sync job.
    for (const [name, job] of Object.entries(jobs)) {
      expect(JSON.stringify(job).includes("AGENT_GH_TOKEN"), name).toBe(
        name === "publish",
      );
    }
    expect(jobs.publish.needs).toBe("sync");
    expect(jobs.sync.permissions).toEqual({
      contents: "read",
      "pull-requests": "read",
    });
    expect(jobs.publish.permissions).toEqual({ contents: "read" });

    // The publish job sets up no Node and runs no npm, Node, test or build tool.
    // Wrappers and shells count too: they could run a synced file.
    const command =
      /(?:^\s*|\$\(\s*|[|;&]\s*)(?:npm|npx|node|vitest|astro|tsx|yarn|pnpm|bun|deno|env|command|exec|xargs|bash|sh|zsh|source|\.)(?=\s|$)/m;
    for (const { name, run = "" } of jobs.publish.steps) {
      expect(run, name).not.toMatch(command);
    }
    expect(
      jobs.publish.steps.flatMap(({ uses }) => (uses ? [uses] : [])),
    ).toEqual([
      "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
      "actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333",
    ]);
    // ...and no Git hook: every git command that could run one says so.
    const publish = jobs.publish.steps.find(
      (step) => step.name === "Create or recover delivery pull request",
    )!;
    expect(publish.env).toMatchObject({
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "core.hooksPath",
      GIT_CONFIG_VALUE_0: "/dev/null",
    });
    const hooked = [
      ...(publish.run ?? "").matchAll(
        /\bgit\s+(?:-c\s+\S+\s+)*(?:switch|checkout|commit|push|merge|rebase|am|pull)\b/g,
      ),
    ].map(([match]) => match);
    expect(hooked).toHaveLength(3);
    for (const match of hooked) {
      expect(match).toMatch(/^git -c core\.hooksPath=\/dev\/null /);
    }

    // Checkouts keep no credentials, and the synced files leave the sync job
    // before any dependency code runs there.
    for (const job of Object.values(jobs)) {
      for (const step of job.steps) {
        if (step.uses?.startsWith("actions/checkout@")) {
          expect(step.with?.["persist-credentials"]).toBe(false);
        }
      }
    }
    const names = jobs.sync.steps.map(({ name }) => name);
    expect(names.indexOf("Upload synced landing")).toBeGreaterThan(-1);
    expect(names.indexOf("Upload synced landing")).toBeLessThan(
      names.indexOf("Install dependencies"),
    );
  });

  it("never lets vitest collect the synced landing", async () => {
    // The exported config, not its text, so a comment cannot satisfy this.
    const { default: config } = await import("../vitest.config");
    const exclude = config.test?.exclude ?? [];

    for (const path of [
      "public/agent-inbox/vendor/scripts/vendor-agent-inbox-landing.test.ts",
      "public/agent-inbox/vendor/three-0.186.0/three.test.js",
    ]) {
      expect(
        exclude.some((pattern) => matchesGlob(path, pattern)),
        path,
      ).toBe(true);
    }
  });
});
