// Agent Inbox's page moved from shariq.dev/agent-inbox/ to Bundle's site.
// functions/_middleware.ts sends /agent-inbox and everything under it to the
// new page with a 301, and the Projects page links there directly.
export const AGENT_INBOX_HOME = "https://bundleapps.io/agent-inbox/";

// The old page lived at /agent-inbox/ with its assets under /agent-inbox/vendor/.
const OLD_PATH = /^\/agent-inbox(?:\/.*)?$/i;

/**
 * Where a request to the old Agent Inbox page should go, or null when the path
 * isn't one of the old page's. Every old path goes to the one new page, since
 * the new site's paths don't mirror the old ones. The query string is kept.
 */
export function agentInboxRedirect(url: URL): string | null {
  if (!OLD_PATH.test(url.pathname)) return null;
  const target = new URL(AGENT_INBOX_HOME);
  target.search = url.search;
  return target.toString();
}
