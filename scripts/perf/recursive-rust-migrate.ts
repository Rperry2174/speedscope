import * as fs from 'fs'
import * as path from 'path'
import {execFileSync, execFile} from 'child_process'
import {promisify} from 'util'
import {fetchCursorModels, selectCursorModel} from './cursor-api'

const execFileAsync = promisify(execFile)

type ModelFamily = 'composer-2' | 'gpt-5.4' | 'opus-4.6'
type TaskMode = 'migrate-rust' | 'keep-ts-review' | 'proof-point'

interface RecursiveTask {
  id: string
  title: string
  mode: TaskMode
  modelFamily: ModelFamily
  rationale: string
  verification: string[]
  files: string[]
}

interface CreatedAgentResult {
  taskId: string
  title: string
  mode: TaskMode
  modelId: string
  files: string[]
  agentId?: string
  agentUrl?: string
  branchName?: string
  runId?: string
  status: string
  result?: string
  error?: string
}

const ROOTS = ['src', 'scripts']
const MAX_MIGRATION_FILES_PER_TASK = 3
const MAX_KEEP_TS_FILES_PER_TASK = 6

function requireApiKey(): string {
  const apiKey = process.env.CURSOR_API_KEY
  if (!apiKey) {
    throw new Error('CURSOR_API_KEY must be set to run recursive Rust migration delegation')
  }
  return apiKey
}

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, {cwd, encoding: 'utf8'}).trim()
}

function normalizeGithubRemoteUrl(remoteUrl: string): string {
  const sshMatch = remoteUrl.match(/^git@github\.com:(.+?)(?:\.git)?$/)
  if (sshMatch) return `https://github.com/${sshMatch[1]}`

  const httpsMatch = remoteUrl.match(/^https?:\/\/(?:[^@/]+@)?github\.com\/(.+?)(?:\.git)?$/)
  if (httpsMatch) return `https://github.com/${httpsMatch[1]}`

  return remoteUrl.replace(/\.git$/, '')
}

function toTaskId(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function collectTsFilesRecursive(dirPath: string, repoRoot: string): string[] {
  if (!fs.existsSync(dirPath)) return []

  const entries = fs.readdirSync(dirPath, {withFileTypes: true})
  let files: string[] = []
  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      files = files.concat(collectTsFilesRecursive(absolutePath, repoRoot))
      continue
    }

    const relativePath = path.relative(repoRoot, absolutePath).replace(/\\/g, '/')
    if (relativePath.includes('/node_modules/')) continue
    if (relativePath.includes('/dist/')) continue
    if (relativePath.endsWith('.ts') || relativePath.endsWith('.tsx')) {
      files.push(relativePath)
    }
  }
  return files
}

function classifyFile(filePath: string): {
  mode: TaskMode
  modelFamily: ModelFamily
  rationale: string
  verification: string[]
} {
  if (
    filePath.startsWith('src/views/') ||
    filePath.startsWith('src/gl/') ||
    filePath.startsWith('src/app-state/') ||
    filePath.includes('/themes/') ||
    filePath.endsWith('.tsx')
  ) {
    return {
      mode: 'keep-ts-review',
      modelFamily: 'composer-2',
      rationale:
        'This file is tightly coupled to browser UI, DOM, canvas, or Preact rendering and should usually remain in TypeScript.',
      verification: ['npm run typecheck'],
    }
  }

  if (filePath.startsWith('scripts/')) {
    return {
      mode: 'keep-ts-review',
      modelFamily: 'composer-2',
      rationale:
        'This file is part of the Node/SDK control plane and is better kept as TypeScript orchestration code.',
      verification: ['npm run typecheck'],
    }
  }

  if (filePath === 'src/lib/fuzzy-find.ts') {
    return {
      mode: 'proof-point',
      modelFamily: 'gpt-5.4',
      rationale:
        'This file is already migrated to Rust/WASM in this branch and should be used as a proof point and reference boundary.',
      verification: ['npm run build:rust:fuzzy-find', 'npm run jest -- src/lib/fuzzy-find.test.ts'],
    }
  }

  if (
    filePath === 'src/lib/profile.ts' ||
    filePath === 'src/lib/flamechart.ts' ||
    filePath === 'src/import/pprof.ts' ||
    filePath === 'src/import/java-flight-recorder.ts'
  ) {
    return {
      mode: 'migrate-rust',
      modelFamily: 'opus-4.6',
      rationale:
        'This file is a compute-heavy or binary-boundary core module and is a strong Rust/WASM migration candidate.',
      verification: ['npm run typecheck', 'npm run perf:parity'],
    }
  }

  if (filePath.startsWith('src/import/')) {
    return {
      mode: 'migrate-rust',
      modelFamily: 'gpt-5.4',
      rationale:
        'This importer/parser stage is a good Rust candidate while keeping browser File/ArrayBuffer integration in TypeScript.',
      verification: ['npm run typecheck', 'npm run perf:parity'],
    }
  }

  if (
    filePath.startsWith('src/lib/') &&
    !filePath.startsWith('src/lib/demangle/')
  ) {
    return {
      mode: 'migrate-rust',
      modelFamily: 'gpt-5.4',
      rationale:
        'This library file looks algorithmic enough to evaluate as a Rust/WASM boundary with a TypeScript fallback.',
      verification: ['npm run typecheck'],
    }
  }

  return {
    mode: 'keep-ts-review',
    modelFamily: 'composer-2',
    rationale:
      'This file should be reviewed before migration and likely kept in TypeScript unless a narrower boundary emerges.',
    verification: ['npm run typecheck'],
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }
  return result
}

function buildRecursiveTasks(repoRoot: string): RecursiveTask[] {
  const allFiles = ROOTS.reduce<string[]>((files, root) => {
    return files.concat(collectTsFilesRecursive(path.join(repoRoot, root), repoRoot))
  }, [])

  const groupedByDirectory = new Map<string, string[]>()
  for (const filePath of allFiles) {
    const directory = path.dirname(filePath)
    const existing = groupedByDirectory.get(directory) || []
    existing.push(filePath)
    groupedByDirectory.set(directory, existing)
  }

  const tasks: RecursiveTask[] = []

  tasks.push({
    id: 'proof-point-fuzzy-find',
    title: 'Validate Rust fuzzy-find proof point',
    mode: 'proof-point',
    modelFamily: 'gpt-5.4',
    rationale:
      'Use the existing Rust fuzzy-find migration as a known-good proof point and reference boundary.',
    verification: ['npm run build:rust:fuzzy-find', 'npm run jest -- src/lib/fuzzy-find.test.ts'],
    files: ['src/lib/fuzzy-find.ts', 'src/lib/fuzzy-find-rust.ts', 'rust/fuzzy-find/**'],
  })

  const directories = Array.from(groupedByDirectory.keys()).sort()
  for (const directory of directories) {
    const files = (groupedByDirectory.get(directory) || []).filter(filePath => filePath !== 'src/lib/fuzzy-find.ts')
    if (files.length === 0) continue

    const byMode = new Map<string, {files: string[]; sample: ReturnType<typeof classifyFile>}>()
    for (const filePath of files) {
      const classification = classifyFile(filePath)
      const key = `${classification.mode}:${classification.modelFamily}:${classification.rationale}`
      const existing = byMode.get(key)
      if (existing) {
        existing.files.push(filePath)
      } else {
        byMode.set(key, {files: [filePath], sample: classification})
      }
    }

    for (const [, group] of byMode) {
      const chunkSize =
        group.sample.mode === 'migrate-rust' ? MAX_MIGRATION_FILES_PER_TASK : MAX_KEEP_TS_FILES_PER_TASK
      const fileChunks = chunk(group.files.sort(), chunkSize)
      fileChunks.forEach((fileChunk, index) => {
        tasks.push({
          id: `${toTaskId(directory)}-${group.sample.mode}-${index + 1}`,
          title: `${group.sample.mode === 'migrate-rust' ? 'Migrate to Rust' : 'Review keep-in-TS'}: ${directory}`,
          mode: group.sample.mode,
          modelFamily: group.sample.modelFamily,
          rationale: group.sample.rationale,
          verification: group.sample.verification.slice(),
          files: fileChunk,
        })
      })
    }
  }

  return tasks
}

async function curlJson(args: string[], stdin?: string): Promise<any> {
  const result = spawnSync('curl', args, {
    input: stdin,
    maxBuffer: 8 * 1024 * 1024,
    encoding: 'utf8',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error((result.stderr || '').trim() || `curl exited with status ${result.status}`)
  }
  return JSON.parse(result.stdout)
}

async function createCloudAgentRun(args: {
  apiKey: string
  repoUrl: string
  startingRef: string
  modelId: string
  task: RecursiveTask
}): Promise<{
  agentId: string
  agentUrl: string
  branchName: string
  runId: string
}> {
  const branchName = `cursor/${toTaskId(args.task.id).slice(0, 45)}-bc66`
  const payload = {
    prompt: {
      text: [
        `Task: ${args.task.title}`,
        '',
        `Mode: ${args.task.mode}`,
        `Rationale: ${args.task.rationale}`,
        '',
        'Files in scope:',
        ...args.task.files.map(filePath => `- ${filePath}`),
        '',
        'Instructions:',
        '- Recursively inspect only the files and nearby dependencies needed for this shard.',
        '- Migrate code to Rust/WASM only where it makes sense.',
        '- If a file should stay in TypeScript, do not force a translation; explain why.',
        '- Keep or add a TypeScript fallback if compatibility risk is significant.',
        '- Summarize what was migrated, what stayed in TypeScript, and why.',
        '- Run the listed verification commands if you make changes.',
        '',
        'Verification commands:',
        ...args.task.verification.map(command => `- ${command}`),
      ].join('\n'),
    },
    model: {id: args.modelId},
    repos: [{url: args.repoUrl, startingRef: args.startingRef}],
    branchName,
    autoGenerateBranch: false,
    autoCreatePR: false,
    skipReviewerRequest: true,
  }

  const response = await curlJson([
    '-sS',
    '--fail',
    '-u',
    `${args.apiKey}:`,
    '-H',
    'Content-Type: application/json',
    '-d',
    JSON.stringify(payload),
    'https://api.cursor.com/v1/agents',
  ])

  return {
    agentId: response.agent.id,
    agentUrl: response.agent.url,
    branchName: response.agent.branchName,
    runId: response.run.id,
  }
}

async function getRunStatus(args: {
  apiKey: string
  agentId: string
  runId: string
}): Promise<any> {
  return curlJson([
    '-sS',
    '--fail',
    '-u',
    `${args.apiKey}:`,
    `https://api.cursor.com/v1/agents/${args.agentId}/runs/${args.runId}`,
  ])
}

async function runWithConcurrency<T, U>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
  const results: U[] = new Array(items.length)
  let cursor = 0

  async function worker() {
    while (cursor < items.length) {
      const currentIndex = cursor++
      results[currentIndex] = await fn(items[currentIndex], currentIndex)
    }
  }

  const workers = Array.from({length: Math.min(limit, items.length)}, () => worker())
  await Promise.all(workers)
  return results
}

function buildMarkdownSummary(tasks: CreatedAgentResult[], generatedTasks: RecursiveTask[]): string {
  const lines: string[] = []
  lines.push('# Recursive Rust migration delegation')
  lines.push('')
  lines.push(`Generated tasks: ${generatedTasks.length}`)
  lines.push(`Completed records: ${tasks.length}`)
  lines.push('')
  lines.push('## Tasks')
  lines.push('')

  for (const task of tasks) {
    lines.push(`### ${task.taskId}`)
    lines.push(`- title: ${task.title}`)
    lines.push(`- mode: ${task.mode}`)
    lines.push(`- model: ${task.modelId}`)
    lines.push(`- status: ${task.status}`)
    if (task.agentId) lines.push(`- agentId: ${task.agentId}`)
    if (task.agentUrl) lines.push(`- agentUrl: ${task.agentUrl}`)
    if (task.branchName) lines.push(`- branch: ${task.branchName}`)
    if (task.error) lines.push(`- error: ${task.error}`)
    if (task.result) lines.push(`- result: ${task.result}`)
    lines.push('- files:')
    for (const filePath of task.files) {
      lines.push(`  - ${filePath}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

async function main() {
  const apiKey = requireApiKey()
  const repoRoot = '/workspace'
  const repoUrl = normalizeGithubRemoteUrl(git(['config', '--get', 'remote.origin.url'], repoRoot))
  const startingRef = git(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot)
  const models = await fetchCursorModels(apiKey)
  const tasks = buildRecursiveTasks(repoRoot)
  const outputDir = path.join(repoRoot, 'artifacts', 'perf')

  fs.mkdirSync(outputDir, {recursive: true})

  const results = await runWithConcurrency(tasks, 4, async task => {
    const modelId = selectCursorModel(models, task.modelFamily)
    try {
      const created = await createCloudAgentRun({
        apiKey,
        repoUrl,
        startingRef,
        modelId,
        task,
      })
      const runStatus = await getRunStatus({
        apiKey,
        agentId: created.agentId,
        runId: created.runId,
      })
      return {
        taskId: task.id,
        title: task.title,
        mode: task.mode,
        modelId,
        files: task.files.slice(),
        agentId: created.agentId,
        agentUrl: created.agentUrl,
        branchName: created.branchName,
        runId: created.runId,
        status: runStatus.status,
        result: runStatus.result,
      } satisfies CreatedAgentResult
    } catch (error) {
      return {
        taskId: task.id,
        title: task.title,
        mode: task.mode,
        modelId,
        files: task.files.slice(),
        status: 'ERROR',
        error: error instanceof Error ? error.message : `${error}`,
      } satisfies CreatedAgentResult
    }
  })

  const jsonPath = path.join(outputDir, 'recursive-migration-summary.json')
  const mdPath = path.join(outputDir, 'recursive-migration-summary.md')

  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        repoUrl,
        startingRef,
        taskCount: tasks.length,
        tasks,
        results,
      },
      null,
      2,
    ),
  )
  fs.writeFileSync(mdPath, buildMarkdownSummary(results, tasks))

  console.log(JSON.stringify({jsonPath, mdPath, taskCount: tasks.length, results}, null, 2))
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
