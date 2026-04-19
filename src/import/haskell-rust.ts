import initRustHaskellImport, {
  import_haskell_profile_json as importHaskellProfileRustJson,
} from '../../rust/haskell-import/pkg/haskell_import.js'
import {readNodeFileSync, resolveFromCwd} from '../lib/node-shim'

export interface RustHaskellEvent {
  frame: number
  at: number
  open: boolean
}

export interface RustHaskellFrame {
  key: number
  name: string
  file?: string
}

export interface RustImportedHaskellProfile {
  program: string
  total_ticks: number
  frames: RustHaskellFrame[]
  time_events: RustHaskellEvent[]
  alloc_events: RustHaskellEvent[]
}

let modulePromise: Promise<void> | null = null

function isNodeRuntime() {
  return typeof process !== 'undefined' && !!process.versions?.node
}

async function initializeModule(): Promise<void> {
  if (isNodeRuntime()) {
    await initRustHaskellImport({
      module_or_path: readNodeFileSync(
        resolveFromCwd('rust', 'haskell-import', 'pkg', 'haskell_import_bg.wasm'),
      ),
    })
    return
  }

  const wasmBinaryModule = await import('../../rust/haskell-import/pkg/haskell_import_bg.wasm')
  const wasmBinaryPath = wasmBinaryModule.default
  await initRustHaskellImport({module_or_path: wasmBinaryPath as unknown as string})
}

export async function loadRustHaskellImporter(): Promise<
  (profile: unknown) => RustImportedHaskellProfile
> {
  if (!modulePromise) {
    modulePromise = initializeModule()
  }
  await modulePromise

  return (profile: unknown) =>
    JSON.parse(importHaskellProfileRustJson(JSON.stringify(profile))) as RustImportedHaskellProfile
}
