import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateImage } from './azure'

const SAVED = { ...process.env }
beforeEach(() => {
  process.env.AZURE_OPENAI_ENDPOINT = 'https://x.openai.azure.com'
  process.env.AZURE_OPENAI_KEY = 'k'
  process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT = 'gpt-image-1'
})
afterEach(() => {
  process.env = { ...SAVED }
  vi.restoreAllMocks()
})

const PNG_B64 = Buffer.from('hello-png').toString('base64')

describe('generateImage', () => {
  it('POSTs to the images endpoint and returns decoded PNG bytes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ b64_json: PNG_B64 }] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const buf = await generateImage('a prompt')
    expect(buf.toString()).toBe('hello-png')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(
      'https://x.openai.azure.com/openai/deployments/gpt-image-1/images/generations?api-version=2025-04-01-preview'
    )
    expect(init.headers['api-key']).toBe('k')
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({ prompt: 'a prompt', n: 1, size: '1536x1024', quality: 'high', output_format: 'png' })
  })

  it('throws on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => 'rate limited' }))
    await expect(generateImage('p')).rejects.toThrow(/429/)
  })

  it('throws when no image is returned', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{}] }) }))
    await expect(generateImage('p')).rejects.toThrow(/no image/i)
  })
})
