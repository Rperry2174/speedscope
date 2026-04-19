import * as fs from 'fs'

import {dumpProfile} from '../lib/test-utils'
import {importProfilesFromArrayBuffer} from './index'
import {loadRustV8ProfLogImporter} from './v8-prof-log-rust'
import {importFromV8ProfLogTs, V8LogProfile} from './v8proflog'
import {setExperimentOverridesForTesting} from '../lib/runtime-config'

test('importFromV8ProfLog', async () => {
  const fixturePath = './sample/profiles/node/fixture.v8log.json'
  const fileBuffer = fs.readFileSync(fixturePath)
  const arrayBuffer = fileBuffer.buffer.slice(
    fileBuffer.byteOffset,
    fileBuffer.byteOffset + fileBuffer.byteLength,
  )
  const imported = await importProfilesFromArrayBuffer('fixture.v8log.json', arrayBuffer)
  expect(imported).not.toBeNull()
  expect(dumpProfile(imported!.profiles[0])).toMatchSnapshot()
})

test('rust v8 prof log importer matches TypeScript implementation for representative fixture', async () => {
  const fixturePath = './sample/profiles/node/fixture.v8log.json'
  const fixtureText = fs.readFileSync(fixturePath, 'utf8')
  const fixture = JSON.parse(fixtureText) as V8LogProfile

  const rustImport = await loadRustV8ProfLogImporter()
  const rustProfile = rustImport(Uint8Array.from(Buffer.from(fixtureText)))
  const tsProfile = importFromV8ProfLogTs(fixture)

  expect(dumpProfile(rustProfile)).toEqual(dumpProfile(tsProfile))
})

test('array buffer import stays aligned when rust v8 prof log experiment is enabled', async () => {
  const fixturePath = './sample/profiles/node/fixture.v8log.json'
  const fileBuffer = fs.readFileSync(fixturePath)
  const arrayBuffer = fileBuffer.buffer.slice(
    fileBuffer.byteOffset,
    fileBuffer.byteOffset + fileBuffer.byteLength,
  )

  const legacy = await importProfilesFromArrayBuffer('fixture.v8log.json', arrayBuffer)

  setExperimentOverridesForTesting({rustV8ProfLog: true})
  try {
    const experimental = await importProfilesFromArrayBuffer('fixture.v8log.json', arrayBuffer)
    expect(experimental).not.toBeNull()
    expect(legacy).not.toBeNull()
    expect(dumpProfile(experimental!.profiles[0])).toEqual(dumpProfile(legacy!.profiles[0]))
  } finally {
    setExperimentOverridesForTesting(null)
  }
})
