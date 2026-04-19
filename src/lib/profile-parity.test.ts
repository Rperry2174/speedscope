import * as fs from 'fs'
import * as path from 'path'

import {importProfilesFromArrayBuffer} from '../import'
import {compareProfileGroups} from './profile-parity'
import {setExperimentOverridesForTesting} from './runtime-config'

async function importFixtureWithOverrides(
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

describe('profile parity', () => {
  const fixtures = [
    './sample/profiles/Chrome/65/simple.cpuprofile',
    './sample/profiles/Chrome/65/timeline.json',
    './sample/profiles/Firefox/59/firefox.json',
    './sample/profiles/Safari/13.1/simple.html-recording.json',
    './sample/profiles/stackprof/ruby-stackprof.json',
  ]

  for (const fixturePath of fixtures) {
    test(`optimized forEachCall preserves profile parity for ${fixturePath}`, async () => {
      const legacy = await importFixtureWithOverrides(fixturePath, {
        deferDemangle: false,
        rustFuzzyFind: false,
        rustV8ProfLog: false,
        optimizedForEachCall: false,
      })
      const experimental = await importFixtureWithOverrides(fixturePath, {
        deferDemangle: false,
        rustFuzzyFind: false,
        rustV8ProfLog: false,
        optimizedForEachCall: true,
      })

      expect(compareProfileGroups(legacy, experimental)).toEqual([])
    })
  }

  const rustImporterFixtures = [
    './sample/profiles/Safari/13.1/simple.html-recording.json',
    './sample/profiles/stackprof/ruby-stackprof.json',
  ]

  for (const fixturePath of rustImporterFixtures) {
    test(`rust import parsers preserve profile parity for ${fixturePath}`, async () => {
      const legacy = await importFixtureWithOverrides(fixturePath, {
        optimizedForEachCall: false,
        rustImportParsers: false,
      })
      const experimental = await importFixtureWithOverrides(fixturePath, {
        optimizedForEachCall: false,
        rustImportParsers: true,
      })

      expect(compareProfileGroups(legacy, experimental)).toEqual([])
    })
  }
})
