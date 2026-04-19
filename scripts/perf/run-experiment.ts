import * as fs from 'fs'
import * as path from 'path'

import {runBrowserBenchmark} from './benchmark'
import {runParityCheck} from './parity'
import {renderBenchmarkReport, writeJson, writeMarkdown} from './report'
import {FIXTURES} from './fixtures'
import {BrowserBenchmarkReport, ExperimentFlags, ParityReport} from './types'

interface ExperimentDefinition {
  id: string
  label: string
  description: string
  flags: ExperimentFlags
}

interface ExperimentSummary {
  experimentId: string
  benchmarkPath: string
  parityPath: string
  reportPath: string
  recommendation: 'ship' | 'keep-experimental' | 'stop'
  findings: string[]
}

const EXPERIMENTS: ExperimentDefinition[] = [
  {
    id: 'legacy',
    label: 'Legacy',
    description: 'Current default implementation with instrumentation enabled.',
    flags: {
      deferDemangle: false,
      optimizedForEachCall: false,
      rustFuzzyFind: false,
      rustBase64Decode: false,
      rustProfileSearch: false,
      rustTextUtils: false,
      rustPprofImport: false,
      rustHaskellImport: false,
    },
  },
  {
    id: 'optimized-for-each-call',
    label: 'Optimized forEachCall',
    description: 'Experimental path using the prefix-based forEachCall traversal.',
    flags: {
      deferDemangle: false,
      optimizedForEachCall: true,
      rustFuzzyFind: false,
      rustBase64Decode: false,
      rustProfileSearch: false,
      rustTextUtils: false,
      rustPprofImport: false,
      rustHaskellImport: false,
    },
  },
  {
    id: 'defer-demangle',
    label: 'Deferred demangle',
    description: 'Experimental path that defers demangling until after first render.',
    flags: {
      deferDemangle: true,
      optimizedForEachCall: false,
      rustFuzzyFind: false,
      rustBase64Decode: false,
      rustProfileSearch: false,
      rustTextUtils: false,
      rustPprofImport: false,
      rustHaskellImport: false,
    },
  },
  {
    id: 'rust-fuzzy-find',
    label: 'Rust fuzzy find',
    description: 'Experimental path that routes fuzzy matching through the Rust/WASM implementation with a TS fallback.',
    flags: {
      deferDemangle: false,
      optimizedForEachCall: false,
      rustFuzzyFind: true,
      rustBase64Decode: false,
      rustProfileSearch: false,
      rustTextUtils: false,
      rustPprofImport: false,
      rustHaskellImport: false,
    },
  },
  {
    id: 'rust-pprof-import',
    label: 'Rust pprof import',
    description: 'Experimental path that parses pprof protobuf in Rust/WASM with a TS fallback.',
    flags: {
      deferDemangle: false,
      optimizedForEachCall: false,
      rustFuzzyFind: false,
      rustBase64Decode: false,
      rustProfileSearch: false,
      rustTextUtils: false,
      rustPprofImport: true,
      rustHaskellImport: false,
    },
  },
  {
    id: 'rust-haskell-import',
    label: 'Rust Haskell import',
    description:
      'Experimental path that routes the Haskell JSON importer through Rust/WASM while preserving TypeScript file IO and a TS fallback.',
    flags: {
      deferDemangle: false,
      optimizedForEachCall: false,
      rustFuzzyFind: false,
      rustBase64Decode: false,
      rustProfileSearch: false,
      rustTextUtils: false,
      rustPprofImport: false,
      rustHaskellImport: true,
    },
  },
]

function parseArgs(argv: string[]) {
  let outputDir = path.join(process.cwd(), 'artifacts', 'perf')
  let warmRuns = 2

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--output-dir') {
      outputDir = path.resolve(argv[++i])
    } else if (arg === '--warm-runs') {
      warmRuns = Number(argv[++i])
    }
  }

  return {outputDir, warmRuns}
}

function getMedianTotalWallClock(report: BrowserBenchmarkReport): number | null {
  const values = report.results
    .map(result => result.warmSummary?.totalWallClockMs.median || result.coldSummary?.totalWallClockMs || null)
    .filter((value): value is number => typeof value === 'number' && isFinite(value))
    .sort((a, b) => a - b)

  if (values.length === 0) return null
  return values[Math.floor(values.length / 2)]
}

function getRepresentativeTotalTime(result: BrowserBenchmarkReport['results'][number]): number | null {
  if (result.warmSummary) {
    return result.warmSummary.totalWallClockMs.median
  }
  return result.coldSummary ? result.coldSummary.totalWallClockMs : null
}

function recommend(
  baseline: BrowserBenchmarkReport | null,
  candidate: BrowserBenchmarkReport,
  parity: ParityReport,
): {recommendation: 'ship' | 'keep-experimental' | 'stop'; findings: string[]} {
  const findings: string[] = []
  const parityFailures = parity.fixtures.filter(fixture => !fixture.equal)
  if (parityFailures.length > 0) {
    findings.push(
      `Parity failed for ${parityFailures.length} fixture(s): ${parityFailures
        .map(fixture => fixture.fixtureId)
        .join(', ')}`,
    )
    return {recommendation: 'stop', findings}
  }

  const candidateMedian = getMedianTotalWallClock(candidate)
  const baselineMedian = baseline ? getMedianTotalWallClock(baseline) : null
  if (candidateMedian == null) {
    findings.push('No usable browser timing samples were collected for this experiment.')
    return {recommendation: 'stop', findings}
  }
  if (baselineMedian == null) {
    findings.push('No baseline timing was available, so this result remains experimental.')
    return {recommendation: 'keep-experimental', findings}
  }

  const delta = baselineMedian - candidateMedian
  const deltaPercent = baselineMedian === 0 ? 0 : (delta / baselineMedian) * 100
  findings.push(
    `Median total wall-clock time changed by ${delta.toFixed(2)}ms (${deltaPercent.toFixed(1)}%).`,
  )

  const regressedFixtures: string[] = []
  if (baseline) {
    const baselineByFixture = new Map<string, number>()
    for (const result of baseline.results) {
      const total = getRepresentativeTotalTime(result)
      if (typeof total === 'number' && isFinite(total)) {
        baselineByFixture.set(result.fixtureId, total)
      }
    }
    for (const result of candidate.results) {
      const baselineValue = baselineByFixture.get(result.fixtureId)
      const candidateValue = getRepresentativeTotalTime(result)
      if (
        typeof baselineValue === 'number' &&
        typeof candidateValue === 'number' &&
        isFinite(baselineValue) &&
        isFinite(candidateValue)
      ) {
        const regressionMs = candidateValue - baselineValue
        const regressionPct = baselineValue === 0 ? 0 : (regressionMs / baselineValue) * 100
        if (regressionMs > 25 || regressionPct > 10) {
          regressedFixtures.push(
            `${result.fixtureId} (+${regressionMs.toFixed(2)}ms, +${regressionPct.toFixed(1)}%)`,
          )
        }
      }
    }
  }
  if (regressedFixtures.length > 0) {
    findings.push(`Representative fixture regressions detected: ${regressedFixtures.join(', ')}`)
    return {recommendation: 'keep-experimental', findings}
  }

  if (delta > 25 || deltaPercent > 5) {
    findings.push('Candidate improved the primary metric while maintaining parity.')
    return {recommendation: 'ship', findings}
  }
  if (delta >= 0) {
    findings.push('Candidate was not materially faster than baseline.')
    return {recommendation: 'keep-experimental', findings}
  }

  findings.push('Candidate regressed end-to-end browser latency compared to baseline.')
  return {recommendation: 'stop', findings}
}

async function main() {
  const {outputDir, warmRuns} = parseArgs(process.argv.slice(2))
  fs.mkdirSync(outputDir, {recursive: true})

  const summaries: ExperimentSummary[] = []
  let baseline: BrowserBenchmarkReport | null = null

  for (const experiment of EXPERIMENTS) {
    const experimentDir = path.join(outputDir, experiment.id)
    fs.mkdirSync(experimentDir, {recursive: true})

    const benchmarkPath = path.join(experimentDir, 'browser-benchmark.json')
    const parityPath = path.join(experimentDir, 'parity.json')
    const reportPath = path.join(experimentDir, 'report.md')

    const benchmark = await runBrowserBenchmark({
      fixtures: FIXTURES,
      outputPath: benchmarkPath,
      warmRuns,
      experimentName: experiment.id,
      experiments: experiment.flags,
    })
    const parity = await runParityCheck({
      fixtures: FIXTURES,
      outputPath: parityPath,
      experiment: experiment.flags,
    })

    if (experiment.id === 'legacy') {
      baseline = benchmark
    }

    const {recommendation, findings} = recommend(
      experiment.id === 'legacy' ? null : baseline,
      benchmark,
      parity,
    )

    const reportMarkdown = [
      `# ${experiment.label}`,
      '',
      experiment.description,
      '',
      `Recommendation: ${recommendation}`,
      '',
      ...findings.map(line => `- ${line}`),
      '',
      '## Browser benchmark summary',
      '',
      renderBenchmarkReport(benchmark),
      '',
      '## Parity',
      '',
      ...parity.fixtures.map(result => `- ${result.fixtureId}: ${result.equal ? 'passed' : 'failed'}`),
      '',
    ].join('\n')

    writeMarkdown(reportPath, reportMarkdown)

    summaries.push({
      experimentId: experiment.id,
      benchmarkPath,
      parityPath,
      reportPath,
      recommendation,
      findings,
    })
  }

  const summaryPath = path.join(outputDir, 'experiment-summary.json')
  writeJson(summaryPath, {
    generatedAt: new Date().toISOString(),
    outputDir,
    experiments: summaries,
  })

  console.log(JSON.stringify({summaryPath, experiments: summaries}, null, 2))
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
