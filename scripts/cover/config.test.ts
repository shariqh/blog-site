import { describe, it, expect } from 'vitest';
import { getGatewayConfig } from './config.js';

describe('getGatewayConfig', () => {
  it('reads url + token from env', () => {
    process.env.IMAGE_GATEWAY_URL = 'https://img-gateway.shariq.dev';
    process.env.IMAGE_GATEWAY_TOKEN = 'tok';
    expect(getGatewayConfig()).toEqual({ url: 'https://img-gateway.shariq.dev', token: 'tok' });
  });
  it('throws when token missing', () => {
    process.env.IMAGE_GATEWAY_URL = 'https://x'; delete process.env.IMAGE_GATEWAY_TOKEN;
    expect(() => getGatewayConfig()).toThrow(/IMAGE_GATEWAY_TOKEN/);
  });
});
