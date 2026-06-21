import 'dotenv/config'

function trimmed(key: string): string {
  const v = process.env[key]
  return v && v.length > 0 ? v : ''
}

// Strip a single trailing slash so callers can always join paths with a leading slash.
function endpoint(): string {
  return trimmed('AZURE_OPENAI_ENDPOINT').replace(/\/$/, '')
}

function requireCreds(): { endpoint: string; key: string } {
  const ep = endpoint()
  const key = trimmed('AZURE_OPENAI_KEY')
  if (!ep || !key) {
    throw new Error(
      'Cover generation needs AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_KEY (set them in .env.local or the environment).'
    )
  }
  return { endpoint: ep, key }
}

export function getImageConfig(): { endpoint: string; key: string; deployment: string } {
  const { endpoint, key } = requireCreds()
  return { endpoint, key, deployment: trimmed('AZURE_OPENAI_IMAGE_DEPLOYMENT') || 'gpt-image-1' }
}

export function getVisionConfig(): { endpoint: string; key: string; deployment: string } {
  const { endpoint, key } = requireCreds()
  return { endpoint, key, deployment: trimmed('AZURE_OPENAI_VISION_DEPLOYMENT') || 'gpt-4o-mini' }
}
