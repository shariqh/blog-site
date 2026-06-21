import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { hasText } from './text-check'

beforeEach(() => {
  process.env.AZURE_OPENAI_ENDPOINT = 'https://x.openai.azure.com'
  process.env.AZURE_OPENAI_KEY = 'k'
  process.env.AZURE_OPENAI_VISION_DEPLOYMENT = 'gpt-4o-mini'
})
afterEach(() => vi.restoreAllMocks())

function reply(content: string) {
  return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) }
}

describe('hasText', () => {
  it('returns true when the model answers yes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply('YES')))
    expect(await hasText(Buffer.from('img'))).toBe(true)
  })
  it('returns false when the model answers no', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply('no')))
    expect(await hasText(Buffer.from('img'))).toBe(false)
  })
  it('sends the image as a base64 data URL in the vision message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply('no'))
    vi.stubGlobal('fetch', fetchMock)
    await hasText(Buffer.from('img'))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    const imagePart = body.messages[0].content.find((p: any) => p.type === 'image_url')
    expect(imagePart.image_url.url).toMatch(/^data:image\/png;base64,/)
  })
  it('fails safe to true on an API error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'err' }))
    expect(await hasText(Buffer.from('img'))).toBe(true)
  })
  it('fails safe to true when fetch throws (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    expect(await hasText(Buffer.from('img'))).toBe(true)
  })
  it('fails safe to true when the model returns an unexpected/unparseable body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply('I cannot assist with that request.')))
    expect(await hasText(Buffer.from('img'))).toBe(true)
  })
  it('fails safe to true when the model returns an empty string', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply('')))
    expect(await hasText(Buffer.from('img'))).toBe(true)
  })
})
