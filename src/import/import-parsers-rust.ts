import initRustImportParsers, {
  normalize_safari_profile as normalizeSafariProfileRustBinding,
  normalize_stackprof_profile as normalizeStackprofProfileRustBinding,
  parse_papyrus_json as parsePapyrusJson,
  parse_pmcstat_json as parsePMCStatJson,
} from '../../rust/import-parsers/pkg/import_parsers.js'
import {getNodeFsAndPath} from '../lib/node-shim'
import {isExperimentEnabled} from '../lib/runtime-config'
import type {TextFileContent} from './utils'

export interface RustNormalizedFrame {
  key: string | number
  name: string
  file?: string
  line?: number
  col?: number
}

export interface RustWeightedStack {
  frames: RustNormalizedFrame[]
  weight: number
}

export interface RustSafariImport {
  profile_duration: number
  display_name: string
  samples: RustWeightedStack[]
}

export interface RustStackprofImport {
  mode: string
  interval: number
  samples: RustWeightedStack[]
}

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

async function resolveWasmModuleOrPath(): Promise<BufferSource | string> {
  if (typeof window === 'undefined') {
    const {fs, path} = getNodeFsAndPath()
    return fs.readFileSync(
      path.join(process.cwd(), 'rust', 'import-parsers', 'pkg', 'import_parsers_bg.wasm'),
    )
  }

  const wasmModule = await import('../../rust/import-parsers/pkg/import_parsers_bg.wasm')
  return ((wasmModule as any).default || wasmModule) as string
}

async function ensureModule(): Promise<void> {
  if (!modulePromise) {
    modulePromise = resolveWasmModuleOrPath()
      .then(moduleOrPath =>
        initRustImportParsers({
          module_or_path: moduleOrPath,
        }),
      )
      .then(() => undefined)
      .catch(error => {
        modulePromise = null
        throw error
      })
  }
  await modulePromise
}

export async function parsePapyrusWithRust(
  contents: TextFileContent,
): Promise<RustPapyrusParsedLine[] | null> {
  try {
    await ensureModule()
    const result = parsePapyrusJson(contents.fullText())
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
    const result = parsePMCStatJson(contents.fullText())
    return JSON.parse(result) as RustPMCStatEntry[]
  } catch {
    return null
  }
}

export async function normalizeSafariProfileWithRust(profile: unknown): Promise<RustSafariImport | null> {
  if (!isExperimentEnabled('rustImportParsers')) {
    return null
  }
  try {
    await ensureModule()
    return normalizeSafariProfileRustBinding(profile as object) as RustSafariImport
  } catch {
    return null
  }
}

export async function normalizeStackprofProfileWithRust(
  profile: unknown,
): Promise<RustStackprofImport | null> {
  if (!isExperimentEnabled('rustImportParsers')) {
    return null
  }
  try {
    await ensureModule()
    return normalizeStackprofProfileRustBinding(profile as object) as RustStackprofImport
  } catch {
    return null
  }
}
