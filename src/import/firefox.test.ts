import {checkProfileSnapshot} from '../lib/test-utils'
import * as fs from 'fs'
import * as path from 'path'
import {extractFirefoxImportPayload, importFromFirefox} from './firefox'
import {importFromFirefoxArrayBuffer} from './firefox-rust'
import {setExperimentOverridesForTesting} from '../lib/runtime-config'
import {dumpProfile} from '../lib/test-utils'

async function loadFirefoxProfile(relativePath: string) {
  const absolutePath = path.join(process.cwd(), relativePath)
  const buffer = fs.readFileSync(absolutePath)
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  return {absolutePath, arrayBuffer}
}

test('importFromFirefox', async () => {
  await checkProfileSnapshot('./sample/profiles/Firefox/59/simple-firefox.json')
})

test('importFromFirefox recursion', async () => {
  await checkProfileSnapshot('./sample/profiles/Firefox/61/recursion.json')
})

test('importFromFirefox ignore self-hosted', async () => {
  await checkProfileSnapshot('./sample/profiles/Firefox/63/simple-firefox.json')
})

describe('rust firefox importer parity', () => {
  test('matches TypeScript payload extraction for representative fixtures', async () => {
    const fixtures = [
      './sample/profiles/Firefox/59/simple-firefox.json',
      './sample/profiles/Firefox/61/recursion.json',
      './sample/profiles/Firefox/63/simple-firefox.json',
    ]

    for (const fixture of fixtures) {
      const {absolutePath, arrayBuffer} = await loadFirefoxProfile(fixture)
      const parsed = JSON.parse(fs.readFileSync(absolutePath, 'utf8'))
      const rustPayload = await importFromFirefoxArrayBuffer(arrayBuffer)
      expect(rustPayload).toEqual(extractFirefoxImportPayload(parsed))
    }
  })

  test('import path stays aligned when rust flag is enabled', async () => {
    const fixture = './sample/profiles/Firefox/59/simple-firefox.json'
    const {absolutePath, arrayBuffer} = await loadFirefoxProfile(fixture)
    const parsed = JSON.parse(fs.readFileSync(absolutePath, 'utf8'))
    const legacyProfile = importFromFirefox(parsed)

    setExperimentOverridesForTesting({rustFirefoxImport: true})
    try {
      const experimentalModule = await import('./index')
      const profileGroup = await experimentalModule.importProfilesFromArrayBuffer(
        path.basename(fixture),
        arrayBuffer,
      )
      expect(profileGroup).not.toBeNull()
      expect(profileGroup!.profiles).toHaveLength(1)
      expect(dumpProfile(profileGroup!.profiles[0])).toEqual(dumpProfile(legacyProfile))
    } finally {
      setExperimentOverridesForTesting(null)
    }
  })
})
