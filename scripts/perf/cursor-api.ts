import {execFileSync} from 'child_process'

export interface CursorModelResponse {
  items: string[]
}

export interface CursorApiClient {
  listModels(): Promise<string[]>
}

function parseCursorModelsResponse(raw: string): string[] {
  const data = JSON.parse(raw) as CursorModelResponse
  return data.items
}

function fetchCursorModelsWithCurl(apiKey: string): string[] {
  const raw = execFileSync(
    'curl',
    ['-sS', '--fail', '-u', `${apiKey}:`, 'https://api.cursor.com/v1/models'],
    {encoding: 'utf8'},
  )
  return parseCursorModelsResponse(raw)
}

export async function fetchCursorModels(apiKey: string): Promise<string[]> {
  try {
    return fetchCursorModelsWithCurl(apiKey)
  } catch (curlError) {
    // Fallback to fetch in environments where curl is unavailable.
  }

  try {
    const response = await fetch('https://api.cursor.com/v1/models', {
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch Cursor models: ${response.status} ${response.statusText}`)
    }

    return parseCursorModelsResponse(await response.text())
  } catch (error) {
    throw error
  }
}

export function createApiClient(apiKey: string): CursorApiClient {
  return {
    async listModels() {
      return fetchCursorModels(apiKey)
    },
  }
}

function modelMatches(modelId: string, fragments: string[]) {
  const normalized = modelId.toLowerCase()
  return fragments.every(fragment => normalized.includes(fragment.toLowerCase()))
}

export function selectCursorModel(models: string[], preference: string): string {
  const prefer = preference.toLowerCase()

  if (prefer === 'composer-2') {
    const exact = models.find(model => model === 'composer-2')
    if (exact) return exact
  }

  if (prefer === 'gpt-5.4') {
    const preferred =
      models.find(model => modelMatches(model, ['gpt', '5.4', 'high'])) ||
      models.find(model => modelMatches(model, ['gpt', '5.4']))
    if (preferred) return preferred
  }

  if (prefer === 'opus-4.6') {
    const preferred =
      models.find(model => modelMatches(model, ['opus', '4.6'])) ||
      models.find(model => modelMatches(model, ['claude', '4.6', 'opus']))
    if (preferred) return preferred
  }

  throw new Error(
    `Could not resolve requested model family "${preference}". Available models: ${models.join(', ')}`,
  )
}

export function ensureRequestedModelFamilies(models: string[], preferences: string[]) {
  preferences.forEach(preference => {
    selectCursorModel(models, preference)
  })
}
