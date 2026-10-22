import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { active } from "./projects";

interface VendorMetadata {
  repository: string;
  sourcePath: string;
  sourceRef: string;
  commit: string;
  sha256: string;
  license: string;
  assets?: Array<{ path: string; sha256: string }>;
}

const metadata = JSON.parse(
  readFileSync(
    new URL("../../vendor/agent-inbox-landing.json", import.meta.url),
    "utf8",
  ),
) as VendorMetadata;
const LANDING_DIRECTORY = fileURLToPath(
  new URL("../../public/agent-inbox/", import.meta.url),
);
const LANDING_PAGE = join(LANDING_DIRECTORY, "index.html");

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("Agent Inbox landing page", () => {
  it("has valid source metadata", () => {
    expect(metadata).toEqual({
      repository: "https://github.com/shariqh/agent-inbox",
      sourcePath: "marketing/index.html",
      sourceRef: "main",
      commit: expect.stringMatching(/^[a-f0-9]{40}$/),
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      license: "MIT",
      // Present only when the source vendors files next to the page.
      ...(metadata.assets && {
        assets: metadata.assets.map(() => ({
          path: expect.stringMatching(
            /^vendor(?:\/[A-Za-z0-9][A-Za-z0-9._-]*){1,4}$/,
          ),
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        })),
      }),
    });
    expect(metadata.assets?.length).not.toBe(0);
  });

  it(`matches the pinned ${metadata.sourcePath} source bytes`, () => {
    expect(
      sha256(LANDING_PAGE),
      `Run npm run sync:agent-inbox-landing to refresh ${metadata.sourcePath} from ${metadata.repository} and update its provenance`,
    ).toBe(metadata.sha256);
  });

  it("holds exactly the page and its pinned vendored files", () => {
    const entries = readdirSync(LANDING_DIRECTORY, {
      recursive: true,
      withFileTypes: true,
    }).filter((entry) => !entry.isDirectory());
    const name = (entry: (typeof entries)[number]) =>
      relative(LANDING_DIRECTORY, join(entry.parentPath, entry.name))
        .split("\\")
        .join("/");
    const assets = metadata.assets ?? [];

    // Plain files only: a link could point the published page anywhere.
    expect(entries.filter((entry) => !entry.isFile()).map(name)).toEqual([]);
    expect(entries.map(name).sort()).toEqual(
      ["index.html", ...assets.map(({ path }) => path)].sort(),
    );
    for (const asset of assets) {
      expect(
        sha256(join(LANDING_DIRECTORY, asset.path)),
        `Run npm run sync:agent-inbox-landing to refresh ${asset.path}`,
      ).toBe(asset.sha256);
    }
  });

  it("uses the hosted landing page while retaining the source repository", () => {
    const project = active.find(({ name }) => name === "Agent Inbox");

    expect(project).toMatchObject({
      site: "https://shariq.dev/agent-inbox/",
      repo: metadata.repository,
    });
  });
});
