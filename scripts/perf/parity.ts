import * as path from 'path'

import {compareFixtureParity} from '../../src/lib/profile-parity'
import {ImportEngine} from '../../src/experimental/contracts'
import {FIXTURES, PerfFixture, resolveFixturePath} from './fixtures'
import {EngineRunOptions, ParityReport, ParityFixtureResult} from './types'
import {writeJson} from './report'

function parseBooleanFlag(value: string | undefined): boolean {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].indexOf(value.toLowerCase()) !== -1
}

function getEngineRunOptions(): EngineRunOptions {
  const importEngine: ImportEngine = parseBooleanFlag(process.env.SPEEDSCOPE_EXPERIMENTAL_IMPORT)
    ? 'experimental'
    : 'legacy'
  return {
    name: process.env.SPEEDSCOPE_EXPERIMENT_NAME || importEngine,
    importEngine,
    compareImport: parseBooleanFlag(process.env.SPEEDSCOPE_COMPARE_IMPORT),
    visibleImportEngine: parseBooleanFlag(process.env.SPEEDSCOPE_COMPARE_IMPORT) ? 'legacy' : importEngine,
  }
}

async function runFixtureParityCheck(
  fixture: PerfFixture,
  _experiment: EngineRunOptions,
): Promise<ParityFixtureResult> {
  const fixturePath = resolveFixturePath(process.cwd(), fixture)
  const comparison = await compareFixtureParity(fixturePath)
  return {
    fixtureId: fixture.id,
    fixturePath: fixture.relativePath,
    equal: comparison.equivalent,
    reason: comparison.reason,
  }
}

export async function runParityCheck({
  fixtures = FIXTURES,
  outputPath,
  experiment = getEngineRunOptions(),
}: {
  fixtures?: PerfFixture[]
  outputPath?: string
  experiment?: EngineRunOptions
} = {}): Promise<ParityReport> {
  const results: ParityFixtureResult[] = []
  for (const fixture of fixtures) {
    try {
      results.push(await runFixtureParityCheck(fixture, experiment))
    } catch (error) {
      results.push({
        fixtureId: fixture.id,
        fixturePath: fixture.relativePath,
        equal: false,
        reason: error instanceof Error ? error.message : `${error}`,
      })
    }
  }

  const report: ParityReport = {
    generatedAt: new Date().toISOString(),
    experiment,
    fixtures: results,
  }

  if (outputPath) {
    writeJson(outputPath, report)
  }

  return report
}

async function main() {
  const outputPath = path.resolve(process.cwd(), 'artifacts/perf/latest/parity.json')
  const report = await runParityCheck({outputPath})
  const failures = report.fixtures.filter(fixture => !fixture.equal)
  if (failures.length > 0) {
    const failureLines = failures.map(
      failure => `- ${failure.fixtureId}: ${failure.reason || 'unknown failure'}`,
    )
    throw new Error(`Parity checks failed:\n${failureLines.join('\n')}`)
  }

  console.log(`Parity checks passed for ${report.fixtures.length} fixtures.`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
