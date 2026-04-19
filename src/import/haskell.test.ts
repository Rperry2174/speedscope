import {checkProfileSnapshot} from '../lib/test-utils'
import {importProfilesFromArrayBuffer} from '.'
import * as fs from 'fs'
import * as path from 'path'

test('importFromHaskell', async () => {
  await checkProfileSnapshot('./sample/profiles/haskell/simple.prof')
})

test('importFromHaskell remains importable without rust firefox flag', async () => {
  const filepath = './sample/profiles/haskell/simple.prof'
  const buffer = fs.readFileSync(filepath)
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  const profileGroup = await importProfilesFromArrayBuffer(path.basename(filepath), arrayBuffer)
  expect(profileGroup?.profiles.length).toBe(2)
})
