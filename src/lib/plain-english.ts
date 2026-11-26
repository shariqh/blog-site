// Plain-English check for blog posts (docs/EDITORIAL.md §Plain English).
//
// Flags insider shorthand: phrases that only make sense to someone who already
// knows what the writer means ("the job", "got the time right"). Each rule
// carries a short reason and a plainer way to say it. `error` rules fail CI;
// `warning` rules are annotated on the PR for a human to judge, because the
// same words are sometimes literal ("the job market").
//
// scripts/check-plain-english.ts runs this over src/content/writing in CI.

export type Level = "error" | "warning";

export interface Rule {
  id: string;
  level: Level;
  pattern: RegExp;
  why: string;
  instead: string;
}

export interface Finding {
  rule: string;
  level: Level;
  line: number;
  column: number;
  match: string;
  why: string;
  instead: string;
}

export const RULES: Rule[] = [
  {
    id: "got-x-right",
    level: "error",
    pattern:
      /\b(?:got|gets|get|getting) (?:(?:it|that|this|them|those)|(?:the|a|an|its|their|my) \w+(?: \w+)?) right\b/gi,
    why: '"Got X right" hides what was measured. A reader can\'t tell what "right" means.',
    instead:
      'Say what happened in numbers: "only 1 of the 128 trimmed workouts fit the time I gave it".',
  },
  {
    id: "does-the-job",
    level: "error",
    pattern: /\b(?:does|did|do|doing|done) the (?:job|trick)\b/gi,
    why: '"Does the job" points at a job the reader was never told about.',
    instead:
      'Name the task: "a simple rule now trims the workout instead of the model".',
  },
  {
    id: "the-job",
    level: "warning",
    pattern:
      /(?<!\b(?:does|did|do|doing|done) )\b(?:the|its|their|this|that) job\b/gi,
    why: '"The job" is shorthand unless the post has said which job.',
    instead: "Name the task the thing does.",
  },
  {
    id: "the-target",
    level: "warning",
    pattern: /\b(?:the|a|its|their|hit the|miss(?:ed)? the) target\b/gi,
    why: '"The target" is shorthand unless the post has said what the target is.',
    instead:
      'Say the actual number or goal: "the 25% limit", "the time I gave it".',
  },
  {
    id: "vague-verb-path",
    level: "error",
    pattern:
      /\b(?:kills?|killed|closes?|closed) (?:that|the|this) (?:path|edge|hole|gap|vector)\b/gi,
    why: "Metaphor in place of a statement. The reader has to guess what is stopped.",
    instead:
      'Say what is refused or prevented: "so the server refuses that request".',
  },
  {
    id: "the-edges",
    level: "error",
    pattern: /\bthe edges\b/gi,
    why: '"The edges" is shorthand for cases the post hasn\'t listed yet.',
    instead:
      'List the cases: "what happens when the connection drops halfway".',
  },
  {
    id: "lie-by-omission",
    level: "error",
    pattern: /\blie by omission\b/gi,
    why: "Metaphor in place of a statement.",
    instead:
      'Say what goes wrong: "a reader can see an edit that later fails the check".',
  },
  {
    id: "say-so",
    level: "error",
    pattern: /\bsay-so\b/gi,
    why: "Idiom that hides who decides what.",
    instead: 'Say who chooses: "a web address that the caller chooses".',
  },
  {
    id: "structure-label-heading",
    level: "error",
    pattern:
      /^#{2,6}[ \t]+(?:the[ \t]+)?(?:situation|task|action|result|problem|agitat(?:e|ion)|solution)s?\b/gim,
    why: "PAS and STAR shape the post but never show in it. A heading named after a step reads like a template.",
    instead:
      'Name what the section is about: "Two copies of the same skill", not "The situation: two copies of one skill".',
  },
  {
    id: "moves-the-needle",
    level: "error",
    pattern: /\b(?:move|moves|moved|moving) the needle\b/gi,
    why: "Idiom with no number behind it.",
    instead: "Say what changed and by how much.",
  },
  {
    id: "pulls-its-weight",
    level: "error",
    pattern: /\b(?:pull|pulls|pulled|pulling) (?:its|their|my) weight\b/gi,
    why: "Idiom with no number behind it.",
    instead: "Say what it did and how well, in numbers.",
  },
];

// Replace everything that isn't prose with spaces, keeping line and column
// positions: YAML frontmatter, fenced code, inline code, JSX/HTML tags, and
// link targets. What's left is the text a reader actually reads.
export function proseOnly(source: string): string {
  const blank = (s: string) => s.replace(/[^\n]/g, " ");
  let text = source.replace(/^---\n[\s\S]*?\n---\n/, blank);
  text = text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, blank);
  text = text.replace(/`[^`\n]*`/g, blank);
  text = text.replace(/\]\([^)\n]*\)/g, (m) => "]" + blank(m.slice(1)));
  text = text.replace(/<[^>\n]*>/g, blank);
  return text;
}

export function checkPlainEnglish(
  source: string,
  rules: Rule[] = RULES,
): Finding[] {
  const text = proseOnly(source);
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++)
    if (text[i] === "\n") lineStarts.push(i + 1);
  const position = (index: number) => {
    let line = 0;
    while (line + 1 < lineStarts.length && lineStarts[line + 1] <= index)
      line++;
    return { line: line + 1, column: index - lineStarts[line] + 1 };
  };

  const findings: Finding[] = [];
  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    for (const m of text.matchAll(rule.pattern)) {
      findings.push({
        rule: rule.id,
        level: rule.level,
        match: m[0],
        why: rule.why,
        instead: rule.instead,
        ...position(m.index ?? 0),
      });
    }
  }
  return findings.sort((a, b) => a.line - b.line || a.column - b.column);
}
