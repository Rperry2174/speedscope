import * as fs from 'fs'
import * as path from 'path'

import {compareProfileGroups} from '../lib/profile-parity'
import {setExperimentOverridesForTesting} from '../lib/runtime-config'
import {checkProfileSnapshot} from '../lib/test-utils'
import {importProfilesFromArrayBuffer} from './index'

async function importCallgrindFixture(
  fixturePath: string,
  overrides: Parameters<typeof setExperimentOverridesForTesting>[0],
) {
  const buffer = fs.readFileSync(fixturePath)
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  setExperimentOverridesForTesting(overrides)
  try {
    const imported = await importProfilesFromArrayBuffer(path.basename(fixturePath), arrayBuffer)
    if (!imported) {
      throw new Error(`Failed to import fixture ${fixturePath}`)
    }
    return imported
  } finally {
    setExperimentOverridesForTesting(null)
  }
}

test('importFromCallgrind', async () => {
  await checkProfileSnapshot('./sample/profiles/callgrind/callgrind.example.log')
})

test('importFromCallgrind name compression', async () => {
  await checkProfileSnapshot('./sample/profiles/callgrind/callgrind.name-compression.log')
})

test('importFromCallgrind multiple event types', async () => {
  await checkProfileSnapshot('./sample/profiles/callgrind/callgrind.multiple-event-types.log')
})

test('importFromCallgrind subposition compression', async () => {
  await checkProfileSnapshot('./sample/profiles/callgrind/callgrind.subposition-compression.log')
})

test('importFromCallgrind cfn reset', async () => {
  await checkProfileSnapshot('./sample/profiles/callgrind/callgrind.cfn-reset.log')
})

test('importFromCallgrind Rust path preserves TypeScript parity', async () => {
  const fixturePath = './sample/profiles/callgrind/callgrind.multiple-event-types.log'
  const legacy = await importCallgrindFixture(fixturePath, {
    rustCallgrindImport: false,
  })
  const experimental = await importCallgrindFixture(fixturePath, {
    rustCallgrindImport: true,
  })

  expect(compareProfileGroups(legacy, experimental)).toEqual([])
})
