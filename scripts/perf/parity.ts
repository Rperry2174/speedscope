import * as path from 'path'

import {compareFixtureParity} from '../../src/lib/profile-parity'
import {FIXTURES, PerfFixture, resolveFixturePath} from './fixtures'
import {ParityReport, ParityFixtureResult, ExperimentFlags} from './types'
import {writeJson} from './report'

function parseBooleanFlag(value: string | undefined): boolean {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].indexOf(value.toLowerCase()) !== -1
}

function getExperimentFlags(): ExperimentFlags {
  return {
    deferDemangle: parseBooleanFlag(process.env.SPEEDSCOPE_DEFER_DEMANGLE),
    optimizedForEachCall: parseBooleanFlag(process.env.SPEEDSCOPE_OPTIMIZED_FOR_EACH_CALL),
    rustFuzzyFind: parseBooleanFlag(process.env.SPEEDSCOPE_RUST_FUZZY_FIND),
    rustBase64Decode: parseBooleanFlag(process.env.SPEEDSCOPE_RUST_BASE64_DECODE),
    rustProfileSearch: parseBooleanFlag(process.env.SPEEDSCOPE_RUST_PROFILE_SEARCH),
    rustTextUtils: parseBooleanFlag(process.env.SPEEDSCOPE_RUST_TEXT_UTILS),
    rustPprofImport: parseBooleanFlag(process.env.SPEEDSCOPE_RUST_PPROF_IMPORT),
    rustV8CpuFormatter: parseBooleanFlag(process.env.SPEEDSCOPE_RUST_V8_CPU_FORMATTER),
    rustCallgrindImport: parseBooleanFlag(process.env.SPEEDSCOPE_RUST_CALLGRIND_IMPORT),
    rustHaskellImport: parseBooleanFlag(process.env.SPEEDSCOPE_RUST_HASKELL_IMPORT),
    rustInstrumentsDeepCopy: parseBooleanFlag(process.env.SPEEDSCOPE_RUST_INSTRUMENTS_DEEP_COPY),
    rustV8ProfLog: parseBooleanFlag(process.env.SPEEDSCOPE_RUST_V8_PROF_LOG),
  }
}

async function runFixtureParityCheck(
  fixture: PerfFixture,
  experiment: ExperimentFlags,
): Promise<ParityFixtureResult> {
  const fixturePath = resolveFixturePath(process.cwd(), fixture)
  const comparison = await compareFixtureParity(fixturePath, experiment)
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
  experiment = getExperimentFlags(),
}: {
  fixtures?: PerfFixture[]
  outputPath?: string
  experiment?: ExperimentFlags
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
