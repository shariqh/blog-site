import { getGatewayConfig } from './config.js';

const GENERATE_TIMEOUT_MS = 200_000; // > gpt-image-1 worst case (~180s) + proxy overhead

export async function generateImage(prompt: string): Promise<Buffer> {
  const { url, token } = getGatewayConfig();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), GENERATE_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/v1/images/generate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-client': 'blog-site' },
      body: JSON.stringify({ prompt, size: '1536x1024', quality: 'high', output_format: 'png' }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`gateway generate failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(t);
  }
}
