import * as fs from 'fs'
import * as path from 'path'

import {ImportEngine} from '../experimental/contracts'
import {canonicalizeImportedProfileGroup} from '../experimental/engine'
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
  const aSummary = canonicalizeImportedProfileGroup(a)
  const bSummary = canonicalizeImportedProfileGroup(b)
  if (JSON.stringify(aSummary?.group) !== JSON.stringify(bSummary?.group)) {
    diffs.push('Exported profile groups differed')
  }

  if (JSON.stringify(aSummary?.dumps) !== JSON.stringify(bSummary?.dumps)) {
    diffs.push('Profile stack dumps differed')
  }

  return diffs
}

async function importFixtureWithExperiment(
  fixturePath: string,
  engine: ImportEngine,
) {
  const buffer = fs.readFileSync(fixturePath)
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  return await importProfilesFromArrayBuffer(path.basename(fixturePath), arrayBuffer, {engine})
}

export async function compareFixtureParity(
  fixturePath: string,
  candidateEngine: ImportEngine = 'experimental',
  baselineEngine: ImportEngine = 'legacy',
): Promise<ProfileParityResult> {
  const legacy = await importFixtureWithExperiment(fixturePath, baselineEngine)
  const experimental = await importFixtureWithExperiment(fixturePath, candidateEngine)

  if (!legacy || !experimental) {
    return {
      fixturePath,
      equivalent: false,
      reason: 'One of the imports returned null',
      legacySummary: legacy,
      experimentalSummary: experimental,
    }
  }

  const legacySummary = canonicalizeImportedProfileGroup(legacy)
  const experimentalSummary = canonicalizeImportedProfileGroup(experimental)

  const equivalent = compareProfileGroups(legacy, experimental).length === 0
  return {
    fixturePath,
    equivalent,
    reason: equivalent ? null : 'Exported profile groups or stack dumps differed',
    legacySummary: equivalent ? null : legacySummary,
    experimentalSummary: equivalent ? null : experimentalSummary,
  }
}
