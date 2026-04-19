import initRustImportParsers, {
  normalize_safari_profile as normalizeSafariProfileRustBinding,
  normalize_stackprof_profile as normalizeStackprofProfileRustBinding,
} from '../../rust/import-parsers/pkg/import_parsers.js'
import wasmBinaryPath from '../../rust/import-parsers/pkg/import_parsers_bg.wasm'
import {isExperimentEnabled} from '../lib/runtime-config'

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

let modulePromise: Promise<void> | null = null
let moduleFailed = false

async function initializeModule(): Promise<void> {
  await initRustImportParsers({module_or_path: wasmBinaryPath as unknown as string})
}

async function ensureModule(): Promise<void> {
  if (moduleFailed) {
    throw new Error('Rust import parsers module is unavailable')
  }
  if (!modulePromise) {
    modulePromise = initializeModule().catch(error => {
      moduleFailed = true
      throw error
    })
  }
  await modulePromise
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
