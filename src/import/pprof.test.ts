import {checkProfileSnapshot} from '../lib/test-utils'
import {importAsPprofProfileTs} from './pprof-format'
import {setExperimentOverridesForTesting} from '../lib/runtime-config'
import {importProfilesFromArrayBuffer} from './index'
import {compareProfileGroups} from '../lib/profile-parity'
import * as fs from 'fs'
import * as path from 'path'

test('importAsPprofProfile', async () => {
  await checkProfileSnapshot('./sample/profiles/pprof/simple.prof')
})

test('importAsPprofProfile rust path matches TypeScript fallback', async () => {
  const fixturePath = path.join(process.cwd(), 'sample/profiles/pprof/simple.prof')
  const buffer = fs.readFileSync(fixturePath)
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)

  const directTsProfile = importAsPprofProfileTs(arrayBuffer)
  expect(directTsProfile).toBeNull()

  setExperimentOverridesForTesting({rustPprofImport: false})
  try {
    const legacyGroup = await importProfilesFromArrayBuffer('simple.prof', arrayBuffer)
    expect(legacyGroup).not.toBeNull()

    setExperimentOverridesForTesting({rustPprofImport: true})
    const rustGroup = await importProfilesFromArrayBuffer('simple.prof', arrayBuffer)
    expect(rustGroup).not.toBeNull()
    expect(compareProfileGroups(legacyGroup!, rustGroup!)).toEqual([])
  } finally {
    setExperimentOverridesForTesting(null)
  }
})
