import { getImageConfig } from './config'

const API_VERSION = '2025-04-01-preview'

export async function generateImage(prompt: string): Promise<Buffer> {
  const { endpoint, key, deployment } = getImageConfig()
  const url = `${endpoint}/openai/deployments/${deployment}/images/generations?api-version=${API_VERSION}`
  const res = await fetch(url, {
    method: 'POST',
    signal: AbortSignal.timeout(120000),
    headers: { 'api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({
      prompt,
      n: 1,
      size: '1536x1024',
      quality: 'high',
      output_format: 'png',
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`gpt-image-1 request failed: ${res.status} ${detail.slice(0, 300)}`)
  }
  const json = (await res.json()) as { data?: Array<{ b64_json?: string }> }
  const b64 = json.data?.[0]?.b64_json
  if (!b64) throw new Error('gpt-image-1 returned no image')
  return Buffer.from(b64, 'base64')
}
