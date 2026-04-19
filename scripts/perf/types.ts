import {ImportEngine} from '../../src/experimental/contracts'

export type PerfValue = string | number | boolean | null

export interface BenchmarkArtifactPaths {
  rootDir: string
  jsonPath: string
  reportPath: string
}

export interface EngineRunOptions {
  name: string
  importEngine: ImportEngine
  compareImport?: boolean
  visibleImportEngine?: ImportEngine
}

export interface ExperimentRunOptions {
  experimentName: string
  engine: EngineRunOptions
}

export interface BrowserBenchmarkMilestones {
  loadStartMs: number
  bytesAvailableMs: number | null
  importParseFinishedMs: number | null
  profileStateAppliedMs: number | null
  firstMeaningfulPaintMs: number | null
  totalWallClockMs: number | null
}

export interface PerfSummary {
  loadStartMs: number
  bytesAvailableMs: number | null
  importParseFinishedMs: number | null
  profileStateAppliedMs: number | null
  firstMeaningfulPaintMs: number | null
  totalWallClockMs: number | null
}

export interface BrowserBenchmarkRun {
  fixtureId: string
  runIndex: number
  warm: boolean
  wallClockMs: number
  summary: PerfSummary
  perfRun: {
    id: string
    startedAt: number
    finishedAt: number | null
    status: 'running' | 'completed' | 'error'
    metadata: {[key: string]: unknown}
    milestones: {[key: string]: number}
    measures: {[key: string]: number[]}
    annotations: {[key: string]: PerfValue}
  }
}

export interface AggregateMetric {
  min: number
  max: number
  median: number
  average: number
}

export interface BrowserBenchmarkResult {
  fixtureId: string
  fixturePath: string
  format: string
  experiment: string
  importEngine: ImportEngine
  compareImport: boolean
  runs: BrowserBenchmarkRun[]
  coldSummary: {
    firstMeaningfulPaintMs: number | null
    totalWallClockMs: number | null
  } | null
  warmSummary: {
    firstMeaningfulPaintMs: AggregateMetric
    totalWallClockMs: AggregateMetric
  } | null
}

export interface BrowserBenchmarkReport {
  generatedAt: string
  experiment: ExperimentRunOptions
  results: BrowserBenchmarkResult[]
}

export interface ParityFixtureResult {
  fixtureId: string
  fixturePath: string
  equal: boolean
  reason: string | null
}

export interface ParityReport {
  generatedAt: string
  experiment: EngineRunOptions
  fixtures: ParityFixtureResult[]
}

export interface BuildPerfReportInput {
  title: string
  summaryLines: string[]
  benchmarkReport: BrowserBenchmarkReport
  parityReport: ParityReport
}

