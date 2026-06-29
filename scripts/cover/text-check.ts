import { getGatewayConfig } from './config.js';

const CHECK_TIMEOUT_MS = 60_000;

export async function hasText(png: Buffer): Promise<boolean> {
  // Read config OUTSIDE the fail-safe catch: a missing IMAGE_GATEWAY_URL/TOKEN is a
  // deployment error that must surface, not be silently masked as "has text" (which would
  // turn every cover into a branded fallback with no error).
  const { url, token } = getGatewayConfig();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), CHECK_TIMEOUT_MS);
    try {
      const res = await fetch(`${url}/v1/vision/check-text`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'image/png', 'x-client': 'blog-site' },
        body: png as unknown as BodyInit, signal: ctrl.signal,
      });
      if (!res.ok) return true; // fail safe -> forces retry / fallback
      const json = (await res.json()) as { hasText?: boolean };
      return typeof json.hasText === 'boolean' ? json.hasText : true;
    } finally {
      clearTimeout(t);
    }
  } catch {
    return true; // network/abort/parse failures fail safe to "has text"
  }
}
