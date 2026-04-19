import {mkdirSync, writeFileSync} from 'fs'
import {execFileSync} from 'child_process'
import * as path from 'path'
import {Agent} from '@cursor/february'
import {ensureRequestedModelFamilies, fetchCursorModels, selectCursorModel} from './cursor-api'
import {FIXTURES} from './fixtures'
import {
  BuildPerfReportInput,
  BrowserBenchmarkReport,
  ExperimentFlags,
  ParityReport,
} from './types'
import {buildPerfReport} from './report'
import {MIGRATION_SHARDS, type MigrationShard} from './migration-plan'

type SpecialistRole = 'conductor' | 'analyst' | 'reviewer'

interface SpecialistDefinition {
  role: SpecialistRole
  requestedFamily: 'composer-2' | 'gpt-5.4' | 'opus-4.6'
  prompt: string
}

type OrchestratorRuntime = 'local' | 'cloud'

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

function summarizeShard(shard: MigrationShard): string[] {
  return [
    `- shard: ${shard.id}`,
    `  - label: ${shard.label}`,
    `  - model: ${shard.suggestedModelFamily}`,
    `  - keep in TS: ${shard.keepInTypeScript ? 'yes' : 'no'}`,
    `  - files:`,
    ...shard.paths.map((filePath: string) => `    - ${filePath}`),
    `  - rationale: ${shard.rationale}`,
  ]
}

function ensureOutputDir() {
  const dir = path.resolve('/workspace/artifacts/perf')
  mkdirSync(dir, {recursive: true})
  return dir
}

function getRequestedRuntime(): OrchestratorRuntime {
  const raw = (process.env.SPEEDSCOPE_CURSOR_RUNTIME || 'cloud').toLowerCase()
  return raw === 'local' ? 'local' : 'cloud'
}

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, {cwd, encoding: 'utf8'}).trim()
}

function normalizeGithubRemoteUrl(remoteUrl: string): string {
  const sshMatch = remoteUrl.match(/^git@github\.com:(.+?)(?:\.git)?$/)
  if (sshMatch) {
    return `https://github.com/${sshMatch[1]}`
  }

  const httpsMatch = remoteUrl.match(/^https?:\/\/(?:[^@/]+@)?github\.com\/(.+?)(?:\.git)?$/)
  if (httpsMatch) {
    return `https://github.com/${httpsMatch[1]}`
  }

  return remoteUrl.replace(/\.git$/, '')
}

function createAgentForRuntime(args: {
  apiKey: string
  cwd: string
  modelId: string
  prompt: string
}) {
  const runtime = getRequestedRuntime()
  if (runtime === 'local') {
    return Agent.create({
      apiKey: args.apiKey,
      model: {id: args.modelId},
      local: {cwd: args.cwd},
      addedSystemInstruction: args.prompt,
    })
  }

  const remoteUrl = normalizeGithubRemoteUrl(git(['config', '--get', 'remote.origin.url'], args.cwd))
  const startingRef = git(['rev-parse', '--abbrev-ref', 'HEAD'], args.cwd)
  return Agent.create({
    apiKey: args.apiKey,
    model: {id: args.modelId},
    cloud: {
      repos: [{url: remoteUrl, startingRef}],
      autoGenerateBranch: true,
      autoCreatePR: false,
    },
    addedSystemInstruction: args.prompt,
  })
}

function buildPrompt(role: SpecialistRole, experimentFlags: ExperimentFlags[]) {
  const fixtures = FIXTURES
  const shardLines = ([] as string[]).concat(
    ...MIGRATION_SHARDS.map((shard: MigrationShard) => summarizeShard(shard)),
  )
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
    '- Migration shard map:',
    ...shardLines,
    '',
    'Current experiment flags under comparison:',
    ...experimentFlags.map(flags => `  - ${JSON.stringify(flags)}`),
    '',
    'Constraints:',
    '- Prefer evidence-driven recommendations grounded in browser timing.',
    '- Maintain parity on supported fixtures.',
    '- Rust/WASM is only worthwhile if it wins end-to-end.',
    '- Organize the repo into many cloud-agent tasks instead of a single monolithic migration.',
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
  const runtime = getRequestedRuntime()
  let agent: ReturnType<typeof createAgentForRuntime> | null = null
  try {
    agent = createAgentForRuntime({
      apiKey,
      cwd,
      modelId,
      prompt: specialist.prompt,
    })
    const run = await agent.send(buildPrompt(specialist.role, experimentFlags))
    const result = await run.wait()
    return {
      role: specialist.role,
      modelId,
      runtime,
      status: result.status,
      text: result.result || '',
    }
  } catch (error) {
    return {
      role: specialist.role,
      modelId,
      runtime,
      status: 'error' as const,
      text: error instanceof Error ? error.message : `${error}`,
    }
  } finally {
    if (agent) {
      agent.close()
    }
  }
}

function toSummaryReport(
  specialistOutputs: Awaited<ReturnType<typeof runSpecialist>>[],
): BuildPerfReportInput {
  const summaryLines = specialistOutputs.map(
    output =>
      `${output.role} (${output.modelId}, ${output.runtime}, ${output.status}): ${
        output.text || 'no text output'
      }`,
  )
  summaryLines.push('')
  summaryLines.push('Proposed migration shards:')
  for (const shard of MIGRATION_SHARDS) {
    summaryLines.push(
      `${shard.id}: ${shard.suggestedModelFamily} / ${shard.keepInTypeScript ? 'keep-ts' : 'rust-candidate'} / ${shard.label}`,
    )
  }
  const emptyBenchmark: BrowserBenchmarkReport = {
    generatedAt: new Date().toISOString(),
    experiment: {
      experimentName: 'cursor-orchestrator',
      experiments: {
        deferDemangle: false,
        optimizedForEachCall: false,
        rustFuzzyFind: false,
        rustFirefoxImport: false,
        rustBase64Decode: false,
        rustProfileSearch: false,
        rustTextUtils: false,
        rustPprofImport: false,
        rustV8CpuFormatter: false,
        rustHaskellImport: false,
        rustInstrumentsDeepCopy: false,
        rustCallgrindImport: false,
        rustV8ProfLog: false,
        rustLinuxPerf: false,
      },
    },
    results: [],
  }
  const emptyParity: ParityReport = {
    generatedAt: new Date().toISOString(),
    experiment: {
      deferDemangle: false,
      optimizedForEachCall: false,
      rustFuzzyFind: false,
      rustFirefoxImport: false,
      rustBase64Decode: false,
      rustProfileSearch: false,
      rustTextUtils: false,
      rustPprofImport: false,
      rustV8CpuFormatter: false,
      rustHaskellImport: false,
      rustInstrumentsDeepCopy: false,
      rustCallgrindImport: false,
      rustV8ProfLog: false,
      rustLinuxPerf: false,
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

function createSummaryPayload(specialistOutputs: Awaited<ReturnType<typeof runSpecialist>>[]) {
  return {
    generatedAt: new Date().toISOString(),
    runtime: getRequestedRuntime(),
    specialists: specialistOutputs.map(output => ({
      role: output.role,
      modelId: output.modelId,
      runtime: output.runtime,
      status: output.status,
      text: output.text,
    })),
    migrationShards: MIGRATION_SHARDS,
  }
}

async function main() {
  const apiKey = requireApiKey()
  const cwd = path.resolve('/workspace')
  const models = await fetchCursorModels(apiKey)
  ensureRequestedModelFamilies(models, ['composer-2', 'gpt-5.4', 'opus-4.6'])

  const experimentFlags: ExperimentFlags[] = [
    {
      deferDemangle: false,
      optimizedForEachCall: false,
      rustFuzzyFind: false,
      rustFirefoxImport: false,
      rustBase64Decode: false,
      rustProfileSearch: false,
      rustTextUtils: false,
      rustPprofImport: false,
      rustV8CpuFormatter: false,
      rustHaskellImport: false,
      rustInstrumentsDeepCopy: false,
      rustCallgrindImport: false,
      rustV8ProfLog: false,
      rustLinuxPerf: false,
    },
    {
      deferDemangle: true,
      optimizedForEachCall: false,
      rustFuzzyFind: false,
      rustFirefoxImport: false,
      rustBase64Decode: false,
      rustProfileSearch: false,
      rustTextUtils: false,
      rustPprofImport: false,
      rustV8CpuFormatter: false,
      rustHaskellImport: false,
      rustInstrumentsDeepCopy: false,
      rustCallgrindImport: false,
      rustV8ProfLog: false,
      rustLinuxPerf: false,
    },
    {
      deferDemangle: false,
      optimizedForEachCall: true,
      rustFuzzyFind: false,
      rustFirefoxImport: false,
      rustBase64Decode: false,
      rustProfileSearch: false,
      rustTextUtils: false,
      rustPprofImport: false,
      rustV8CpuFormatter: false,
      rustHaskellImport: false,
      rustInstrumentsDeepCopy: false,
      rustCallgrindImport: false,
      rustV8ProfLog: false,
      rustLinuxPerf: false,
    },
    {
      deferDemangle: false,
      optimizedForEachCall: false,
      rustFuzzyFind: true,
      rustFirefoxImport: false,
      rustBase64Decode: false,
      rustProfileSearch: false,
      rustTextUtils: false,
      rustPprofImport: false,
      rustV8CpuFormatter: false,
      rustHaskellImport: false,
      rustInstrumentsDeepCopy: false,
      rustCallgrindImport: false,
      rustV8ProfLog: false,
      rustLinuxPerf: false,
    },
    {
      deferDemangle: false,
      optimizedForEachCall: false,
      rustFuzzyFind: false,
      rustFirefoxImport: false,
      rustBase64Decode: false,
      rustProfileSearch: false,
      rustTextUtils: false,
      rustPprofImport: true,
      rustV8CpuFormatter: false,
      rustHaskellImport: false,
      rustInstrumentsDeepCopy: false,
      rustCallgrindImport: false,
      rustV8ProfLog: false,
      rustLinuxPerf: false,
    },
    {
      deferDemangle: false,
      optimizedForEachCall: false,
      rustFuzzyFind: false,
      rustFirefoxImport: false,
      rustBase64Decode: false,
      rustProfileSearch: false,
      rustTextUtils: false,
      rustPprofImport: false,
      rustV8CpuFormatter: false,
      rustHaskellImport: true,
      rustInstrumentsDeepCopy: false,
      rustCallgrindImport: false,
      rustV8ProfLog: false,
      rustLinuxPerf: false,
    },
    {
      deferDemangle: false,
      optimizedForEachCall: false,
      rustFuzzyFind: false,
      rustFirefoxImport: false,
      rustBase64Decode: false,
      rustProfileSearch: false,
      rustTextUtils: false,
      rustPprofImport: false,
      rustV8CpuFormatter: false,
      rustHaskellImport: false,
      rustInstrumentsDeepCopy: false,
      rustCallgrindImport: true,
      rustV8ProfLog: false,
      rustLinuxPerf: false,
    },
    {
      deferDemangle: false,
      optimizedForEachCall: false,
      rustFuzzyFind: false,
      rustFirefoxImport: false,
      rustBase64Decode: false,
      rustProfileSearch: false,
      rustTextUtils: false,
      rustPprofImport: false,
      rustV8CpuFormatter: true,
      rustHaskellImport: false,
      rustInstrumentsDeepCopy: false,
      rustCallgrindImport: false,
      rustV8ProfLog: false,
      rustLinuxPerf: false,
    },
    {
      deferDemangle: false,
      optimizedForEachCall: false,
      rustFuzzyFind: false,
      rustBase64Decode: false,
      rustProfileSearch: false,
      rustTextUtils: false,
      rustPprofImport: false,
      rustV8CpuFormatter: false,
      rustHaskellImport: false,
      rustInstrumentsDeepCopy: false,
      rustCallgrindImport: false,
      rustV8ProfLog: true,
      rustLinuxPerf: false,
    },
    {
      deferDemangle: false,
      optimizedForEachCall: false,
      rustFuzzyFind: false,
      rustFirefoxImport: false,
      rustBase64Decode: false,
      rustProfileSearch: false,
      rustTextUtils: false,
      rustPprofImport: false,
      rustHaskellImport: false,
      rustInstrumentsDeepCopy: false,
      rustCallgrindImport: false,
      rustV8ProfLog: false,
      rustLinuxPerf: true,
    },
    {
      deferDemangle: false,
      optimizedForEachCall: false,
      rustFuzzyFind: false,
      rustBase64Decode: false,
      rustProfileSearch: false,
      rustTextUtils: false,
      rustPprofImport: false,
      rustV8CpuFormatter: false,
      rustHaskellImport: false,
      rustInstrumentsDeepCopy: true,
      rustCallgrindImport: false,
      rustV8ProfLog: false,
    },
    {
      deferDemangle: false,
      optimizedForEachCall: false,
      rustFuzzyFind: false,
      rustFirefoxImport: true,
      rustBase64Decode: false,
      rustProfileSearch: false,
      rustTextUtils: false,
      rustPprofImport: false,
      rustHaskellImport: false,
      rustInstrumentsDeepCopy: false,
      rustCallgrindImport: false,
      rustV8ProfLog: false,
    },
  ]

  const specialistOutputs = await Promise.all(
    getSpecialists().map(specialist =>
      runSpecialist(apiKey, cwd, models, specialist, experimentFlags),
    ),
  )

  const reportInput = toSummaryReport(specialistOutputs)
  const summaryPayload = createSummaryPayload(specialistOutputs)
  const outputDir = ensureOutputDir()
  writeFileSync(
    path.join(outputDir, 'cursor-orchestrator-summary.json'),
    JSON.stringify(summaryPayload, null, 2),
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
