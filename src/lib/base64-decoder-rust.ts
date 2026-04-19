import initRustBase64Decoder, {
  decode_base64 as decodeBase64Rust,
} from '../../rust/base64-decoder/pkg/base64_decoder.js'
import {isExperimentEnabled} from './runtime-config'
import {decodeBase64} from './utils'

let modulePromise: Promise<unknown> | null = null
let rustDecoder: ((encoded: string) => Uint8Array) | null = null

async function initializeModule(): Promise<unknown> {
  if (typeof window === 'undefined') {
    const {readFile} = await import('fs/promises')
    const {join} = await import('path')
    return initRustBase64Decoder(
      await readFile(join(process.cwd(), 'rust', 'base64-decoder', 'pkg', 'base64_decoder_bg.wasm')),
    )
  }

  const wasmModule = (await import('../../rust/base64-decoder/pkg/base64_decoder_bg.wasm')) as unknown as {
    default: string
  }
  return initRustBase64Decoder(wasmModule.default as unknown as BufferSource)
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
