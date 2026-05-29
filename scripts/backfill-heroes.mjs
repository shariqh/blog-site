// One-shot migration: for each post that has an inline <Image> banner,
// promote it to the frontmatter hero block and remove the inline tag.
// After this runs, delete the file (it's a single-use script).

import { readFileSync, writeFileSync } from "node:fs";

const POSTS = [
  {
    file: "src/content/writing/be-shamelessly-cutting-edge.mdx",
    image: "/static/images/blog/be-shamelessly-cutting-edge/banner.png",
    alt: "Be Shamelessly Cutting Edge banner",
  },
  {
    file: "src/content/writing/best-blogging-resources.mdx",
    image: "/static/images/blog/best-blogging-resources/banner.png",
    alt: "Best Blogging Resources banner",
  },
  {
    file: "src/content/writing/cloud-native-flow.mdx",
    image: "/static/images/blog/cloud-native-flow/banner.png",
    alt: "A Cloud Native CI/CD Flow banner",
  },
  {
    file: "src/content/writing/docker-env-arg-heroku-github-actions-guide.mdx",
    image: "/static/images/blog/docker_env_arg-heroku-github_actions-guide/banner.png",
    alt: "Deploy Microservices with Docker on Heroku and GitHub Actions banner",
  },
  {
    file: "src/content/writing/ethics-of-software-engineering.mdx",
    image: "/static/images/blog/ethics-of-software-engineering/banner.png",
    alt: "Ethics of Software Engineering banner",
  },
  {
    file: "src/content/writing/managing-your-lows.mdx",
    image: "/static/images/blog/managing-your-lows/banner.png",
    alt: "Managing Your Lows banner",
  },
  {
    file: "src/content/writing/moving-up-in-technical-leadership.mdx",
    image: "/static/images/blog/moving-up-in-technical-leadership/banner.png",
    alt: "Five Skills to Move Up in Technical Leadership banner",
  },
  {
    file: "src/content/writing/nestjs-docker-heroku-github-actions-guide.mdx",
    image: "/static/images/blog/nestjs-docker-heroku-github_actions-guide/banner.png",
    alt: "Deploy NestJS with Docker, Heroku, and GitHub Actions banner",
  },
  {
    file: "src/content/writing/nextjs-and-tailwindcss-made-me-want-to-write-front_end-code.mdx",
    image: "/static/images/blog/nextjs-and-tailwindcss-made-me-want-to-write-front_end-code/banner.png",
    alt: "Next.js and TailwindCSS banner",
  },
  {
    file: "src/content/writing/nextjs-context-api-tutorial.mdx",
    image: "/static/images/blog/nextjs-context-api-tutorial/banner.png",
    alt: "Next.js Context API Tutorial banner",
  },
  {
    file: "src/content/writing/sonarqube-docker-guide.mdx",
    image: "/static/images/blog/sonarqube-docker-guide/banner.png",
    alt: "Launching a SonarQube Docker Container banner",
  },
  {
    file: "src/content/writing/docker-series/pt-1-installing-docker-and-docker-compose.mdx",
    image: "/static/images/blog/docker-series/pt-1-installing-docker-and-docker-compose/banner.png",
    alt: "Installing Docker and Docker Compose banner",
  },
];

let touched = 0;

for (const post of POSTS) {
  let body = readFileSync(post.file, "utf8");

  // 1) Add hero to frontmatter (after summary line, before closing ---).
  if (!body.includes("hero:")) {
    const fmEnd = body.indexOf("\n---\n", 4);
    if (fmEnd === -1) {
      console.warn(`  no frontmatter end in ${post.file}, skipping`);
      continue;
    }
    const heroBlock = `hero:\n  image: '${post.image}'\n  alt: '${post.alt}'\n`;
    body = body.slice(0, fmEnd) + "\n" + heroBlock + body.slice(fmEnd + 1);
  }

  // 2) Remove the inline <Image ...> tag that points at the same banner.
  // The component spans multiple lines; match from <Image to the next /> on
  // its own (closing tag varies by file).
  const inlineImageRe = /<Image[^>]*?\bsrc=\{?\s*'\/static\/images\/blog\/[^']+'\s*\}?[\s\S]*?\/>\s*/g;
  const before = body;
  body = body.replace(inlineImageRe, "");

  if (before === body && !before.includes("hero:")) {
    console.warn(`  ${post.file}: hero added but no inline Image was removed (manual check)`);
  }

  writeFileSync(post.file, body);
  touched++;
  console.log(`migrated ${post.file}`);
}

console.log(`\n${touched} posts migrated.`);
