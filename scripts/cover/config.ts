import { config as loadEnv } from 'dotenv'

// Load .env.local first (wins over .env) then fall back to .env.
// Neither call overrides already-set process.env vars (dotenv's default).
loadEnv({ path: '.env.local' })
loadEnv()

export interface GatewayConfig { url: string; token: string }

export function getGatewayConfig(): GatewayConfig {
  const url = process.env.IMAGE_GATEWAY_URL
  const token = process.env.IMAGE_GATEWAY_TOKEN
  if (!url) throw new Error('Missing IMAGE_GATEWAY_URL')
  if (!token) throw new Error('Missing IMAGE_GATEWAY_TOKEN')
  return { url: url.replace(/\/+$/, ''), token }
}
