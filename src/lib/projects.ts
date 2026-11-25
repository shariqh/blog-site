export type ProjectKind = "product" | "tool" | "site" | "learn" | "talk";

export interface Project {
  name: string;
  description: string;
  /** Short one-line blurb for compact Home and Now contexts. */
  blurb?: string;
  kind: ProjectKind;
  /** Public-facing site, if any. */
  site?: string;
  /** GitHub repo, if open source. Omit for closed-source products. */
  repo?: string;
  /** Optional badge text like "active" / "archived" / a year. */
  status?: string;
  /** Public beta link (e.g. a TestFlight invite), shown on the Now and Projects pages. */
  beta?: string;
  /** Technology or product traits shown when this project is spotlighted. */
  stack?: readonly string[];
}

export const active: Project[] = [
  {
    name: "Oris",
    blurb: "Local-first meeting notes for Mac.",
    description:
      "A local-first Mac app that records meetings without a call bot, transcribes on-device with WhisperKit, and lands structured notes in Obsidian, Apple Notes, or a Markdown folder.",
    kind: "product",
    site: "https://orisnotes.com",
    status: "active",
    stack: ["Swift", "WhisperKit", "macOS", "local-first"],
  },
  {
    name: "Agent Inbox",
    blurb: "A local command center for coding agents.",
    description:
      "A local, cross-project attention inbox where Copilot CLI and Claude Code surface decisions, plans, and handoffs through MCP.",
    kind: "tool",
    site: "https://shariq.dev/agent-inbox/",
    repo: "https://github.com/shariqh/agent-inbox",
    status: "building",
  },
  {
    name: "A2A Marketplace",
    blurb: "Hosted A2A agents that plug into Agent Inbox.",
    description:
      "Hosted A2A agent services for Agent Inbox: accounts, a catalog of hosted agents, billing and a relay. Agent Inbox itself stays open source and local-first.",
    kind: "product",
    status: "building",
  },
  {
    name: "AskDocs",
    blurb: "Embeddable search and RAG for product sites.",
    description:
      "Multi-tenant search and RAG delivered as a Web Component. It currently powers the site search for Oris.",
    kind: "tool",
    status: "private",
  },
  {
    name: "GitHub Enterprise Settings Configurator",
    blurb: "Desired-state planning for GitHub Enterprise.",
    description:
      "An interactive planner for GitHub Enterprise settings, security posture, governance, and rollout complexity.",
    kind: "tool",
    site: "https://shariqh.github.io/github-enterprise-settings-configurator/",
    repo: "https://github.com/shariqh/github-enterprise-settings-configurator",
    status: "active",
  },
  {
    name: "Browser Search for Alfred",
    blurb: "Search browser tabs, bookmarks and history from Alfred.",
    description:
      "An Alfred workflow that searches open tabs, bookmarks and history across Firefox, Safari and Chromium browsers.",
    kind: "tool",
    repo: "https://github.com/shariqh/browser-search-for-alfred",
    status: "awaiting approval",
  },
];

/** iOS apps in TestFlight with Bundle. Shown on the Now page and in Projects' "Also building" grid. */
export const testflight: Project[] = [
  {
    name: "Matryoshka",
    blurb: "An iOS app for keeping track of what's stored where at home.",
    description:
      "An iOS home inventory app for keeping track of what's stored where.",
    kind: "product",
    site: "https://matryoshka.bundleapps.io/",
    beta: "https://testflight.apple.com/join/zbxDR9K9",
    status: "TestFlight",
  },
  {
    name: "Reps & Co.",
    blurb: "An iOS workout app where you bring your own AI keys.",
    description: "A workout app for iPhone where you bring your own AI API keys.",
    kind: "product",
    beta: "https://testflight.apple.com/join/Hny7ksYg",
    status: "TestFlight",
  },
  {
    name: "Test Recorder",
    blurb: "An iPhone app that records app-testing sessions with your narration.",
    description:
      "An iPhone app that records your screen and voice while you test an app, with marks, sections and an on-device transcript.",
    kind: "product",
    beta: "https://testflight.apple.com/join/KMhUu3P9",
    status: "TestFlight",
  },
];

export const built: Project[] = [
  {
    name: "shariq.dev",
    description: "This site: Astro, Tailwind 4, and MDX on Cloudflare Pages.",
    kind: "site",
    site: "https://shariq.dev",
    repo: "https://github.com/shariqh/blog-site",
  },
  {
    name: "portalrewards",
    description:
      "A gateway for brands to build consumer loyalty programs with scan-to-earn rewards.",
    kind: "product",
    site: "https://portalrewards.com",
  },
  {
    name: "home-server-docker-compose",
    description:
      "A collection of docker-compose files I use to run my home server. With comments.",
    kind: "tool",
    repo: "https://github.com/shariqh/home-server-docker-compose",
  },
  {
    name: "bullmq + bull-board + redis docker starter",
    description:
      "Quickstart for running BullMQ with Bull-Board behind Redis, in Docker.",
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
    description:
      "Internal presentation on engineering management during attrition.",
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

/** Only allow http(s) project URLs into hrefs (defends against javascript:/data: values). */
export function safeHref(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? url : undefined;
  } catch {
    return undefined;
  }
}
