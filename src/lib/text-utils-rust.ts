import initRustTextUtils, {
  remap_ranges_to_trimmed_text_json as remapRangesToTrimmedTextJson,
} from '../../rust/text-utils/pkg/text_utils.js'
import wasmBinaryPath from '../../rust/text-utils/pkg/text_utils_bg.wasm'
import type {TrimmedTextResult} from './text-utils'

type RangeTuple = [number, number]
type RustTextUtilsRemapper = (trimmedText: TrimmedTextResult, ranges: RangeTuple[]) => RangeTuple[]

let modulePromise: Promise<void> | null = null
let rustRemapper: RustTextUtilsRemapper | null = null

async function initializeModule(): Promise<void> {
  await initRustTextUtils(wasmBinaryPath as unknown as BufferSource)
}

export async function loadRustTextUtilsRemapper(): Promise<RustTextUtilsRemapper> {
  if (!modulePromise) {
    modulePromise = initializeModule()
  }
  await modulePromise

  const remapper: RustTextUtilsRemapper = (trimmedText, ranges) => {
    const result = remapRangesToTrimmedTextJson(
      trimmedText.trimmedLength,
      trimmedText.prefixLength,
      trimmedText.suffixLength,
      trimmedText.originalLength,
      JSON.stringify(ranges),
    )
    return JSON.parse(result) as RangeTuple[]
  }
  rustRemapper = remapper
  return remapper
}

export function preloadRustTextUtilsRemapper() {
  if (rustRemapper != null || modulePromise != null) return
  loadRustTextUtilsRemapper()
    .then(remapper => {
      rustRemapper = remapper
    })
    .catch(() => {
      rustRemapper = null
    })
}

export function getRustTextUtilsRemapper(): RustTextUtilsRemapper | null {
  return rustRemapper
}
