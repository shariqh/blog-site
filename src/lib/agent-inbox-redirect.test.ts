import { describe, expect, it } from "vitest";
import { onRequest } from "../../functions/_middleware";
import { AGENT_INBOX_HOME, agentInboxRedirect } from "./agent-inbox-redirect";
import { active } from "./projects";

const at = (path: string) => new URL(path, "https://shariq.dev");

describe("agentInboxRedirect", () => {
  it.each([
    "/agent-inbox",
    "/agent-inbox/",
    "/agent-inbox/index.html",
    "/agent-inbox/vendor/three-0.186.0/three.module.js",
    "/Agent-Inbox/",
  ])("sends %s to the new page", (path) => {
    expect(agentInboxRedirect(at(path))).toBe(AGENT_INBOX_HOME);
  });

  it("keeps the query string", () => {
    expect(agentInboxRedirect(at("/agent-inbox/?ref=x"))).toBe(
      `${AGENT_INBOX_HOME}?ref=x`,
    );
  });

  it.each([
    "/",
    "/projects/",
    "/blog/terminal-scroll-is-not-a-workflow/",
    "/agent-inboxes/",
    "/blog/agent-inbox/",
  ])("leaves %s alone", (path) => {
    expect(agentInboxRedirect(at(path))).toBeNull();
  });

  it("targets an https page off shariq.dev", () => {
    const target = new URL(AGENT_INBOX_HOME);
    expect(target.protocol).toBe("https:");
    expect(target.hostname).not.toBe("shariq.dev");
  });

  it("matches the Projects page link", () => {
    const entry = active.find((p) => p.name === "Agent Inbox");
    expect(entry?.site).toBe(AGENT_INBOX_HOME);
  });
});

describe("middleware", () => {
  const next = async () => new Response("asset", { status: 200 });

  it("answers the old page with a 301 to the new page", async () => {
    const res = await onRequest({
      request: new Request("https://shariq.dev/agent-inbox/"),
      next,
    });
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(AGENT_INBOX_HOME);
  });

  it("sends www's old page straight to the new page", async () => {
    const res = await onRequest({
      request: new Request("https://www.shariq.dev/agent-inbox"),
      next,
    });
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(AGENT_INBOX_HOME);
  });

  it("still sends www to the bare domain", async () => {
    const res = await onRequest({
      request: new Request("https://www.shariq.dev/projects/?a=1"),
      next,
    });
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(
      "https://shariq.dev/projects/?a=1",
    );
  });

  it("serves every other page as before", async () => {
    const res = await onRequest({
      request: new Request("https://shariq.dev/projects/"),
      next,
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("asset");
  });
});
