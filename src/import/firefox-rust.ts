import initRustFirefoxImport, {
  extract_firefox_import_payload_json as extractFirefoxImportPayloadJson,
} from '../../rust/firefox-import/pkg/firefox_import.js'
import {readFileSync, resolveFromCwd} from '../lib/node-shim'
import {FirefoxImportPayload, normalizeFirefoxImportFrame} from './firefox'

type RustFirefoxImportFn = (buffer: ArrayBuffer) => FirefoxImportPayload | null

let modulePromise: Promise<RustFirefoxImportFn> | null = null

async function resolveWasmModuleOrPath(): Promise<BufferSource | string> {
  if (typeof window === 'undefined') {
    return readFileSync(
      resolveFromCwd('rust', 'firefox-import', 'pkg', 'firefox_import_bg.wasm'),
    ) as BufferSource
  }

  const wasmModule = await import('../../rust/firefox-import/pkg/firefox_import_bg.wasm')
  return ((wasmModule as any).default || wasmModule) as string
}

function normalizeFirefoxImportPayload(payload: FirefoxImportPayload): FirefoxImportPayload {
  return {
    duration: payload.duration,
    frames: payload.frames.map(frame => ({
      ...(normalizeFirefoxImportFrame(frame.key) || frame),
    })),
    samples: payload.samples.map(sample => ({
      stack: sample.stack.slice(),
      value: sample.value,
    })),
  }
}

function createRustFirefoxImporter(): RustFirefoxImportFn {
  return (buffer: ArrayBuffer) => {
    const payloadJson = extractFirefoxImportPayloadJson(new Uint8Array(buffer))
    if (!payloadJson || payloadJson === 'null') {
      return null
    }
    return normalizeFirefoxImportPayload(JSON.parse(payloadJson) as FirefoxImportPayload)
  }
}

export async function loadRustFirefoxImporter(): Promise<RustFirefoxImportFn> {
  if (!modulePromise) {
    modulePromise = resolveWasmModuleOrPath()
      .then(moduleOrPath =>
        initRustFirefoxImport({
          module_or_path: moduleOrPath,
        }),
      )
      .then(() => createRustFirefoxImporter())
      .catch(error => {
        modulePromise = null
        throw error
      })
  }
  return await modulePromise
}

export async function importFromFirefoxArrayBuffer(buffer: ArrayBuffer) {
  const importFromRust = await loadRustFirefoxImporter()
  return importFromRust(buffer)
}
