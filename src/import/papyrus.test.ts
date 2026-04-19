import fs from 'fs'
import {dumpProfile, checkProfileSnapshot} from '../lib/test-utils'
import {StringBackedTextFileContent} from './utils'
import {importFromPapyrus, importFromPapyrusTs} from './papyrus'

test('importFromPapyrus script profile', async () => {
  await checkProfileSnapshot('./sample/profiles/papyrus/script.log')
})

test('importFromPapyrus stack profile', async () => {
  await checkProfileSnapshot('./sample/profiles/papyrus/stack.log')
})

test('importFromPapyrus Rust parser matches TypeScript fallback', async () => {
  for (const path of ['./sample/profiles/papyrus/script.log', './sample/profiles/papyrus/stack.log']) {
    const contents = fs.readFileSync(path, 'utf8')
    const rustProfile = await importFromPapyrus(new StringBackedTextFileContent(contents))
    const tsProfile = importFromPapyrusTs(new StringBackedTextFileContent(contents))
    expect(dumpProfile(rustProfile)).toEqual(dumpProfile(tsProfile))
  }
})
