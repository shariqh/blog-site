import { describe, it, expect, vi, beforeEach } from 'vitest';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

beforeEach(() => {
  process.env.IMAGE_GATEWAY_URL = 'https://gw.test';
  process.env.IMAGE_GATEWAY_TOKEN = 'tok';
});

describe('generateImage', () => {
  it('POSTs the gateway generate endpoint and returns PNG bytes', async () => {
    const png = Buffer.concat([PNG_MAGIC, Buffer.from('the rest of the image bytes')]);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(png, { status: 200, headers: { 'content-type': 'image/png' } }),
    );
    const { generateImage } = await import('./azure.js');
    const out = await generateImage('a cover prompt');
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://gw.test/v1/images/generate');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body as string)).toMatchObject({ prompt: 'a cover prompt', size: '1536x1024', quality: 'high', output_format: 'png' });
    expect(out.equals(png)).toBe(true);
    fetchSpy.mockRestore();
  });
  it('throws on non-2xx', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('err', { status: 502 }));
    const { generateImage } = await import('./azure.js');
    await expect(generateImage('p')).rejects.toThrow();
    fetchSpy.mockRestore();
  });
  it('throws when a 2xx body is not a PNG (misrouted HTML/JSON)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>not an image</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    );
    const { generateImage } = await import('./azure.js');
    await expect(generateImage('p')).rejects.toThrow(/not a valid PNG/);
    fetchSpy.mockRestore();
  });
  it('throws when streamed body exceeds MAX_IMAGE_BYTES (26 MB across chunks)', async () => {
    // Build a ReadableStream that pushes >25MB of data in chunks.
    const chunk = new Uint8Array(10 * 1024 * 1024); // 10 MB per chunk
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.enqueue(chunk); // 30 MB total — exceeds 25 MB cap
        controller.close();
      },
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(stream, { status: 200 }),
    );
    const { generateImage } = await import('./azure.js');
    await expect(generateImage('p')).rejects.toThrow(/too large/);
    fetchSpy.mockRestore();
  });
});
