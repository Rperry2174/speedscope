import * as fs from 'fs'
import * as path from 'path'

import {exportProfileGroup} from './file-format'
import {dumpProfile} from './test-utils'
import {ExperimentFlags, setExperimentOverridesForTesting} from './runtime-config'
import {importProfilesFromArrayBuffer} from '../import'
import {ProfileGroup} from './profile'

export interface ProfileParityResult {
  fixturePath: string
  equivalent: boolean
  reason: string | null
  legacySummary: any | null
  experimentalSummary: any | null
}

export function compareProfileGroups(a: ProfileGroup, b: ProfileGroup): string[] {
  const diffs: string[] = []
  const aExport = exportProfileGroup(a)
  const bExport = exportProfileGroup(b)
  if (JSON.stringify(aExport) !== JSON.stringify(bExport)) {
    diffs.push('Exported profile groups differed')
  }

  const aDumps = a.profiles.map(profile => dumpProfile(profile))
  const bDumps = b.profiles.map(profile => dumpProfile(profile))
  if (JSON.stringify(aDumps) !== JSON.stringify(bDumps)) {
    diffs.push('Profile stack dumps differed')
  }

  return diffs
}

async function importFixtureWithExperiment(
  fixturePath: string,
  overrides: Partial<ExperimentFlags> | null,
) {
  const buffer = fs.readFileSync(fixturePath)
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  setExperimentOverridesForTesting(overrides)
  try {
    return await importProfilesFromArrayBuffer(path.basename(fixturePath), arrayBuffer)
  } finally {
    setExperimentOverridesForTesting(null)
  }
}

export async function compareFixtureParity(
  fixturePath: string,
  overrides: Partial<ExperimentFlags>,
): Promise<ProfileParityResult> {
  const legacy = await importFixtureWithExperiment(fixturePath, {
    optimizedForEachCall: false,
    deferDemangle: false,
    rustCallgrindImport: false,
  })
  const experimental = await importFixtureWithExperiment(fixturePath, overrides)

  if (!legacy || !experimental) {
    return {
      fixturePath,
      equivalent: false,
      reason: 'One of the imports returned null',
      legacySummary: legacy,
      experimentalSummary: experimental,
    }
  }

  const legacyExport = exportProfileGroup(legacy)
  const experimentalExport = exportProfileGroup(experimental)

  const legacySummary = {
    group: legacyExport,
    dumps: legacy.profiles.map(profile => dumpProfile(profile)),
  }
  const experimentalSummary = {
    group: experimentalExport,
    dumps: experimental.profiles.map(profile => dumpProfile(profile)),
  }

  const equivalent = compareProfileGroups(legacy, experimental).length === 0
  return {
    fixturePath,
    equivalent,
    reason: equivalent ? null : 'Exported profile groups or stack dumps differed',
    legacySummary: equivalent ? null : legacySummary,
    experimentalSummary: equivalent ? null : experimentalSummary,
  }
}
