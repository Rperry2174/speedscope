import {mkdirSync, writeFileSync} from 'fs'
import * as path from 'path'
import {Agent} from '@cursor/february'
import {ensureRequestedModelFamilies, fetchCursorModels, selectCursorModel} from './cursor-api'
import {FIXTURES} from './fixtures'
import {BuildPerfReportInput, BrowserBenchmarkReport, ExperimentFlags, ParityReport} from './types'
import {buildPerfReport} from './report'

type SpecialistRole = 'conductor' | 'analyst' | 'reviewer'

interface SpecialistDefinition {
  role: SpecialistRole
  requestedFamily: 'composer-2' | 'gpt-5.4' | 'opus-4.6'
  prompt: string
}

function requireApiKey() {
  const apiKey = process.env.CURSOR_API_KEY
  if (!apiKey) {
    throw new Error('CURSOR_API_KEY must be set to use the Cursor orchestrator')
  }
  return apiKey
}

function getSpecialists(): SpecialistDefinition[] {
  return [
    {
      role: 'conductor',
      requestedFamily: 'composer-2',
      prompt:
        'You are the main execution conductor for the SpeedScope performance experiment. Coordinate work, decide what to keep, and focus on end-to-end browser latency from file open to first meaningful render.',
    },
    {
      role: 'analyst',
      requestedFamily: 'gpt-5.4',
      prompt:
        'You are the benchmark analyst. Read machine output, identify dominant bottlenecks, compare experiments, and recommend the next highest-leverage step.',
    },
    {
      role: 'reviewer',
      requestedFamily: 'opus-4.6',
      prompt:
        'You are the architecture reviewer. Evaluate worker and Rust/WASM boundaries, reject wrapper-style designs, and keep correctness and measurable end-to-end improvements front and center.',
    },
  ]
}

function ensureOutputDir() {
  const dir = path.resolve('/workspace/artifacts/perf')
  mkdirSync(dir, {recursive: true})
  return dir
}

function buildPrompt(role: SpecialistRole, experimentFlags: ExperimentFlags[]) {
  const fixtures = FIXTURES
  return [
    `Role: ${role}`,
    '',
    'Repository context:',
    '- Repo: SpeedScope',
    '- Objective: improve end-to-end browser latency from file-open to first meaningful flamegraph render.',
    '- Representative fixtures:',
    ...fixtures.map(
      fixture =>
        `  - ${fixture.id}: ${fixture.relativePath} (${fixture.format})`,
    ),
    '',
    'Current experiment flags under comparison:',
    ...experimentFlags.map(flags => `  - ${JSON.stringify(flags)}`),
    '',
    'Constraints:',
    '- Prefer evidence-driven recommendations grounded in browser timing.',
    '- Maintain parity on supported fixtures.',
    '- Rust/WASM is only worthwhile if it wins end-to-end.',
    '',
    'Respond with a concise structured recommendation for your role.',
  ].join('\n')
}

async function runSpecialist(
  apiKey: string,
  cwd: string,
  availableModels: string[],
  specialist: SpecialistDefinition,
  experimentFlags: ExperimentFlags[],
) {
  const modelId = selectCursorModel(availableModels, specialist.requestedFamily)
  const agent = Agent.create({
    apiKey,
    model: {id: modelId},
    local: {cwd},
    addedSystemInstruction: specialist.prompt,
  })
  try {
    const run = await agent.send(buildPrompt(specialist.role, experimentFlags))
    const result = await run.wait()
    return {
      role: specialist.role,
      modelId,
      status: result.status,
      text: result.result || '',
    }
  } finally {
    agent.close()
  }
}

function toSummaryReport(
  specialistOutputs: Awaited<ReturnType<typeof runSpecialist>>[],
): BuildPerfReportInput {
  const summaryLines = specialistOutputs.map(
    output => `${output.role} (${output.modelId}, ${output.status}): ${output.text || 'no text output'}`,
  )
  const emptyBenchmark: BrowserBenchmarkReport = {
    generatedAt: new Date().toISOString(),
    experiment: {
      experimentName: 'cursor-orchestrator',
      experiments: {
        deferDemangle: false,
        optimizedForEachCall: false,
      },
    },
    results: [],
  }
  const emptyParity: ParityReport = {
    generatedAt: new Date().toISOString(),
    experiment: {
      deferDemangle: false,
      optimizedForEachCall: false,
    },
    fixtures: [],
  }
  return {
    title: 'Cursor orchestrator summary',
    summaryLines,
    benchmarkReport: emptyBenchmark,
    parityReport: emptyParity,
  }
}

async function main() {
  const apiKey = requireApiKey()
  const cwd = path.resolve('/workspace')
  const models = await fetchCursorModels(apiKey)
  ensureRequestedModelFamilies(models, ['composer-2', 'gpt-5.4', 'opus-4.6'])

  const experimentFlags: ExperimentFlags[] = [
    {deferDemangle: false, optimizedForEachCall: false},
    {deferDemangle: true, optimizedForEachCall: false},
    {deferDemangle: false, optimizedForEachCall: true},
  ]

  const specialistOutputs = await Promise.all(
    getSpecialists().map(specialist =>
      runSpecialist(apiKey, cwd, models, specialist, experimentFlags),
    ),
  )

  const reportInput = toSummaryReport(specialistOutputs)
  const outputDir = ensureOutputDir()
  writeFileSync(
    path.join(outputDir, 'cursor-orchestrator-summary.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        specialists: specialistOutputs,
      },
      null,
      2,
    ),
  )
  writeFileSync(
    path.join(outputDir, 'cursor-orchestrator-summary.md'),
    buildPerfReport(reportInput),
  )

  console.log(JSON.stringify({outputDir, specialists: specialistOutputs}, null, 2))
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
