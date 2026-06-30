import { getGatewayConfig } from './config.js';

const GENERATE_TIMEOUT_MS = 200_000; // > gpt-image-1 worst case (~180s) + proxy overhead
const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // gpt-image-1 PNGs are ~1.5MB; cap absurd responses
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
    // Reject an oversized response up front (Content-Length) before buffering it.
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > MAX_IMAGE_BYTES) {
      throw new Error(`gateway generate: response too large (${declared} bytes)`);
    }
    // The result is written verbatim as a public cover.png — never trust a 2xx blindly.
    // Stream the body and abort mid-stream if accumulated bytes exceed the cap, so a gateway
    // that omits/lies about Content-Length cannot OOM the process.
    if (!res.body) throw new Error('gateway generate: response body is null');
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > MAX_IMAGE_BYTES) {
          await reader.cancel();
          throw new Error(`gateway generate: response too large (>${MAX_IMAGE_BYTES} bytes)`);
        }
        chunks.push(value);
      }
    } finally {
      // Ensure the reader is always released, even if read() itself throws (e.g. AbortError).
      reader.releaseLock();
    }
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_MAGIC)) {
      throw new Error(`gateway generate: response is not a valid PNG (${buf.length} bytes)`);
    }
    return buf;
  } finally {
    clearTimeout(t);
  }
}
