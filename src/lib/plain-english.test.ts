import { describe, expect, it } from "vitest";
import { checkPlainEnglish, proseOnly } from "./plain-english";

const errors = (text: string) =>
  checkPlainEnglish(text).filter((f) => f.level === "error");

describe("checkPlainEnglish", () => {
  it("fails the old Apple on-device model line (#138)", () => {
    const old =
      "Apple's on-device model got the time right once in 128 tries, so a plain rule does the job now.";
    expect(errors(old).map((f) => f.rule)).toEqual([
      "got-x-right",
      "does-the-job",
    ]);
  });

  it("passes the rewritten Apple on-device model line", () => {
    const rewritten =
      "I wanted Apple's on-device model to do the trimming, but only 1 of its 128 trimmed workouts actually fit the time I gave it. So Shorter now uses a simple rule instead of the model.";
    expect(checkPlainEnglish(rewritten)).toEqual([]);
  });

  it("fails the old A2A opening and passes the rewrite", () => {
    expect(
      errors("The parts of A2A 1.0 the demos skip are the edges.").map(
        (f) => f.rule,
      ),
    ).toEqual(["the-edges"]);
    expect(
      errors(
        "Requiring Host to equal the literal IP string kills that path.",
      ).map((f) => f.rule),
    ).toEqual(["vague-verb-path"]);
    expect(
      errors("And the stream itself can lie by omission.").map((f) => f.rule),
    ).toEqual(["lie-by-omission"]);
    expect(
      checkPlainEnglish(
        "Most A2A demos skip what happens when something goes wrong. The server accepts only 127.0.0.1 in Host, so it refuses the request.",
      ),
    ).toEqual([]);
  });

  it('catches the common shapes of "got X right"', () => {
    for (const s of [
      "We got it right.",
      "It gets the count right.",
      "The model got the start time right.",
    ]) {
      expect(errors(s).map((f) => f.rule)).toEqual(["got-x-right"]);
    }
  });

  it('leaves literal uses of "right" alone', () => {
    expect(
      checkPlainEnglish(
        "Pick the right tool. Turn right at the light. I got a right answer.",
      ),
    ).toEqual([]);
  });

  it('only warns on "the job" and "the target", since they can be literal', () => {
    const found = checkPlainEnglish(
      "The job market is slow. We hit the target.",
    );
    expect(found.map((f) => [f.rule, f.level])).toEqual([
      ["the-job", "warning"],
      ["the-target", "warning"],
    ]);
  });

  it("fails headings named after a PAS or STAR step (#128)", () => {
    for (const h of [
      "## The situation: two copies of one skill",
      "## The task: one shared A2A agent with three hard rules",
      "### Action",
      "## The result: what the bench showed",
      "## Problem",
      "## Solution",
    ]) {
      expect(errors(h).map((f) => f.rule)).toEqual(["structure-label-heading"]);
    }
  });

  it("passes headings that name their subject, and the words in prose", () => {
    expect(
      checkPlainEnglish(
        [
          "## Two copies of the same skill",
          "## How the two-week trial went",
          "The situation was simple. The result: 260 calls.",
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("reports line and column", () => {
    const [f] = checkPlainEnglish(
      "First line.\nA plain rule does the job now.",
    );
    expect(f).toMatchObject({ line: 2, column: 14, match: "does the job" });
  });

  it("ignores frontmatter, code, inline code and link targets", () => {
    const source = [
      "---",
      'title: "It got the time right"',
      "---",
      "",
      "See [the docs](https://example.com/does-the-job) and `got it right`.",
      "",
      "```ts",
      "// this does the job",
      "```",
      "",
      "Plain text here.",
    ].join("\n");
    expect(checkPlainEnglish(source)).toEqual([]);
  });

  it("keeps positions when it blanks out non-prose", () => {
    const source = "---\ntitle: x\n---\n`code` then the edges.";
    expect(proseOnly(source).split("\n")).toHaveLength(4);
    expect(checkPlainEnglish(source)[0]).toMatchObject({ line: 4, column: 13 });
  });
});
