import * as fs from 'fs'
import * as path from 'path'

import {AggregateMetric, BrowserBenchmarkReport, BrowserBenchmarkResult, BuildPerfReportInput} from './types'

function formatMs(value: number | null | undefined) {
  if (value == null || !isFinite(value)) return 'n/a'
  return `${value.toFixed(2)} ms`
}

function formatAggregate(metric: AggregateMetric | null | undefined) {
  if (!metric) return 'n/a'
  return `median ${formatMs(metric.median)}, avg ${formatMs(metric.average)}, min ${formatMs(
    metric.min,
  )}, max ${formatMs(metric.max)}`
}

function renderFixtureSummary(result: BrowserBenchmarkResult) {
  return [
    `### ${result.fixtureId}`,
    `- fixture: \`${result.fixturePath}\``,
    `- format: ${result.format}`,
    `- cold first paint: ${formatMs(result.coldSummary?.firstMeaningfulPaintMs ?? null)}`,
    `- cold total wall-clock: ${formatMs(result.coldSummary?.totalWallClockMs ?? null)}`,
    `- warm first paint: ${formatAggregate(result.warmSummary?.firstMeaningfulPaintMs)}`,
    `- warm total wall-clock: ${formatAggregate(result.warmSummary?.totalWallClockMs)}`,
  ].join('\n')
}

export function renderBenchmarkReport(report: BrowserBenchmarkReport) {
  const sections = report.results.map(renderFixtureSummary).join('\n\n')
  return `# SpeedScope browser benchmark

Generated at: ${report.generatedAt}

Experiment: ${report.experiment.experimentName}

Engine:

- requested engine: ${report.experiment.engine.importEngine}
- compare import: ${report.experiment.engine.compareImport ? 'enabled' : 'disabled'}
- visible engine: ${report.experiment.engine.visibleImportEngine || report.experiment.engine.importEngine}

## Fixture results

${sections || '- no results'}
`
}

export function buildPerfReport(input: BuildPerfReportInput) {
  const parityFailures = input.parityReport.fixtures.filter(fixture => !fixture.equal)
  const paritySection =
    parityFailures.length === 0
      ? '- All parity checks passed.'
      : parityFailures
          .map(fixture => `- ${fixture.fixtureId}: ${fixture.reason || 'parity mismatch'}`)
          .join('\n')

  return `# ${input.title}

## Summary

${input.summaryLines.map(line => `- ${line}`).join('\n')}

## Browser benchmark

${renderBenchmarkReport(input.benchmarkReport)}

## Parity

${paritySection}
`
}

export function ensureArtifactDir(outputDir: string) {
  fs.mkdirSync(outputDir, {recursive: true})
}

export function writeJson(outputPath: string, value: unknown) {
  ensureArtifactDir(path.dirname(outputPath))
  fs.writeFileSync(outputPath, JSON.stringify(value, null, 2))
}

export function writeMarkdown(outputPath: string, markdown: string) {
  ensureArtifactDir(path.dirname(outputPath))
  fs.writeFileSync(outputPath, markdown)
}
