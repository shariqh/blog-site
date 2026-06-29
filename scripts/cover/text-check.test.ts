import { describe, it, expect, vi, beforeEach } from 'vitest';
beforeEach(() => { process.env.IMAGE_GATEWAY_URL = 'https://gw.test'; process.env.IMAGE_GATEWAY_TOKEN = 'tok'; });

describe('hasText', () => {
  it('returns the gateway hasText value on 200', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ hasText: false }), { status: 200 }));
    const { hasText } = await import('./text-check.js');
    expect(await hasText(Buffer.from('p'))).toBe(false);
    spy.mockRestore();
  });
  it('fails safe to true on non-2xx', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('err', { status: 502 }));
    const { hasText } = await import('./text-check.js');
    expect(await hasText(Buffer.from('p'))).toBe(true);
    spy.mockRestore();
  });
  it('fails safe to true on network error', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('down'));
    const { hasText } = await import('./text-check.js');
    expect(await hasText(Buffer.from('p'))).toBe(true);
    spy.mockRestore();
  });
});
