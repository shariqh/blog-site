import { config as loadEnv } from 'dotenv'

// Load .env.local first (wins over .env) then fall back to .env.
// Neither call overrides already-set process.env vars (dotenv's default).
loadEnv({ path: '.env.local' })
loadEnv()

export interface GatewayConfig { url: string; token: string }

export function getGatewayConfig(): GatewayConfig {
  // Trim so a whitespace-only value (e.g. a botched secret render) is rejected here,
  // not silently turned into an invalid URL/token that the fail-safe later masks.
  const url = (process.env.IMAGE_GATEWAY_URL ?? '').trim()
  const token = (process.env.IMAGE_GATEWAY_TOKEN ?? '').trim()
  if (!url) throw new Error('Missing IMAGE_GATEWAY_URL')
  if (!token) throw new Error('Missing IMAGE_GATEWAY_TOKEN')
  try {
    new URL(url)
  } catch {
    throw new Error(`Invalid IMAGE_GATEWAY_URL: ${JSON.stringify(url)}`)
  }
  return { url: url.replace(/\/+$/, ''), token }
}
