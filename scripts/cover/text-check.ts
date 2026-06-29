import { getGatewayConfig } from './config.js';

const CHECK_TIMEOUT_MS = 60_000;

export async function hasText(png: Buffer): Promise<boolean> {
  try {
    const { url, token } = getGatewayConfig();
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
    return true; // any error (network/abort/parse) fails safe to "has text"
  }
}
