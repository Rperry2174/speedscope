import * as fs from 'fs'
import * as path from 'path'

import {exportProfileGroup} from '../lib/file-format'
import {setExperimentOverridesForTesting} from '../lib/runtime-config'
import {importProfileGroupFromText, importProfilesFromArrayBuffer} from '.'

test('importProfileGroup', async () => {
  // Importing garbage should return null
  expect(await importProfileGroupFromText('unknown', '')).toBe(null)
  expect(await importProfileGroupFromText('unknown', 'Hello world')).toBe(null)
  expect(await importProfileGroupFromText('unknown', 'Hello\n\nWorld')).toBe(null)

  // Importing from a version of stackprof which was missing raw_timestamp_deltas should return null
  const oldStackprof = `{"version":1.2,"mode":"wall","interval":1000,"samples":0,"gc_samples":0,"missed_samples":0,"frames":{}}`
  expect(await importProfileGroupFromText('unknown', oldStackprof)).toBe(null)
})

test('rust Haskell importer matches TypeScript fallback', async () => {
  const fixturePath = path.join(process.cwd(), 'sample/profiles/haskell/simple.prof')
  const buffer = fs.readFileSync(fixturePath)
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)

  setExperimentOverridesForTesting({rustHaskellImport: false})
  const legacy = await importProfilesFromArrayBuffer('simple.prof', arrayBuffer)

  setExperimentOverridesForTesting({rustHaskellImport: true})
  const experimental = await importProfilesFromArrayBuffer('simple.prof', arrayBuffer)

  setExperimentOverridesForTesting(null)

  expect(legacy).not.toBeNull()
  expect(experimental).not.toBeNull()
  expect(exportProfileGroup(experimental!)).toEqual(exportProfileGroup(legacy!))
})
