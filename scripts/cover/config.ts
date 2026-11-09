import { config as loadEnv } from 'dotenv'

// Local runs: load .env.local first (wins over .env) then fall back to .env.
// Neither call overrides already-set process.env vars (dotenv's default).
// CI skips both: the working directory may be a checkout of another branch, and
// CI passes its settings through the environment.
export function loadLocalEnv(
  env: NodeJS.ProcessEnv = process.env,
  load: (options?: { path: string }) => unknown = loadEnv,
): boolean {
  if (env.GITHUB_ACTIONS === 'true' || env.CI === 'true') return false
  load({ path: '.env.local' })
  load()
  return true
}

loadLocalEnv()

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
