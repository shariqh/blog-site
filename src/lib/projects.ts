export type ProjectKind = "product" | "tool" | "site" | "learn" | "talk";

export interface Project {
  name: string;
  description: string;
  /** Short one-line blurb for compact contexts (e.g. the homepage "built" list). */
  blurb?: string;
  kind: ProjectKind;
  /** Public-facing site, if any. */
  site?: string;
  /** GitHub repo, if open source. Omit for closed-source products. */
  repo?: string;
  /** Optional badge text like "active" / "archived" / a year. */
  status?: string;
}

export const active: Project[] = [
  {
    name: "lognote",
    blurb: "Local transcription & summarization for Mac.",
    description:
      "Local audio transcription + summarization for Mac. Records mic + system audio, runs MLX-Whisper on-device, lands a Markdown transcript and summary in your notes.",
    kind: "product",
    site: "https://lognote.dev",
    status: "active",
  },
  {
    name: "unrivaledpro",
    blurb: "Reviews & deals on gaming peripherals.",
    description:
      "Reviews and deals on gaming peripherals — chairs, speakers, power banks, and the gear in between.",
    kind: "product",
    site: "https://unrivaledpro.com",
    status: "active",
  },
  {
    name: "portalrewards",
    blurb: "A loyalty-rewards gateway for brands.",
    description:
      "A gateway for brands to build consumer loyalty programs. Users scan to earn rewards and redeem them for brand prizes.",
    kind: "product",
    site: "https://portalrewards.com",
    status: "active",
  },
  {
    name: "shariq.dev",
    blurb: "This site — Astro, Tailwind &amp; MDX.",
    description:
      'This site. Astro + Tailwind 4 + MDX, deployed on Cloudflare Pages. The whole rebuild is <a class="underline decoration-[var(--accent)] underline-offset-2 hover:text-[var(--accent)]" href="/blog/rebuilding-shariq-dev">documented in the blog</a>.',
    kind: "site",
    site: "https://shariq.dev",
    repo: "https://github.com/shariqh/blog-site",
    status: "active",
  },
];

export const built: Project[] = [
  {
    name: "home-server-docker-compose",
    description:
      "A collection of docker-compose files I use to run my home server. With comments.",
    kind: "tool",
    repo: "https://github.com/shariqh/home-server-docker-compose",
  },
  {
    name: "myspace",
    description: "A personal sandbox / landing page from a while back.",
    kind: "site",
    site: "https://shariqh.github.io/myspace/",
    repo: "https://github.com/shariqh/myspace",
  },
  {
    name: "coffee-ui",
    description: "Coffee-themed UI experiments.",
    kind: "site",
    site: "https://coffee-ui.vercel.app",
    repo: "https://github.com/shariqh/coffee-ui",
  },
  {
    name: "bullmq + bull-board + redis docker starter",
    description: "Quickstart for running BullMQ with Bull-Board behind Redis, in Docker.",
    kind: "tool",
    repo: "https://github.com/shariqh/bullmq_bull-board_redis_docker_starter",
  },
];

export const talks: Project[] = [
  {
    name: "DevOps intro",
    description: "Internal presentation introducing DevOps practices.",
    kind: "talk",
    repo: "https://github.com/shariqh/presentation_devops",
  },
  {
    name: "JUnit + Mockito intro",
    description: "Internal presentation on Java unit testing.",
    kind: "talk",
    repo: "https://github.com/shariqh/presentation_junit-mockito-intro",
  },
  {
    name: "Managing in high-turnover environments",
    description: "Internal presentation on engineering management during attrition.",
    kind: "talk",
    repo: "https://github.com/shariqh/presentation_managing-in-high-turnover",
  },
];

export function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
