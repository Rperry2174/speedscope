import * as fs from 'fs'
import * as path from 'path'
import {spawn, ChildProcess} from 'child_process'
import {chromium, Browser, Page} from 'playwright'

import {FIXTURES, PerfFixture, resolveFixturePath} from './fixtures'
import {
  BenchmarkArtifactPaths,
  BrowserBenchmarkReport,
  BrowserBenchmarkResult,
  BrowserBenchmarkRun,
  ExperimentFlags,
  ExperimentRunOptions,
  PerfSummary,
} from './types'
import {renderBenchmarkReport, writeJson, writeMarkdown} from './report'

interface ServerInfo {
  process: ChildProcess
  url: string
}

interface RawPerfRun {
  id: string
  startedAt: number
  finishedAt: number | null
  status: 'running' | 'completed' | 'error'
  metadata: {[key: string]: unknown}
  milestones: {[key: string]: number}
  measures: {[key: string]: number[]}
  annotations: {[key: string]: string | number | boolean | null}
}

interface PerfWindowApi {
  __speedscopePerf?: {
    getState: () => {
      enabled: boolean
      activeRun: RawPerfRun | null
      runs: RawPerfRun[]
    }
    reset: () => void
  }
}

interface RunBrowserBenchmarkArgs {
  fixtures?: PerfFixture[]
  outputPath?: string
  warmRuns: number
  experiments: ExperimentFlags
  experimentName: string
}

const PERF_TIMEOUT_MS = 180000

function allExperimentsDisabled(experiments: ExperimentFlags): ExperimentFlags {
  return {
    deferDemangle: false,
    optimizedForEachCall: false,
    rustFirefoxImport: false,
    rustFuzzyFind: false,
    rustBase64Decode: false,
    rustProfileSearch: false,
    rustTextUtils: false,
    rustPprofImport: false,
    rustV8CpuFormatter: false,
    rustLinuxPerf: false,
    rustHaskellImport: false,
    rustInstrumentsDeepCopy: false,
    rustCallgrindImport: false,
    rustV8ProfLog: false,
    rustTraceEventImport: false,
  }
}

function parseBooleanFlag(value: string | undefined): boolean {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

function toIsoLikeTimestamp(date: Date): string {
  return date.toISOString().replace(/[:]/g, '-')
}

function buildQueryString(options: ExperimentRunOptions): string {
  const params = new URLSearchParams()
  params.set('perf', '1')
  const enabledExperiments: string[] = []
  const experimentEntries: [keyof ExperimentFlags, boolean][] = [
    ['deferDemangle', options.experiments.deferDemangle],
    ['optimizedForEachCall', options.experiments.optimizedForEachCall],
    ['rustFuzzyFind', options.experiments.rustFuzzyFind],
    ['rustBase64Decode', options.experiments.rustBase64Decode],
    ['rustProfileSearch', options.experiments.rustProfileSearch],
    ['rustTextUtils', options.experiments.rustTextUtils],
    ['rustPprofImport', options.experiments.rustPprofImport],
    ['rustCallgrindImport', options.experiments.rustCallgrindImport],
    ['rustHaskellImport', options.experiments.rustHaskellImport],
    ['rustInstrumentsDeepCopy', options.experiments.rustInstrumentsDeepCopy],
    ['rustV8ProfLog', options.experiments.rustV8ProfLog],
    ['rustV8CpuFormatter', options.experiments.rustV8CpuFormatter],
    ['rustTraceEventImport', options.experiments.rustTraceEventImport],
  ]
  for (const [name, enabled] of experimentEntries) {
    if (enabled) enabledExperiments.push(name)
    params.set(name, enabled ? '1' : '0')
  }
  if (enabledExperiments.length > 0) {
    params.set('experiments', enabledExperiments.join(','))
  }
  return params.toString()
}

function summarizePerf(run: RawPerfRun): PerfSummary {
  const milestones = run.milestones || {}
  return {
    loadStartMs: milestones.load_start ?? 0,
    bytesAvailableMs: milestones.bytes_available ?? null,
    importParseFinishedMs: milestones.import_parse_finished ?? null,
    profileStateAppliedMs: milestones.profile_state_applied ?? null,
    firstMeaningfulPaintMs: milestones.first_meaningful_paint ?? null,
    totalWallClockMs:
      typeof run.finishedAt === 'number' && typeof run.startedAt === 'number'
        ? Math.max(0, run.finishedAt - run.startedAt)
        : milestones.run_complete ?? null,
  }
}

function aggregateNumbers(values: number[]) {
  const sorted = values.slice().sort((a, b) => a - b)
  const sum = values.reduce((acc, value) => acc + value, 0)
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: sorted[Math.floor(sorted.length / 2)],
    average: sum / values.length,
  }
}

async function startServer(): Promise<ServerInfo> {
  return await new Promise((resolve, reject) => {
    const childProcess = spawn('npm', ['run', 'serve'], {
      cwd: path.resolve('/workspace'),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        FORCE_COLOR: '0',
      },
    })

    let resolved = false
    const onData = (chunk: Buffer) => {
      const text = chunk.toString()
      const match = text.match(/Server is running at (http:\/\/[^\s]+)/)
      if (match && !resolved) {
        resolved = true
        resolve({
          process: childProcess,
          url: match[1],
        })
      }
    }

    childProcess.stdout?.on('data', onData)
    childProcess.stderr?.on('data', onData)
    childProcess.on('exit', code => {
      if (!resolved) {
        reject(new Error(`Dev server exited before becoming ready (exit code ${code})`))
      }
    })
    childProcess.on('error', reject)
  })
}

async function stopServer(server: ServerInfo): Promise<void> {
  await new Promise(resolve => {
    if (server.process.exitCode != null) {
      resolve(null)
      return
    }

    const timeout = setTimeout(() => {
      if (server.process.exitCode == null) {
        server.process.kill('SIGKILL')
      }
    }, 5000)

    server.process.once('exit', () => {
      clearTimeout(timeout)
      resolve(null)
    })

    server.process.kill('SIGTERM')
  })
}

async function waitForPerfRun(page: Page): Promise<RawPerfRun> {
  await page.waitForFunction(
    () => {
      const api = (window as unknown as PerfWindowApi).__speedscopePerf
      if (!api) return false
      const state = api.getState()
      return state.runs.some(run => run.status === 'completed')
    },
    undefined,
    {timeout: PERF_TIMEOUT_MS},
  )

  const run = await page.evaluate(() => {
    const api = (window as unknown as PerfWindowApi).__speedscopePerf
    if (!api) return null
    const state = api.getState()
    const completedRuns = state.runs.filter(run => run.status === 'completed')
    return completedRuns[completedRuns.length - 1] || null
  })
  if (!run) {
    throw new Error('Benchmark completed without a recorded perf run')
  }
  return run
}

async function resetPerf(page: Page) {
  await page.evaluate(() => {
    const api = (window as unknown as PerfWindowApi).__speedscopePerf
    if (api) {
      api.reset()
    }
  })
}

async function loadFixtureThroughFileInput(page: Page, fixture: PerfFixture) {
  const input = page.locator('input[type="file"]#file')
  await input.setInputFiles(resolveFixturePath('/workspace', fixture))
}

async function runSingleFixturePass(
  browser: Browser,
  serverUrl: string,
  fixture: PerfFixture,
  options: ExperimentRunOptions,
  runIndex: number,
): Promise<BrowserBenchmarkRun> {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    const search = buildQueryString(options)
    await page.goto(`${serverUrl}/index.html?${search}`, {waitUntil: 'domcontentloaded'})
    await resetPerf(page)

    const wallClockStart = Date.now()
    await loadFixtureThroughFileInput(page, fixture)
    const perfRun = await waitForPerfRun(page)
    const wallClockMs = Date.now() - wallClockStart

    return {
      fixtureId: fixture.id,
      runIndex,
      warm: runIndex > 0,
      wallClockMs,
      summary: summarizePerf(perfRun),
      perfRun,
    }
  } finally {
    await context.close()
  }
}

function summarizeFixtureRuns(
  fixture: PerfFixture,
  runs: BrowserBenchmarkRun[],
  options: ExperimentRunOptions,
): BrowserBenchmarkResult {
  const coldRuns = runs.filter(run => !run.warm)
  const warmRuns = runs.filter(run => run.warm)
  const warmPaintValues = warmRuns
    .map(run => run.summary.firstMeaningfulPaintMs)
    .filter((value): value is number => typeof value === 'number')
  const warmTotalValues = warmRuns
    .map(run => run.summary.totalWallClockMs)
    .filter((value): value is number => typeof value === 'number')

  return {
    fixtureId: fixture.id,
    fixturePath: fixture.relativePath,
    format: fixture.format,
    experiment: options.experimentName,
    runs,
    coldSummary:
      coldRuns.length > 0
        ? {
            firstMeaningfulPaintMs: coldRuns[0].summary.firstMeaningfulPaintMs,
            totalWallClockMs: coldRuns[0].summary.totalWallClockMs,
          }
        : null,
    warmSummary:
      warmPaintValues.length > 0 && warmTotalValues.length > 0
        ? {
            firstMeaningfulPaintMs: aggregateNumbers(warmPaintValues),
            totalWallClockMs: aggregateNumbers(warmTotalValues),
          }
        : null,
  }
}

function getArtifactPaths(rootDir: string, experimentName: string): BenchmarkArtifactPaths {
  const timestamp = toIsoLikeTimestamp(new Date())
  const outputDir = path.join(rootDir, `${timestamp}-${experimentName}`)
  fs.mkdirSync(outputDir, {recursive: true})
  return {
    rootDir: outputDir,
    jsonPath: path.join(outputDir, 'results.json'),
    reportPath: path.join(outputDir, 'report.md'),
  }
}

export async function runBrowserBenchmark(args: RunBrowserBenchmarkArgs): Promise<BrowserBenchmarkReport> {
  const fixtures = args.fixtures || FIXTURES
  const options: ExperimentRunOptions = {
    experimentName: args.experimentName,
    experiments: args.experiments,
  }

  const server = await startServer()
  const browser = await chromium.launch({headless: true})

  try {
    const results: BrowserBenchmarkResult[] = []
    for (const fixture of fixtures) {
      const runs: BrowserBenchmarkRun[] = []
      for (let runIndex = 0; runIndex <= args.warmRuns; runIndex++) {
        runs.push(await runSingleFixturePass(browser, server.url, fixture, options, runIndex))
      }
      results.push(summarizeFixtureRuns(fixture, runs, options))
    }

    const report: BrowserBenchmarkReport = {
      generatedAt: new Date().toISOString(),
      experiment: options,
      results,
    }

    if (args.outputPath) {
      writeJson(args.outputPath, report)
      writeMarkdown(
        path.join(path.dirname(args.outputPath), 'report.md'),
        renderBenchmarkReport(report),
      )
    }

    return report
  } finally {
    await browser.close()
    await stopServer(server)
  }
}

async function main() {
  const experimentName = process.env.SPEEDSCOPE_EXPERIMENT_NAME || 'legacy'
  const warmRuns = Number(process.env.SPEEDSCOPE_WARM_RUNS || '2')
  const includeOnly = process.env.SPEEDSCOPE_FIXTURES
    ? new Set(process.env.SPEEDSCOPE_FIXTURES.split(',').map(token => token.trim()))
    : null
  const fixtures = includeOnly
    ? FIXTURES.filter((fixture: PerfFixture) => includeOnly.has(fixture.id))
    : FIXTURES

  if (fixtures.length === 0) {
    throw new Error('No fixtures selected for benchmark run')
  }

  const artifactPaths = getArtifactPaths(
    path.join('/workspace', 'artifacts', 'benchmarks'),
    experimentName,
  )
  const report = await runBrowserBenchmark({
    fixtures,
    outputPath: artifactPaths.jsonPath,
    warmRuns,
    experimentName,
    experiments: {
      ...allExperimentsDisabled({
        deferDemangle: false,
        optimizedForEachCall: false,
        rustFirefoxImport: false,
        rustFuzzyFind: false,
        rustBase64Decode: false,
        rustProfileSearch: false,
        rustTextUtils: false,
        rustPprofImport: false,
        rustV8CpuFormatter: false,
        rustLinuxPerf: false,
        rustHaskellImport: false,
        rustInstrumentsDeepCopy: false,
        rustCallgrindImport: false,
        rustV8ProfLog: false,
        rustTraceEventImport: false,
      }),
      deferDemangle: parseBooleanFlag(process.env.SPEEDSCOPE_DEFER_DEMANGLE),
      optimizedForEachCall: parseBooleanFlag(process.env.SPEEDSCOPE_OPTIMIZED_FOR_EACH_CALL),
      rustFuzzyFind: parseBooleanFlag(process.env.SPEEDSCOPE_RUST_FUZZY_FIND),
      rustBase64Decode: parseBooleanFlag(process.env.SPEEDSCOPE_RUST_BASE64_DECODE),
      rustProfileSearch: parseBooleanFlag(process.env.SPEEDSCOPE_RUST_PROFILE_SEARCH),
      rustTextUtils: parseBooleanFlag(process.env.SPEEDSCOPE_RUST_TEXT_UTILS),
      rustPprofImport: parseBooleanFlag(process.env.SPEEDSCOPE_RUST_PPROF_IMPORT),
      rustCallgrindImport: parseBooleanFlag(process.env.SPEEDSCOPE_RUST_CALLGRIND_IMPORT),
      rustV8CpuFormatter: parseBooleanFlag(process.env.SPEEDSCOPE_RUST_V8_CPU_FORMATTER),
      rustHaskellImport: parseBooleanFlag(process.env.SPEEDSCOPE_RUST_HASKELL_IMPORT),
      rustInstrumentsDeepCopy: parseBooleanFlag(process.env.SPEEDSCOPE_RUST_INSTRUMENTS_DEEP_COPY),
      rustV8ProfLog: parseBooleanFlag(process.env.SPEEDSCOPE_RUST_V8_PROF_LOG),
      rustTraceEventImport: parseBooleanFlag(process.env.SPEEDSCOPE_RUST_TRACE_EVENT_IMPORT),
    },
  })
  writeMarkdown(artifactPaths.reportPath, renderBenchmarkReport(report))
  process.stdout.write(`${artifactPaths.jsonPath}\n${artifactPaths.reportPath}\n`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
