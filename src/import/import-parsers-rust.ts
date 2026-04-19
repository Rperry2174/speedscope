import {readFileSync} from 'fs'
import {join} from 'path'
const importParsersModule = require('../../rust/import-parsers/pkg/import_parsers.js') as {
  default: (moduleOrPath?: unknown) => Promise<unknown>
  parse_papyrus_json: (contents: string) => string
  parse_pmcstat_json: (contents: string) => string
}
import {TextFileContent} from './utils'

export type RustPapyrusParsedLine = {
  at: number
  event: string
  stackInt: number
  name: string
}

export type RustPMCStatEntry = {
  indent: number
  duration: number
  name: string
  file?: string
}

let modulePromise: Promise<void> | null = null
let rustAvailable = false

async function initializeModule(): Promise<void> {
  const wasmPath = join(process.cwd(), 'rust', 'import-parsers', 'pkg', 'import_parsers_bg.wasm')
  const wasmBytes = readFileSync(wasmPath)
  await importParsersModule.default(wasmBytes)
}

async function ensureModule(): Promise<boolean> {
  if (rustAvailable) return true
  if (!modulePromise) {
    modulePromise = initializeModule()
      .then(() => {
        rustAvailable = true
      })
      .catch(error => {
        modulePromise = null
        rustAvailable = false
        throw error
      })
  }
  await modulePromise
  return rustAvailable
}

export async function parsePapyrusWithRust(
  contents: TextFileContent,
): Promise<RustPapyrusParsedLine[] | null> {
  try {
    await ensureModule()
    const result = importParsersModule.parse_papyrus_json(contents.fullText())
    return JSON.parse(result) as RustPapyrusParsedLine[]
  } catch {
    return null
  }
}

export async function parsePMCStatWithRust(
  contents: TextFileContent,
): Promise<RustPMCStatEntry[] | null> {
  try {
    await ensureModule()
    const result = importParsersModule.parse_pmcstat_json(contents.fullText())
    return JSON.parse(result) as RustPMCStatEntry[]
  } catch {
    return null
  }
}
