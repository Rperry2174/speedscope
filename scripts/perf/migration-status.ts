import * as fs from 'fs'
import * as path from 'path'
import {execFileSync} from 'child_process'

import {MIGRATION_SHARDS, MIGRATION_TASKS} from './migration-plan'

interface StatusSummary {
  generatedAt: string
  counts: {
    ts: number
    tsx: number
    rs: number
    wasm: number
  }
  lineCounts: {
    ts: number
    tsx: number
    rs: number
  }
  rustMigratedPaths: string[]
  shardSummary: Array<{
    shardId: string
    label: string
    keepInTypeScript: boolean
    suggestedModelFamily: string
    paths: string[]
  }>
  migrationTasks: Array<{
    id: string
    title: string
    shardId: string
    modelFamily: string
    executionMode: string
    files: string[]
  }>
}

function gitLsFiles(): string[] {
  return execFileSync('git', ['ls-files'], {
    cwd: '/workspace',
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
}

function countLines(filePath: string): number {
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .length
}

function buildStatusSummary(): StatusSummary {
  const repoRoot = '/workspace'
  const files = gitLsFiles()
  const counts = {ts: 0, tsx: 0, rs: 0, wasm: 0}
  const lineCounts = {ts: 0, tsx: 0, rs: 0}

  for (const relativePath of files) {
    const absolutePath = path.join(repoRoot, relativePath)
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) continue
    if (relativePath.endsWith('.ts')) {
      counts.ts++
      lineCounts.ts += countLines(absolutePath)
    } else if (relativePath.endsWith('.tsx')) {
      counts.tsx++
      lineCounts.tsx += countLines(absolutePath)
    } else if (relativePath.endsWith('.rs')) {
      counts.rs++
      lineCounts.rs += countLines(absolutePath)
    } else if (relativePath.endsWith('.wasm')) {
      counts.wasm++
    }
  }

  const rustMigratedPaths = [
    'src/lib/fuzzy-find.ts',
    'rust/fuzzy-find/src/lib.rs',
    'rust/fuzzy-find/pkg/fuzzy_find.js',
    'rust/fuzzy-find/pkg/fuzzy_find_bg.wasm',
  ]

  return {
    generatedAt: new Date().toISOString(),
    counts,
    lineCounts,
    rustMigratedPaths,
    shardSummary: MIGRATION_SHARDS.map(shard => ({
      shardId: shard.id,
      label: shard.label,
      keepInTypeScript: shard.keepInTypeScript,
      suggestedModelFamily: shard.suggestedModelFamily,
      paths: shard.paths.slice(),
    })),
    migrationTasks: MIGRATION_TASKS.map(task => ({
      id: task.id,
      title: task.title,
      shardId: task.mode,
      modelFamily: task.suggestedModelFamily,
      executionMode: task.mode,
      files: task.paths.slice(),
    })),
  }
}

function main() {
  const summary = buildStatusSummary()
  const outputPath = path.join('/workspace', 'artifacts', 'perf', 'migration-status.json')
  fs.mkdirSync(path.dirname(outputPath), {recursive: true})
  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2))
  console.log(JSON.stringify({outputPath, summary}, null, 2))
}

main()
