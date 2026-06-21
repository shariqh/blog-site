import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getImageConfig, getVisionConfig } from './config'

const SAVED = { ...process.env }
beforeEach(() => {
  delete process.env.AZURE_OPENAI_ENDPOINT
  delete process.env.AZURE_OPENAI_KEY
  delete process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT
  delete process.env.AZURE_OPENAI_VISION_DEPLOYMENT
})
afterEach(() => {
  process.env = { ...SAVED }
})

describe('getImageConfig', () => {
  it('throws a clear error when creds are missing', () => {
    expect(() => getImageConfig()).toThrow(/AZURE_OPENAI_ENDPOINT/)
  })
  it('returns config with the default deployment when set', () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://x.openai.azure.com'
    process.env.AZURE_OPENAI_KEY = 'k'
    expect(getImageConfig()).toEqual({
      endpoint: 'https://x.openai.azure.com',
      key: 'k',
      deployment: 'gpt-image-1',
    })
  })
})

describe('getVisionConfig', () => {
  it('defaults the vision deployment to gpt-4o-mini', () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://x.openai.azure.com'
    process.env.AZURE_OPENAI_KEY = 'k'
    expect(getVisionConfig().deployment).toBe('gpt-4o-mini')
  })
})
