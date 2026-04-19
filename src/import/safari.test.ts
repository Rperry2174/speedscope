import {checkProfileSnapshot} from '../lib/test-utils'
import {setExperimentOverridesForTesting} from '../lib/runtime-config'

test('importFromSafari', async () => {
  await checkProfileSnapshot('./sample/profiles/Safari/13.1/simple.html-recording.json')
})

describe('rust safari importer parity', () => {
  afterEach(() => {
    setExperimentOverridesForTesting(null)
  })

  test('imports the Safari fixture when enabled', async () => {
    setExperimentOverridesForTesting({rustImportParsers: true})
    await checkProfileSnapshot('./sample/profiles/Safari/13.1/simple.html-recording.json')
  })
})
