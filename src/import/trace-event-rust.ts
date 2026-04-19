import {isExperimentEnabled} from '../lib/runtime-config'

export interface RustImportableTraceEvent {
  pid: number
  tid: number
  ph: 'B' | 'E' | 'X'
  ts: number
  name?: string
  args_json?: string
  dur?: number
  tdur?: number
  ordinal: number
}

let modulePromise: Promise<void> | null = null
let rustImporter: ((events: RustImportableTraceEvent[]) => string) | null = null
let rustModulePromise: Promise<typeof import('../../rust/trace-event-import/pkg/trace_event_import.js')> | null =
  null

const browserWasmPath = '../../rust/trace-event-import/pkg/trace_event_import_bg.wasm'

async function loadRustModule() {
  if (!rustModulePromise) {
    rustModulePromise = import('../../rust/trace-event-import/pkg/trace_event_import.js')
  }
  return rustModulePromise
}

async function initializeModule(): Promise<void> {
  const rustModule = await loadRustModule()
  const isNodeRuntime =
    typeof process !== 'undefined' && process.versions != null && process.versions.node != null
  if (isNodeRuntime) {
    const fs = await import('fs')
    const path = await import('path')
    const wasmPath = path.join(
      process.cwd(),
      'rust',
      'trace-event-import',
      'pkg',
      'trace_event_import_bg.wasm',
    )
    await rustModule.default(fs.readFileSync(wasmPath))
    return
  }

  await rustModule.default(browserWasmPath)
}

export async function loadRustTraceEventImporter(): Promise<
  (events: RustImportableTraceEvent[]) => string
> {
  if (!modulePromise) {
    modulePromise = initializeModule()
  }
  await modulePromise
  const rustModule = await loadRustModule()

  const importer = (events: RustImportableTraceEvent[]) =>
    rustModule.import_trace_events_json(JSON.stringify({events}))
  rustImporter = importer
  return importer
}

export function shouldUseRustTraceEventImporter(): boolean {
  return isExperimentEnabled('rustTraceEventImport')
}

export function getRustTraceEventImporter():
  | ((events: RustImportableTraceEvent[]) => string)
  | null {
  if (!shouldUseRustTraceEventImporter()) {
    return null
  }
  return rustImporter
}
