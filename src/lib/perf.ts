import {getExperimentFlags, isPerfInstrumentationEnabled} from './runtime-config'

type PerfValue = string | number | boolean | null

export interface PerfRunMetadata {
  fileName?: string
  loadSource?: string
  route?: string
}

export interface PerfRun {
  id: string
  startedAt: number
  finishedAt: number | null
  status: 'running' | 'completed' | 'error'
  metadata: PerfRunMetadata
  experimentFlags: ReturnType<typeof getExperimentFlags>
  milestones: {[key: string]: number}
  measures: {[key: string]: number[]}
  annotations: {[key: string]: PerfValue}
}

interface PerfDebugApi {
  getState: () => PerfState
  reset: () => void
}

export interface PerfState {
  enabled: boolean
  activeRun: PerfRun | null
  runs: PerfRun[]
}

declare global {
  interface Window {
    __speedscopePerf?: PerfDebugApi
  }
}

let activeRun: PerfRun | null = null
let runs: PerfRun[] = []
let nextRunId = 1

function now() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

function canUsePerformanceMarks() {
  return typeof performance !== 'undefined' && typeof performance.mark === 'function'
}

function canUsePerformanceMeasures() {
  return typeof performance !== 'undefined' && typeof performance.measure === 'function'
}

function toRelativeTime(timestamp: number, run: PerfRun) {
  return Math.max(0, timestamp - run.startedAt)
}

function markPerformance(name: string) {
  if (!canUsePerformanceMarks()) return
  performance.mark(`speedscope:${name}`)
}

function measurePerformance(name: string, startMark: string, endMark: string) {
  if (!canUsePerformanceMeasures()) return
  performance.measure(`speedscope:${name}`, `speedscope:${startMark}`, `speedscope:${endMark}`)
}

function getDebugApi(): PerfDebugApi {
  return {
    getState() {
      return getPerfState()
    },
    reset() {
      resetPerfState()
    },
  }
}

function installDebugApi() {
  if (typeof window === 'undefined') return
  window.__speedscopePerf = getDebugApi()
}

function cloneRun(run: PerfRun): PerfRun {
  return JSON.parse(JSON.stringify(run))
}

function ensureActiveRun() {
  if (!isPerfInstrumentationEnabled()) return null
  if (!activeRun) return null
  return activeRun
}

function commitActiveRun() {
  if (!activeRun) return
  const existingIndex = runs.findIndex(run => run.id === activeRun!.id)
  const cloned = cloneRun(activeRun)
  if (existingIndex === -1) {
    runs = runs.concat([cloned])
  } else {
    runs = runs.map((run, index) => (index === existingIndex ? cloned : run))
  }
}

installDebugApi()

export function resetPerfState() {
  activeRun = null
  runs = []
  nextRunId = 1
}

export function getPerfState(): PerfState {
  return {
    enabled: isPerfInstrumentationEnabled(),
    activeRun: activeRun ? cloneRun(activeRun) : null,
    runs: runs.map(run => cloneRun(run)),
  }
}

export function startPerfRun(metadata: PerfRunMetadata) {
  if (!isPerfInstrumentationEnabled()) return null
  if (activeRun) {
    completePerfRun('error')
  }
  activeRun = {
    id: `run-${nextRunId++}`,
    startedAt: now(),
    finishedAt: null,
    status: 'running',
    metadata,
    experimentFlags: getExperimentFlags(),
    milestones: {},
    measures: {},
    annotations: {},
  }
  notePerfMilestone('load_start')
  annotatePerfRun('route', metadata.route || 'browser')
  commitActiveRun()
  return activeRun.id
}

export function updatePerfMetadata(metadata: Partial<PerfRunMetadata>) {
  const run = ensureActiveRun()
  if (!run) return
  run.metadata = {
    ...run.metadata,
    ...metadata,
  }
  commitActiveRun()
}

export function annotatePerfRun(key: string, value: PerfValue) {
  const run = ensureActiveRun()
  if (!run) return
  run.annotations[key] = value
  commitActiveRun()
}

export function notePerfMilestone(name: string) {
  const run = ensureActiveRun()
  if (!run) return
  if (run.milestones[name] != null) return
  const timestamp = now()
  run.milestones[name] = toRelativeTime(timestamp, run)
  markPerformance(`${run.id}:${name}`)
  commitActiveRun()
}

export function hasPerfMilestone(name: string): boolean {
  const run = ensureActiveRun()
  if (!run) return false
  return run.milestones[name] != null
}

export function timePerfSync<T>(name: string, cb: () => T): T {
  const run = ensureActiveRun()
  if (!run) return cb()

  const startMark = `${run.id}:${name}:start:${run.measures[name]?.length || 0}`
  const endMark = `${run.id}:${name}:end:${run.measures[name]?.length || 0}`
  markPerformance(startMark)
  const start = now()
  try {
    return cb()
  } finally {
    const duration = now() - start
    if (!run.measures[name]) run.measures[name] = []
    run.measures[name].push(duration)
    markPerformance(endMark)
    measurePerformance(`${run.id}:${name}`, startMark, endMark)
    commitActiveRun()
  }
}

export async function timePerfAsync<T>(name: string, cb: () => Promise<T>): Promise<T> {
  const run = ensureActiveRun()
  if (!run) return cb()

  const measureIndex = run.measures[name]?.length || 0
  const startMark = `${run.id}:${name}:start:${measureIndex}`
  const endMark = `${run.id}:${name}:end:${measureIndex}`
  markPerformance(startMark)
  const start = now()
  try {
    return await cb()
  } finally {
    const duration = now() - start
    if (!run.measures[name]) run.measures[name] = []
    run.measures[name].push(duration)
    markPerformance(endMark)
    measurePerformance(`${run.id}:${name}`, startMark, endMark)
    commitActiveRun()
  }
}

export function completePerfRun(status: 'completed' | 'error' = 'completed') {
  const run = ensureActiveRun()
  if (!run) return
  notePerfMilestone('run_complete')
  run.status = status
  run.finishedAt = now()
  commitActiveRun()
  activeRun = null
}

export async function afterNextPaint(cb: () => void | Promise<void>) {
  await new Promise<void>(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
  await cb()
}
