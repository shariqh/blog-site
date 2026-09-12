import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { active } from "./projects";

interface VendorMetadata {
  repository: string;
  sourcePath: string;
  sourceRef: string;
  commit: string;
  sha256: string;
  license: string;
}

const metadata = JSON.parse(
  readFileSync(
    new URL("../../vendor/agent-inbox-landing.json", import.meta.url),
    "utf8",
  ),
) as VendorMetadata;
const LANDING_PAGE = new URL(
  "../../public/agent-inbox/index.html",
  import.meta.url,
);

describe("Agent Inbox landing page", () => {
  it("has valid source metadata", () => {
    expect(metadata).toEqual({
      repository: "https://github.com/shariqh/agent-inbox",
      sourcePath: "marketing/index.html",
      sourceRef: "main",
      commit: expect.stringMatching(/^[a-f0-9]{40}$/),
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      license: "MIT",
    });
  });

  it(`matches the pinned ${metadata.sourcePath} source bytes`, () => {
    const bytes = readFileSync(LANDING_PAGE);
    const actual = createHash("sha256").update(bytes).digest("hex");

    expect(
      actual,
      `Run npm run sync:agent-inbox-landing to refresh ${metadata.sourcePath} from ${metadata.repository} and update its provenance`,
    ).toBe(metadata.sha256);
  });

  it("uses the hosted landing page while retaining the source repository", () => {
    const project = active.find(({ name }) => name === "Agent Inbox");

    expect(project).toMatchObject({
      site: "https://shariq.dev/agent-inbox/",
      repo: metadata.repository,
    });
  });
});
