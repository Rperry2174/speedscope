import initRustCallgrind, {
  parse_callgrind_json as parseCallgrindJson,
} from '../../rust/callgrind-import/pkg/callgrind_import.js'
import wasmBinaryPath from '../../rust/callgrind-import/pkg/callgrind_import_bg.wasm'

export interface ParsedCallgrindData {
  fieldNames: string[]
  operations: ParsedCallgrindOperation[]
}

export type ParsedCallgrindOperation =
  | {
      kind: 'self'
      file: string | null
      name: string | null
      weights: number[]
    }
  | {
      kind: 'child'
      parentFile: string | null
      parentName: string | null
      childFile: string | null
      childName: string | null
      weights: number[]
    }

let modulePromise: Promise<void> | null = null

async function initializeModule(): Promise<void> {
  await initRustCallgrind({module_or_path: wasmBinaryPath as unknown as string})
}

async function parseCallgrindWithRust(buffer: ArrayBuffer): Promise<ParsedCallgrindData | null> {
  if (!modulePromise) {
    modulePromise = initializeModule()
  }
  await modulePromise
  return JSON.parse(parseCallgrindJson(new Uint8Array(buffer))) as ParsedCallgrindData | null
}

export async function loadRustCallgrindParser(): Promise<
  (buffer: ArrayBuffer) => Promise<ParsedCallgrindData | null>
> {
  return parseCallgrindWithRust
}
