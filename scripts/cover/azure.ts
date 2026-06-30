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
    // Stream the body into a single preallocated buffer so we can enforce the byte cap
    // incrementally without a second full allocation from Buffer.concat.
    if (!res.body) throw new Error('gateway generate: response body is null');
    const reader = res.body.getReader();
    // Preallocate the maximum allowed size; we'll subarray to actual length afterward.
    const preallocated = Buffer.allocUnsafe(MAX_IMAGE_BYTES);
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        // Reject before copying so an oversized chunk is never written into the buffer.
        if (total + value.length > MAX_IMAGE_BYTES) {
          await reader.cancel();
          throw new Error(`gateway generate: response too large (>${MAX_IMAGE_BYTES} bytes)`);
        }
        preallocated.set(value, total);
        total += value.length;
      }
    } finally {
      // Ensure the reader is always released, even if read() itself throws (e.g. AbortError).
      reader.releaseLock();
    }
    const buf = preallocated.subarray(0, total);
    if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_MAGIC)) {
      throw new Error(`gateway generate: response is not a valid PNG (${buf.length} bytes)`);
    }
    return buf;
  } finally {
    clearTimeout(t);
  }
}
