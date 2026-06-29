import { getGatewayConfig } from './config.js';

const GENERATE_TIMEOUT_MS = 200_000; // > gpt-image-1 worst case (~180s) + proxy overhead
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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
    // The result is written verbatim as a public cover.png — never trust a 2xx blindly.
    // Validate the actual PNG signature so a misrouted/error body can't be published as an image.
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_MAGIC)) {
      throw new Error(`gateway generate: response is not a valid PNG (${buf.length} bytes)`);
    }
    return buf;
  } finally {
    clearTimeout(t);
  }
}
