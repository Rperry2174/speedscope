import {mkdirSync, writeFileSync} from 'fs'
import {execFileSync} from 'child_process'
import * as path from 'path'
import {Agent} from '@cursor/february'
import {ensureRequestedModelFamilies, fetchCursorModels, selectCursorModel} from './cursor-api'
import {MIGRATION_TASKS, type MigrationDelegationTask} from './migration-plan'

function requireApiKey() {
  const apiKey = process.env.CURSOR_API_KEY
  if (!apiKey) {
    throw new Error('CURSOR_API_KEY must be set to delegate migration tasks')
  }
  return apiKey
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

function createCloudAgent(args: {
  apiKey: string
  cwd: string
  modelId: string
  prompt: string
}) {
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

function buildTaskPrompt(task: MigrationDelegationTask) {
  return [
    `You are executing the migration task "${task.title}" for the SpeedScope repository.`,
    '',
    `Execution mode: ${task.mode}`,
    `Suggested model family: ${task.suggestedModelFamily}`,
    '',
    'Files in scope:',
    ...task.paths.map(filePath => `- ${filePath}`),
    '',
    `Rationale: ${task.rationale}`,
    '',
    'Verification commands to run when relevant:',
    ...task.verification.map(command => `- ${command}`),
    '',
    'Instructions:',
    '- Migrate only the files in scope that actually make sense to move to Rust/WASM.',
    '- Leave browser/UI/DOM/WebGL ownership in TypeScript unless there is a compelling narrow boundary.',
    '- Keep safe TypeScript fallbacks where compatibility is uncertain.',
    '- Add or update tests when it materially improves confidence.',
    '- If the files in scope should remain in TypeScript, explain why and do not force a translation.',
    '- Summarize what you changed, what stayed in TS, and any blockers.',
  ].join('\n')
}

async function main() {
  const apiKey = requireApiKey()
  const cwd = path.resolve('/workspace')
  const models = await fetchCursorModels(apiKey)
  ensureRequestedModelFamilies(models, ['composer-2', 'gpt-5.4', 'opus-4.6'])

  const outputDir = path.resolve('/workspace/artifacts/perf')
  mkdirSync(outputDir, {recursive: true})

  const results: Array<{
    taskId: string
    title: string
    modelId: string
    status: string
    agentId?: string
    branch?: string
    prUrl?: string
    result?: string
    error?: string
  }> = []

  for (const task of MIGRATION_TASKS) {
    const modelId = selectCursorModel(models, task.suggestedModelFamily)
    let agent: ReturnType<typeof createCloudAgent> | null = null
    try {
      agent = createCloudAgent({
        apiKey,
        cwd,
        modelId,
        prompt: `You are a shard migration agent for the SpeedScope Rust migration.`,
      })
      const run = await agent.send(buildTaskPrompt(task))
      const result = await run.wait()
      results.push({
        taskId: task.id,
        title: task.title,
        modelId,
        status: result.status,
        agentId: agent.agentId,
        branch: result.git?.branch,
        prUrl: result.git?.prUrl,
        result: result.result,
      })
    } catch (error) {
      results.push({
        taskId: task.id,
        title: task.title,
        modelId,
        status: 'error',
        error: error instanceof Error ? error.message : `${error}`,
        agentId: agent ? agent.agentId : undefined,
      })
    } finally {
      if (agent) {
        agent.close()
      }
    }
  }

  writeFileSync(
    path.join(outputDir, 'migration-delegation-summary.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        tasks: results,
      },
      null,
      2,
    ),
  )

  console.log(JSON.stringify({outputDir, tasks: results}, null, 2))
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
