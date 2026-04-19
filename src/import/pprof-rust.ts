import {isExperimentEnabled} from '../lib/runtime-config'
import {PprofImportPayload} from './pprof-format'

let modulePromise: Promise<void> | null = null
let rustDecoder: ((rawProfile: ArrayBuffer) => PprofImportPayload | null) | null = null

async function initializeModule(): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('Rust pprof decoder is only available in browser-like environments')
  }

  const [{default: initRustPprofImport, decode_pprof_to_json: decodePprofToJson}, wasmModule] =
    await Promise.all([
      import('../../rust/pprof-import/pkg/pprof_import.js'),
      import('../../rust/pprof-import/pkg/pprof_import_bg.wasm'),
    ])

  await initRustPprofImport({module_or_path: wasmModule.default as unknown as string})

  rustDecoder = (rawProfile: ArrayBuffer) => {
    const result = decodePprofToJson(new Uint8Array(rawProfile))
    if (!result || result === 'null') return null
    return JSON.parse(result) as PprofImportPayload
  }
}

export async function loadRustPprofDecoder(): Promise<(rawProfile: ArrayBuffer) => PprofImportPayload | null> {
  if (!modulePromise) {
    modulePromise = initializeModule()
  }
  await modulePromise
  if (!rustDecoder) {
    throw new Error('Rust pprof decoder failed to initialize')
  }
  return rustDecoder
}

function preloadRustPprofDecoder() {
  if (rustDecoder != null || modulePromise != null) return
  loadRustPprofDecoder()
    .then(decoder => {
      rustDecoder = decoder
    })
    .catch(() => {
      rustDecoder = null
    })
}

export function shouldUseRustPprofDecoder() {
  return isExperimentEnabled('rustPprofImport')
}

export function getLoadedRustPprofDecoder(): ((rawProfile: ArrayBuffer) => PprofImportPayload | null) | null {
  if (!shouldUseRustPprofDecoder()) {
    return null
  }
  preloadRustPprofDecoder()
  return rustDecoder
}
