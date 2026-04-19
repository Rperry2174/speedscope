import initRustBase64Decoder, {
  decode_base64 as decodeBase64Rust,
} from '../../rust/base64-decoder/pkg/base64_decoder.js'
import {isExperimentEnabled} from './runtime-config'
import {decodeBase64} from './utils'

let modulePromise: Promise<void> | null = null
let rustDecoder: ((encoded: string) => Uint8Array) | null = null

function isNodeRuntime(): boolean {
  return typeof process !== 'undefined' && !!process.versions?.node
}

async function getWasmModuleOrPath(): Promise<BufferSource | string> {
  if (isNodeRuntime()) {
    const wasmModule = await import('./base64-decoder-rust.wasm.mock')
    return (('default' in wasmModule ? wasmModule.default : wasmModule) as unknown) as BufferSource
  }

  const wasmBinaryModule = await import('../../rust/base64-decoder/pkg/base64_decoder_bg.wasm')
  return (wasmBinaryModule.default as unknown) as string
}

async function initializeModule(): Promise<void> {
  await initRustBase64Decoder({module_or_path: (await getWasmModuleOrPath()) as any})
}

export async function loadRustBase64Decoder(): Promise<(encoded: string) => Uint8Array> {
  if (!modulePromise) {
    modulePromise = initializeModule()
  }
  await modulePromise

  const decoder = (encoded: string) => decodeBase64Rust(encoded)
  rustDecoder = decoder
  return decoder
}

function preloadRustBase64Decoder() {
  if (rustDecoder != null || modulePromise != null) return
  loadRustBase64Decoder()
    .then(decoder => {
      rustDecoder = decoder
    })
    .catch(() => {
      rustDecoder = null
    })
}

export function maybePreloadRustBase64Decoder() {
  if (isExperimentEnabled('rustBase64Decode')) {
    preloadRustBase64Decoder()
  }
}

export async function decodeBase64WithFallback(encoded: string): Promise<Uint8Array> {
  if (!isExperimentEnabled('rustBase64Decode')) {
    return decodeBase64(encoded)
  }

  try {
    const decoder = rustDecoder || (await loadRustBase64Decoder())
    return decoder(encoded)
  } catch {
    return decodeBase64(encoded)
  }
}

export const decodeBase64WithBestAvailableImplementation = decodeBase64WithFallback
