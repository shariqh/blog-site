import { getVisionConfig } from './config'

const API_VERSION = '2024-10-21'
const QUESTION =
  'Does this image contain READABLE WORDS, captions, labels, headlines, or full sentences — actual spelled-out prose text a person could read (for example a word written on an object, a sign, or a caption)? Answer NO for logos and brand marks, code symbols like </> or {}, abstract or illegible squiggles meant to suggest code, single decorative letters, and numbers that are part of an icon or logo. Answer YES only if there is legible word-text that would visually compete with a title. Reply with only "yes" or "no".'

// Provider-agnostic in spirit: the agent MAY swap this for its in-process Claude
// vision. The default uses an Azure gpt-4o-mini chat-completions vision call.
export async function hasText(png: Buffer): Promise<boolean> {
  const { endpoint, key, deployment } = getVisionConfig()
  const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${API_VERSION}`
  const dataUrl = `data:image/png;base64,${png.toString('base64')}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        max_tokens: 3,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: QUESTION },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    })
    if (!res.ok) return true
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const answer = (json.choices?.[0]?.message?.content ?? '').trim().toLowerCase()
    return answer.startsWith('y')
  } catch {
    return true
  }
}
