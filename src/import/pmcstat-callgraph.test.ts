import * as fs from 'fs'
import {dumpProfile, checkProfileSnapshot} from '../lib/test-utils'
import {StringBackedTextFileContent} from './utils'
import {importFromPMCStatCallGraph, importFromPMCStatCallGraphTs} from './pmcstat-callgraph'

test('importFromPMCStatCallGraph', async () => {
  await checkProfileSnapshot('./sample/profiles/pmcstat/simple.txt')
})

test('importFromPMCStatCallGraph with invalid lines', async () => {
  await checkProfileSnapshot('./sample/profiles/pmcstat/simple-with-invalids.txt')
})

test('importFromPMCStatCallGraph rust parity', async () => {
  const text = fs.readFileSync('./sample/profiles/pmcstat/simple-with-invalids.txt', 'utf8')
  const tsProfile = importFromPMCStatCallGraphTs(new StringBackedTextFileContent(text))
  const rustProfile = await importFromPMCStatCallGraph(new StringBackedTextFileContent(text))

  expect(tsProfile).not.toBeNull()
  expect(rustProfile).not.toBeNull()
  expect(dumpProfile(rustProfile!)).toEqual(dumpProfile(tsProfile!))
})
